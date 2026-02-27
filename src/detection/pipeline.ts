import type { DetectedEntity, OCRWord } from '../types';
import { runLayer1Detection } from './layer1';
import { runGeminiDetection } from './gemini';

/**
 * Unified Detection Pipeline
 * Layer 1: deterministic regex + checksum detection
 * Layer 2: Gemini 1.5 Flash AI-powered PII detection
 */
export async function runDetectionPipeline(
    fullText: string,
    words: OCRWord[],
    geminiApiKey: string,
    confidenceThreshold: number = 0.5,
    requiredFields: string[] = [],
    pageIndex: number = 0,
    onProgress?: (msg: string) => void
): Promise<DetectedEntity[]> {
    // Run Layer 1 synchronously (fast regex + checksums)
    const layer1Entities = runLayer1Detection(fullText, words, pageIndex);
    console.log('[Pipeline] Layer 1 entities:', layer1Entities.map(e => ({ type: e.type, value: e.value, confidence: e.confidence, bbox: e.bbox })));

    // Run Layer 2 via Gemini AI
    let layer2Entities: DetectedEntity[] = [];
    try {
        layer2Entities = await runGeminiDetection(fullText, words, geminiApiKey, pageIndex, onProgress);
        console.log('[Pipeline] Gemini entities:', layer2Entities.map(e => ({ type: e.type, value: e.value, confidence: e.confidence, bbox: e.bbox })));
    } catch (err) {
        console.warn('Gemini detection failed:', err);
    }

    // Merge results
    const allEntities = [...layer1Entities, ...layer2Entities];

    // Deduplicate overlapping detections (prefer higher confidence)
    const deduped = deduplicateEntities(allEntities);
    console.log('[Pipeline] After dedup:', deduped.map(e => ({ type: e.type, value: e.value, confidence: e.confidence, bbox: e.bbox })));

    // Filter by confidence threshold
    const filtered = deduped.filter(e => e.confidence >= confidenceThreshold);
    console.log('[Pipeline] After filtering (threshold=' + confidenceThreshold + '):', filtered.map(e => ({ type: e.type, value: e.value, confidence: e.confidence, bbox: e.bbox, masked: e.masked })));

    // Mark required fields as unmasked
    for (const entity of filtered) {
        if (requiredFields.includes(entity.type)) {
            entity.masked = false;
        }
    }

    return filtered;
}

/**
 * Remove overlapping detections, keeping the one with higher confidence.
 */
function deduplicateEntities(entities: DetectedEntity[]): DetectedEntity[] {
    // Sort by confidence descending
    const sorted = [...entities].sort((a, b) => b.confidence - a.confidence);
    const result: DetectedEntity[] = [];

    for (const entity of sorted) {
        const overlaps = result.some(existing =>
            existing.bbox.pageIndex === entity.bbox.pageIndex &&
            boxesOverlap(existing.bbox, entity.bbox, 0.5)
        );

        if (!overlaps) {
            result.push(entity);
        }
    }

    return result;
}

/**
 * Check if two bounding boxes overlap by more than the given threshold.
 */
function boxesOverlap(
    a: DetectedEntity['bbox'],
    b: DetectedEntity['bbox'],
    threshold: number
): boolean {
    const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const overlapArea = overlapX * overlapY;
    const minArea = Math.min(a.w * a.h, b.w * b.h);

    return minArea > 0 && overlapArea / minArea > threshold;
}
