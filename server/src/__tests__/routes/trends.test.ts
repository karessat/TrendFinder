import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import trendsRouter from '../../routes/trends';
import { createTestUser, assignTestProject } from '../helpers/auth';
import { createTestProject, cleanupTestProject } from '../helpers/database';
import { getDatabase, closeDatabase } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

// Mock Claude service
const mockGenerateTrendSummary = vi.fn().mockResolvedValue({
  title: 'Mock Trend Title',
  summary: 'Mock trend summary'
});
vi.mock('../../services/claudeService', () => ({
  generateTrendSummary: mockGenerateTrendSummary
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/projects/:projectId/trends', trendsRouter);
  return app;
}

describe('Trends API', () => {
  const app = createTestApp();
  let testUser: { userId: string; email: string; token: string };
  let projectId: string;
  let signalIds: string[];

  beforeEach(async () => {
    testUser = await createTestUser();
    projectId = createTestProject();
    assignTestProject(projectId, testUser.userId);

    // Add some test signals
    const db = getDatabase(projectId);
    signalIds = [];
    for (let i = 0; i < 3; i++) {
      const signalId = uuidv4();
      signalIds.push(signalId);
      db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)').run(signalId, `Test signal ${i + 1}`, 'unassigned');
    }
    // Force checkpoint to ensure changes are persisted
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    closeDatabase(projectId);
  });

  afterEach(() => {
    if (projectId) {
      cleanupTestProject(projectId);
    }
  });

  describe('GET /api/projects/:projectId/trends', () => {
    it('returns list of trends', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('trends');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.trends)).toBe(true);
    });
  });

  describe('POST /api/projects/:projectId/trends', () => {
    it('creates a trend from signals', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ signalIds: signalIds.slice(0, 2) });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('trend');
      expect(res.body.trend).toHaveProperty('id');
      expect(res.body.trend).toHaveProperty('summary');
      expect(mockGenerateTrendSummary).toHaveBeenCalled();
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/projects/:projectId/trends/:trendId', () => {
    it('returns a trend with its signals', async () => {
      // Create a trend first
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ signalIds: signalIds.slice(0, 2) });

      const trendId = createRes.body.trend.id;

      const res = await request(app)
        .get(`/api/projects/${projectId}/trends/${trendId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('trend');
      expect(res.body).toHaveProperty('signals');
      expect(res.body.signals.length).toBe(2);
    });
  });

  describe('PUT /api/projects/:projectId/trends/:trendId', () => {
    it('updates a trend', async () => {
      // Create a trend first
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ signalIds: signalIds.slice(0, 2) });

      const trendId = createRes.body.trend.id;

      const res = await request(app)
        .put(`/api/projects/${projectId}/trends/${trendId}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ summary: 'Updated summary' });

      expect(res.status).toBe(200);
      expect(res.body.trend.summary).toBe('Updated summary');
    });
  });

  describe('DELETE /api/projects/:projectId/trends/:trendId', () => {
    it('deletes a trend and unassigns signals', async () => {
      // Create a trend first
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/trends`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ signalIds: signalIds.slice(0, 2) });

      const trendId = createRes.body.trend.id;

      const res = await request(app)
        .delete(`/api/projects/${projectId}/trends/${trendId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(204);

      // Verify signals are unassigned
      const db = getDatabase(projectId);
      const signals = db.prepare('SELECT status FROM signals WHERE id IN (?, ?)').all(signalIds[0], signalIds[1]) as Array<{ status: string }>;
      closeDatabase(projectId);
      expect(signals.every(s => s.status === 'unassigned')).toBe(true);
    });
  });
});

