import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createTestUser, assignTestProject } from '../helpers/auth';
import { createTestProject, cleanupTestProject } from '../helpers/database';

// Import router AFTER environment is loaded
import projectsRouter from '../../routes/projects';

// Mock processing service to avoid actual processing during tests
vi.mock('../../services/processingService', () => ({
  processProject: vi.fn().mockResolvedValue(undefined),
  retryFailedVerifications: vi.fn().mockResolvedValue({ retried: 0, succeeded: 0 })
}));

// Mock upload service
vi.mock('../../services/uploadService', () => ({
  processSpreadsheetUpload: vi.fn().mockResolvedValue({
    success: true,
    signalCount: 5,
    detectedColumn: 'B',
    processingStarted: false,
    estimatedCost: '$0.07',
    estimatedMinutes: 1
  })
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/projects', projectsRouter);
  return app;
}

describe('Projects API', () => {
  const app = createTestApp();
  let testUser: { userId: string; email: string; token: string };
  let projectId: string;

  beforeEach(async () => {
    testUser = await createTestUser();
    // Note: projectId is created in individual tests
  });

  afterEach(() => {
    if (projectId) {
      cleanupTestProject(projectId);
    }
  });

  describe('POST /api/projects', () => {
    it('creates a new project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ name: 'Test Project' });

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^proj_/);
      expect(res.body.name).toBe('Test Project');
      expect(res.body.createdAt).toBeDefined();

      projectId = res.body.id;
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects', () => {
    it('returns list of projects', async () => {
      // Create a project first
      const createRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ name: 'Test Project' });

      projectId = createRes.body.id;

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .get('/api/projects');

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('deletes a project', async () => {
      // Create a project first
      const createRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ name: 'Test Project' });

      projectId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(204);
      projectId = ''; // Already deleted
    });

    it('returns 403 for non-existent project (access denied)', async () => {
      const fakeId = 'proj_nonexistent';
      const res = await request(app)
        .delete(`/api/projects/${fakeId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      // Access control middleware checks before project existence
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/projects/:projectId/processing-status', () => {
    it('returns processing status', async () => {
      // Create a project first
      const createRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ name: 'Test Project' });

      projectId = createRes.body.id;

      const res = await request(app)
        .get(`/api/projects/${projectId}/processing-status`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('totalSignals');
      expect(res.body).toHaveProperty('currentPhase');
    });
  });
});

