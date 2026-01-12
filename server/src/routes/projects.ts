import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase, projectExists, deleteProjectDatabase, listProjectIds } from '../config/database';
import { processProject } from '../services/processingService';
import { retryFailedVerifications } from '../services/processingService';
import { createUploadMiddleware, handleMulterError, validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { validate } from '../validation/schemas';
import { createProjectSchema } from '../validation/schemas';
import { 
  processSpreadsheetUpload, 
  getUploadPreview, 
  processSpreadsheetUploadLegacy,
  ColumnMappings 
} from '../services/uploadService';
import { assignProjectToUser, getUserProjects } from '../services/authService';
import { logger } from '../config/logger';
import { ProcessingStatusRecord } from '../types';

const router = Router();
// Lazy initialization - create upload middleware when needed
const getUploadMiddleware = () => createUploadMiddleware().single('file');

// Apply authentication to all routes
router.use(requireAuth);

// Apply project ID validation and access control to routes with :projectId
router.param('projectId', validateProjectId);
router.use('/:projectId', requireProjectAccess);

// List all projects (filtered by user's projects)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    // Get user's project IDs
    const userProjectIds = getUserProjects(req.user!.userId);
    const allProjectIds = listProjectIds();
    // Filter to only include user's projects (or all if admin)
    const projectIds = req.user!.role === 'admin' 
      ? allProjectIds 
      : allProjectIds.filter(id => userProjectIds.includes(id));
    
    const projects = projectIds.map(id => {
      const db = getDatabase(id);
      try {
        const signalCount = db.prepare('SELECT COUNT(*) as count FROM signals').get() as { count: number };
        const trendCount = db.prepare('SELECT COUNT(*) as count FROM trends').get() as { count: number };
        const processingStatus = db.prepare('SELECT status FROM processing_status WHERE project_id = ?').get(id) as { status: string } | undefined;
        const projectMeta = db.prepare("SELECT value FROM project_meta WHERE key = 'name'").get() as { value: string } | undefined;
        const createdAt = db.prepare("SELECT value FROM project_meta WHERE key = 'created_at'").get() as { value: string } | undefined;
        
        return {
          id,
          name: projectMeta?.value || 'Unnamed Project',
          signalCount: signalCount.count,
          trendCount: trendCount.count,
          processingStatus: processingStatus?.status || 'pending',
          createdAt: createdAt?.value || new Date().toISOString()
        };
      } finally {
        closeDatabase(id);
      }
    });
    
    res.json(projects);
  } catch (error) {
    logger.error({ error }, 'Failed to list projects');
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Create new project
router.post('/', validate(createProjectSchema), (req: AuthRequest, res: Response) => {
  try {
    const projectId = `proj_${uuidv4().replace(/-/g, '')}`;
    const db = getDatabase(projectId);
    
    try {
      // Store project name in meta table
      db.prepare("INSERT INTO project_meta (key, value) VALUES ('name', ?)").run(req.body.name);
      db.prepare("INSERT INTO project_meta (key, value) VALUES ('created_at', ?)").run(new Date().toISOString());
      
      // Initialize processing status
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(projectId);
      
      // Assign project to current user
      assignProjectToUser(projectId, req.user!.userId);
      
      res.status(201).json({
        id: projectId,
        name: req.body.name,
        createdAt: new Date().toISOString()
      });
    } finally {
      closeDatabase(projectId);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create project');
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Clear all project data (signals, trends, processing status) - keeps the project
router.delete('/:projectId/data', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Delete all signals (this will also remove foreign key references to trends)
    db.prepare('DELETE FROM signals').run();
    
    // Delete all trends
    db.prepare('DELETE FROM trends').run();
    
    // Reset processing status
    db.prepare(`
      UPDATE processing_status 
      SET total_signals = 0,
          embeddings_complete = 0,
          embedding_similarities_complete = 0,
          claude_verifications_complete = 0,
          claude_verification_failures = 0,
          status = 'pending',
          error_message = NULL,
          started_at = NULL,
          completed_at = NULL
      WHERE project_id = ?
    `).run(projectId);
    
    logger.info({ projectId }, 'Project data cleared');
    res.status(204).send();
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to clear project data');
    res.status(500).json({ error: 'Failed to clear project data' });
  } finally {
    closeDatabase(projectId);
  }
});

// Delete project (entire database)
router.delete('/:projectId', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    deleteProjectDatabase(projectId);
    res.status(204).send();
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to delete project');
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Upload preview - returns detected column mappings and sample data
router.post('/:projectId/upload/preview', (req: AuthRequest, res: Response, next: any) => {
  getUploadMiddleware()(req, res, next);
}, handleMulterError, async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const preview = await getUploadPreview(req.file.buffer);
    res.json(preview);
  } catch (error) {
    logger.error({ projectId, error }, 'Upload preview failed');
    res.status(500).json({ error: 'Upload preview failed', details: String(error) });
  }
});

// Upload spreadsheet with column mappings
router.post('/:projectId/upload', (req: AuthRequest, res: Response, next: any) => {
  getUploadMiddleware()(req, res, next);
}, handleMulterError, async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    let result;
    
    // Check if column mappings are provided in request body
    // With multer, FormData fields come as strings that need parsing
    let mappings: ColumnMappings | undefined;
    
    // Check both req.body.mappings (multer) and parsed body
    const mappingsRaw = req.body?.mappings;
    
    logger.debug({ 
      projectId, 
      bodyKeys: Object.keys(req.body || {}),
      hasMappings: !!mappingsRaw,
      mappingsType: typeof mappingsRaw,
      mappingsValue: mappingsRaw
    }, 'Upload request received');
    
    if (mappingsRaw) {
      try {
        let mappingsData: any;
        
        // Parse JSON string if it's a string
        if (typeof mappingsRaw === 'string') {
          mappingsData = JSON.parse(mappingsRaw);
        } else if (typeof mappingsRaw === 'object') {
          mappingsData = mappingsRaw;
        } else {
          throw new Error('Invalid mappings format: must be string or object');
        }
        
        mappings = {
          description: mappingsData.description,
          title: mappingsData.title,
          source: mappingsData.source,
          status: mappingsData.status,
          id: mappingsData.id,
          note: mappingsData.note
        };
        
        logger.info({ projectId, mappings }, 'Parsed column mappings from request');
      } catch (parseError) {
        logger.error({ projectId, error: parseError, mappingsRaw }, 'Failed to parse mappings JSON');
        return res.status(400).json({ 
          error: 'Invalid mappings format. Please ensure column mappings are properly configured.',
          details: parseError instanceof Error ? parseError.message : String(parseError)
        });
      }
    }
    
    if (mappings && mappings.description) {
      // New format: use column mappings
      logger.info({ projectId, descriptionColumn: mappings.description }, 'Using provided column mappings');
      result = await processSpreadsheetUpload(projectId, req.file.buffer, mappings);
    } else {
      // Don't auto-detect - require explicit mappings through the UI
      logger.warn({ projectId }, 'Upload attempted without column mappings');
      return res.status(400).json({ 
        error: 'Column mappings are required. Please use the upload preview interface to configure column mappings first.' 
      });
    }
    
    // Start background processing (non-blocking)
    processProject(projectId).catch(error => {
      logger.error({ projectId, error }, 'Background processing failed');
    });
    
    res.json(result);
  } catch (error) {
    logger.error({ projectId, error }, 'Upload failed');
    res.status(500).json({ error: 'Upload failed', details: String(error) });
  }
});

// Get processing status
router.get('/:projectId/processing-status', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const status = db.prepare('SELECT * FROM processing_status WHERE project_id = ?').get(projectId) as ProcessingStatusRecord | undefined;
    
    if (!status) {
      logger.error({ projectId }, 'Processing status record not found');
      closeDatabase(projectId);
      return res.status(404).json({ error: 'Processing status not found' });
    }
    
    const percentComplete = status.total_signals > 0
      ? Math.round(
          ((status.embeddings_complete + status.embedding_similarities_complete + status.claude_verifications_complete) /
           (status.total_signals * 3)) * 100
        )
      : 0;
    
    const phaseNames: { [key: string]: string } = {
      pending: 'Pending',
      embedding: 'Generating Embeddings',
      embedding_similarity: 'Calculating Similarities',
      claude_verification: 'Verifying with Claude',
      complete: 'Complete',
      error: 'Error'
    };
    
    res.json({
      status: status.status,
      totalSignals: status.total_signals,
      embeddingsComplete: status.embeddings_complete,
      embeddingSimilaritiesComplete: status.embedding_similarities_complete,
      claudeVerificationsComplete: status.claude_verifications_complete,
      claudeVerificationFailures: status.claude_verification_failures,
      currentPhase: phaseNames[status.status] || status.status,
      percentComplete,
      estimatedSecondsRemaining: null, // Could calculate based on rate
      startedAt: status.started_at,
      completedAt: status.completed_at,
      errorMessage: status.error_message
    });
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to get processing status');
    res.status(500).json({ error: 'Failed to get processing status', details: String(error) });
  } finally {
    closeDatabase(projectId);
  }
});

// Resume processing
router.post('/:projectId/resume-processing', async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    // Start processing in background (non-blocking)
    processProject(projectId).catch(error => {
      logger.error({ projectId, error }, 'Resume processing failed');
    });
    
    res.json({ success: true, message: 'Processing resumed' });
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to resume processing');
    res.status(500).json({ error: 'Failed to resume processing' });
  }
});

// Retry failed verifications
router.post('/:projectId/retry-verifications', async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const result = await retryFailedVerifications(projectId);
    res.json(result);
  } catch (error) {
    logger.error({ projectId, error }, 'Failed to retry verifications');
    res.status(500).json({ error: 'Failed to retry verifications' });
  }
});

export default router;

