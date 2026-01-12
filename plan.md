# TrendFinder
## Technical Specification for Cursor (Updated Version)

---

## Executive Summary

Build a web application that helps users identify trends from scan hits (signals). Users upload spreadsheet data, the app pre-computes semantic similarities using a hybrid approach (local embeddings + Claude verification), and users work through signals to group them into trends. Final clustered data can be exported as CSV.

**Core principle:** Local embeddings handle fast filtering, Claude Sonnet verifies and scores the top candidates for quality. This achieves near-Claude quality at ~99% cost reduction compared to naive approaches.

**Expected cost per project:** ~$6.50 for 500 signals (one-time processing after upload)

**Expected limits:** Tested for up to 1,000 signals per project. Processing time: ~15-30 minutes for 500 signals.

---

## Technology Stack

### Backend
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** SQLite via `better-sqlite3`
- **File uploads:** `multer`
- **Spreadsheet parsing:** `@e965/xlsx` (secure fork of xlsx)
- **Local embeddings:** `@xenova/transformers`
- **Claude API:** `@anthropic-ai/sdk`
- **Validation:** `zod`
- **Logging:** `pino`
- **IDs:** `uuid`

### Frontend
- **Framework:** React with TypeScript (Vite)
- **Routing:** react-router-dom
- **State Management:** React Context + useReducer (simple, no external deps)
- **HTTP client:** axios
- **Styling:** Tailwind CSS

### Key Dependencies

Backend:
```
express cors dotenv multer @e965/xlsx better-sqlite3 uuid @anthropic-ai/sdk @xenova/transformers zod pino pino-pretty
```

Backend dev dependencies:
```
typescript ts-node @types/node @types/express @types/cors @types/multer @types/better-sqlite3 @types/uuid vitest
```

Frontend:
```
axios react-router-dom tailwindcss autoprefixer postcss
```

Frontend dev dependencies (via Vite React-TS template):
```
vitest @testing-library/react @testing-library/jest-dom
```

### Authentication & Authorization (Multi-User Support)

For multi-user deployment, the following authentication system will be implemented:

- **Authentication:** JWT-based authentication using `jsonwebtoken` and `bcryptjs`
- **User Management:** SQLite user database with session management
- **Authorization:** Role-based access control (RBAC) with user-project ownership
- **Session Management:** JWT tokens stored in HTTP-only cookies for security

**Additional Backend Dependencies:**
```
jsonwebtoken bcryptjs express-session cookie-parser
@types/jsonwebtoken @types/bcryptjs @types/cookie-parser
```

**User Roles:**
- `admin`: Full system access
- `user`: Can create and manage own projects
- `viewer`: Read-only access to assigned projects (future feature)

---

## Architecture Overview

### Background Processing (Runs After Upload)

```
User uploads spreadsheet
         ↓
Server validates & parses spreadsheet → Creates signals in SQLite
         ↓
Background processing starts (3 phases):
  PHASE 1: Generate embedding for each signal (local, ~50-100ms each)
           ↳ Progress saved after each signal
  PHASE 2: Calculate initial similarities via embeddings (local math, fast)
           ↳ Progress saved after each signal
  PHASE 3: Claude verifies each signal's top 40 candidates (API call)
           ↳ Progress saved after each signal (resumable on failure)
           ↳ Failed verifications queued for retry
         ↓
Processing complete - User can now review signals
```

### User Workflow (On-Demand, After Processing)

```
User works through signals:
  - Select a signal → Instantly see Claude-verified similar signals (from database)
  - Select which signals belong together
  - Click "Create Trend" → Claude generates summary (API call happens HERE)
  - Grouped signals marked as "assigned"
         ↓
User exports CSV of clustered trends
```

**IMPORTANT:** Trend summary generation is NOT part of background processing. It happens on-demand when the user clicks "Create Trend."

### Expected Processing Times

| Dataset Size | Phase 1 (Embeddings) | Phase 2 (Similarity) | Phase 3 (Claude) | Total |
|--------------|---------------------|---------------------|------------------|-------|
| 100 signals | ~1 min | ~5 sec | ~3 min | ~5 min |
| 250 signals | ~2 min | ~15 sec | ~8 min | ~10 min |
| 500 signals | ~4 min | ~30 sec | ~15 min | ~20 min |
| 1000 signals | ~8 min | ~2 min | ~30 min | ~40 min |

---

## Type Definitions

Create: `server/src/types/index.ts`

```typescript
// ============================================
// Database Record Types (as stored in SQLite)
// ============================================

export interface SignalRecord {
  id: string;
  original_text: string;
  summary: string | null;
  embedding: string | null;           // JSON string of number[]
  embedding_candidates: string | null; // JSON string of SimilarityScore[]
  similar_signals: string | null;      // JSON string of SimilarityScore[]
  status: SignalStatus;
  trend_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrendRecord {
  id: string;
  summary: string;
  signal_count: number;
  status: TrendStatus;
  created_at: string;
  updated_at: string;
}

export interface ProcessingStatusRecord {
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

// ============================================
// Enums and Literal Types
// ============================================

export type SignalStatus = 'unassigned' | 'assigned' | 'retired';
export type TrendStatus = 'draft' | 'final';
export type ProcessingPhase = 
  | 'pending' 
  | 'embedding' 
  | 'embedding_similarity' 
  | 'claude_verification' 
  | 'complete' 
  | 'error';

// ============================================
// Application Types
// ============================================

export interface SimilarityScore {
  id: string;
  score: number;
}

export interface ProcessingStatus {
  status: ProcessingPhase;
  totalSignals: number;
  embeddingsComplete: number;
  embeddingSimilaritiesComplete: number;
  claudeVerificationsComplete: number;
  claudeVerificationFailures: number;
  currentPhase: string;
  percentComplete: number;
  estimatedSecondsRemaining: number | null;
}

// ============================================
// API Request Types (with Zod schemas below)
// ============================================

export interface CreateProjectRequest {
  name: string;
}

export interface CreateSignalRequest {
  text: string;
}

export interface UpdateSignalRequest {
  text?: string;
  status?: SignalStatus;
}

export interface CreateTrendRequest {
  signalIds: string[];
}

export interface UpdateTrendRequest {
  summary?: string;
  status?: TrendStatus;
}

export interface AddSignalsToTrendRequest {
  signalIds: string[];
  regenerateSummary?: boolean;
}

export interface RemoveSignalsFromTrendRequest {
  signalIds: string[];
  regenerateSummary?: boolean;
}

// ============================================
// API Response Types
// ============================================

export interface ProjectResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  signalCount: number;
  trendCount: number;
  processingStatus: ProcessingPhase;
  createdAt: string;
}

export interface UploadResponse {
  success: boolean;
  signalCount: number;
  detectedColumn: string;
  processingStarted: boolean;
  estimatedCost: string;
  estimatedMinutes: number;
}

export interface SignalListResponse {
  signals: SignalListItem[];
  total: number;
  unassignedCount: number;
}

export interface SignalListItem {
  id: string;
  originalText: string;
  status: SignalStatus;
  trendId: string | null;
  createdAt: string;
}

export interface SimilarSignalItem {
  id: string;
  originalText: string;
  score: number;
  status: SignalStatus;
  trendId: string | null;
  trendSummary?: string;
}

export interface NextUnassignedResponse {
  signal: SignalListItem | null;
  similarSignals: SimilarSignalItem[];
  remainingCount: number;
}

export interface TrendListItem {
  id: string;
  summary: string;
  signalCount: number;
  status: TrendStatus;
  createdAt: string;
}

export interface TrendListResponse {
  trends: TrendListItem[];
  total: number;
}

export interface TrendDetailResponse {
  trend: TrendListItem;
  signals: SignalListItem[];
}

export interface TrendResponse {
  trend: TrendListItem;
}

export interface ProcessingStatusResponse extends ProcessingStatus {}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// ============================================
// Claude API Types
// ============================================

export interface ClaudeVerificationResult {
  number: number;
  score: number;
}
```

---

## Input Validation Schemas

Create: `server/src/validation/schemas.ts`

```typescript
import { z } from 'zod';

// Project validation
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long')
});

// Signal validation
export const createSignalSchema = z.object({
  text: z.string().min(1, 'Text is required').max(10000, 'Text too long')
});

export const updateSignalSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  status: z.enum(['unassigned', 'assigned', 'retired']).optional()
}).refine(data => data.text || data.status, {
  message: 'At least one field required'
});

// Trend validation
export const createTrendSchema = z.object({
  signalIds: z.array(z.string().uuid()).min(1, 'At least one signal required').max(50, 'Too many signals')
});

export const updateTrendSchema = z.object({
  summary: z.string().min(1).max(1000).optional(),
  status: z.enum(['draft', 'final']).optional()
});

export const addRemoveSignalsSchema = z.object({
  signalIds: z.array(z.string().uuid()).min(1).max(50),
  regenerateSummary: z.boolean().optional().default(false)
});

// Query params validation
export const signalListQuerySchema = z.object({
  status: z.enum(['unassigned', 'assigned', 'retired']).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0)
});

// Validation middleware helper
export function validate<T>(schema: z.Schema<T>) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map(e => e.message).join(', ')
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: z.Schema<T>) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.errors.map(e => e.message).join(', ')
      });
    }
    req.query = result.data;
    next();
  };
}
```

---

## Database Configuration

Create: `server/src/config/database.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

const DATA_DIR = process.env.DATA_DIR || './data/projects';

// Resolve to absolute path to prevent path traversal issues
const resolvedDataDir = path.isAbsolute(DATA_DIR) 
  ? DATA_DIR 
  : path.resolve(process.cwd(), DATA_DIR);

// Ensure data directory exists
if (!fs.existsSync(resolvedDataDir)) {
  fs.mkdirSync(resolvedDataDir, { recursive: true });
}

// Connection cache with LRU-like cleanup (max 50 connections)
const connectionCache = new Map<string, Database.Database>();
const MAX_CACHE_SIZE = 50;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    original_text TEXT NOT NULL,
    summary TEXT,
    embedding TEXT,
    embedding_candidates TEXT,
    similar_signals TEXT,
    status TEXT DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'retired')),
    trend_id TEXT REFERENCES trends(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trends (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    signal_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS processing_status (
    project_id TEXT PRIMARY KEY,
    total_signals INTEGER DEFAULT 0,
    embeddings_complete INTEGER DEFAULT 0,
    embedding_similarities_complete INTEGER DEFAULT 0,
    claude_verifications_complete INTEGER DEFAULT 0,
    claude_verification_failures INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS project_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
  CREATE INDEX IF NOT EXISTS idx_signals_trend_id ON signals(trend_id);
  CREATE INDEX IF NOT EXISTS idx_signals_embedding_null ON signals(embedding) WHERE embedding IS NULL;
  CREATE INDEX IF NOT EXISTS idx_signals_embedding_candidates_null ON signals(embedding_candidates) WHERE embedding_candidates IS NULL;
  CREATE INDEX IF NOT EXISTS idx_signals_similar_signals_null ON signals(similar_signals) WHERE similar_signals IS NULL;
  CREATE INDEX IF NOT EXISTS idx_signals_retry ON signals(similar_signals, embedding_candidates) WHERE similar_signals = '[]';
`;

/**
 * Cleanup old connections from cache when it exceeds max size
 */
function cleanupConnectionCache(): void {
  if (connectionCache.size <= MAX_CACHE_SIZE) return;
  
  // Remove oldest entries (simple FIFO approach)
  const entries = Array.from(connectionCache.entries());
  const toRemove = entries.slice(0, connectionCache.size - MAX_CACHE_SIZE);
  
  for (const [projectId, db] of toRemove) {
    if (db.open) {
      try {
        db.close();
      } catch (error) {
        logger.warn({ projectId, error }, 'Error closing cached database connection');
      }
    }
    connectionCache.delete(projectId);
  }
  
  logger.debug({ removed: toRemove.length, remaining: connectionCache.size }, 'Cleaned up connection cache');
}

/**
 * Get database connection for a project.
 * Connections are cached and should be closed after use.
 * 
 * Note: better-sqlite3 is synchronous and handles file locking internally.
 * With WAL mode enabled, SQLite supports concurrent reads and single writer.
 * For multi-user deployments, user authentication and authorization ensure proper access control.
 */
export function getDatabase(projectId: string): Database.Database {
  // Validate projectId format to prevent path traversal
  if (!/^proj_[a-zA-Z0-9]+$/.test(projectId)) {
    throw new Error('Invalid project ID format');
  }
  
  const dbPath = path.join(resolvedDataDir, `${projectId}.db`);
  
  // Ensure path stays within resolvedDataDir (additional safety check)
  if (!dbPath.startsWith(resolvedDataDir)) {
    throw new Error('Invalid database path - potential path traversal detected');
  }
  
  // Cleanup cache if needed
  cleanupConnectionCache();
  
  // Check cache first
  let db = connectionCache.get(projectId);
  if (db && db.open) {
    return db;
  }
  
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL'); // Better concurrent read performance
  db.exec(SCHEMA);
  
  connectionCache.set(projectId, db);
  logger.debug({ projectId }, 'Database connection opened');
  
  return db;
}

export function closeDatabase(projectId: string): void {
  const db = connectionCache.get(projectId);
  if (db && db.open) {
    db.close();
    connectionCache.delete(projectId);
    logger.debug({ projectId }, 'Database connection closed');
  }
}

export function getProjectPath(projectId: string): string {
  if (!/^proj_[a-zA-Z0-9]+$/.test(projectId)) {
    throw new Error('Invalid project ID format');
  }
  const dbPath = path.join(resolvedDataDir, `${projectId}.db`);
  if (!dbPath.startsWith(resolvedDataDir)) {
    throw new Error('Invalid database path - potential path traversal detected');
  }
  return dbPath;
}

export function projectExists(projectId: string): boolean {
  if (!/^proj_[a-zA-Z0-9]+$/.test(projectId)) {
    return false;
  }
  return fs.existsSync(getProjectPath(projectId));
}

export function deleteProjectDatabase(projectId: string): void {
  closeDatabase(projectId);
  const dbPath = getProjectPath(projectId);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    // Also remove WAL files if they exist
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  }
  logger.info({ projectId }, 'Project database deleted');
}

export function listProjectIds(): string[] {
  try {
    return fs.readdirSync(resolvedDataDir)
      .filter(f => f.endsWith('.db') && !f.includes('-wal') && !f.includes('-shm'))
      .map(f => f.replace('.db', ''))
      .filter(id => /^proj_[a-zA-Z0-9]+$/.test(id)); // Additional validation
  } catch (error) {
    logger.error({ error, dataDir: resolvedDataDir }, 'Failed to list project IDs');
    return [];
  }
}
```

---

## Authentication & User Management

For multi-user support, TrendFinder includes JWT-based authentication and user management.

### User Database Schema

Create: `server/src/config/userDatabase.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { getEnv } from './env';

const DATA_DIR = process.env.DATA_DIR || './data/projects';
const resolvedDataDir = path.isAbsolute(DATA_DIR) 
  ? DATA_DIR 
  : path.resolve(process.cwd(), DATA_DIR);

// Ensure data directory exists
if (!fs.existsSync(resolvedDataDir)) {
  fs.mkdirSync(resolvedDataDir, { recursive: true });
}

const USER_DB_PATH = path.join(resolvedDataDir, 'users.db');

const USER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_owners (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_project_owners_project_id ON project_owners(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id);
`;

let userDb: Database.Database | null = null;

export function getUserDatabase(): Database.Database {
  if (!userDb) {
    const exists = fs.existsSync(USER_DB_PATH);
    userDb = new Database(USER_DB_PATH);
    userDb.pragma('foreign_keys = ON');
    userDb.pragma('journal_mode = WAL');
    userDb.exec(USER_SCHEMA);
    
    if (!exists) {
      logger.info('User database created');
    }
  }
  return userDb;
}

export function closeUserDatabase(): void {
  if (userDb && userDb.open) {
    userDb.close();
    userDb = null;
  }
}
```

**Note:** The user database is separate from project databases. Each project database stores signals and trends, while the user database manages authentication and project ownership.

### Authentication Service

Create: `server/src/services/authService.ts`

```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserDatabase } from '../config/userDatabase';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = getEnv().JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = '7d';
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

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch (error) {
    logger.warn({ error }, 'Token verification failed');
    return null;
  }
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
```

### Authentication Middleware

Create: `server/src/middleware/auth.ts`

```typescript
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
    : req.cookies?.token;
  
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
```

---

## Logging Configuration

Create: `server/src/config/logger.ts`

```typescript
import pino from 'pino';
import { randomUUID } from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Request logging middleware with request ID for tracing
export function requestLogger(req: any, res: any, next: any) {
  const start = Date.now();
  const requestId = randomUUID().substring(0, 8);
  req.requestId = requestId; // Attach to request for use in other middleware/handlers
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  
  next();
}
```

---

## Environment Configuration

Create: `server/src/config/env.ts`

```typescript
import { z } from 'zod';
import { logger } from './logger';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ANTHROPIC_API_KEY: z.string()
    .min(1, 'ANTHROPIC_API_KEY is required')
    .refine((key) => key.startsWith('sk-ant-'), {
      message: 'ANTHROPIC_API_KEY must start with sk-ant-'
    }),
  EMBEDDING_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),
  DATA_DIR: z.string().default('./data/projects'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  CLAUDE_RATE_LIMIT_DELAY_MS: z.coerce.number().default(150),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173')
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  if (env) return env;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    logger.error({ errors: result.error.errors }, 'Environment validation failed');
    console.error('Environment validation failed:');
    result.error.errors.forEach(err => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  
  env = result.data;
  logger.info('Environment configuration loaded');
  return env;
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not loaded. Call loadEnv() first.');
  }
  return env;
}
```

---

## Embedding Service with Singleton Pattern

Create: `server/src/services/embeddingService.ts`

```typescript
import { pipeline } from '@xenova/transformers';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

// Singleton pattern: Load model once at startup
let embeddingPipeline: any = null;
let modelLoadingPromise: Promise<any> | null = null;

/**
 * Initialize embedding pipeline (loads model on first call)
 * Uses singleton pattern to avoid reloading model for each request
 */
async function getEmbeddingPipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }
  
  // If already loading, wait for that promise
  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }
  
  // Start loading
  modelLoadingPromise = (async () => {
    try {
      logger.info({ model: getEnv().EMBEDDING_MODEL }, 'Loading embedding model');
      embeddingPipeline = await pipeline(
        'feature-extraction',
        getEnv().EMBEDDING_MODEL,
        { quantized: true } // Use quantized model for faster loading and lower memory
      );
      logger.info('Embedding model loaded successfully');
      return embeddingPipeline;
    } catch (error) {
      logger.error({ error }, 'Failed to load embedding model');
      modelLoadingPromise = null; // Reset so we can retry
      throw error;
    }
  })();
  
  return modelLoadingPromise;
}

/**
 * Generate embedding vector for a text string
 * Returns normalized embedding as array of numbers
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    logger.warn('Empty text provided for embedding generation');
    return null;
  }
  
  // Truncate very long text (embedding models have token limits)
  const MAX_TEXT_LENGTH = 512; // Conservative limit for most models
  const truncatedText = text.length > MAX_TEXT_LENGTH 
    ? text.substring(0, MAX_TEXT_LENGTH) 
    : text;
  
  try {
    const pipeline = await getEmbeddingPipeline();
    const result = await pipeline(truncatedText, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array
    const embedding = Array.from(result.data);
    
    // Validate embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      logger.error({ textLength: truncatedText.length }, 'Invalid embedding result');
      return null;
    }
    
    return embedding as number[];
  } catch (error) {
    logger.error({ error, textLength: truncatedText.length }, 'Failed to generate embedding');
    return null;
  }
}
```

---

## Similarity Service

Create: `server/src/services/similarityService.ts`

```typescript
import { SimilarityScore } from '../types';

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  if (vecA.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Find top N candidates by cosine similarity
 * Returns sorted array of SimilarityScore objects (highest similarity first)
 */
export function findTopCandidates(
  targetEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[] }>,
  topN: number
): SimilarityScore[] {
  if (candidates.length === 0 || topN <= 0) {
    return [];
  }
  
  // Calculate similarities for all candidates
  const scores: SimilarityScore[] = candidates
    .map(candidate => {
      try {
        const similarity = cosineSimilarity(targetEmbedding, candidate.embedding);
        return {
          id: candidate.id,
          score: similarity
        };
      } catch (error) {
        // Skip candidates with invalid embeddings
        return null;
      }
    })
    .filter((item): item is SimilarityScore => item !== null);
  
  // Sort by score descending and take top N
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

---

## Claude Service with Robust Retry Logic

Create: `server/src/services/claudeService.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeVerificationResult } from '../types';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

let anthropic: Anthropic;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: getEnv().ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

const MODEL = 'claude-sonnet-4-20250514';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Sleep with optional jitter
 */
async function sleep(ms: number, jitter = true): Promise<void> {
  const delay = jitter ? ms + Math.random() * 200 : ms;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get delay from rate limit headers or use exponential backoff
 */
function getRetryDelay(error: any, attempt: number, baseDelay: number): number {
  // Check for Anthropic rate limit headers
  if (error?.headers?.['retry-after']) {
    const retryAfter = parseInt(error.headers['retry-after'], 10);
    if (!isNaN(retryAfter)) {
      return retryAfter * 1000;
    }
  }
  
  // Check for x-ratelimit-reset header
  if (error?.headers?.['x-ratelimit-reset']) {
    const resetTime = new Date(error.headers['x-ratelimit-reset']).getTime();
    const now = Date.now();
    if (resetTime > now) {
      return Math.min(resetTime - now, 60000); // Cap at 60 seconds
    }
  }
  
  // Exponential backoff with jitter
  return baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Rate limit errors
  if (error?.status === 429) return true;
  
  // Server errors
  if (error?.status >= 500 && error?.status < 600) return true;
  
  // Network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') return true;
  
  // Anthropic overloaded error
  if (error?.error?.type === 'overloaded_error') return true;
  
  return false;
}

/**
 * Execute with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryableError(error)) {
        logger.error({ error: error.message, attempt }, 'Non-retryable Claude API error');
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = getRetryDelay(error, attempt, baseDelayMs);
        logger.warn({ 
          error: error.message, 
          attempt: attempt + 1, 
          nextRetryMs: delay 
        }, 'Retrying Claude API call');
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Verify similarity between a focus signal and its candidates.
 * Used during background processing (Phase 3).
 */
export async function verifySimilarities(
  focusSignal: { id: string; text: string },
  candidates: Array<{ id: string; text: string }>
): Promise<ClaudeVerificationResult[]> {
  if (candidates.length === 0) {
    return [];
  }
  
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.text}`)
    .join('\n');
  
  const prompt = `You are helping identify similar signals in a foresight/horizon scanning project. Signals are observations about emerging changes, trends, or developments.

FOCUS SIGNAL:
"${focusSignal.text}"

CANDIDATE SIGNALS (identified as potentially similar by initial screening):
${candidateList}

TASK:
Evaluate each candidate for semantic similarity to the focus signal. Two signals are similar if they:
- Describe the same underlying trend or phenomenon
- Would logically be grouped together when identifying patterns
- Represent different facets or examples of the same development

Even if signals use completely different words, they should be marked as similar if they point to the same underlying trend.

SCORING:
- 9-10: Nearly identical trend, clearly the same phenomenon
- 7-8: Strongly related, same underlying development
- 5-6: Moderately related, overlapping themes, could be grouped
- 3-4: Loosely related, tangential connection
- 1-2: Minimal connection, probably not the same trend

Return a JSON array of objects with "number" (candidate number) and "score" (1-10).
Only include candidates that score 5 or higher.
Return ONLY the JSON array, no other text.

Example: [{"number": 1, "score": 9}, {"number": 5, "score": 7}, {"number": 12, "score": 5}]`;

  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].type === 'text' 
      ? response.content[0].text.trim() 
      : '';
    
    // Try to find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as any[];
        
        // Validate structure
        if (!Array.isArray(parsed)) {
          throw new Error('Parsed result is not an array');
        }
        
        // Validate each item has required fields
        const validated = parsed.filter((item): item is ClaudeVerificationResult => {
          return (
            typeof item === 'object' &&
            item !== null &&
            typeof item.number === 'number' &&
            typeof item.score === 'number' &&
            item.score >= 1 &&
            item.score <= 10
          );
        });
        
        if (validated.length !== parsed.length) {
          logger.warn({ 
            total: parsed.length, 
            valid: validated.length 
          }, 'Some Claude verification results were invalid');
        }
        
        return validated;
      } catch (parseError) {
        logger.error({ response: text, error: parseError }, 'Failed to parse Claude JSON response');
        return [];
      }
    }
    
    logger.warn({ response: text }, 'Claude returned non-JSON response');
    return [];
  });
}

/**
 * Generate a trend summary from grouped signals.
 * Used on-demand when user creates a trend.
 */
export async function generateTrendSummary(signalTexts: string[]): Promise<string> {
  const signalList = signalTexts
    .map((text, i) => `${i + 1}. ${text}`)
    .join('\n');
  
  const prompt = `You are helping identify trends from a collection of signals (observations about change) in a foresight/horizon scanning project.

The following signals have been identified as related. Generate a concise trend summary that captures the underlying pattern or trend these signals represent.

SIGNALS:
${signalList}

REQUIREMENTS:
- Write exactly 2-3 sentences
- Maximum 65 words
- Focus on the underlying trend, not the individual signals
- Use present tense
- Be specific and actionable
- Capture the "so what" - why this trend matters

Return ONLY the trend summary text, nothing else.`;

  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 150,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return response.content[0].type === 'text' 
      ? response.content[0].text.trim() 
      : '';
  });
}
```

---

## Processing Service with Resume Logic

Create: `server/src/services/processingService.ts`

```typescript
import Database from 'better-sqlite3';
import { getDatabase, closeDatabase } from '../config/database';
import { generateEmbedding } from './embeddingService';
import { cosineSimilarity, findTopCandidates } from './similarityService';
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
    logger.info('Phase 1: All embeddings already generated');
    return;
  }
  
  logger.info({ count: signals.length }, 'Phase 1: Generating embeddings');
  
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
  
  for (const signal of signals) {
    try {
      const embedding = await generateEmbedding(signal.original_text);
      
      if (embedding) {
        updateStmt.run(JSON.stringify(embedding), signal.id);
      }
      
      completed++;
      updateProcessingStatus(db, projectId, { embeddings_complete: completed });
      
      if (completed % PROGRESS_LOG_INTERVAL === 0) {
        logger.debug({ completed, total: status.total_signals }, 'Embedding progress');
      }
    } catch (error) {
      logger.error({ signalId: signal.id, error }, 'Failed to generate embedding');
      // Continue with next signal
    }
  }
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
  
  logger.info({ count: signals.length }, 'Phase 3: Verifying with Claude');
  
  // Prepare statements once, reuse in loop
  const updateStmt = db.prepare(`
    UPDATE signals SET similar_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  const getCandidatesStmt = db.prepare(`
    SELECT id, original_text FROM signals WHERE id = ?
  `);
  
  const status = getProcessingStatus(db, projectId);
  if (!status) {
    throw new Error('Processing status record not found');
  }
  let completed = status.claude_verifications_complete || 0;
  let failures = status.claude_verification_failures || 0;
  
  const delayMs = getEnv().CLAUDE_RATE_LIMIT_DELAY_MS;
  
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    let candidates: SimilarityScore[];
    
    try {
      candidates = JSON.parse(signal.embedding_candidates) as SimilarityScore[];
    } catch (error) {
      logger.error({ signalId: signal.id, error }, 'Failed to parse embedding_candidates JSON');
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      failures++;
      updateProcessingStatus(db, projectId, { 
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
      updateProcessingStatus(db, projectId, { claude_verifications_complete: completed });
      continue;
    }
    
    // Batch fetch candidate texts using IN clause with proper parameterization
    const placeholders = candidateIds.map(() => '?').join(',');
    const getCandidateBatchStmt = db.prepare(`
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
      updateProcessingStatus(db, projectId, { 
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
      updateProcessingStatus(db, projectId, { claude_verifications_complete: completed });
      continue;
    }
    
    try {
      const verifiedResults = await verifySimilarities(
        { id: signal.id, text: signal.original_text },
        candidatesWithText
      );
      
      // Map Claude's results back to signal IDs (validate array indices)
      const verifiedSimilarities: SimilarityScore[] = verifiedResults
        .filter(result => result.number >= 1 && result.number <= candidatesWithText.length)
        .map(result => {
          const candidate = candidatesWithText[result.number - 1];
          return candidate ? { id: candidate.id, score: result.score } : null;
        })
        .filter((item): item is SimilarityScore => item !== null && item.score >= 5); // Only include score >= 5 as per prompt
      
      updateStmt.run(JSON.stringify(verifiedSimilarities), signal.id);
      completed++;
      
      logger.debug({ 
        signalId: signal.id, 
        similarCount: verifiedSimilarities.length,
        progress: `${completed}/${signals.length}`
      }, 'Signal verified');
      
    } catch (error) {
      logger.error({ signalId: signal.id, error }, 'Claude verification failed');
      // Store empty array so we can identify failed signals
      updateStmt.run(JSON.stringify([]), signal.id);
      completed++;
      failures++;
    }
    
    updateProcessingStatus(db, projectId, { 
      claude_verifications_complete: completed,
      claude_verification_failures: failures
    });
    
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
  // Check if processing is already in progress
  if (processingLocks.get(projectId)) {
    logger.warn({ projectId }, 'Processing already in progress, skipping');
    return;
  }
  
  processingLocks.set(projectId, true);
  const db = getDatabase(projectId);
  
  try {
    const status = getProcessingStatus(db, projectId);
    
    if (!status) {
      throw new Error('Processing status record not found. Project may not be initialized.');
    }
    
    // Determine which phase to start/resume from
    if (status.status === 'complete') {
      logger.info({ projectId }, 'Project already processed');
      return;
    }
    
    // Set started_at on first run
    if (!status.started_at) {
      updateProcessingStatus(db, projectId, { started_at: new Date().toISOString() });
    }
    
    // Phase 1: Embeddings
    if (status.status === 'pending' || status.status === 'embedding') {
      updateProcessingStatus(db, projectId, { status: 'embedding', error_message: null });
      await generateAllEmbeddings(db, projectId);
    }
    
    // Phase 2: Embedding similarities
    if (['pending', 'embedding', 'embedding_similarity'].includes(status.status)) {
      updateProcessingStatus(db, projectId, { status: 'embedding_similarity' });
      await calculateEmbeddingSimilarities(db, projectId);
    }
    
    // Phase 3: Claude verification
    if (['pending', 'embedding', 'embedding_similarity', 'claude_verification'].includes(status.status)) {
      updateProcessingStatus(db, projectId, { status: 'claude_verification' });
      await verifyWithClaude(db, projectId);
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
```

---

## Server Entry Point

Create: `server/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { loadEnv, getEnv } from './config/env';
import { logger, requestLogger } from './config/logger';
import { rateLimit } from './middleware/security';
import projectsRouter from './routes/projects';
import signalsRouter from './routes/signals';
import trendsRouter from './routes/trends';
import exportRouter from './routes/export';
import healthRouter from './routes/health';

// Load and validate environment
loadEnv();

const app = express();
const env = getEnv();

// Security: Request size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// CORS configuration
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging
app.use(requestLogger);

// Health check (no rate limiting)
app.use('/api/health', healthRouter);

// Rate limiting for API endpoints
app.use('/api', rateLimit(100, 60000)); // 100 requests per minute per IP

// API routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/signals', signalsRouter);
app.use('/api/projects/:projectId/trends', trendsRouter);
app.use('/api/projects/:projectId/export', exportRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ 
    error: err.message, 
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  }, 'Unhandled error');
  
  // Don't expose internal error details in production
  const isProduction = env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Export app for testing
export { app };
export default app;
```

---

## Security Middleware

Create: `server/src/middleware/security.ts`

```typescript
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
  
  if (!projectId || !/^proj_[a-zA-Z0-9]+$/.test(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }
  
  next();
}
```

---

## Export Service

Create: `server/src/services/exportService.ts`

```typescript
import Database from 'better-sqlite3';
import { getDatabase, closeDatabase } from '../config/database';
import { logger } from '../config/logger';

interface CSVRow {
  [key: string]: string;
}

/**
 * Escape CSV value (handles quotes, commas, newlines)
 */
function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(rows: CSVRow[], headers: string[]): string {
  const csvRows: string[] = [];
  
  // Header row
  csvRows.push(headers.map(escapeCSV).join(','));
  
  // Data rows
  for (const row of rows) {
    csvRows.push(headers.map(header => escapeCSV(row[header] || '')).join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Export trends with their signals as CSV
 */
export function exportTrendsWithSignals(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const trends = db.prepare(`
      SELECT 
        t.id as trend_id,
        t.summary as trend_summary,
        t.status as trend_status,
        t.signal_count,
        t.created_at as trend_created,
        s.id as signal_id,
        s.original_text as signal_text,
        s.status as signal_status,
        s.created_at as signal_created
      FROM trends t
      LEFT JOIN signals s ON s.trend_id = t.id
      ORDER BY t.created_at DESC, s.created_at ASC
    `).all() as Array<{
      trend_id: string;
      trend_summary: string;
      trend_status: string;
      signal_count: number;
      trend_created: string;
      signal_id: string | null;
      signal_text: string | null;
      signal_status: string | null;
      signal_created: string | null;
    }>;
    
    const rows: CSVRow[] = trends.map(t => ({
      'Trend ID': t.trend_id,
      'Trend Summary': t.trend_summary,
      'Trend Status': t.trend_status,
      'Signal Count': t.signal_count.toString(),
      'Trend Created': t.trend_created,
      'Signal ID': t.signal_id || '',
      'Signal Text': t.signal_text || '',
      'Signal Status': t.signal_status || '',
      'Signal Created': t.signal_created || ''
    }));
    
    const headers = [
      'Trend ID', 'Trend Summary', 'Trend Status', 'Signal Count', 'Trend Created',
      'Signal ID', 'Signal Text', 'Signal Status', 'Signal Created'
    ];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Export all signals as CSV
 */
export function exportSignals(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const signals = db.prepare(`
      SELECT 
        s.id,
        s.original_text,
        s.status,
        s.trend_id,
        t.summary as trend_summary,
        s.created_at,
        s.updated_at
      FROM signals s
      LEFT JOIN trends t ON s.trend_id = t.id
      ORDER BY s.created_at ASC
    `).all() as Array<{
      id: string;
      original_text: string;
      status: string;
      trend_id: string | null;
      trend_summary: string | null;
      created_at: string;
      updated_at: string;
    }>;
    
    const rows: CSVRow[] = signals.map(s => ({
      'Signal ID': s.id,
      'Text': s.original_text,
      'Status': s.status,
      'Trend ID': s.trend_id || '',
      'Trend Summary': s.trend_summary || '',
      'Created': s.created_at,
      'Updated': s.updated_at
    }));
    
    const headers = ['Signal ID', 'Text', 'Status', 'Trend ID', 'Trend Summary', 'Created', 'Updated'];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Export trend summaries only as CSV
 */
export function exportTrendSummaries(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const trends = db.prepare(`
      SELECT 
        id,
        summary,
        signal_count,
        status,
        created_at,
        updated_at
      FROM trends
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      summary: string;
      signal_count: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>;
    
    const rows: CSVRow[] = trends.map(t => ({
      'Trend ID': t.id,
      'Summary': t.summary,
      'Signal Count': t.signal_count.toString(),
      'Status': t.status,
      'Created': t.created_at,
      'Updated': t.updated_at
    }));
    
    const headers = ['Trend ID', 'Summary', 'Signal Count', 'Status', 'Created', 'Updated'];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}
```

---

## API Routes

### Projects Route

Create: `server/src/routes/projects.ts`

```typescript
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase, projectExists, deleteProjectDatabase, listProjectIds } from '../config/database';
import { processProject } from '../services/processingService';
import { retryFailedVerifications } from '../services/processingService';
import { createUploadMiddleware, handleMulterError, validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { validate } from '../validation/schemas';
import { createProjectSchema, signalListQuerySchema } from '../validation/schemas';
import { processSpreadsheetUpload } from '../services/uploadService';
import { assignProjectToUser, getUserProjects } from '../services/authService';
import { logger } from '../config/logger';
import { ProcessingStatusRecord } from '../types';

const router = Router();
const upload = createUploadMiddleware().single('file');

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

// Delete project
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

// Upload spreadsheet
router.post('/:projectId/upload', upload, handleMulterError, async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const textColumn = req.query.textColumn as string | undefined;
    const result = await processSpreadsheetUpload(projectId, req.file.buffer, textColumn);
    
    // Start background processing (non-blocking)
    processProject(projectId).catch(error => {
      logger.error({ projectId, error }, 'Background processing failed');
    });
    
    res.json(result);
  } catch (error) {
    logger.error({ projectId, error }, 'Upload failed');
    res.status(500).json({ error: 'Upload failed' });
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
```

### Signals Route

Create: `server/src/routes/signals.ts`

```typescript
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase, projectExists } from '../config/database';
import { validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { validate, validateQuery } from '../validation/schemas';
import { createSignalSchema, updateSignalSchema, signalListQuerySchema } from '../validation/schemas';
import { logger } from '../config/logger';
import { SignalRecord, SimilarityScore } from '../types';

const router = Router();

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use('/:projectId', requireProjectAccess);

// List signals
router.get('/', validateQuery(signalListQuerySchema), (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const { status, limit = 50, offset = 0 } = req.query as { status?: string; limit: number; offset: number };
    
    let query = 'SELECT id, original_text, status, trend_id, created_at FROM signals';
    const params: any[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const signals = db.prepare(query).all(...params) as Array<{
      id: string;
      original_text: string;
      status: string;
      trend_id: string | null;
      created_at: string;
    }>;
    
    const total = db.prepare('SELECT COUNT(*) as count FROM signals' + (status ? ' WHERE status = ?' : '')).get(
      ...(status ? [status] : [])
    ) as { count: number };
    
    const unassignedCount = db.prepare("SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned'").get() as { count: number };
    
    res.json({
      signals: signals.map(s => ({
        id: s.id,
        originalText: s.original_text,
        status: s.status,
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
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    // Get first unassigned signal
    const signal = db.prepare(`
      SELECT id, original_text, status, trend_id, created_at, similar_signals
      FROM signals
      WHERE status = 'unassigned'
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as (SignalRecord & { similar_signals: string | null }) | undefined;
    
    if (!signal) {
      const remainingCount = db.prepare("SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned'").get() as { count: number };
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
            SELECT s.id, s.original_text, s.status, s.trend_id, t.summary as trend_summary
            FROM signals s
            LEFT JOIN trends t ON s.trend_id = t.id
            WHERE s.id IN (${placeholders})
          `).all(...similarIds.map(s => s.id)) as Array<{
            id: string;
            original_text: string;
            status: string;
            trend_id: string | null;
            trend_summary: string | null;
          }>;
          
          const scoreMap = new Map(similarIds.map(s => [s.id, s.score]));
          
          similarSignals = similarRecords.map(rec => ({
            id: rec.id,
            originalText: rec.original_text,
            score: scoreMap.get(rec.id) || 0,
            status: rec.status,
            trendId: rec.trend_id,
            trendSummary: rec.trend_summary || undefined
          }));
        }
      } catch (error) {
        logger.error({ signalId: signal.id, error }, 'Failed to parse similar_signals');
      }
    }
    
    const remainingCount = db.prepare("SELECT COUNT(*) as count FROM signals WHERE status = 'unassigned'").get() as { count: number };
    
    res.json({
      signal: {
        id: signal.id,
        originalText: signal.original_text,
        status: signal.status,
        trendId: signal.trend_id,
        createdAt: signal.created_at
      },
      similarSignals,
      remainingCount: remainingCount.count - 1 // Exclude current signal
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
      summary: signal.summary,
      status: signal.status,
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
    const signalId = uuidv4();
    db.prepare(`
      INSERT INTO signals (id, original_text, status)
      VALUES (?, ?, 'unassigned')
    `).run(signalId, req.body.text);
    
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId) as SignalRecord;
    
    res.status(201).json({
      id: signal.id,
      originalText: signal.original_text,
      status: signal.status,
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
    
    if (req.body.text !== undefined) {
      updates.push('original_text = ?');
      values.push(req.body.text);
    }
    
    if (req.body.status !== undefined) {
      updates.push('status = ?');
      values.push(req.body.status);
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
      status: signal.status,
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
```

### Trends Route

Create: `server/src/routes/trends.ts`

```typescript
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

const router = Router();

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use('/:projectId', requireProjectAccess);

// List trends
router.get('/', (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const db = getDatabase(projectId);
  
  try {
    const trends = db.prepare(`
      SELECT id, summary, signal_count, status, created_at
      FROM trends
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      summary: string;
      signal_count: number;
      status: string;
      created_at: string;
    }>;
    
    res.json({
      trends: trends.map(t => ({
        id: t.id,
        summary: t.summary,
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
        summary: trend.summary,
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
    
    // Generate trend summary
    const signalTexts = signals.map(s => s.original_text);
    let summary: string;
    
    try {
      summary = await generateTrendSummary(signalTexts);
    } catch (error) {
      logger.error({ projectId, error }, 'Failed to generate trend summary');
      return res.status(500).json({ error: 'Failed to generate trend summary' });
    }
    
    // Create trend
    const trendId = uuidv4();
    db.prepare(`
      INSERT INTO trends (id, summary, signal_count)
      VALUES (?, ?, ?)
    `).run(trendId, summary, signals.length);
    
    // Update signals
    const updateStmt = db.prepare('UPDATE signals SET trend_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    for (const signalId of req.body.signalIds) {
      updateStmt.run(trendId, 'assigned', signalId);
    }
    
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.status(201).json({
      trend: {
        id: trend.id,
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
    
    if (req.body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(req.body.summary);
    }
    
    if (req.body.status !== undefined) {
      updates.push('status = ?');
      values.push(req.body.status);
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
        summary: trend.summary,
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
    const summary = await generateTrendSummary(signalTexts);
    
    db.prepare('UPDATE trends SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, trendId);
    
    const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(trendId) as TrendRecord;
    
    res.json({
      trend: {
        id: trend.id,
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
    
    // Update signals
    const placeholders = req.body.signalIds.map(() => '?').join(',');
    const updateStmt = db.prepare(`UPDATE signals SET trend_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`);
    updateStmt.run(trendId, 'assigned', ...req.body.signalIds);
    
    // Update signal count
    const newCount = db.prepare('SELECT COUNT(*) as count FROM signals WHERE trend_id = ?').get(trendId) as { count: number };
    db.prepare('UPDATE trends SET signal_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newCount.count, trendId);
    
    // Regenerate summary if requested
    if (req.body.regenerateSummary) {
      const signals = db.prepare('SELECT original_text FROM signals WHERE trend_id = ?').all(trendId) as Array<{ original_text: string }>;
      const summary = await generateTrendSummary(signals.map(s => s.original_text));
      db.prepare('UPDATE trends SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, trendId);
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
      const summary = await generateTrendSummary(signals.map(s => s.original_text));
      db.prepare('UPDATE trends SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, trendId);
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
```

### Export Route

Create: `server/src/routes/export.ts`

```typescript
import { Router, Response } from 'express';
import { validateProjectId } from '../middleware/security';
import { requireAuth, requireProjectAccess, AuthRequest } from '../middleware/auth';
import { projectExists } from '../config/database';
import { exportTrendsWithSignals, exportSignals, exportTrendSummaries } from '../services/exportService';
import { logger } from '../config/logger';

const router = Router();

router.use(requireAuth);
router.param('projectId', validateProjectId);
router.use('/:projectId', requireProjectAccess);

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
```

---

## Upload Service

Create: `server/src/services/uploadService.ts`

```typescript
import * as XLSX from '@e965/xlsx';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase } from '../config/database';
import { logger } from '../config/logger';

export interface UploadResult {
  success: boolean;
  signalCount: number;
  detectedColumn: string;
  processingStarted: boolean;
  estimatedCost: string;
  estimatedMinutes: number;
}

/**
 * Detect the text column in a spreadsheet (longest average cell length)
 */
function detectTextColumn(sheet: XLSX.WorkSheet): string | null {
  if (!sheet || Object.keys(sheet).length === 0) {
    return null;
  }
  
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const columns: { [key: string]: { total: number; count: number } } = {};
  
  // Sample first 50 rows to detect column
  const maxRows = Math.min(range.e.r, 50);
  
  for (let row = range.s.r; row <= maxRows; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      
      if (cell && cell.v) {
        const colLetter = XLSX.utils.encode_col(col);
        if (!columns[colLetter]) {
          columns[colLetter] = { total: 0, count: 0 };
        }
        columns[colLetter].total += String(cell.v).length;
        columns[colLetter].count += 1;
      }
    }
  }
  
  let bestColumn: string | null = null;
  let bestAvg = 0;
  
  for (const [col, stats] of Object.entries(columns)) {
    const avg = stats.total / stats.count;
    if (avg > bestAvg && avg > 10) { // Minimum 10 chars average
      bestAvg = avg;
      bestColumn = col;
    }
  }
  
  return bestColumn;
}

/**
 * Process uploaded spreadsheet and create signals
 */
export async function processSpreadsheetUpload(
  projectId: string,
  buffer: Buffer,
  textColumn?: string
): Promise<UploadResult> {
  const db = getDatabase(projectId);
  
  try {
    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    
    if (!sheet) {
      throw new Error('Spreadsheet has no data');
    }
    
    // Detect or use provided column
    let columnToUse = textColumn;
    if (!columnToUse) {
      columnToUse = detectTextColumn(sheet);
      if (!columnToUse) {
        throw new Error('Could not detect text column. Please specify manually.');
      }
    }
    
    // Convert to JSON with column headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (jsonData.length === 0) {
      throw new Error('Spreadsheet contains no data rows');
    }
    
    // Extract text from specified column (convert column letter to index if needed)
    const columnIndex = columnToUse.match(/^\d+$/) 
      ? parseInt(columnToUse) 
      : XLSX.utils.decode_col(columnToUse);
    const columnKey = Object.keys(jsonData[0] || {})[columnIndex] || columnToUse;
    
    const signals: Array<{ id: string; text: string }> = [];
    
    for (const row of jsonData as any[]) {
      const text = String(row[columnKey] || '').trim();
      
      if (text && text.length > 0) {
        // Validate text length (matches schema limit)
        const trimmedText = text.length > 10000 ? text.substring(0, 10000) : text;
        signals.push({
          id: uuidv4(),
          text: trimmedText
        });
      }
    }
    
    if (signals.length === 0) {
      throw new Error('No valid signal text found in specified column');
    }
    
    // Insert signals in batch
    const insertStmt = db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)');
    const insertMany = db.transaction((signals) => {
      for (const signal of signals) {
        insertStmt.run(signal.id, signal.text, 'unassigned');
      }
    });
    
    insertMany(signals);
    
    // Update processing status
    db.prepare(`
      UPDATE processing_status 
      SET total_signals = ?, 
          embeddings_complete = 0,
          embedding_similarities_complete = 0,
          claude_verifications_complete = 0,
          status = 'pending',
          started_at = NULL,
          completed_at = NULL,
          error_message = NULL
      WHERE project_id = ?
    `).run(signals.length, projectId);
    
    // Estimate cost (from plan: ~$6.50 for 500 signals)
    const estimatedCost = (signals.length / 500 * 6.5).toFixed(2);
    const estimatedMinutes = Math.ceil(signals.length / 500 * 20); // ~20 min for 500 signals
    
    logger.info({ 
      projectId, 
      signalCount: signals.length, 
      column: columnToUse 
    }, 'Spreadsheet uploaded and processed');
    
    return {
      success: true,
      signalCount: signals.length,
      detectedColumn: columnToUse,
      processingStarted: false, // Will be started by route handler
      estimatedCost: `$${estimatedCost}`,
      estimatedMinutes
    };
  } catch (error) {
    logger.error({ projectId, error }, 'Spreadsheet upload failed');
    throw error;
  } finally {
    closeDatabase(projectId);
  }
}
```

---

## Frontend Architecture

### State Management Approach

Use React Context + useReducer for simple, type-safe state management without external dependencies.

Create: `client/src/context/AppContext.tsx`

```typescript
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ProjectListItem, ProcessingStatus } from '../types';

// State
interface AppState {
  projects: ProjectListItem[];
  currentProject: ProjectListItem | null;
  processingStatus: ProcessingStatus | null;
  isLoading: boolean;
  error: string | null;
}

// Actions
type Action =
  | { type: 'SET_PROJECTS'; payload: ProjectListItem[] }
  | { type: 'SET_CURRENT_PROJECT'; payload: ProjectListItem | null }
  | { type: 'SET_PROCESSING_STATUS'; payload: ProcessingStatus | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_PROJECT'; payload: ProjectListItem }
  | { type: 'REMOVE_PROJECT'; payload: string };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    case 'SET_CURRENT_PROJECT':
      return { ...state, currentProject: action.payload };
    case 'SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'REMOVE_PROJECT':
      return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };
    default:
      return state;
  }
}

// Initial state
const initialState: AppState = {
  projects: [],
  currentProject: null,
  processingStatus: null,
  isLoading: false,
  error: null
};

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
```

### Component Structure

```
client/src/
├── components/
│   ├── common/
│   │   ├── Button.tsx           # Reusable button with loading state
│   │   ├── Card.tsx             # Container component
│   │   ├── Modal.tsx            # Dialog/modal component
│   │   ├── ProgressBar.tsx      # Progress indicator
│   │   ├── Spinner.tsx          # Loading spinner
│   │   ├── ErrorMessage.tsx     # Error display
│   │   ├── EmptyState.tsx       # Empty state placeholder
│   │   └── ErrorBoundary.tsx    # React error boundary for error handling
│   │
│   ├── projects/
│   │   ├── ProjectCard.tsx      # Project list item
│   │   ├── CreateProjectModal.tsx
│   │   └── DeleteProjectDialog.tsx
│   │
│   ├── upload/
│   │   ├── FileUploader.tsx     # Drag & drop file upload
│   │   ├── ColumnSelector.tsx   # Optional column picker
│   │   └── ProcessingProgress.tsx # 3-phase progress display
│   │
│   ├── signals/
│   │   ├── SignalCard.tsx       # Individual signal display
│   │   ├── SimilarSignalsList.tsx # List of similar signals with checkboxes
│   │   ├── SignalTable.tsx      # CRUD table view
│   │   └── SignalEditModal.tsx
│   │
│   └── trends/
│       ├── TrendCard.tsx        # Trend with expandable signals
│       ├── TrendEditModal.tsx
│       └── TrendList.tsx
│
├── pages/
│   ├── Home.tsx                 # Project list
│   ├── Upload.tsx               # Upload & processing
│   ├── ProjectDashboard.tsx     # Project overview
│   ├── SignalReview.tsx         # Main workflow (core page)
│   ├── SignalsCRUD.tsx          # Signal management
│   ├── TrendsView.tsx           # View all trends
│   └── Export.tsx               # Export options
│
├── hooks/
│   ├── useProjects.ts           # Project CRUD operations
│   ├── useSignals.ts            # Signal operations
│   ├── useTrends.ts             # Trend operations
│   ├── useProcessingStatus.ts   # Polling for processing status
│   └── useExport.ts             # Export operations
│
├── services/
│   └── api.ts                   # Axios instance & API functions
│
├── types/
│   └── index.ts                 # Shared types (from backend)
│
├── context/
│   └── AppContext.tsx           # Global state
│
├── App.tsx                      # Router setup
└── main.tsx                     # Entry point
```

### Key Component Responsibilities

**SignalReview.tsx (Core Workflow)**
- Fetches next unassigned signal via useSignals hook
- Displays current signal prominently
- Renders SimilarSignalsList with checkboxes
- Handles signal selection state locally (useState)
- "Create Trend" button triggers API call with loading state
- Auto-advances to next signal on success
- Shows progress (X remaining)

**ProcessingProgress.tsx**
- Polls /processing-status every 2 seconds
- Displays 3-phase progress bar
- Shows current phase name
- Displays estimated time remaining
- Auto-navigates when complete

**SimilarSignalsList.tsx**
- Receives similar signals array
- Renders checkboxes with scores (color-coded)
- Toggle for showing already-assigned signals
- Emits selected IDs to parent

### Error Boundary Component

Create: `client/src/components/common/ErrorBoundary.tsx`

```typescript
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // In production, you might want to log this to an error reporting service
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-gray-700 mb-4">
              An unexpected error occurred. Please refresh the page or try again later.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-600">Error details</summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Routing Structure

```typescript
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import Home from './pages/Home';
import ProjectDashboard from './pages/ProjectDashboard';
import Upload from './pages/Upload';
import SignalReview from './pages/SignalReview';
import SignalsCRUD from './pages/SignalsCRUD';
import TrendsView from './pages/TrendsView';
import Export from './pages/Export';

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects/:projectId" element={<ProjectDashboard />} />
            <Route path="/projects/:projectId/upload" element={<Upload />} />
            <Route path="/projects/:projectId/review" element={<SignalReview />} />
            <Route path="/projects/:projectId/signals" element={<SignalsCRUD />} />
            <Route path="/projects/:projectId/trends" element={<TrendsView />} />
            <Route path="/projects/:projectId/export" element={<Export />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
```

### API Service

Create: `client/src/services/api.ts`

```typescript
import axios, { AxiosError } from 'axios';
import {
  ProjectListItem,
  ProjectResponse,
  CreateProjectRequest,
  UploadResponse,
  ProcessingStatusResponse,
  SignalListResponse,
  NextUnassignedResponse,
  SignalDetailResponse,
  CreateSignalRequest,
  UpdateSignalRequest,
  TrendListResponse,
  TrendDetailResponse,
  TrendResponse,
  CreateTrendRequest,
  UpdateTrendRequest,
  ErrorResponse
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Error handler
api.interceptors.response.use(
  response => response,
  (error: AxiosError<ErrorResponse>) => {
    const message = error.response?.data?.error || error.message || 'Unknown error';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Projects
export const projectsApi = {
  list: () => api.get<ProjectListItem[]>('/projects'),
  create: (data: CreateProjectRequest) => api.post<ProjectResponse>('/projects', data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  
  upload: (projectId: string, file: File, textColumn?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const params = textColumn ? `?textColumn=${encodeURIComponent(textColumn)}` : '';
    return api.post<UploadResponse>(`/projects/${projectId}/upload${params}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  getProcessingStatus: (projectId: string) => 
    api.get<ProcessingStatusResponse>(`/projects/${projectId}/processing-status`),
  
  resumeProcessing: (projectId: string) =>
    api.post(`/projects/${projectId}/resume-processing`),
  
  retryFailedVerifications: (projectId: string) =>
    api.post(`/projects/${projectId}/retry-verifications`)
};

// Signals
export const signalsApi = {
  list: (projectId: string, params?: { status?: string; limit?: number; offset?: number }) =>
    api.get<SignalListResponse>(`/projects/${projectId}/signals`, { params }),
  
  getNextUnassigned: (projectId: string) =>
    api.get<NextUnassignedResponse>(`/projects/${projectId}/signals/next-unassigned`),
  
  get: (projectId: string, signalId: string) =>
    api.get<SignalDetailResponse>(`/projects/${projectId}/signals/${signalId}`),
  
  create: (projectId: string, data: CreateSignalRequest) =>
    api.post<SignalDetailResponse>(`/projects/${projectId}/signals`, data),
  
  update: (projectId: string, signalId: string, data: UpdateSignalRequest) =>
    api.put(`/projects/${projectId}/signals/${signalId}`, data),
  
  delete: (projectId: string, signalId: string) =>
    api.delete(`/projects/${projectId}/signals/${signalId}`)
};

// Trends
export const trendsApi = {
  list: (projectId: string) =>
    api.get<TrendListResponse>(`/projects/${projectId}/trends`),
  
  get: (projectId: string, trendId: string) =>
    api.get<TrendDetailResponse>(`/projects/${projectId}/trends/${trendId}`),
  
  create: (projectId: string, data: CreateTrendRequest) =>
    api.post<TrendResponse>(`/projects/${projectId}/trends`, data),
  
  update: (projectId: string, trendId: string, data: UpdateTrendRequest) =>
    api.put(`/projects/${projectId}/trends/${trendId}`, data),
  
  delete: (projectId: string, trendId: string) =>
    api.delete(`/projects/${projectId}/trends/${trendId}`),
  
  regenerateSummary: (projectId: string, trendId: string) =>
    api.post<TrendResponse>(`/projects/${projectId}/trends/${trendId}/regenerate-summary`),
  
  addSignals: (projectId: string, trendId: string, signalIds: string[], regenerate = false) =>
    api.post<TrendResponse>(`/projects/${projectId}/trends/${trendId}/add-signals`, {
      signalIds,
      regenerateSummary: regenerate
    }),
  
  removeSignals: (projectId: string, trendId: string, signalIds: string[], regenerate = false) =>
    api.post(`/projects/${projectId}/trends/${trendId}/remove-signals`, {
      signalIds,
      regenerateSummary: regenerate
    })
};

// Export
export const exportApi = {
  trendsWithSignals: (projectId: string) =>
    api.get(`/projects/${projectId}/export/trends-csv`, { responseType: 'blob' }),
  
  signals: (projectId: string) =>
    api.get(`/projects/${projectId}/export/signals-csv`, { responseType: 'blob' }),
  
  trendSummaries: (projectId: string) =>
    api.get(`/projects/${projectId}/export/summary-csv`, { responseType: 'blob' })
};

// Helper to trigger download
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
```

---

## Testing Strategy

### Backend Testing

Create: `server/src/__tests__/setup.ts`

```typescript
import { beforeAll, afterAll } from 'vitest';
import { loadEnv } from '../config/env';

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.DATA_DIR = './data/test-projects';
  process.env.NODE_ENV = 'test';
  loadEnv();
});

afterAll(() => {
  // Cleanup test databases
});
```

Create: `server/src/__tests__/services/similarityService.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findTopCandidates } from '../../services/similarityService';

describe('similarityService', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 0, 0, 0];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
    });
    
    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0, 0];
      const b = [0, 1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });
    
    it('returns -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });
    
    it('handles empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });
  });
  
  describe('findTopCandidates', () => {
    it('returns top N candidates sorted by similarity', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0, 1, 0] },
        { id: 'c', embedding: [0.5, 0.5, 0] }
      ];
      
      const result = findTopCandidates(target, candidates, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('c');
    });
  });
});
```

Create: `server/src/__tests__/routes/projects.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index'; // Export app from index.ts
import fs from 'fs';

describe('Projects API', () => {
  let projectId: string;
  
  afterEach(() => {
    // Cleanup created projects
    if (projectId) {
      const dbPath = `./data/test-projects/${projectId}.db`;
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });
  
  describe('POST /api/projects', () => {
    it('creates a new project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project' });
      
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^proj_/);
      expect(res.body.name).toBe('Test Project');
      
      projectId = res.body.id;
    });
    
    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation');
    });
  });
  
  describe('GET /api/projects', () => {
    it('returns list of projects', async () => {
      const res = await request(app).get('/api/projects');
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

### Frontend Testing

Create: `client/src/__tests__/components/SimilarSignalsList.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimilarSignalsList } from '../../components/signals/SimilarSignalsList';

describe('SimilarSignalsList', () => {
  const mockSignals = [
    { id: '1', originalText: 'Signal 1', score: 9, status: 'unassigned' as const, trendId: null },
    { id: '2', originalText: 'Signal 2', score: 7, status: 'unassigned' as const, trendId: null },
    { id: '3', originalText: 'Signal 3', score: 5, status: 'assigned' as const, trendId: 'trend1' }
  ];
  
  it('renders all unassigned signals', () => {
    render(
      <SimilarSignalsList 
        signals={mockSignals}
        selectedIds={[]}
        onSelectionChange={() => {}}
        showAssigned={false}
      />
    );
    
    expect(screen.getByText('Signal 1')).toBeInTheDocument();
    expect(screen.getByText('Signal 2')).toBeInTheDocument();
    expect(screen.queryByText('Signal 3')).not.toBeInTheDocument();
  });
  
  it('shows assigned signals when toggled', () => {
    render(
      <SimilarSignalsList 
        signals={mockSignals}
        selectedIds={[]}
        onSelectionChange={() => {}}
        showAssigned={true}
      />
    );
    
    expect(screen.getByText('Signal 3')).toBeInTheDocument();
  });
  
  it('calls onSelectionChange when checkbox clicked', () => {
    const handleChange = vi.fn();
    
    render(
      <SimilarSignalsList 
        signals={mockSignals}
        selectedIds={[]}
        onSelectionChange={handleChange}
        showAssigned={false}
      />
    );
    
    fireEvent.click(screen.getByRole('checkbox', { name: /Signal 1/i }));
    
    expect(handleChange).toHaveBeenCalledWith(['1']);
  });
});
```

### Mock Strategy for Claude API

Create: `server/src/__tests__/mocks/claudeService.ts`

```typescript
import { vi } from 'vitest';

export const mockVerifySimilarities = vi.fn().mockResolvedValue([
  { number: 1, score: 9 },
  { number: 2, score: 7 }
]);

export const mockGenerateTrendSummary = vi.fn().mockResolvedValue(
  'This is a mock trend summary describing the pattern.'
);

vi.mock('../../services/claudeService', () => ({
  verifySimilarities: mockVerifySimilarities,
  generateTrendSummary: mockGenerateTrendSummary
}));
```

### Running Tests

Add to `server/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Deployment Notes

### Basic Production Setup

1. **Build the application**
```bash
# Backend
cd server
npm run build

# Frontend
cd client
npm run build
```

2. **Environment variables**
```bash
NODE_ENV=production
PORT=3000
ANTHROPIC_API_KEY=sk-ant-...
DATA_DIR=/var/data/trendfinder/projects
LOG_LEVEL=info
MAX_FILE_SIZE_MB=10
```

3. **Process manager (PM2)**
```bash
npm install -g pm2
pm2 start dist/index.js --name trendfinder
pm2 save
```

4. **Reverse proxy (Nginx)**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. **Data backup**
```bash
# Simple backup script
#!/bin/bash
tar -czf backup-$(date +%Y%m%d).tar.gz /var/data/trendfinder/projects/
```

### Health Check Endpoint

Add to `server/src/routes/health.ts`:

```typescript
import { Router } from 'express';
import { getEnv } from '../config/env';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

router.get('/health/ready', async (req, res) => {
  try {
    // Check if we can access data directory
    const env = getEnv();
    // Could add database connectivity check here
    
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: String(error) });
  }
});

export default router;
```

---

## File Structure (Final)

```
trendfinder/
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env
│   ├── .env.example
│   └── src/
│       ├── index.ts
│       ├── types/
│       │   └── index.ts
│       ├── config/
│       │   ├── database.ts
│       │   ├── logger.ts
│       │   └── env.ts
│       ├── middleware/
│       │   └── security.ts
│       ├── validation/
│       │   └── schemas.ts
│       ├── services/
│       │   ├── embeddingService.ts
│       │   ├── similarityService.ts
│       │   ├── claudeService.ts
│       │   ├── processingService.ts
│       │   ├── exportService.ts
│       │   └── uploadService.ts
│       ├── routes/
│       │   ├── projects.ts
│       │   ├── signals.ts
│       │   ├── trends.ts
│       │   ├── export.ts
│       │   └── health.ts
│       └── __tests__/
│           ├── setup.ts
│           ├── mocks/
│           ├── services/
│           └── routes/
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   └── index.ts
│       ├── context/
│       │   └── AppContext.tsx
│       ├── services/
│       │   └── api.ts
│       ├── hooks/
│       │   ├── useProjects.ts
│       │   ├── useSignals.ts
│       │   ├── useTrends.ts
│       │   └── useProcessingStatus.ts
│       ├── components/
│       │   ├── common/
│       │   ├── projects/
│       │   ├── upload/
│       │   ├── signals/
│       │   └── trends/
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── Upload.tsx
│       │   ├── ProjectDashboard.tsx
│       │   ├── SignalReview.tsx
│       │   ├── SignalsCRUD.tsx
│       │   ├── TrendsView.tsx
│       │   └── Export.tsx
│       └── __tests__/
│
├── data/
│   └── projects/
│
├── .gitignore
└── README.md
```

---

## Summary of Changes from Feedback

| Feedback Item | Implementation |
|--------------|----------------|
| Database connections | Added connection caching with LRU cleanup, WAL mode, multi-user support with authentication |
| Error handling & recovery | Added resumable processing, failure tracking, retry endpoint, React Error Boundary |
| Rate limiting & Claude API | Enhanced retry logic with header-based backoff, configurable delays, automatic cleanup |
| Frontend implementation | Added full component structure, state management, routing, hooks, error boundaries |
| Background concurrency | Documented expected times, added processing locks to prevent concurrent runs |
| Security | Added Zod validation, CORS configuration, API key validation, rate limiting with cleanup, request size limits, path traversal protection, SQL injection prevention via whitelisting, error message sanitization |
| Testing | Added Vitest setup, service tests, route tests, mock strategies |
| Performance & scalability | Documented limits (1000 signals), added missing indexes, prepared statement reuse, batch JSON parsing, embedding model singleton pattern |
| Logging | Added Pino logger with request logging middleware, proper error context |
| Environment validation | Added Zod schema for env vars with fail-fast validation, API key format validation |
| Deployment | Added basic production setup, health checks, backup notes, graceful shutdown handling |
| Type safety | Added proper TypeScript interfaces for database records, removed `any` types |
| JSON parsing | Added error handling for all JSON.parse() calls with try-catch blocks |
| Claude response validation | Added structure validation for Claude API responses, array bounds checking |
| Code quality | Extracted magic numbers to constants, added processing lock mechanism, improved error messages |

---

## Environment Variables (Complete)

```bash
# Server
PORT=3000
NODE_ENV=development

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Processing
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
CLAUDE_RATE_LIMIT_DELAY_MS=150

# Storage
DATA_DIR=./data/projects
MAX_FILE_SIZE_MB=10

# CORS (comma-separated list of allowed origins)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Logging
LOG_LEVEL=debug  # debug, info, warn, error

# Authentication (Multi-User)
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY=7d
```

---

## Implementation Plan

This section provides a structured phased approach to implementing the TrendFinder application, with clear dependencies, testability at each phase, and incremental value delivery.

### Phase Dependencies

```
Phase 1 (Foundation) 
    ↓
Phase 2 (Core Services - Pure Logic)
    ↓
Phase 3 (Data Services)
    ↓
Phase 4 (API Infrastructure)
    ↓
Phase 5 (API Routes)
    ↓
Phase 6 (Frontend Foundation)
    ↓
Phase 7 (Enhanced Signal Data Model & Import)
    ↓
Phase 8 (Frontend Core Features)
    ↓
Phase 9 (Polish & Production)
```

### Phase 1: Foundation & Configuration (Day 1)

**Goal:** Set up project structure and core infrastructure that everything depends on.

**Deliverables:**
- ✅ Project structure (folders, package.json, tsconfig)
- ✅ Type definitions (all interfaces)
- ✅ Environment configuration with validation
- ✅ Database configuration and schema
- ✅ Logger configuration
- ✅ `.env.example` file

**Testing:** 
- Environment validation tests
- Database schema creation tests
- Logger output verification

**Why First:** Everything else depends on these. Types are needed by all services, database is needed by all routes.

---

### Phase 2: Core Services - Pure Logic (Day 2)

**Goal:** Implement stateless business logic services that can be tested in isolation.

**Order of Implementation:**
1. Similarity Service (no external deps - pure math)
2. Embedding Service (needs config, but testable with mock model)
3. Claude Service (needs API key, testable with mocks)

**Deliverables:**
- ✅ `similarityService.ts` - cosine similarity calculations
- ✅ `embeddingService.ts` - local embedding generation (singleton pattern)
- ✅ `claudeService.ts` - API integration with retry logic

**Testing:**
- Unit tests for similarity calculations
- Unit tests for embedding generation (with mocked transformers)
- Unit tests for Claude service (with mocked API calls)
- Integration test with real embedding model (optional)

**Why Second:** These are dependencies for processing service. Can test without database or API routes.

---

### Phase 3: Data Services (Day 3)

**Goal:** Implement services that interact with database and orchestrate business logic.

**Order of Implementation:**
1. Upload Service (simplest - just parsing)
2. Export Service (read-only operations)
3. Processing Service (most complex - orchestrates Phase 2 services)

**Deliverables:**
- ✅ `uploadService.ts` - spreadsheet parsing and signal creation
- ✅ `exportService.ts` - CSV generation
- ✅ `processingService.ts` - 3-phase background processing

**Testing:**
- Upload service with sample spreadsheets
- Export service with sample data
- Processing service with small datasets (5-10 signals)
- Test resumability by interrupting and resuming

**Why Third:** Needs database (Phase 1) and core services (Phase 2). Can test independently of API.

**Note:** For Processing Service, test with very small datasets first (5 signals) before scaling up.

---

### Phase 4: API Infrastructure (Day 4)

**Goal:** Set up middleware, validation, and basic server structure.

**Deliverables:**
- ✅ Validation schemas (Zod)
- ✅ Security middleware (rate limiting, file upload, sanitization)
- ✅ Server entry point (`index.ts`) with middleware setup
- ✅ Health check route (simple, no dependencies)

**Testing:**
- Validation schema tests
- Middleware unit tests
- Health endpoint integration test
- Server startup/shutdown test

**Why Fourth:** Needed by all routes. Can verify server starts and middleware works before implementing routes.

---

### Phase 5: API Routes (Days 5-6)

**Goal:** Implement all REST API endpoints.

**Order of Implementation:**
1. **Projects Route** - CRUD, upload, processing status (most foundational)
2. **Signals Route** - Signal management (needed by trends)
3. **Trends Route** - Trend creation and management (depends on signals)
4. **Export Route** - CSV downloads (depends on export service)

**Deliverables:**
- ✅ All route handlers with proper error handling
- ✅ Request validation on all endpoints
- ✅ Proper database connection management

**Testing:**
- Integration tests for each route
- Test with Postman/curl for manual verification
- Test error cases (404s, validation failures, etc.)

**Why Fifth:** Needs all previous phases. Can test entire backend API independently of frontend.

**Critical Path Checkpoint:** After this phase, entire backend should be functional. Can upload spreadsheet, process it, create trends, export data - all via API.

---

### Phase 6: Frontend Foundation (Day 7)

**Goal:** Set up React app structure and core infrastructure.

**Order of Implementation:**
1. Vite + React + TypeScript setup
2. Type definitions (copy from backend)
3. API service client (axios setup)
4. Context/state management
5. Routing setup
6. Basic layout/components (Button, Card, Spinner, etc.)
7. Error Boundary

**Deliverables:**
- ✅ Working React app that can call backend API
- ✅ Reusable UI components
- ✅ State management structure
- ✅ Error handling foundation

**Testing:**
- Verify API calls work
- Test error boundary
- Visual verification of basic components

**Why Sixth:** Frontend needs API to be complete. Foundation components needed by all pages.

---

### Phase 7: Enhanced Signal Data Model and Import (Enhancement Phase)

**Goal:** Enhance the signal data model to support comprehensive signal metadata and implement intelligent column mapping for spreadsheet imports.

**Prerequisites:** Phase 6 (Frontend Foundation) must be complete. This phase enhances existing functionality while maintaining backward compatibility.

**Order of Implementation:**
1. **Database Schema Migration** - Add new columns (title, source, note) to signals table
2. **Type System Updates** - Update TypeScript types and add status mapping functions
3. **Upload Service Enhancement** - Implement column detection and mapping logic
4. **Upload API Updates** - Add two-phase upload (preview + import) with column mapping
5. **Column Mapping UI** - Create interactive column mapping component
6. **Signal Display Updates** - Update all signal components to show new fields
7. **Signal API Updates** - Update routes to handle new fields
8. **Note Management Logic** - Auto-populate notes when combining/archiving
9. **Export Updates** - Include new fields in CSV exports
10. **Validation Updates** - Update Zod schemas for new fields

**Deliverables:**
- ✅ Enhanced database schema with title, source, note columns
- ✅ Status mapping (internal: unassigned/assigned/retired → display: Pending/Combined/Archived)
- ✅ Intelligent column detection and mapping for spreadsheet imports
- ✅ Interactive column mapping UI with preview
- ✅ Support for importing Signal ID, Status, Title, Source, Note from spreadsheets
- ✅ Auto-population of notes when combining signals or archiving
- ✅ Updated signal display components showing all new fields
- ✅ Enhanced CSV exports with new fields

**Database Changes:**
- Add `title TEXT` column to signals table (nullable)
- Add `source TEXT` column to signals table (nullable, URL)
- Add `note TEXT` column to signals table (nullable)
- Migration script for existing databases

**Status Mapping:**
- Internal status values remain: `'unassigned' | 'assigned' | 'retired'`
- Display status values: `'Pending' | 'Combined' | 'Archived'`
- Mapping functions convert between internal and display values
- API responses use display values, database stores internal values

**Column Mapping Features:**
- Auto-detection of common column names (description, title, source, status, id, note)
- Manual override for each field
- Preview of first few rows with mapped data
- Validation before upload (duplicate IDs, invalid statuses)
- Support for importing Signal ID (with uniqueness validation)
- Support for importing Status (with validation: Pending/Combined/Archived)

**Note Management:**
- Auto-populate when combining signals: "Combined with signals: [list]"
- Require note when archiving signal (user input)
- Allow manual editing of notes at any time
- Preserve auto-generated content but allow additions

**Testing:**
- Database migration tests
- Column detection logic tests
- Status mapping function tests
- Upload with various column configurations
- Signal ID uniqueness validation
- Status import validation
- Note auto-population logic
- Export with new fields

**Why Seventh:** Enhances existing functionality after foundation is complete. Can be implemented incrementally without breaking existing features.

**Backward Compatibility:**
- All new fields are nullable
- Existing signals continue to work
- Status mapping ensures display consistency
- Export includes new fields (empty for old data)

---

### Phase 8: Frontend Core Features (Days 8-10)

**Goal:** Implement main user-facing features.

**Order of Implementation:**
1. **Home Page** - Project list (simplest, good starting point)
2. **Upload Page** - File upload with progress (needs processing status)
3. **Processing Progress Page** - Real-time status updates
4. **Signal Review Page** - Core workflow (most complex)
5. **Trends View** - List and manage trends
6. **Export Page** - Download CSVs

**Deliverables:**
- ✅ All pages functional
- ✅ Real-time processing status updates
- ✅ Core workflow working end-to-end

**Testing:**
- Manual end-to-end test: Upload → Process → Review → Create Trend → Export
- Test with small dataset (10-20 signals)
- Test error states and edge cases

**Why Seventh:** Needs backend API complete. Can test full user workflow.

**Critical Path Checkpoint:** After this phase, full application should work end-to-end for small datasets.

---

### Phase 9: Polish & Production (Days 11-12)

**Goal:** Production readiness, testing, optimization.

**Tasks:**
- ✅ Comprehensive testing (unit, integration, E2E)
- ✅ Error handling improvements
- ✅ Performance optimization
- ✅ Security audit
- ✅ Documentation
- ✅ Deployment setup
- ✅ Load testing with realistic dataset sizes

**Testing:**
- Full test suite
- Test with 500+ signals
- Test error recovery scenarios
- Test concurrent operations

**Why Last:** Final polish after core functionality works. Ensures production readiness.

---

## Implementation Strategy Notes

### Parallel Work Opportunities
- **Phase 2 & 3:** Can start writing tests for Phase 2 while implementing Phase 3
- **Phase 5 & 6:** Can start frontend setup while finishing API routes
- **Phase 8:** Different pages can be built in parallel by different developers

### Risk Mitigation
- **Early Testing:** Each phase should be tested before moving to next
- **Small Datasets First:** Always test with 5-10 signals before scaling
- **Mock External APIs:** Use mocks for Claude API during development to avoid costs
- **Incremental Database Testing:** Test each database operation as you build

### Critical Success Factors
1. **Get Phase 5 (API Routes) working fully** - This is the backend foundation
2. **Test Processing Service with small datasets** - Catches issues early
3. **Complete Phase 7 (Enhanced Data Model) before Phase 8** - Ensures data model is stable
4. **Verify end-to-end flow after Phase 8** - Ensures integration works
5. **Performance testing in Phase 9** - Validates architecture choices

### Estimated Timeline
- **Fast track (solo developer):** 12-14 days (includes Phase 7 enhancement)
- **With thorough testing:** 16-18 days (includes Phase 7 enhancement)
- **Team of 2-3:** 7-9 days (with parallel work, includes Phase 7 enhancement)

This phased approach ensures you can test incrementally and catch issues early, while maintaining clear checkpoints for progress validation.

---

## Plan Review Updates (2024)

This updated plan addresses the following improvements identified in the comprehensive review:

### 1. Multi-User Authentication & Authorization
- Added JWT-based authentication system
- User database schema with roles (admin, user, viewer)
- Project ownership management
- Authentication middleware for protected routes
- Authorization checks for project access

### 2. Database Schema Improvements
- Fixed `processing_status` table to use `project_id` as primary key (removed `id = 1` constraint)
- Updated all processing status queries to use project_id parameter
- Added user database schema for authentication

### 3. Naming Consistency
- Standardized project name from "Signal-to-Trend Clustering App" to "TrendFinder"
- Updated directory references from `signal-trend-app` to `trendfinder`
- Updated PM2 process name and file paths

### 4. Technology Stack Updates
- Added Tailwind CSS to frontend dependencies with setup instructions
- Added authentication libraries (jsonwebtoken, bcryptjs, cookie-parser)
- Updated backend dependencies list

### 5. Environment Variables
- Added JWT_SECRET and JWT_EXPIRY for authentication
- Updated deployment examples with correct directory paths

### 6. Documentation Improvements
- Updated single-user references to multi-user architecture
- Clarified database connection handling for multi-user scenarios
- Updated file structure references

### Additional Considerations for Future Implementation

1. **Database Migrations**: Implement a migration system for schema changes
2. **Monitoring & Observability**: Add metrics endpoints and monitoring integration
3. **Data Retention**: Define and implement data archival/deletion policies
4. **API Documentation**: Generate OpenAPI/Swagger documentation
5. **User Guide**: Create user-facing documentation
6. **Deployment Guide**: Expand deployment documentation with more details
7. **Troubleshooting Guide**: Add common issues and solutions
8. **Performance Testing**: Document performance benchmarks and optimization strategies
9. **Concurrent Processing**: For multi-instance deployments, consider Redis for processing locks
10. **Memory Management**: Document expected memory usage with embedding model for large datasets