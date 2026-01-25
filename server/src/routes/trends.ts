import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase, projectExists } from '../config/database';
import { validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { validate } from '../validation/schemas';
import { createTrendSchema, updateTrendSchema, addRemoveSignalsSchema } from '../validation/schemas';
import { generateTrendSummary } from '../services/claudeService';
import { logger } from '../config/logger';
import { TrendRecord, SignalRecord } from '../types';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use(requireProjectAccess);

// List trends
router.get('/', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Check if we should include archived trends (for CRUD views)
    const includeArchived = req.query.includeArchived === 'true';
    
    const query = includeArchived
      ? `SELECT id, title, summary, note, signal_count, status, created_at FROM trends ORDER BY created_at DESC`
      : `SELECT id, title, summary, note, signal_count, status, created_at FROM trends WHERE status != 'archived' ORDER BY created_at DESC`;
    
    const trends = db.prepare(query).all() as Array<{
      id: string;
      title: string | null;
      summary: string;
      note: string | null;
      signal_count: number;
      status: string;
      created_at: string;
    }>;
    
    res.json({
      trends: trends.map(t => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        note: t.note,
        signalCount: t.signal_count,
        status: t.status,
        createdAt: t.created_at
      })),
      total: trends.length
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Get single trend with signals
router.get('/:trendId', (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord | undefined;
    
    if (!trend) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    const signals = db.prepare(`
      SELECT id, original_text, status, trend_id, created_at
      FROM signals
      WHERE trend_id = ?
      ORDER BY created_at ASC
    `).all(trendId) as Array<{
      id: string;
      original_text: string;
      status: string;
      trend_id: string | null;
      created_at: string;
    }>;
    
    res.json({
      trend: {
        id: trend.id,
        title: trend.title,
        summary: trend.summary,
        note: trend.note,
        signalCount: trend.signal_count,
        status: trend.status,
        createdAt: trend.created_at
      },
      signals: signals.map(s => ({
        id: s.id,
        originalText: s.original_text,
        status: s.status,
        trendId: s.trend_id,
        createdAt: s.created_at
      }))
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Create trend from signals
router.post('/', validate(createTrendSchema), async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Verify all signals exist and are unassigned
    const placeholders = req.body.signalIds.map(() => '?').join(',');
    const signals = db.prepare(`
      SELECT id, original_text FROM signals WHERE id IN (${placeholders})
    `).all(...req.body.signalIds) as Array<{ id: string; original_text: string }>;
    
    if (signals.length !== req.body.signalIds.length) {
      return res.status(400).json({ error: 'One or more signals not found' });
    }
    
    // Generate trend title and summary
    const signalTexts = signals.map(s => s.original_text);
    let trendData: { title: string; summary: string };
    
    try {
      trendData = await generateTrendSummary(signalTexts);
      logger.info({ projectId, title: trendData.title, hasTitle: !!trendData.title }, 'Generated trend title and summary');
    } catch (error) {
      logger.error({ projectId, error }, 'Failed to generate trend title and summary');
      return res.status(500).json({ error: 'Failed to generate trend title and summary' });
    }
    
    // Ensure title is not empty
    if (!trendData.title || trendData.title.trim().length === 0) {
      logger.warn({ projectId, trendData }, 'Generated trend data has empty title, using fallback');
      trendData.title = 'Trend';
    }
    
    // Create trend
    const trendId = uuidv4();
    db.prepare(`
      INSERT INTO trends (id, title, summary, signal_count)
      VALUES (?, ?, ?, ?)
    `).run(trendId, trendData.title, trendData.summary, signals.length);
    
    // Get signal titles/IDs for note
    const signalTitles: string[] = [];
    for (const signal of signals) {
      const signalRecord = db.prepare('SELECT title, id FROM signals WHERE id = ?').get(signal.id) as { title: string | null; id: string };
      signalTitles.push(signalRecord.title || signalRecord.id);
    }
    
    // Build note text
    const combinedNote = `Combined with signals: ${signalTitles.join(', ')}`;
    
    // Update signals with auto-populated notes
    const updateStmt = db.prepare('UPDATE signals SET trend_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const noteUpdateStmt = db.prepare('UPDATE signals SET note = ? WHERE id = ?');
    
    for (const signalId of req.body.signalIds) {
      // Update trend_id and status
      updateStmt.run(trendId, 'assigned', signalId);
      
      // Update note (append or create)
      const currentSignal = db.prepare('SELECT note FROM signals WHERE id = ?').get(signalId) as { note: string | null } | undefined;
      const existingNote = currentSignal?.note?.trim() || '';
      
      const newNote = existingNote 
        ? `${existingNote}\n\n${combinedNote}`
        : combinedNote;
      
      noteUpdateStmt.run(newNote, signalId);
    }
    
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.status(201).json({
      trend: {
        id: trend.id,
        title: trend.title || 'Trend', // Ensure title is never null
        summary: trend.summary,
        signalCount: trend.signal_count,
        status: trend.status,
        createdAt: trend.created_at
      }
    });
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to create trend');
    res.status(500).json({ error: 'Failed to create trend' });
  } finally {
    closeDatabase(projectId);
  }
});

// Update trend
router.put('/:trendId', validate(updateTrendSchema), (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    if (req.body.title !== undefined) {
      // Ensure title is not empty
      if (!req.body.title || req.body.title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push('title = ?');
      values.push(req.body.title.trim());
    }
    
    if (req.body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(req.body.summary);
    }
    
    if (req.body.status !== undefined) {
      updates.push('status = ?');
      values.push(req.body.status);
    }
    
    if (req.body.note !== undefined) {
      updates.push('note = ?');
      values.push(req.body.note);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(trendId);
    
    db.prepare(`UPDATE trends SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord | undefined;
    
    if (!trend) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    res.json({
      trend: {
        id: trend.id,
        title: trend.title,
        summary: trend.summary,
        note: trend.note,
        signalCount: trend.signal_count,
        status: trend.status,
        createdAt: trend.created_at
      }
    });
  } finally {
    closeDatabase(projectId);
  }
});

// Delete trend
// Undo trend creation - restore signals to pending and archive the trend
router.post('/:trendId/undo', (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Check if trend exists
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord | undefined;
    if (!trend) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    // Restore signals to pending status (unassigned)
    const updateResult = db.prepare(`
      UPDATE signals 
      SET trend_id = NULL, status = 'unassigned', updated_at = CURRENT_TIMESTAMP 
      WHERE trend_id = ?
    `).run(trendId);
    
    // Archive the trend instead of deleting it
    db.prepare('UPDATE trends SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('archived', trendId);
    
    const archivedTrend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.json({
      trend: {
        id: archivedTrend.id,
        title: archivedTrend.title,
        summary: archivedTrend.summary,
        note: archivedTrend.note,
        signalCount: archivedTrend.signal_count,
        status: archivedTrend.status,
        createdAt: archivedTrend.created_at
      },
      signalsRestored: updateResult.changes
    });
  } finally {
    closeDatabase(projectId);
  }
});

router.delete('/:trendId', (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Unassign signals
    db.prepare('UPDATE signals SET trend_id = NULL, status = ?, updated_at = CURRENT_TIMESTAMP WHERE trend_id = ?').run('unassigned', trendId);
    
    // Delete trend
    const result = db.prepare('DELETE FROM trends WHERE id = ?').run(trendId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    res.status(204).send();
  } finally {
    closeDatabase(projectId);
  }
});

// Regenerate trend summary
router.post('/:trendId/regenerate-summary', async (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const signals = db.prepare(`
      SELECT original_text FROM signals WHERE trend_id = ?
    `).all(trendId) as Array<{ original_text: string }>;
    
    if (signals.length === 0) {
      return res.status(400).json({ error: 'Trend has no signals' });
    }
    
    const signalTexts = signals.map(s => s.original_text);
    const trendData = await generateTrendSummary(signalTexts);
    
    db.prepare('UPDATE trends SET title = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(trendData.title, trendData.summary, trendId);
    
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.json({
      trend: {
        id: trend.id,
        title: trend.title,
        summary: trend.summary,
        signalCount: trend.signal_count,
        status: trend.status,
        createdAt: trend.created_at
      }
    });
  } catch (error) {
    logger.error({ projectId, trendId, error }, 'Failed to regenerate summary');
    res.status(500).json({ error: 'Failed to regenerate summary' });
  } finally {
    closeDatabase(projectId);
  }
});

// Add signals to trend
router.post('/:trendId/add-signals', validate(addRemoveSignalsSchema), async (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord | undefined;
    if (!trend) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    // Get signal titles/IDs for note
    const signalTitles: string[] = [];
    for (const signalId of req.body.signalIds) {
      const signalRecord = db.prepare('SELECT title, id FROM signals WHERE id = ?').get(signalId) as { title: string | null; id: string } | undefined;
      if (signalRecord) {
        signalTitles.push(signalRecord.title || signalRecord.id);
      }
    }
    
    const combinedNote = `Added to trend with signals: ${signalTitles.join(', ')}`;
    
    // Update signals with auto-populated notes
    for (const signalId of req.body.signalIds) {
      // Update trend_id and status
      db.prepare('UPDATE signals SET trend_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(trendId, 'assigned', signalId);
      
      // Update note (append or create)
      const currentSignal = db.prepare('SELECT note FROM signals WHERE id = ?').get(signalId) as { note: string | null } | undefined;
      const existingNote = currentSignal?.note?.trim() || '';
      
      const newNote = existingNote 
        ? `${existingNote}\n\n${combinedNote}`
        : combinedNote;
      
      db.prepare('UPDATE signals SET note = ? WHERE id = ?').run(newNote, signalId);
    }
    
    // Update signal count
    const newCount = db.prepare('SELECT COUNT(*) as count FROM signals WHERE trend_id = ?').get(trendId) as { count: number };
    db.prepare('UPDATE trends SET signal_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newCount.count, trendId);
    
    // Regenerate summary if requested
    if (req.body.regenerateSummary) {
      const signals = db.prepare('SELECT original_text FROM signals WHERE trend_id = ?').all(trendId) as Array<{ original_text: string }>;
      const trendData = await generateTrendSummary(signals.map(s => s.original_text));
      db.prepare('UPDATE trends SET title = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(trendData.title, trendData.summary, trendId);
    }
    
    const updatedTrend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.json({
      trend: {
        id: updatedTrend.id,
        summary: updatedTrend.summary,
        signalCount: updatedTrend.signal_count,
        status: updatedTrend.status,
        createdAt: updatedTrend.created_at
      }
    });
  } catch (error) {
    logger.error({ projectId, trendId, error }, 'Failed to add signals');
    res.status(500).json({ error: 'Failed to add signals' });
  } finally {
    closeDatabase(projectId);
  }
});

// Remove signals from trend
router.post('/:trendId/remove-signals', validate(addRemoveSignalsSchema), async (req: AuthRequest, res: Response) => {
  const { projectId, trendId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord | undefined;
    if (!trend) {
      return res.status(404).json({ error: 'Trend not found' });
    }
    
    // Update signals
    const placeholders = req.body.signalIds.map(() => '?').join(',');
    db.prepare(`UPDATE signals SET trend_id = NULL, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND trend_id = ?`)
      .run('unassigned', ...req.body.signalIds, trendId);
    
    // Update signal count
    const newCount = db.prepare('SELECT COUNT(*) as count FROM signals WHERE trend_id = ?').get(trendId) as { count: number };
    db.prepare('UPDATE trends SET signal_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newCount.count, trendId);
    
    // Regenerate summary if requested and trend still has signals
    if (req.body.regenerateSummary && newCount.count > 0) {
      const signals = db.prepare('SELECT original_text FROM signals WHERE trend_id = ?').all(trendId) as Array<{ original_text: string }>;
      const trendData = await generateTrendSummary(signals.map(s => s.original_text));
      db.prepare('UPDATE trends SET title = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(trendData.title, trendData.summary, trendId);
    }
    
    const updatedTrend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.json({
      trend: {
        id: updatedTrend.id,
        summary: updatedTrend.summary,
        signalCount: updatedTrend.signal_count,
        status: updatedTrend.status,
        createdAt: updatedTrend.created_at
      }
    });
  } catch (error) {
    logger.error({ projectId, trendId, error }, 'Failed to remove signals');
    res.status(500).json({ error: 'Failed to remove signals' });
  } finally {
    closeDatabase(projectId);
  }
});

export default router;

