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
 */
async function generateAllEmbeddings(db: Database.Database, projectId: string): Promise<void> {
  const signals = db.prepare(`
    SELECT id, original_text FROM signals WHERE embedding IS NULL
  `).all() as Array<{ id: string; original_text: string }>;
  
  if (signals.length === 0) {
    logger.info({ projectId }, 'Phase 1: All embeddings already generated');
    return;
  }
  
  logger.info({ projectId, count: signals.length }, 'Phase 1: Starting embedding generation');
  
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
  
  logger.info({ projectId, completed, total, remaining: signals.length }, 'Phase 1: Starting embedding generation');
  
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const signalStartTime = Date.now();
    
    try {
      logger.debug({ projectId, signalId: signal.id, index: i + 1, total: signals.length }, 'Generating embedding');
      const embedding = await generateEmbedding(signal.original_text);
      
      if (embedding) {
        updateStmt.run(JSON.stringify(embedding), signal.id);
        const signalDuration = Date.now() - signalStartTime;
        logger.debug({ projectId, signalId: signal.id, duration: signalDuration }, 'Embedding generated');
      } else {
        logger.warn({ projectId, signalId: signal.id }, 'Generated embedding is null');
      }
      
      completed++;
      updateProcessingStatus(db, projectId, { embeddings_complete: completed });
      
      // Log progress more frequently (every 10 signals) and always log milestones
      if (completed % 10 === 0 || completed % PROGRESS_LOG_INTERVAL === 0 || completed === total) {
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
          estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining)
        }, 'Phase 1: Embedding progress');
      }
    } catch (error) {
      const signalDuration = Date.now() - signalStartTime;
      logger.error({ projectId, signalId: signal.id, error, duration: signalDuration }, 'Failed to generate embedding');
      // Continue with next signal
    }
  }
  
  const totalDuration = Date.now() - startTime;
  logger.info({ projectId, completed, total, duration: Math.round(totalDuration / 1000) }, 'Phase 1: Embedding generation complete');
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
 */
async function verifyWithClaude(db: Database.Database, projectId: string): Promise<void> {
  // Use let so we can reassign if connection is closed during async operations
  let dbConnection = db;
  
  const signals = dbConnection.prepare(`
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
  
  logger.info({ projectId, count: signals.length }, 'Phase 3: Starting Claude verification');
  
  const status = getProcessingStatus(dbConnection, projectId);
  if (!status) {
    throw new Error('Processing status record not found');
  }
  let completed = status.claude_verifications_complete || 0;
  let failures = status.claude_verification_failures || 0;
  
  const delayMs = getEnv().CLAUDE_RATE_LIMIT_DELAY_MS;
  
  // Helper function to ensure database connection is valid
  const ensureDbConnection = (): Database.Database => {
    if (!dbConnection.open) {
      logger.warn({ projectId }, 'Database connection closed, getting new connection');
      closeDatabase(projectId);
      dbConnection = getDatabase(projectId);
    }
    return dbConnection;
  };
  
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    let candidates: SimilarityScore[];
    
    // Ensure connection is valid at start of each iteration
    dbConnection = ensureDbConnection();
    
    // Prepare statement fresh each iteration in case connection changed
    const updateStmt = dbConnection.prepare(`
      UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    
    try {
      candidates = JSON.parse(signal.embedding_candidates) as SimilarityScore[];
    } catch (error) {
      logger.error({ signalId: signal.id, error }, 'Failed to parse embedding_candidates JSON');
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      failures++;
      dbConnection = ensureDbConnection();
      updateProcessingStatus(dbConnection, projectId, { 
        claude_verifications_complete: completed,
        claude_verification_failures: failures
      });
      continue;
    }
    
    // Get full text for each candidate
    const candidateIds = candidates.map(c => c.id);
    if (candidateIds.length === 0) {
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      dbConnection = ensureDbConnection();
      updateProcessingStatus(dbConnection, projectId, { claude_verifications_complete: completed });
      continue;
    }
    
    // Batch fetch candidate texts using IN clause with proper parameterization
    const placeholders = candidateIds.map(() => '?').join(',');
    const getCandidateBatchStmt = dbConnection.prepare(`
      SELECT id, original_text FROM signals WHERE id IN (${placeholders})
    `);
    
    let candidateRecords: Array<{ id: string; original_text: string }>;
    try {
      candidateRecords = getCandidateBatchStmt.all(...candidateIds) as Array<{ id: string; original_text: string }>;
    } catch (error) {
      logger.error({ signalId: signal.id, candidateIds, error }, 'Failed to fetch candidate texts');
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      failures++;
      dbConnection = ensureDbConnection();
      updateProcessingStatus(dbConnection, projectId, { 
        claude_verifications_complete: completed,
        claude_verification_failures: failures
      });
      continue;
    }
    
    const candidateMap = new Map(candidateRecords.map(c => [c.id, c.original_text]));
    const candidatesWithText = candidates
      .map(c => ({ id: c.id, text: candidateMap.get(c.id) || '' }))
      .filter(c => c.text !== '');
    
    if (candidatesWithText.length === 0) {
      // No valid candidates found
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      dbConnection = ensureDbConnection();
      updateProcessingStatus(dbConnection, projectId, { claude_verifications_complete: completed });
      continue;
    }
    
    try {
      const verifiedResults = await verifySimilarities(
        { id: signal.id, text: signal.original_text },
        candidatesWithText
      );
      
      // Ensure connection is still valid after async Claude API call
      dbConnection = ensureDbConnection();
      
      // Re-prepare statement in case connection changed
      const currentUpdateStmt = dbConnection.prepare(`
        UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);
      
      // Map Claude's results back to signal IDs (validate array indices)
      const verifiedSimilarities: SimilarityScore[] = verifiedResults
        .filter(result => result.number >= 1 && result.number <= candidatesWithText.length)
        .map(result => {
          const candidate = candidatesWithText[result.number - 1];
          return candidate ? { id: candidate.id, score: result.score } : null;
        })
        .filter((item): item is SimilarityScore => item !== null && item.score >= 5); // Only include score >= 5 as per prompt
      
      currentUpdateStmt.run(JSON.stringify(verifiedSimilarities), signal.id);
      completed++;
      
      logger.debug({ 
        signalId: signal.id, 
        similarCount: verifiedSimilarities.length,
        progress: `${completed}/${signals.length}`
      }, 'Signal verified');
      
    } catch (error) {
      logger.error({ signalId: signal.id, error, errorMessage: error instanceof Error ? error.message : String(error) }, 'Claude verification failed');
      
      // Ensure connection is valid after error
      dbConnection = ensureDbConnection();
      const errorUpdateStmt = dbConnection.prepare(`
        UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);
      
      try {
        errorUpdateStmt.run(JSON.stringify([]), signal.id);
      } catch (updateError) {
        logger.error({ signalId: signal.id, updateError }, 'Failed to update signal with empty similar_signals');
      }
      
      completed++;
      failures++;
    }
    
    // Update status after each signal (connection should be valid)
    dbConnection = ensureDbConnection();
    try {
      updateProcessingStatus(dbConnection, projectId, { 
        claude_verifications_complete: completed,
        claude_verification_failures: failures
      });
    } catch (statusError) {
      logger.error({ projectId, statusError }, 'Failed to update processing status');
    }
    
    // Rate limiting
    if (i < signals.length - 1) {
      await sleep(delayMs);
    }
  }
  
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

