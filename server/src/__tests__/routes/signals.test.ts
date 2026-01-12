import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import signalsRouter from '../../routes/signals';
import { createTestUser, assignTestProject } from '../helpers/auth';
import { createTestProject, cleanupTestProject } from '../helpers/database';
import { getDatabase, closeDatabase } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

// Mock Claude service
vi.mock('../../services/claudeService', () => ({
  generateTrendSummary: vi.fn().mockResolvedValue({
    title: 'Mock Trend Title',
    summary: 'Mock trend summary'
  })
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/projects/:projectId/signals', signalsRouter);
  return app;
}

describe('Signals API', () => {
  const app = createTestApp();
  let testUser: { userId: string; email: string; token: string };
  let projectId: string;

  beforeEach(async () => {
    testUser = await createTestUser();
    projectId = createTestProject();
    assignTestProject(projectId, testUser.userId);

    // Add some test signals
    const db = getDatabase(projectId);
    const signalId1 = uuidv4();
    const signalId2 = uuidv4();
    db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)').run(signalId1, 'Test signal 1', 'unassigned');
    db.prepare('INSERT INTO signals (id, original_text, status) VALUES (?, ?, ?)').run(signalId2, 'Test signal 2', 'unassigned');
    
    // Force checkpoint to ensure changes are persisted
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    closeDatabase(projectId);
  });

  afterEach(() => {
    if (projectId) {
      cleanupTestProject(projectId);
    }
  });

  describe('GET /api/projects/:projectId/signals', () => {
    it('returns list of signals', async () => {
      // Verify project exists before making request
      const { projectExists } = await import('../../config/database');
      if (!projectExists(projectId)) {
        throw new Error(`Project ${projectId} does not exist before test`);
      }
      
      const res = await request(app)
        .get(`/api/projects/${projectId}/signals`)
        .set('Authorization', `Bearer ${testUser.token}`);

      if (res.status !== 200) {
        console.error('Response body:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('signals');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('unassignedCount');
      expect(Array.isArray(res.body.signals)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/signals?status=unassigned`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.signals.every((s: any) => s.status === 'unassigned')).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/signals`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:projectId/signals/next-unassigned', () => {
    it('returns next unassigned signal with similar signals', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/signals/next-unassigned`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('signal');
      expect(res.body).toHaveProperty('similarSignals');
      expect(res.body).toHaveProperty('remainingCount');
      if (res.body.signal) {
        expect(res.body.signal.status).toBe('unassigned');
      }
    });
  });

  describe('GET /api/projects/:projectId/signals/:signalId', () => {
    it('returns a single signal', async () => {
      const db = getDatabase(projectId);
      const signal = db.prepare('SELECT id FROM signals LIMIT 1').get() as { id: string };
      closeDatabase(projectId);

      const res = await request(app)
        .get(`/api/projects/${projectId}/signals/${signal.id}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('originalText');
    });

    it('returns 404 for non-existent signal', async () => {
      const fakeId = uuidv4();
      const res = await request(app)
        .get(`/api/projects/${projectId}/signals/${fakeId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/projects/:projectId/signals', () => {
    it('creates a new signal', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/signals`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ text: 'New test signal' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.originalText).toBe('New test signal');
      expect(res.body.status).toBe('unassigned');
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/signals`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/projects/:projectId/signals/:signalId', () => {
    it('updates a signal', async () => {
      const db = getDatabase(projectId);
      const signal = db.prepare('SELECT id FROM signals LIMIT 1').get() as { id: string };
      closeDatabase(projectId);

      const res = await request(app)
        .put(`/api/projects/${projectId}/signals/${signal.id}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ text: 'Updated signal text' });

      expect(res.status).toBe(200);
      expect(res.body.originalText).toBe('Updated signal text');
    });
  });

  describe('DELETE /api/projects/:projectId/signals/:signalId', () => {
    it('deletes a signal', async () => {
      const db = getDatabase(projectId);
      const signal = db.prepare('SELECT id FROM signals LIMIT 1').get() as { id: string };
      closeDatabase(projectId);

      const res = await request(app)
        .delete(`/api/projects/${projectId}/signals/${signal.id}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(204);
    });
  });
});

