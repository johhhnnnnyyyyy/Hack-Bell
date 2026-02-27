// ─── Worker Message Types (self-contained for worker scope) ─────────────────

interface BBox {
    x: number;
    y: number;
    w: number;
    h: number;
    pageIndex: number;
}

interface OCRWordResult {
    text: string;
    confidence: number;
    bbox: BBox;
}

let tesseractWorker: import('tesseract.js').Worker | null = null;

async function initTesseract(): Promise<import('tesseract.js').Worker> {
    if (tesseractWorker) return tesseractWorker;
    const Tesseract = await import('tesseract.js');
    tesseractWorker = await Tesseract.createWorker('eng', undefined, {
        logger: (m: { status: string; progress: number }) => {
            self.postMessage({
                type: 'OCR_PROGRESS',
                progress: m.progress,
                message: m.status,
            });
        },
    });
    return tesseractWorker;
}

self.onmessage = async (e: MessageEvent) => {
    const { type, fileBuffer, fileType, pageIndex } = e.data;

    if (type !== 'OCR_START') return;

    try {
        const worker = await initTesseract();

        let imageSource: string | Blob;
        if (fileType === 'application/pdf') {
            // For PDF, we receive an already-rendered image buffer
            imageSource = new Blob([fileBuffer], { type: 'image/png' });
        } else {
            imageSource = new Blob([fileBuffer], { type: fileType });
        }

        const result = await worker.recognize(imageSource, {}, { text: true, blocks: true });
        const words: OCRWordResult[] = [];

        // Tesseract.js v7 nests words in blocks → paragraphs → lines → words.
        // blocks are only populated when { blocks: true } is passed to recognize().
        const extractWord = (w: any) => {
            if (!w || !w.text || !w.bbox) return;
            words.push({
                text: w.text,
                confidence: (w.confidence ?? 0) / 100,
                bbox: {
                    x: w.bbox.x0,
                    y: w.bbox.y0,
                    w: w.bbox.x1 - w.bbox.x0,
                    h: w.bbox.y1 - w.bbox.y0,
                    pageIndex: pageIndex ?? 0,
                },
            });
        };

        if (result.data.blocks && result.data.blocks.length > 0) {
            for (const block of result.data.blocks) {
                for (const paragraph of (block.paragraphs ?? [])) {
                    for (const line of (paragraph.lines ?? [])) {
                        for (const word of (line.words ?? [])) {
                            extractWord(word);
                        }
                    }
                }
            }
        } else if ((result.data as any).words && (result.data as any).words.length > 0) {
            // Legacy v4 fallback
            for (const word of (result.data as any).words) {
                extractWord(word);
            }
        }

        console.log(`[OCR Worker] Extracted ${words.length} words from Tesseract`);

        // Use Tesseract's text if available, otherwise reconstruct from words
        let fullText = result.data.text ?? '';
        if (!fullText.trim() && words.length > 0) {
            fullText = words.map(w => w.text).join(' ');
            console.log('[OCR Worker] Reconstructed fullText from words');
        }
        console.log(`[OCR Worker] fullText length: ${fullText.length}`);

        self.postMessage({
            type: 'OCR_RESULT',
            words,
            fullText,
            pageIndex: pageIndex ?? 0,
        });
    } catch (error) {
        self.postMessage({
            type: 'OCR_ERROR',
            error: error instanceof Error ? error.message : 'OCR processing failed',
        });
    }
};
