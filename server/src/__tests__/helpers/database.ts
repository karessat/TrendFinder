import { getDatabase, closeDatabase, deleteProjectDatabase, getProjectPath, projectExists } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

/**
 * Create a test project database with basic setup
 */
export function createTestProject(projectId?: string): string {
  const testProjectId = projectId || `proj_${uuidv4().replace(/-/g, '')}`;
  const db = getDatabase(testProjectId);
  
  // Initialize project meta
  db.prepare("INSERT OR IGNORE INTO project_meta (key, value) VALUES ('name', ?)").run('Test Project');
  db.prepare("INSERT OR IGNORE INTO project_meta (key, value) VALUES ('created_at', ?)").run(new Date().toISOString());
  
  // Initialize processing status
  db.prepare(`
    INSERT OR IGNORE INTO processing_status (project_id, total_signals, status)
    VALUES (?, 0, 'pending')
  `).run(testProjectId);
  
  // Force checkpoint to ensure WAL is flushed to main database file
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  
  closeDatabase(testProjectId);
  
  // Verify the file exists and projectExists works
  const dbPath = getProjectPath(testProjectId);
  const fileExists = fs.existsSync(dbPath);
  const existsCheck = projectExists(testProjectId);
  
  if (!fileExists) {
    throw new Error(`Database file not created: ${dbPath}`);
  }
  
  if (!existsCheck) {
    // Double-check: maybe there's a timing issue
    const retryCheck = projectExists(testProjectId);
    if (!retryCheck) {
      throw new Error(`projectExists returned false for ${testProjectId}. File exists: ${fileExists}, Path: ${dbPath}, Retry: ${retryCheck}`);
    }
  }
  
  return testProjectId;
}

/**
 * Clean up test project
 */
export function cleanupTestProject(projectId: string): void {
  deleteProjectDatabase(projectId);
}
