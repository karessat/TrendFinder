import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { rateLimit, validateProjectId, sanitizeString } from '../../middleware/security';
import { loadEnv } from '../../config/env';

describe('security middleware', () => {
  beforeEach(() => {
    try {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.DATA_DIR = './data/test-projects';
      process.env.MAX_FILE_SIZE_MB = '10';
      loadEnv();
    } catch (e) {
      // Already loaded, ignore
    }
  });

  describe('rateLimit', () => {
    it('allows requests within limit', () => {
      const middleware = rateLimit(5, 60000); // 5 requests per minute
      const req = { ip: '127.0.0.1-test1' } as Request; // Unique IP per test
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        middleware(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(5);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks requests exceeding limit', () => {
      const middleware = rateLimit(2, 60000); // 2 requests per minute
      const req = { ip: '127.0.0.1-test2' } as Request; // Unique IP per test
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      // Make 3 requests
      middleware(req, res, next);
      middleware(req, res, next);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Too many requests' })
      );
    });

    it('sets rate limit headers', () => {
      const middleware = rateLimit(5, 60000);
      const req = { ip: '127.0.0.1-test3' } as Request; // Unique IP per test
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
  });

  describe('validateProjectId', () => {
    it('allows valid project ID format', () => {
      const middleware = validateProjectId;
      const req = { params: { projectId: 'proj_test123' } } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects invalid project ID format', () => {
      const middleware = validateProjectId;
      const req = { params: { projectId: 'invalid_id' } } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid project ID format' });
    });

    it('rejects missing project ID', () => {
      const middleware = validateProjectId;
      const req = { params: {} } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('sanitizeString', () => {
    it('removes HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('trims whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });

    it('handles empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('handles normal text', () => {
      expect(sanitizeString('Normal text')).toBe('Normal text');
    });
  });
});

