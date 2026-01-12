import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

/**
 * Rate limiting for API endpoints
 * Simple in-memory implementation - use Redis for production scale
 * Includes automatic cleanup of old entries to prevent memory leaks
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_RATE_LIMIT_ENTRIES = 10000;
const CLEANUP_INTERVAL_MS = 60000; // Clean up every minute

// Periodic cleanup of expired rate limit entries
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
      cleaned++;
    }
  }
  
  // If still too many entries, remove oldest
  if (requestCounts.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = Array.from(requestCounts.entries());
    entries.sort((a, b) => a[1].resetTime - b[1].resetTime);
    const toRemove = entries.slice(0, requestCounts.size - MAX_RATE_LIMIT_ENTRIES);
    for (const [key] of toRemove) {
      requestCounts.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug({ cleaned, remaining: requestCounts.size }, 'Cleaned up rate limit entries');
  }
}, CLEANUP_INTERVAL_MS);

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    let record = requestCounts.get(key);
    
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      requestCounts.set(key, record);
    }
    
    record.count++;
    
    if (record.count > maxRequests) {
      logger.warn({ ip: key, count: record.count, path: req.path }, 'Rate limit exceeded');
      return res.status(429).json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    next();
  };
}

/**
 * File upload configuration with size limits
 */
export function createUploadMiddleware() {
  const maxSizeMB = getEnv().MAX_FILE_SIZE_MB;
  
  const storage = multer.memoryStorage();
  
  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  };
  
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSizeMB * 1024 * 1024,
      files: 1
    }
  });
}

/**
 * Error handler for multer errors
 */
export function handleMulterError(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `File too large. Maximum size is ${getEnv().MAX_FILE_SIZE_MB}MB` 
      });
    }
    return res.status(400).json({ error: err.message });
  }
  
  if (err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  
  next(err);
}

/**
 * Sanitize string inputs
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim();
}

/**
 * Project ID validation middleware
 */
export function validateProjectId(req: Request, res: Response, next: NextFunction) {
  const projectId = req.params.projectId;
  
  // Log for debugging
  logger.debug({ 
    projectId, 
    length: projectId?.length,
    path: req.path,
    url: req.url,
    method: req.method
  }, 'Validating project ID');
  
  // Project IDs are: proj_ followed by UUID without dashes (32 hex chars)
  // Allow lowercase hex (a-f) and uppercase (A-F) and numbers
  // Total length should be 5 (proj_) + 32 (hex) = 37 characters
  if (!projectId) {
    logger.warn({ projectId, path: req.path, url: req.url }, 'Missing project ID');
    return res.status(400).json({ error: 'Project ID is required' });
  }
  
  if (!/^proj_[a-fA-F0-9]{32}$/.test(projectId)) {
    logger.warn({ 
      projectId, 
      length: projectId.length, 
      path: req.path,
      fullUrl: req.url,
      method: req.method,
      params: req.params
    }, 'Invalid project ID format');
    return res.status(400).json({ 
      error: 'Invalid project ID format',
      received: projectId,
      receivedLength: projectId.length,
      expectedFormat: 'proj_ followed by 32 hex characters (total 37 chars)'
    });
  }
  
  next();
}

