// ============================================
// Database Record Types (as stored in SQLite)
// ============================================

export interface SignalRecord {
  id: string;
  original_text: string;  // Signal Description
  title: string | null;    // NEW - Optional signal title
  source: string | null;   // NEW - Optional URL source
  note: string | null;     // NEW - Optional notes (combination details, archive reasons, user notes)
  summary: string | null;
  embedding: string | null;           // JSON string of number[]
  embedding_candidates: string | null; // JSON string of SimilarityScore[]
  similar_signals: string | null;      // JSON string of SimilarityScore[]
  status: SignalStatus;    // Keep internal: 'unassigned' | 'assigned' | 'retired'
  trend_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrendRecord {
  id: string;
  title: string | null;
  summary: string;
  note: string | null;
  signal_count: number;
  status: TrendStatus;
  created_at: string;
  updated_at: string;
}

export interface ProcessingStatusRecord {
  project_id: string;
  total_signals: number;
  embeddings_complete: number;
  embedding_similarities_complete: number;
  claude_verifications_complete: number;
  claude_verification_failures: number;
  status: ProcessingPhase;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// ============================================
// Enums and Literal Types
// ============================================

export type SignalStatus = 'unassigned' | 'assigned' | 'retired';
export type SignalStatusDisplay = 'Pending' | 'Combined' | 'Archived';
export type TrendStatus = 'draft' | 'final' | 'retired' | 'archived';
export type ProcessingPhase = 
  | 'pending' 
  | 'embedding' 
  | 'embedding_similarity' 
  | 'claude_verification' 
  | 'complete' 
  | 'error';

/**
 * Map internal status to display status
 */
export function mapStatusToDisplay(status: SignalStatus): SignalStatusDisplay {
  const mapping: Record<SignalStatus, SignalStatusDisplay> = {
    'unassigned': 'Pending',
    'assigned': 'Combined',
    'retired': 'Archived'
  };
  return mapping[status];
}

/**
 * Map display status to internal status
 */
export function mapDisplayToStatus(display: SignalStatusDisplay): SignalStatus {
  const mapping: Record<SignalStatusDisplay, SignalStatus> = {
    'Pending': 'unassigned',
    'Combined': 'assigned',
    'Archived': 'retired'
  };
  return mapping[display];
}

// ============================================
// Application Types
// ============================================

export interface SimilarityScore {
  id: string;
  score: number;
}

export interface ProcessingStatus {
  status: ProcessingPhase;
  totalSignals: number;
  embeddingsComplete: number;
  embeddingSimilaritiesComplete: number;
  claudeVerificationsComplete: number;
  claudeVerificationFailures: number;
  currentPhase: string;
  percentComplete: number;
  estimatedSecondsRemaining: number | null;
}

// ============================================
// API Request Types (with Zod schemas below)
// ============================================

export interface CreateProjectRequest {
  name: string;
}

export interface CreateSignalRequest {
  description: string;
  title?: string;
  source?: string;
  status?: SignalStatusDisplay;
  note?: string;
}

export interface UpdateSignalRequest {
  description?: string;
  title?: string | null;
  source?: string | null;
  status?: SignalStatusDisplay;
  note?: string | null;
}

export interface CreateTrendRequest {
  signalIds: string[];
}

export interface UpdateTrendRequest {
  summary?: string;
  status?: TrendStatus;
}

export interface AddSignalsToTrendRequest {
  signalIds: string[];
  regenerateSummary?: boolean;
}

export interface RemoveSignalsFromTrendRequest {
  signalIds: string[];
  regenerateSummary?: boolean;
}

// ============================================
// API Response Types
// ============================================

export interface ProjectResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  signalCount: number;
  trendCount: number;
  processingStatus: ProcessingPhase;
  createdAt: string;
}

export interface UploadResponse {
  success: boolean;
  signalCount: number;
  detectedColumn: string;
  processingStarted: boolean;
  estimatedCost: string;
  estimatedMinutes: number;
}

export interface SignalListResponse {
  signals: SignalListItem[];
  total: number;
  unassignedCount: number;
}

export interface SignalListItem {
  id: string;
  originalText: string;
  title: string | null;
  source: string | null;
  note: string | null;
  status: SignalStatusDisplay;  // Display status
  trendId: string | null;
  createdAt: string;
}

export interface SimilarSignalItem {
  id: string;
  originalText: string;
  title: string | null;
  source: string | null;
  note: string | null;
  score: number;
  status: SignalStatusDisplay;  // Display status
  trendId: string | null;
  trendSummary?: string;
}

export interface NextUnassignedResponse {
  signal: SignalListItem | null;
  similarSignals: SimilarSignalItem[];
  remainingCount: number;
}

export interface TrendListItem {
  id: string;
  title: string | null;
  summary: string;
  note: string | null;
  signalCount: number;
  status: TrendStatus;
  createdAt: string;
}

export interface TrendListResponse {
  trends: TrendListItem[];
  total: number;
}

export interface TrendDetailResponse {
  trend: TrendListItem;
  signals: SignalListItem[];
}

export interface TrendResponse {
  trend: TrendListItem;
}

export interface ProcessingStatusResponse extends ProcessingStatus {}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// ============================================
// Claude API Types
// ============================================

export interface ClaudeVerificationResult {
  number: number;
  score: number;
}

