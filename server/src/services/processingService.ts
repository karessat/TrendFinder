import Database from 'better-sqlite3';
import { getDatabase, closeDatabase } from '../config/database';
import { generateEmbedding } from './embeddingService';
import { findTopCandidates } from './similarityService';
import { verifySimilarities } from './claudeService';
import { SimilarityScore, ProcessingPhase } from '../types';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

// Processing constants
const TOP_N_CANDIDATES = 40;
const PROGRESS_LOG_INTERVAL = 50; // Log progress every N items

/**
 * Process items in parallel batches
 */
async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchPromises = batch.map(async (item) => {
      try {
        return await processor(item);
      } catch (error) {
        errors.push({ item, error: error as Error });
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null) as R[]);
    
    if (onProgress) {
      onProgress(results.length, items.length);
    }
  }
  
  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length }, 'Some items failed during batch processing');
  }
  
  return results;
}

// Processing lock to prevent concurrent processing of the same project
const processingLocks = new Map<string, boolean>();

interface StatusUpdate {
  status?: ProcessingPhase;
  embeddings_complete?: number;
  embedding_similarities_complete?: number;
  claude_verifications_complete?: number;
  claude_verification_failures?: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface ProcessingStatusRecord {
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

// Whitelist of allowed fields for safe SQL updates
const ALLOWED_STATUS_FIELDS = [
  'status', 'embeddings_complete', 'embedding_similarities_complete',
  'claude_verifications_complete', 'claude_verification_failures',
  'error_message', 'completed_at', 'started_at'
] as const;

function updateProcessingStatus(db: Database.Database, projectId: string, updates: StatusUpdate): void {
  // Validate that all keys are in the whitelist
  const updateKeys = Object.keys(updates);
  const invalidKeys = updateKeys.filter(key => !ALLOWED_STATUS_FIELDS.includes(key as any));
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid status update fields: ${invalidKeys.join(', ')}`);
  }
  
  const setClauses = updateKeys.map(key => `${key} = ?`).join(', ');
  const values = updateKeys.map(key => updates[key as keyof StatusUpdate]);
  db.prepare(`UPDATE processing_status SET ${setClauses} WHERE project_id = ?`).run(...values, projectId);
}

function getProcessingStatus(db: Database.Database, projectId: string): ProcessingStatusRecord | undefined {
  return db.prepare('SELECT * FROM processing_status WHERE project_id = ?').get(projectId) as ProcessingStatusRecord | undefined;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Phase 1: Generate embeddings for all signals
 * RESUMABLE: Only processes signals without embeddings
 * OPTIMIZED: Parallel processing with configurable concurrency
 */
async function generateAllEmbeddings(db: Database.Database, projectId: string): Promise<void> {
  const signals = db.prepare(`
    SELECT id, original_text FROM signals WHERE embedding IS NULL
  `).all() as Array<{ id: string; original_text: string }>;
  
  if (signals.length === 0) {
    logger.info({ projectId }, 'Phase 1: All embeddings already generated');
    return;
  }
  
  const env = getEnv();
  const concurrency = env.PROCESSING_CONCURRENCY || 5;
  
  logger.info({ projectId, count: signals.length, concurrency }, 'Phase 1: Starting parallel embedding generation');
  
  // Prepare statement once, reuse in loop
  const updateStmt = db.prepare(`
    UPDATE signals SET embedding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  
  // Get current progress
  const status = getProcessingStatus(db, projectId);
  if (!status) {
    throw new Error('Processing status record not found');
  }
  let completed = status.embeddings_complete || 0;
  const total = status.total_signals;
  const startTime = Date.now();
  
  logger.info({ projectId, completed, total, remaining: signals.length, concurrency }, 'Phase 1: Starting parallel embedding generation');
  
  // Process signals in parallel batches
  // Collect results first, then update database sequentially (SQLite limitation)
  interface EmbeddingResult {
    signalId: string;
    embedding: number[] | null;
    error?: Error;
  }
  
  const results: EmbeddingResult[] = await processInBatches(
    signals,
    async (signal) => {
      const signalStartTime = Date.now();
      try {
        logger.debug({ projectId, signalId: signal.id }, 'Generating embedding');
        const embedding = await generateEmbedding(signal.original_text);
        const signalDuration = Date.now() - signalStartTime;
        
        if (embedding) {
          logger.debug({ projectId, signalId: signal.id, duration: signalDuration }, 'Embedding generated');
          return { signalId: signal.id, embedding };
        } else {
          logger.warn({ projectId, signalId: signal.id }, 'Generated embedding is null');
          return { signalId: signal.id, embedding: null };
        }
      } catch (error) {
        const signalDuration = Date.now() - signalStartTime;
        logger.error({ projectId, signalId: signal.id, error, duration: signalDuration }, 'Failed to generate embedding');
        return { signalId: signal.id, embedding: null, error: error as Error };
      }
    },
    concurrency
  );
  
  // Update database sequentially with collected results
  for (const result of results) {
    if (result.embedding) {
      updateStmt.run(JSON.stringify(result.embedding), result.signalId);
    }
    completed++;
    
    // Update progress periodically
    if (completed % 10 === 0 || completed % PROGRESS_LOG_INTERVAL === 0 || completed === total) {
      updateProcessingStatus(db, projectId, { embeddings_complete: completed });
      
      const elapsed = Date.now() - startTime;
      const rate = completed / (elapsed / 1000); // signals per second
      const remaining = total - completed;
      const estimatedSecondsRemaining = remaining / rate;
      logger.info({ 
        projectId, 
        completed, 
        total, 
        percentComplete: Math.round((completed / total) * 100),
        elapsedSeconds: Math.round(elapsed / 1000),
        rate: rate.toFixed(2),
        estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
        concurrency
      }, 'Phase 1: Embedding progress');
    }
  }
  
  // Final progress update
  updateProcessingStatus(db, projectId, { embeddings_complete: completed });
  
  const totalDuration = Date.now() - startTime;
  logger.info({ 
    projectId, 
    completed, 
    total, 
    duration: Math.round(totalDuration / 1000),
    concurrency,
    speedup: `~${concurrency}x faster than sequential`
  }, 'Phase 1: Embedding generation complete');
}

/**
 * Phase 2: Calculate embedding-based similarities
 * RESUMABLE: Only processes signals without embedding_candidates
 */
async function calculateEmbeddingSimilarities(db: Database.Database, projectId: string): Promise<void> {
  // Get all signals with embeddings
  const allSignals = db.prepare(`
    SELECT id, embedding FROM signals WHERE embedding IS NOT NULL
  `).all() as Array<{ id: string; embedding: string }>;
  
  // Get signals that need similarity calculation
  const needsCalculation = db.prepare(`
    SELECT id, embedding FROM signals 
    WHERE embedding IS NOT NULL AND embedding_candidates IS NULL
  `).all() as Array<{ id: string; embedding: string }>;
  
  if (needsCalculation.length === 0) {
    logger.info('Phase 2: All similarities already calculated');
    return;
  }
  
  logger.info({ count: needsCalculation.length }, 'Phase 2: Calculating similarities');
  
  // Parse all embeddings once and cache
  const parsedAll: Array<{ id: string; embedding: number[] }> = [];
  for (const s of allSignals) {
    try {
      parsedAll.push({
        id: s.id,
        embedding: JSON.parse(s.embedding) as number[]
      });
    } catch (error) {
      logger.error({ signalId: s.id, error }, 'Failed to parse embedding JSON');
    }
  }
  
  // Prepare statement once, reuse in loop
  const updateStmt = db.prepare(`
    UPDATE signals SET embedding_candidates = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  
  const status = getProcessingStatus(db, projectId);
  if (!status) {
    throw new Error('Processing status record not found');
  }
  let completed = status.embedding_similarities_complete || 0;
  
  for (const signal of needsCalculation) {
    try {
      const currentEmbedding = JSON.parse(signal.embedding) as number[];
      const others = parsedAll.filter(s => s.id !== signal.id);
      
      const candidates = findTopCandidates(currentEmbedding, others, TOP_N_CANDIDATES);
      updateStmt.run(JSON.stringify(candidates), signal.id);
      
      completed++;
      updateProcessingStatus(db, projectId, { embedding_similarities_complete: completed });
    } catch (error) {
      logger.error({ signalId: signal.id, error }, 'Failed to calculate embedding similarities');
      // Continue with next signal
    }
  }
}

/**
 * Phase 3: Verify similarities with Claude
 * RESUMABLE: Only processes signals without similar_signals
 * Tracks failures separately for potential retry
 * OPTIMIZED: Parallel processing with rate limit awareness
 */
async function verifyWithClaude(db: Database.Database, projectId: string): Promise<void> {
  const signals = db.prepare(`
    SELECT id, original_text, embedding_candidates 
    FROM signals 
    WHERE embedding_candidates IS NOT NULL AND similar_signals IS NULL
  `).all() as Array<{ 
    id: string; 
    original_text: string; 
    embedding_candidates: string;
  }>;
  
  if (signals.length === 0) {
    logger.info('Phase 3: All signals already verified');
    return;
  }
  
  const env = getEnv();
  // Use lower concurrency for Claude API to respect rate limits
  // Default to 2-3 concurrent requests to avoid hitting rate limits
  const concurrency = Math.min(env.PROCESSING_CONCURRENCY || 5, 3);
  const delayMs = env.CLAUDE_RATE_LIMIT_DELAY_MS;
  
  logger.info({ projectId, count: signals.length, concurrency }, 'Phase 3: Starting parallel Claude verification');
  
  const status = getProcessingStatus(db, projectId);
  if (!status) {
    throw new Error('Processing status record not found');
  }
  let completed = status.claude_verifications_complete || 0;
  let failures = status.claude_verification_failures || 0;
  const total = status.total_signals;
  const startTime = Date.now();
  
  // Prepare statements once
  const updateStmt = db.prepare(`
    UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  
  interface VerificationResult {
    signalId: string;
    verifiedSimilarities: SimilarityScore[];
    error?: Error;
  }
  
  // Process signals in parallel batches with rate limiting
  const results: VerificationResult[] = [];
  let processedCount = 0;
  
  for (let i = 0; i < signals.length; i += concurrency) {
    const batch = signals.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (signal): Promise<VerificationResult> => {
      let candidates: SimilarityScore[];
      
      try {
        candidates = JSON.parse(signal.embedding_candidates) as SimilarityScore[];
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Failed to parse embedding_candidates JSON');
        return { signalId: signal.id, verifiedSimilarities: [] };
      }
      
      // Get full text for each candidate
      const candidateIds = candidates.map(c => c.id);
      if (candidateIds.length === 0) {
        return { signalId: signal.id, verifiedSimilarities: [] };
      }
      
      // Batch fetch candidate texts
      const placeholders = candidateIds.map(() => '?').join(',');
      const getCandidateBatchStmt = db.prepare(`
        SELECT id, original_text FROM signals WHERE id IN (${placeholders})
      `);
      
      let candidateRecords: Array<{ id: string; original_text: string }>;
      try {
        candidateRecords = getCandidateBatchStmt.all(...candidateIds) as Array<{ id: string; original_text: string }>;
      } catch (error) {
        logger.error({ signalId: signal.id, candidateIds, error }, 'Failed to fetch candidate texts');
        return { signalId: signal.id, verifiedSimilarities: [] };
      }
      
      const candidateMap = new Map(candidateRecords.map(c => [c.id, c.original_text]));
      const candidatesWithText = candidates
        .map(c => ({ id: c.id, text: candidateMap.get(c.id) || '' }))
        .filter(c => c.text !== '');
      
      if (candidatesWithText.length === 0) {
        return { signalId: signal.id, verifiedSimilarities: [] };
      }
      
      try {
        const verifiedResults = await verifySimilarities(
          { id: signal.id, text: signal.original_text },
          candidatesWithText
        );
        
        // Map Claude's results back to signal IDs
        const verifiedSimilarities: SimilarityScore[] = verifiedResults
          .filter(result => result.number >= 1 && result.number <= candidatesWithText.length)
          .map(result => {
            const candidate = candidatesWithText[result.number - 1];
            return candidate ? { id: candidate.id, score: result.score } : null;
          })
          .filter((item): item is SimilarityScore => item !== null && item.score >= 5);
        
        logger.debug({ 
          signalId: signal.id, 
          similarCount: verifiedSimilarities.length
        }, 'Signal verified');
        
        return { signalId: signal.id, verifiedSimilarities };
      } catch (error) {
        logger.error({ 
          signalId: signal.id, 
          error, 
          errorMessage: error instanceof Error ? error.message : String(error) 
        }, 'Claude verification failed');
        return { signalId: signal.id, verifiedSimilarities: [], error: error as Error };
      }
    });
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    processedCount += batch.length;
    
    // Update database sequentially with batch results
    for (const result of batchResults) {
      updateStmt.run(JSON.stringify(result.verifiedSimilarities), result.signalId);
      completed++;
      if (result.error) {
        failures++;
      }
    }
    
    // Update progress periodically
    if (processedCount % 10 === 0 || processedCount % PROGRESS_LOG_INTERVAL === 0 || processedCount === signals.length) {
      updateProcessingStatus(db, projectId, { 
        claude_verifications_complete: completed,
        claude_verification_failures: failures
      });
      
      const elapsed = Date.now() - startTime;
      const rate = completed / (elapsed / 1000);
      const remaining = total - completed;
      const estimatedSecondsRemaining = remaining / rate;
      logger.info({ 
        projectId, 
        completed, 
        total, 
        failures,
        percentComplete: Math.round((completed / total) * 100),
        elapsedSeconds: Math.round(elapsed / 1000),
        rate: rate.toFixed(2),
        estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
        concurrency
      }, 'Phase 3: Claude verification progress');
    }
    
    // Rate limiting between batches (not between individual items since we're batching)
    if (i + concurrency < signals.length) {
      await sleep(delayMs);
    }
  }
  
  // Final progress update
  updateProcessingStatus(db, projectId, { 
    claude_verifications_complete: completed,
    claude_verification_failures: failures
  });
  
  const totalDuration = Date.now() - startTime;
  logger.info({ 
    projectId, 
    completed, 
    total, 
    failures,
    duration: Math.round(totalDuration / 1000),
    concurrency,
    speedup: `~${concurrency}x faster than sequential (with rate limiting)`
  }, 'Phase 3: Claude verification complete');
  
  if (failures > 0) {
    logger.warn({ failures }, 'Some Claude verifications failed');
  }
}

/**
 * Retry failed Claude verifications
 * Call this endpoint to reprocess signals that failed verification
 * Uses same error handling and validation as main verification flow
 */
export async function retryFailedVerifications(projectId: string): Promise<{ retried: number; succeeded: number }> {
  const db = getDatabase(projectId);
  
  try {
    // Find signals with empty similar_signals (likely failed)
    const failed = db.prepare(`
      SELECT id, original_text, embedding_candidates
      FROM signals
      WHERE similar_signals = '[]' AND embedding_candidates IS NOT NULL AND embedding_candidates != '[]'
    `).all() as Array<{ id: string; original_text: string; embedding_candidates: string }>;
    
    logger.info({ count: failed.length }, 'Retrying failed verifications');
    
    let succeeded = 0;
    const updateStmt = db.prepare(`
      UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    
    for (const signal of failed) {
      let candidates: SimilarityScore[];
      
      try {
        candidates = JSON.parse(signal.embedding_candidates) as SimilarityScore[];
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Failed to parse embedding_candidates JSON in retry');
        continue;
      }
      
      const candidateIds = candidates.map(c => c.id);
      
      if (candidateIds.length === 0) {
        continue;
      }
      
      // Batch fetch candidate texts
      const placeholders = candidateIds.map(() => '?').join(',');
      const getCandidateBatchStmt = db.prepare(`
        SELECT id, original_text FROM signals WHERE id IN (${placeholders})
      `);
      
      let candidateRecords: Array<{ id: string; original_text: string }>;
      try {
        candidateRecords = getCandidateBatchStmt.all(...candidateIds) as Array<{ id: string; original_text: string }>;
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Failed to fetch candidate texts in retry');
        continue;
      }
      
      const candidateMap = new Map(candidateRecords.map(c => [c.id, c.original_text]));
      const candidatesWithText = candidates
        .map(c => ({ id: c.id, text: candidateMap.get(c.id) || '' }))
        .filter(c => c.text !== '');
      
      if (candidatesWithText.length === 0) {
        continue;
      }
      
      try {
        const verifiedResults = await verifySimilarities(
          { id: signal.id, text: signal.original_text },
          candidatesWithText
        );
        
        // Validate and filter results
        const verifiedSimilarities: SimilarityScore[] = verifiedResults
          .filter(result => result.number >= 1 && result.number <= candidatesWithText.length)
          .map(result => {
            const candidate = candidatesWithText[result.number - 1];
            return candidate ? { id: candidate.id, score: result.score } : null;
          })
          .filter((item): item is SimilarityScore => item !== null && item.score >= 5);
        
        if (verifiedSimilarities.length > 0) {
          updateStmt.run(JSON.stringify(verifiedSimilarities), signal.id);
          succeeded++;
        }
        
        await sleep(getEnv().CLAUDE_RATE_LIMIT_DELAY_MS);
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Retry verification failed');
      }
    }
    
    // Update failure count
    const currentFailures = db.prepare(`
      SELECT COUNT(*) as count FROM signals 
      WHERE similar_signals = '[]' AND embedding_candidates IS NOT NULL AND embedding_candidates != '[]'
    `).get() as { count: number };
    
    updateProcessingStatus(db, projectId, { claude_verification_failures: currentFailures.count });
    
    return { retried: failed.length, succeeded };
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Main processing orchestration
 * RESUMABLE: Each phase checks what's already done and continues from there
 * THREAD-SAFE: Uses a simple lock mechanism to prevent concurrent processing
 */
export async function processProject(projectId: string): Promise<void> {
  logger.info({ projectId }, 'processProject called - starting');
  
  // Check if processing is already in progress
  if (processingLocks.get(projectId)) {
    logger.warn({ projectId }, 'Processing already in progress, skipping');
    // Check if it's been stuck for more than 5 minutes - clear the lock
    // This handles cases where processing crashed without clearing the lock
    const db = getDatabase(projectId);
    try {
      const status = getProcessingStatus(db, projectId);
      if (status && status.started_at) {
        const startedAt = new Date(status.started_at).getTime();
        const now = Date.now();
        const minutesSinceStart = (now - startedAt) / (1000 * 60);
        if (minutesSinceStart > 5) {
          logger.warn({ projectId, minutesSinceStart }, 'Processing lock exists but started more than 5 minutes ago, clearing lock');
          processingLocks.delete(projectId);
          closeDatabase(projectId);
          // Retry after clearing lock
          return processProject(projectId);
        }
      }
      closeDatabase(projectId);
    } catch (error) {
      logger.error({ projectId, error }, 'Error checking processing status for lock timeout');
      closeDatabase(projectId);
    }
    return;
  }
  
  logger.info({ projectId }, 'Setting processing lock and getting database');
  processingLocks.set(projectId, true);
  const db = getDatabase(projectId);
  
  try {
    logger.info({ projectId }, 'Getting processing status');
    const status = getProcessingStatus(db, projectId);
    
    if (!status) {
      logger.error({ projectId }, 'Processing status record not found');
      throw new Error('Processing status record not found. Project may not be initialized.');
    }
    
    logger.info({ projectId, currentStatus: status.status, totalSignals: status.total_signals }, 'Processing status retrieved');
    
    // Determine which phase to start/resume from
    if (status.status === 'complete') {
      logger.info({ projectId }, 'Project already processed');
      return;
    }
    
    // Set started_at on first run
    if (!status.started_at) {
      logger.info({ projectId }, 'Setting started_at timestamp');
      updateProcessingStatus(db, projectId, { started_at: new Date().toISOString() });
    }
    
    // Phase 1: Embeddings
    if (status.status === 'pending' || status.status === 'embedding') {
      logger.info({ projectId, status: status.status }, 'Starting Phase 1: Embedding generation');
      updateProcessingStatus(db, projectId, { status: 'embedding', error_message: null });
      logger.info({ projectId }, 'Calling generateAllEmbeddings');
      await generateAllEmbeddings(db, projectId);
      logger.info({ projectId }, 'generateAllEmbeddings completed');
    }
    
    // Phase 2: Embedding similarities
    const statusAfterPhase1 = getProcessingStatus(db, projectId);
    if (!statusAfterPhase1) {
      throw new Error('Processing status record not found after Phase 1');
    }
    
    if (['pending', 'embedding', 'embedding_similarity'].includes(statusAfterPhase1.status)) {
      logger.info({ projectId, phase: 'embedding_similarity' }, 'Starting Phase 2: Similarity calculation');
      updateProcessingStatus(db, projectId, { status: 'embedding_similarity' });
      await calculateEmbeddingSimilarities(db, projectId);
      logger.info({ projectId }, 'Phase 2: Similarity calculation completed');
    }
    
    // Phase 3: Claude verification
    const statusAfterPhase2 = getProcessingStatus(db, projectId);
    if (!statusAfterPhase2) {
      throw new Error('Processing status record not found after Phase 2');
    }
    
    if (['pending', 'embedding', 'embedding_similarity', 'claude_verification'].includes(statusAfterPhase2.status)) {
      logger.info({ 
        projectId, 
        phase: 'claude_verification', 
        currentStatus: statusAfterPhase2.status,
        embeddingsComplete: statusAfterPhase2.embeddings_complete,
        similaritiesComplete: statusAfterPhase2.embedding_similarities_complete,
        claudeComplete: statusAfterPhase2.claude_verifications_complete
      }, 'Starting Phase 3: Claude verification');
      updateProcessingStatus(db, projectId, { status: 'claude_verification' });
      logger.info({ projectId }, 'Calling verifyWithClaude');
      try {
        await verifyWithClaude(db, projectId);
        logger.info({ projectId }, 'Phase 3: Claude verification completed');
      } catch (phase3Error) {
        logger.error({ 
          projectId, 
          error: phase3Error, 
          errorMessage: phase3Error instanceof Error ? phase3Error.message : String(phase3Error),
          stack: phase3Error instanceof Error ? phase3Error.stack : undefined
        }, 'Phase 3 failed with error');
        throw phase3Error; // Re-throw to be caught by outer try-catch
      }
    } else {
      logger.warn({ projectId, status: statusAfterPhase2.status }, 'Phase 3 condition not met, skipping');
    }
    
    // Complete
    updateProcessingStatus(db, projectId, { 
      status: 'complete',
      completed_at: new Date().toISOString()
    });
    
    logger.info({ projectId }, 'Processing complete');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ projectId, error: errorMessage }, 'Processing failed');
    
    try {
      updateProcessingStatus(db, projectId, {
        status: 'error',
        error_message: errorMessage
      });
    } catch (updateError) {
      logger.error({ projectId, error: updateError }, 'Failed to update error status');
    }
  } finally {
    processingLocks.delete(projectId);
    closeDatabase(projectId);
  }
}

/**
 * Resume processing from where it left off
 */
export async function resumeProcessing(projectId: string): Promise<void> {
  const db = getDatabase(projectId);
  const status = getProcessingStatus(db, projectId);
  
  if (!status) {
    throw new Error('Processing status record not found');
  }
  
  if (status.status === 'complete') {
    logger.info({ projectId }, 'Project already complete');
    closeDatabase(projectId);
    return;
  }
  
  if (status.status === 'error') {
    // Clear error and resume
    updateProcessingStatus(db, projectId, { status: 'pending', error_message: null });
  }
  
  closeDatabase(projectId);
  
  // Start processing (will resume from checkpoint)
  await processProject(projectId);
}

