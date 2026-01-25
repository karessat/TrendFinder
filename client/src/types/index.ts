// Shared types matching backend types

export interface ProjectListItem {
  id: string;
  name: string;
  signalCount: number;
  trendCount: number;
  processingStatus: string;
  createdAt: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateProjectRequest {
  name: string;
}

export interface UploadResponse {
  success: boolean;
  signalCount: number;
  detectedColumn?: string;  // Legacy
  detectedMappings?: ColumnMappings;  // New
  processingStarted: boolean;
  estimatedCost: string;
  estimatedMinutes: number;
  warnings?: string[];
}

export interface ColumnMappings {
  description?: string;
  title?: string;
  source?: string;
  status?: string;
  id?: string;
  note?: string;
}

export interface UploadPreview {
  columns: string[];
  detectedMappings: ColumnMappings;
  sampleRows: Array<Record<string, any>>;
}

export interface ProcessingStatus {
  status: string;
  totalSignals: number;
  embeddingsComplete: number;
  embeddingSimilaritiesComplete: number;
  claudeVerificationsComplete: number;
  claudeVerificationFailures: number;
  currentPhase: string;
  percentComplete: number;
  estimatedSecondsRemaining: number | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ProcessingStatusResponse extends ProcessingStatus {}

export type SignalStatusDisplay = 'Pending' | 'Combined' | 'Archived';

export interface Signal {
  id: string;
  originalText: string;
  title: string | null;
  source: string | null;
  note: string | null;
  status: SignalStatusDisplay;  // Display status
  trendId: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SimilarSignal {
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

export interface SignalListResponse {
  signals: Signal[];
  total: number;
  unassignedCount: number;
}

export interface NextUnassignedResponse {
  signal: Signal | null;
  similarSignals: SimilarSignal[];
  remainingCount: number;
}

export interface SignalDetailResponse extends Signal {
  summary?: string;
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

export interface Trend {
  id: string;
  title: string;
  summary: string;
  note: string | null;
  signalCount: number;
  status: 'draft' | 'final' | 'retired' | 'archived';
  createdAt: string;
}

export interface TrendListResponse {
  trends: Trend[];
  total: number;
}

export interface TrendDetailResponse {
  trend: Trend;
  signals: Signal[];
}

export interface TrendResponse {
  trend: Trend;
}

export interface CreateTrendRequest {
  signalIds: string[];
}

export interface UpdateTrendRequest {
  title?: string;
  summary?: string;
  status?: 'draft' | 'final' | 'retired' | 'archived';
  note?: string | null;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

