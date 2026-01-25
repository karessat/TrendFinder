import { Router, Response } from 'express';
import { getDatabase, closeDatabase, projectExists } from '../config/database';
import { validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { validate, validateQuery } from '../validation/schemas';
import { createSignalSchema, updateSignalSchema, signalListQuerySchema } from '../validation/schemas';
import { logger } from '../config/logger';
import { SignalRecord, SimilarityScore, mapStatusToDisplay, mapDisplayToStatus } from '../types';

/**
 * Generate next sequential numeric signal ID (0001-9999, then extends if needed)
 */
function getNextSignalId(db: any): string {
  // Get all existing signal IDs that are numeric
  const existingSignals = db.prepare('SELECT id FROM signals').all() as Array<{ id: string }>;
  
  // Find the highest numeric ID
  let maxId = 0;
  for (const signal of existingSignals) {
    const idNum = parseInt(signal.id, 10);
    if (!isNaN(idNum) && idNum > maxId) {
      maxId = idNum;
    }
  }
  
  // Increment and format
  const nextId = maxId + 1;
  
  // Format: 4 digits (0001-9999), or extend to 5+ digits if needed
  if (nextId <= 9999) {
    return nextId.toString().padStart(4, '0');
  } else {
    // Extend to more digits if needed (10000, 10001, etc.)
    return nextId.toString();
  }
}

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use(requireProjectAccess);

// List signals
router.get('/', validateQuery(signalListQuerySchema), (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const { status, limit = 50, offset = 0 } = req.query as unknown as { status?: string; limit: number; offset: number };
    
    // Handle status filter - convert display status to internal if needed
    let statusFilter: string | undefined = status;
    if (status) {
      // Check if it's a display status
      if (['Pending', 'Combined', 'Archived'].includes(status)) {
        statusFilter = mapDisplayToStatus(status as 'Pending' | 'Combined' | 'Archived');
      }
    }
    
    let query = 'SELECT id, original_text, title, source, note, status, trend_id, created_at FROM signals';
    const params: any[] = [];
    
    if (statusFilter) {
      query += ' WHERE status = ?';
      params.push(statusFilter);
    }
    
    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const signals = db.prepare(query).all(...params) as Array<{
      id: string;
      original_text: string;
      title: string | null;
      source: string | null;
      note: string | null;
      status: string;
      trend_id: string | null;
      created_at: string;
    }>;
    
    const total = db.prepare('SELECT COUNT(*) as count FROM signals' + (statusFilter ? ' WHERE status = ?' : '')).get(
      ...(statusFilter ? [statusFilter] : [])
    ) as { count: number };
    
    const unassignedCount = db.prepare("SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned'").get() as { count: number };
    
    res.json({
      signals: signals.map(s => ({
        id: s.id,
        originalText: s.original_text,
        title: s.title,
        source: s.source,
        note: s.note,
        status: mapStatusToDisplay(s.status as 'unassigned' | 'assigned' | 'retired'),
        trendId: s.trend_id,
        createdAt: s.created_at
      })),
      total: total.count,
      unassignedCount: unassignedCount.count
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Get next unassigned signal with similar signals
router.get('/next-unassigned', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  // Disable caching for this endpoint since it varies by query parameters
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Get first unassigned signal
    // Note: This query only returns signals with status = 'unassigned'
    // Archived signals (status = 'retired') and combined signals (status = 'assigned') are excluded
    // If excludeSignalId is provided, exclude that signal (useful for Skip functionality)
    const excludeSignalId = req.query.excludeSignalId as string | undefined;
    
    logger.info({ projectId, excludeSignalId, query: req.query }, 'Getting next unassigned signal');
    
    let query = `
      SELECT id, original_text, title, source, note, status, trend_id, created_at, similar_signals
      FROM signals
      WHERE status = 'unassigned'
    `;
    const params: any[] = [];
    
    if (excludeSignalId) {
      query += ' AND id != ?';
      params.push(excludeSignalId);
      logger.info({ excludeSignalId }, 'Excluding signal from query');
    }
    
    query += ' ORDER BY created_at ASC LIMIT 1';
    
    logger.info({ query, params }, 'Executing query for next unassigned signal');
    const signal = db.prepare(query).get(...params) as (SignalRecord & { similar_signals: string | null }) | undefined;
    
    if (signal) {
      logger.info({ signalId: signal.id }, 'Found next unassigned signal');
    } else {
      logger.info('No unassigned signal found');
    }
    
    if (!signal) {
      // Calculate remaining count, excluding the signal we're skipping if provided
      let countQuery = "SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned'";
      const countParams: any[] = [];
      if (excludeSignalId) {
        countQuery += ' AND id != ?';
        countParams.push(excludeSignalId);
      }
      const remainingCount = db.prepare(countQuery).get(...countParams) as { count: number };
      logger.info({ remainingCount: remainingCount.count, excludeSignalId }, 'No signal found, returning remaining count');
      return res.json({
        signal: null,
        similarSignals: [],
        remainingCount: remainingCount.count
      });
    }
    
    // Get similar signals
    let similarSignals: Array<{
      id: string;
      originalText: string;
      score: number;
      status: string;
      trendId: string | null;
      trendSummary?: string;
    }> = [];
    
    if (signal.similar_signals) {
      try {
        const similarIds = JSON.parse(signal.similar_signals) as SimilarityScore[];
        
        if (similarIds.length > 0) {
          const placeholders = similarIds.map(() => '?').join(',');
          const similarRecords = db.prepare(`
            SELECT s.id, s.original_text, s.title, s.source, s.note, s.status, s.trend_id, t.summary as trend_summary
            FROM signals s
            LEFT JOIN trends t ON s.trend_id = t.id
            WHERE s.id IN (${placeholders})
          `).all(...similarIds.map(s => s.id)) as Array<{
            id: string;
            original_text: string;
            title: string | null;
            source: string | null;
            note: string | null;
            status: string;
            trend_id: string | null;
            trend_summary: string | null;
          }>;
          
          const scoreMap = new Map(similarIds.map(s => [s.id, s.score]));
          
          similarSignals = similarRecords.map(rec => ({
            id: rec.id,
            originalText: rec.original_text,
            title: rec.title,
            source: rec.source,
            note: rec.note,
            score: scoreMap.get(rec.id) || 0,
            status: mapStatusToDisplay(rec.status as 'unassigned' | 'assigned' | 'retired'),
            trendId: rec.trend_id,
            trendSummary: rec.trend_summary || undefined
          }));
        }
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Failed to parse similar_signals');
      }
    }
    
    // Calculate remaining count, excluding the current signal
    let countQuery = "SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned' AND id != ?";
    const countParams = [signal.id];
    const remainingCount = db.prepare(countQuery).get(...countParams) as { count: number };
    
    logger.info({ 
      signalId: signal.id, 
      remainingCount: remainingCount.count,
      excludeSignalId,
      hasExclude: !!excludeSignalId
    }, 'Returning next unassigned signal');
    
    res.json({
      signal: {
        id: signal.id,
        originalText: signal.original_text,
        title: signal.title,
        source: signal.source,
        note: signal.note,
        status: mapStatusToDisplay(signal.status),
        trendId: signal.trend_id,
        createdAt: signal.created_at
      },
      similarSignals,
      remainingCount: remainingCount.count
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Get single signal
router.get('/:signalId', (req: AuthRequest, res: Response) => {
  const { projectId, signalId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId) as SignalRecord | undefined;
    
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    res.json({
      id: signal.id,
      originalText: signal.original_text,
      title: signal.title,
      source: signal.source,
      note: signal.note,
      summary: signal.summary,
      status: mapStatusToDisplay(signal.status),
      trendId: signal.trend_id,
      createdAt: signal.created_at,
      updatedAt: signal.updated_at
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Create signal
router.post('/', validate(createSignalSchema), (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Generate sequential numeric ID
    const signalId = getNextSignalId(db);
    
    // Map display status to internal status
    const status = req.body.status 
      ? mapDisplayToStatus(req.body.status) 
      : 'unassigned';
    
    db.prepare(`
      INSERT INTO signals (id, original_text, title, source, note, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      signalId, 
      req.body.description,
      req.body.title || null,
      req.body.source || null,
      req.body.note || null,
      status
    );
    
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId) as SignalRecord;
    
    res.status(201).json({
      id: signal.id,
      originalText: signal.original_text,
      title: signal.title,
      source: signal.source,
      note: signal.note,
      status: mapStatusToDisplay(signal.status),
      trendId: signal.trend_id,
      createdAt: signal.created_at
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Update signal
router.put('/:signalId', validate(updateSignalSchema), (req: AuthRequest, res: Response) => {
  const { projectId, signalId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    if (req.body.description !== undefined) {
      updates.push('original_text = ?');
      values.push(req.body.description);
    }
    
    if (req.body.title !== undefined) {
      updates.push('title = ?');
      values.push(req.body.title);
    }
    
    if (req.body.source !== undefined) {
      updates.push('source = ?');
      values.push(req.body.source || null);
    }
    
    if (req.body.note !== undefined) {
      updates.push('note = ?');
      values.push(req.body.note);
    }
    
    if (req.body.status !== undefined) {
      // Map display status to internal status
      const internalStatus = mapDisplayToStatus(req.body.status);
      
      // If archiving (retired/Archived), require a note explaining why
      if (internalStatus === 'retired' && (!req.body.note || !req.body.note.trim())) {
        // Check if there's already a note in the database
        const currentSignal = db.prepare('SELECT note FROM signals WHERE id = ?').get(signalId) as { note: string | null } | undefined;
        if (!currentSignal?.note || !currentSignal.note.trim()) {
          return res.status(400).json({ 
            error: 'Note is required when archiving a signal. Please provide a reason for archiving.' 
          });
        }
      }
      
      updates.push('status = ?');
      values.push(internalStatus);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(signalId);
    
    db.prepare(`UPDATE signals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId) as SignalRecord | undefined;
    
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    res.json({
      id: signal.id,
      originalText: signal.original_text,
      title: signal.title,
      source: signal.source,
      note: signal.note,
      status: mapStatusToDisplay(signal.status),
      trendId: signal.trend_id,
      createdAt: signal.created_at,
      updatedAt: signal.updated_at
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Delete signal
router.delete('/:signalId', (req: AuthRequest, res: Response) => {
  const { projectId, signalId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const result = db.prepare('DELETE FROM signals WHERE id = ?').run(signalId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    res.status(204).send();
  } finally {
    closeDatabase(projectId);
  }
});

export default router;

