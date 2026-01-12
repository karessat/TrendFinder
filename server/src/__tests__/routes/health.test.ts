// Note: This test imports index.ts which calls loadEnv() at module load time
// Environment variables must be set in vitest.setup.ts or before this file is loaded
// For now, we'll skip direct integration testing of health routes with index.ts
// and test the health router directly instead

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRouter from '../../routes/health';
import { loadEnv, getEnv } from '../../config/env';

// Create a minimal app for testing the health routes
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Set up test environment before loading env
  try {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.DATA_DIR = './data/test-projects';
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'test';
    process.env.MAX_FILE_SIZE_MB = '10';
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_EXPIRY = '7d';
    process.env.EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
    process.env.CLAUDE_RATE_LIMIT_DELAY_MS = '100';
    process.env.LOG_LEVEL = 'debug';
    
    // Try to load env (may have already been loaded)
    try {
      loadEnv();
    } catch (e) {
      // Already loaded, ignore
    }
  } catch (e) {
    // Ignore
  }
  
  app.use('/api/health', healthRouter);
  return app;
}

describe('health routes', () => {
  const app = createTestApp();

  describe('GET /api/health/health', () => {
    it('returns health status', async () => {
      const res = await request(app)
        .get('/api/health/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.version).toBeDefined();
    });

    it('returns valid timestamp', async () => {
      const res = await request(app)
        .get('/api/health/health')
        .expect(200);

      const timestamp = new Date(res.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('GET /api/health/health/ready', () => {
    it('returns ready status when environment is valid', async () => {
      const res = await request(app)
        .get('/api/health/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ready');
    });
  });
});
