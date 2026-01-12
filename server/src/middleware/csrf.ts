import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

export interface CsrfRequest extends Request {
  csrfToken?: string;
}

const CSRF_TOKEN_COOKIE_NAME = 'csrf-token';
const CSRF_TOKEN_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a new CSRF token
 */
function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * CSRF middleware - validates double-submit cookie pattern
 * 
 * For state-changing operations (POST, PUT, DELETE, PATCH):
 * - Validates that the CSRF token in the cookie matches the token in the header
 * - If no token exists, generates a new one
 * 
 * For safe operations (GET, HEAD, OPTIONS):
 * - Generates/refreshes token if needed but doesn't validate
 */
export function csrfProtection(req: CsrfRequest, res: Response, next: NextFunction) {
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  const cookieToken = (req as any).cookies?.[CSRF_TOKEN_COOKIE_NAME];
  const headerToken = req.headers[CSRF_TOKEN_HEADER_NAME.toLowerCase()] as string | undefined;

  // For state-changing operations, validate CSRF token
  if (isStateChanging) {
    // Skip CSRF validation for auth endpoints (login/register) - they handle their own security
    // Check both req.path (relative to mount) and originalUrl (full path) for robustness
    const path = req.path || '';
    const originalUrl = req.originalUrl || '';
    const isAuthEndpoint = path.includes('/auth/login') || path.includes('/auth/register') ||
                          originalUrl.includes('/auth/login') || originalUrl.includes('/auth/register');
    
    if (isAuthEndpoint) {
      // Still generate token for future requests
      if (!cookieToken) {
        const newToken = generateCsrfToken();
        setCsrfCookie(res, newToken);
        (req as any).csrfToken = newToken;
      }
      return next();
    }

    // Validate CSRF token for all other state-changing operations
    if (!cookieToken || !headerToken) {
      logger.warn({ 
        path: req.path, 
        method: req.method,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken
      }, 'CSRF token missing');
      return res.status(403).json({ error: 'CSRF token missing' });
    }

    if (cookieToken !== headerToken) {
      logger.warn({ 
        path: req.path, 
        method: req.method,
        cookieLength: cookieToken.length,
        headerLength: headerToken.length
      }, 'CSRF token mismatch');
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }

  // Generate new token if it doesn't exist (for GET requests or initial load)
  if (!cookieToken) {
    const newToken = generateCsrfToken();
    setCsrfCookie(res, newToken);
    (req as any).csrfToken = newToken;
  }

  next();
}

/**
 * Set CSRF token cookie
 */
function setCsrfCookie(res: Response, token: string): void {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';
  
  res.cookie(CSRF_TOKEN_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript for double-submit pattern
    secure: isProduction, // Only send over HTTPS in production
    sameSite: 'strict', // Prevent CSRF attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  });
}

/**
 * Get CSRF token endpoint (for initial page load)
 */
export function getCsrfToken(req: Request, res: Response) {
  const cookieToken = (req as any).cookies?.[CSRF_TOKEN_COOKIE_NAME];
  
  if (cookieToken) {
    // Return existing token
    res.json({ csrfToken: cookieToken });
  } else {
    // Generate new token
    const newToken = generateCsrfToken();
    setCsrfCookie(res, newToken);
    res.json({ csrfToken: newToken });
  }
}

