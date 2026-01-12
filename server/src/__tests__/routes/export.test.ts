import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import exportRouter from '../../routes/export';
import { createTestUser, assignTestProject } from '../helpers/auth';
import { createTestProject, cleanupTestProject } from '../helpers/database';
import { getDatabase, closeDatabase } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/projects/:projectId/export', exportRouter);
  return app;
}

describe('Export API', () => {
  const app = createTestApp();
  let testUser: { userId: string; email: string; token: string };
  let projectId: string;

  beforeEach(async () => {
    testUser = await createTestUser();
    projectId = createTestProject();
    assignTestProject(projectId, testUser.userId);

    // Add test data
    const db = getDatabase(projectId);
    
    // Add signals
    const signalId1 = uuidv4();
    const signalId2 = uuidv4();
    db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)').run(signalId1, 'Signal 1', 'unassigned');
    db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)').run(signalId2, 'Signal 2', 'assigned');
    
    // Add trend
    const trendId = uuidv4();
    db.prepare('INSERT INTO trends (id, summary, signal_count) VALUES (?, ?, ?)').run(trendId, 'Test trend summary', 1);
    db.prepare('UPDATE signals SET trend_id = ? WHERE id = ?').run(trendId, signalId2);
    
    // Force checkpoint to ensure changes are persisted
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    closeDatabase(projectId);
  });

  afterEach(() => {
    if (projectId) {
      cleanupTestProject(projectId);
    }
  });

  describe('GET /api/projects/:projectId/export/trends-csv', () => {
    it('exports trends with signals as CSV', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export/trends-csv`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('trends-with-signals');
      expect(res.text).toContain('Trend ID');
      expect(res.text).toContain('Signal ID');
    });
  });

  describe('GET /api/projects/:projectId/export/signals-csv', () => {
    it('exports all signals as CSV', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export/signals-csv`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('signals');
      expect(res.text).toContain('Signal ID');
      expect(res.text).toContain('Text');
    });
  });

  describe('GET /api/projects/:projectId/export/summary-csv', () => {
    it('exports trend summaries as CSV', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export/summary-csv`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('trend-summaries');
      expect(res.text).toContain('Trend ID');
      expect(res.text).toContain('Summary');
    });
  });

  describe('Authentication', () => {
    it('requires authentication for all export routes', async () => {
      const routes = ['/trends-csv', '/signals-csv', '/summary-csv'];
      
      for (const route of routes) {
        const res = await request(app)
          .get(`/api/projects/${projectId}/export${route}`);
        
        expect(res.status).toBe(401);
      }
    });
  });
});

