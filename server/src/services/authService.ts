import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserDatabase } from '../config/userDatabase';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user' | 'viewer';
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
}

function getJwtSecret(): string {
  try {
    return getEnv().JWT_SECRET;
  } catch {
    return process.env.JWT_SECRET || 'change-me-in-production';
  }
}

function getJwtExpiry(): string {
  try {
    return getEnv().JWT_EXPIRY;
  } catch {
    return process.env.JWT_EXPIRY || '7d';
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthTokenPayload): string {
  const secret = getJwtSecret();
  const expiry = getJwtExpiry();
  // @ts-ignore - expiresIn accepts string values like '7d'
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch (error) {
    logger.warn({ error }, 'Token verification failed');
    return null;
  }
}

export function getUserByEmail(email: string): User | null {
  const db = getUserDatabase();
  
  const user = db.prepare(`
    SELECT id, email, name, role, created_at
    FROM users
    WHERE email = ?
  `).get(email.toLowerCase()) as {
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
  } | undefined;
  
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'admin' | 'user' | 'viewer',
    createdAt: user.created_at
  };
}

export async function createUser(email: string, password: string, name?: string): Promise<User> {
  const db = getUserDatabase();
  const userId = uuidv4();
  const passwordHash = await hashPassword(password);
  
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, 'user')
  `).run(userId, email.toLowerCase(), passwordHash, name || null);
  
  logger.info({ userId, email }, 'User created');
  
  return {
    id: userId,
    email: email.toLowerCase(),
    name: name || null,
    role: 'user',
    createdAt: new Date().toISOString()
  };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = getUserDatabase();
  
  const user = db.prepare(`
    SELECT id, email, password_hash, name, role, created_at
    FROM users
    WHERE email = ?
  `).get(email.toLowerCase()) as {
    id: string;
    email: string;
    password_hash: string;
    name: string | null;
    role: string;
    created_at: string;
  } | undefined;
  
  if (!user) {
    return null;
  }
  
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }
  
  // Update last login
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'admin' | 'user' | 'viewer',
    createdAt: user.created_at
  };
}

export function assignProjectToUser(projectId: string, userId: string): void {
  const db = getUserDatabase();
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO project_owners (project_id, user_id)
      VALUES (?, ?)
    `).run(projectId, userId);
  } catch (error) {
    logger.error({ projectId, userId, error }, 'Failed to assign project to user');
    throw error;
  }
}

export function getUserProjects(userId: string): string[] {
  const db = getUserDatabase();
  
  const projects = db.prepare(`
    SELECT project_id FROM project_owners WHERE user_id = ?
  `).all(userId) as Array<{ project_id: string }>;
  
  return projects.map(p => p.project_id);
}

export function checkProjectAccess(userId: string, projectId: string, userRole: string): boolean {
  // Admins have access to all projects
  if (userRole === 'admin') {
    return true;
  }
  
  // Users can access their own projects
  const db = getUserDatabase();
  const owner = db.prepare(`
    SELECT 1 FROM project_owners WHERE project_id = ? AND user_id = ?
  `).get(projectId, userId);
  
  return owner !== undefined;
}

/**
 * Create a password reset token for a user
 * Returns the plain token (to be sent via email) and stores the hash in the database
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const db = getUserDatabase();
  const crypto = await import('crypto');
  
  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = await hashPassword(token); // Use bcrypt to hash the token
  
  const resetId = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  
  // Invalidate any existing reset tokens for this user
  db.prepare(`
    UPDATE user_password_resets 
    SET used_at = CURRENT_TIMESTAMP 
    WHERE user_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).run(userId);
  
  // Insert new reset token
  db.prepare(`
    INSERT INTO user_password_resets (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(resetId, userId, tokenHash, expiresAt.toISOString());
  
  logger.info({ userId, resetId }, 'Password reset token created');
  
  return token;
}

/**
 * Verify and consume a password reset token
 * Returns the user ID if valid, null otherwise
 */
export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const db = getUserDatabase();
  
  // Get all unused, unexpired reset tokens
  const resets = db.prepare(`
    SELECT id, user_id, token_hash, expires_at
    FROM user_password_resets
    WHERE used_at IS NULL 
      AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all() as Array<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
  }>;
  
  // Check each token (we need to check all because tokens are hashed)
  for (const reset of resets) {
    const isValid = await verifyPassword(token, reset.token_hash);
    if (isValid) {
      // Mark token as used
      db.prepare(`
        UPDATE user_password_resets 
        SET used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(reset.id);
      
      logger.info({ userId: reset.user_id, resetId: reset.id }, 'Password reset token verified');
      return reset.user_id;
    }
  }
  
  logger.warn('Invalid or expired password reset token');
  return null;
}

/**
 * Update user password
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const db = getUserDatabase();
  const passwordHash = await hashPassword(newPassword);
  
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(passwordHash, userId);
  
  logger.info({ userId }, 'User password updated');
}

