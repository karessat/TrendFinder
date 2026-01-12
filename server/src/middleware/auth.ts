import { Request, Response, NextFunction } from 'express';
import { verifyToken, checkProjectAccess } from '../services/authService';
import { logger } from '../config/logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : (req as any).cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role
  };
  
  next();
}

export function requireProjectAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const projectId = req.params.projectId;
  if (!projectId) {
    return next();
  }
  
  const hasAccess = checkProjectAccess(
    req.user.userId,
    projectId,
    req.user.role
  );
  
  if (!hasAccess) {
    logger.warn({ userId: req.user.userId, projectId }, 'Project access denied');
    return res.status(403).json({ error: 'Access denied to this project' });
  }
  
  next();
}


