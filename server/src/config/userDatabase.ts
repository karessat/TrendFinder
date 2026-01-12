import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';

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

  CREATE TABLE IF NOT EXISTS user_password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_project_owners_project_id ON project_owners(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON user_password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON user_password_resets(token_hash);
  CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON user_password_resets(expires_at);
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

