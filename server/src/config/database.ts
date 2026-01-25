import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';

// Resolve data directory dynamically to handle test environment changes
function getResolvedDataDir(): string {
  const DATA_DIR = process.env.DATA_DIR || './data/projects';
  const resolvedDataDir = path.isAbsolute(DATA_DIR) 
    ? DATA_DIR 
    : path.resolve(process.cwd(), DATA_DIR);
  
  // Ensure data directory exists
  if (!fs.existsSync(resolvedDataDir)) {
    fs.mkdirSync(resolvedDataDir, { recursive: true });
  }
  
  return resolvedDataDir;
}

// Connection cache with LRU-like cleanup (max 50 connections)
const connectionCache = new Map<string, Database.Database>();
const MAX_CACHE_SIZE = 50;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    original_text TEXT NOT NULL,
    title TEXT,
    source TEXT,
    note TEXT,
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
    title TEXT,
    summary TEXT NOT NULL,
    note TEXT,
    signal_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'retired', 'archived')),
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
 * Migrate database schema to add new columns if they don't exist
 */
function migrateDatabase(db: Database.Database, projectId: string): void {
  try {
    // Migrate signals table
    const signalsTableInfo = db.prepare(`PRAGMA table_info(signals)`).all() as Array<{ name: string }>;
    const signalsColumnNames = signalsTableInfo.map(col => col.name.toLowerCase());
    
    const signalsColumnsToAdd: Array<{ name: string; type: string }> = [];
    
    if (!signalsColumnNames.includes('title')) {
      signalsColumnsToAdd.push({ name: 'title', type: 'TEXT' });
    }
    if (!signalsColumnNames.includes('source')) {
      signalsColumnsToAdd.push({ name: 'source', type: 'TEXT' });
    }
    if (!signalsColumnNames.includes('note')) {
      signalsColumnsToAdd.push({ name: 'note', type: 'TEXT' });
    }
    
    if (signalsColumnsToAdd.length > 0) {
      for (const col of signalsColumnsToAdd) {
        db.exec(`ALTER TABLE signals ADD COLUMN ${col.name} ${col.type}`);
        logger.info({ projectId, column: col.name, table: 'signals' }, 'Added column to signals table');
      }
    }
    
    // Migrate trends table
    const trendsTableInfo = db.prepare(`PRAGMA table_info(trends)`).all() as Array<{ name: string }>;
    const trendsColumnNames = trendsTableInfo.map(col => col.name.toLowerCase());
    
    if (!trendsColumnNames.includes('title')) {
      db.exec(`ALTER TABLE trends ADD COLUMN title TEXT NOT NULL DEFAULT 'Trend'`);
      logger.info({ projectId, column: 'title', table: 'trends' }, 'Added title column to trends table');
    } else {
      // Make title required for existing databases (set default for NULL values)
      const nullTitles = db.prepare('SELECT COUNT(*) as count FROM trends WHERE title IS NULL').get() as { count: number };
      if (nullTitles.count > 0) {
        db.exec(`UPDATE trends SET title = 'Trend' WHERE title IS NULL`);
        logger.info({ projectId, updated: nullTitles.count }, 'Updated NULL titles to default value');
      }
      // Note: SQLite doesn't support ALTER COLUMN to change NULL to NOT NULL
      // We'll enforce this at the application level instead
    }
    
    if (!trendsColumnNames.includes('note')) {
      db.exec(`ALTER TABLE trends ADD COLUMN note TEXT`);
      logger.info({ projectId, column: 'note', table: 'trends' }, 'Added note column to trends table');
    }
    
    // Update status constraint to allow retired and archived (SQLite doesn't support modifying CHECK constraints directly)
    // We'll handle this in application logic - the constraint will be enforced by the application
    
    if (signalsColumnsToAdd.length > 0 || !trendsColumnNames.includes('title')) {
      logger.info({ projectId, signalsColumnsAdded: signalsColumnsToAdd.length, trendsTitleAdded: !trendsColumnNames.includes('title') }, 'Database migration completed');
    }
  } catch (error) {
    logger.error({ projectId, error }, 'Database migration failed');
    // Don't throw - allow the app to continue even if migration fails
    // The columns will be NULL for existing records, which is acceptable
  }
}

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
  
  const resolvedDataDir = getResolvedDataDir();
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
  
  // Run migration to add new columns if needed
  migrateDatabase(db, projectId);
  
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
  const resolvedDataDir = getResolvedDataDir();
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
    const resolvedDataDir = getResolvedDataDir();
    return fs.readdirSync(resolvedDataDir)
      .filter(f => f.endsWith('.db') && !f.includes('-wal') && !f.includes('-shm'))
      .map(f => f.replace('.db', ''))
      .filter(id => /^proj_[a-zA-Z0-9]+$/.test(id)); // Additional validation
  } catch (error) {
    const resolvedDataDir = getResolvedDataDir();
    logger.error({ error, dataDir: resolvedDataDir }, 'Failed to list project IDs');
    return [];
  }
}

