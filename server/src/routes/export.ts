import { Router, Response } from 'express';
import { validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { projectExists } from '../config/database';
import { exportTrendsWithSignals, exportSignals, exportTrendSummaries } from '../services/exportService';
import { logger } from '../config/logger';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use(requireProjectAccess);

// Export trends with signals
router.get('/trends-csv', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const csv = exportTrendsWithSignals(projectId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trends-with-signals-${projectId}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error({ projectId, error }, 'Export failed');
    res.status(500).json({ error: 'Export failed' });
  }
});

// Export all signals
router.get('/signals-csv', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const csv = exportSignals(projectId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="signals-${projectId}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error({ projectId, error }, 'Export failed');
    res.status(500).json({ error: 'Export failed' });
  }
});

// Export trend summaries only
router.get('/summary-csv', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const csv = exportTrendSummaries(projectId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trend-summaries-${projectId}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error({ projectId, error }, 'Export failed');
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;

