// ─── Entity Types ───────────────────────────────────────────────────────────

export type PIIType =
    | 'AADHAAR'
    | 'PAN'
    | 'CREDIT_CARD'
    | 'PHONE'
    | 'NAME'
    | 'ADDRESS'
    | 'MEDICAL'
    | 'EMAIL'
    | 'DOB'
    | 'SENSITIVE';

export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
    pageIndex: number;
}

export interface DetectedEntity {
    id: string;
    type: PIIType;
    value: string;
    confidence: number;
    bbox: BoundingBox;
    masked: boolean;
    layer: 1 | 2;
}

// ─── Worker Message Types ───────────────────────────────────────────────────

export interface OCRRequest {
    type: 'OCR_START';
    fileBuffer: ArrayBuffer;
    fileType: string;
    pageIndex: number;
}

export interface OCRWord {
    text: string;
    confidence: number;
    bbox: BoundingBox;
}

export interface OCRResponse {
    type: 'OCR_RESULT' | 'OCR_PROGRESS' | 'OCR_ERROR';
    words?: OCRWord[];
    fullText?: string;
    progress?: number;
    error?: string;
    pageIndex?: number;
}

export interface NLPRequest {
    type: 'NLP_ANALYZE';
    text: string;
    words: OCRWord[];
    pageIndex: number;
}

export interface NLPResponse {
    type: 'NLP_RESULT' | 'NLP_ERROR';
    entities?: DetectedEntity[];
    error?: string;
}

// ─── Component Props ────────────────────────────────────────────────────────

export interface SecureUploaderProps {
    requiredFields: string[];
    confidenceThreshold?: number;
    onUpload: (maskedFile: File, evidenceBlob: string) => void;
    maxFileSizeMB?: number;
    acceptedTypes?: string[];
}

// ─── Processing State ───────────────────────────────────────────────────────

export type ProcessingStage =
    | 'idle'
    | 'loading'
    | 'ocr'
    | 'detection'
    | 'review'
    | 'redacting'
    | 'complete'
    | 'error';

export interface ProcessingState {
    stage: ProcessingStage;
    progress: number;
    message: string;
}

export interface EvidenceLog {
    timestamp: string;
    fileName: string;
    detectedEntities: Array<{
        type: PIIType;
        confidence: number;
        action: 'masked' | 'kept_visible';
        userConfirmed: boolean;
    }>;
    requiredFields: string[];
}
