import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  createSignalSchema,
  updateSignalSchema,
  createTrendSchema,
  updateTrendSchema,
  addRemoveSignalsSchema,
  signalListQuerySchema
} from '../../validation/schemas';

describe('validation schemas', () => {
  describe('createProjectSchema', () => {
    it('validates valid project name', () => {
      const result = createProjectSchema.safeParse({ name: 'Test Project' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Project');
      }
    });

    it('rejects empty name', () => {
      const result = createProjectSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name longer than 200 characters', () => {
      const result = createProjectSchema.safeParse({ name: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('rejects missing name', () => {
      const result = createProjectSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('createSignalSchema', () => {
    it('validates valid signal text', () => {
      const result = createSignalSchema.safeParse({ text: 'Test signal text' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.text).toBe('Test signal text');
      }
    });

    it('rejects empty text', () => {
      const result = createSignalSchema.safeParse({ text: '' });
      expect(result.success).toBe(false);
    });

    it('rejects text longer than 10000 characters', () => {
      const result = createSignalSchema.safeParse({ text: 'a'.repeat(10001) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateSignalSchema', () => {
    it('validates update with text only', () => {
      const result = updateSignalSchema.safeParse({ text: 'Updated text' });
      expect(result.success).toBe(true);
    });

    it('validates update with status only', () => {
      const result = updateSignalSchema.safeParse({ status: 'assigned' });
      expect(result.success).toBe(true);
    });

    it('validates update with both fields', () => {
      const result = updateSignalSchema.safeParse({ text: 'Updated text', status: 'assigned' });
      expect(result.success).toBe(true);
    });

    it('rejects empty update object', () => {
      const result = updateSignalSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = updateSignalSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('createTrendSchema', () => {
    it('validates valid trend with signal IDs', () => {
      const result = createTrendSchema.safeParse({
        signalIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001'
        ]
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty signal IDs array', () => {
      const result = createTrendSchema.safeParse({ signalIds: [] });
      expect(result.success).toBe(false);
    });

    it('rejects too many signal IDs', () => {
      const result = createTrendSchema.safeParse({
        signalIds: Array(51).fill('123e4567-e89b-12d3-a456-426614174000')
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID format', () => {
      const result = createTrendSchema.safeParse({ signalIds: ['not-a-uuid'] });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTrendSchema', () => {
    it('validates update with summary only', () => {
      const result = updateTrendSchema.safeParse({ summary: 'Updated summary' });
      expect(result.success).toBe(true);
    });

    it('validates update with status only', () => {
      const result = updateTrendSchema.safeParse({ status: 'final' });
      expect(result.success).toBe(true);
    });

    it('validates update with both fields', () => {
      const result = updateTrendSchema.safeParse({ summary: 'Updated summary', status: 'final' });
      expect(result.success).toBe(true);
    });

    it('rejects summary longer than 1000 characters', () => {
      const result = updateTrendSchema.safeParse({ summary: 'a'.repeat(1001) });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = updateTrendSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('addRemoveSignalsSchema', () => {
    it('validates valid signal IDs with regenerateSummary', () => {
      const result = addRemoveSignalsSchema.safeParse({
        signalIds: ['123e4567-e89b-12d3-a456-426614174000'],
        regenerateSummary: true
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.regenerateSummary).toBe(true);
      }
    });

    it('defaults regenerateSummary to false', () => {
      const result = addRemoveSignalsSchema.safeParse({
        signalIds: ['123e4567-e89b-12d3-a456-426614174000']
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.regenerateSummary).toBe(false);
      }
    });
  });

  describe('signalListQuerySchema', () => {
    it('validates valid query params', () => {
      const result = signalListQuerySchema.safeParse({ status: 'unassigned', limit: 25, offset: 10 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('unassigned');
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
      }
    });

    it('defaults limit to 50', () => {
      const result = signalListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('defaults offset to 0', () => {
      const result = signalListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(0);
      }
    });

    it('coerces string numbers to numbers', () => {
      const result = signalListQuerySchema.safeParse({ limit: '25', offset: '10' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
      }
    });

    it('rejects limit greater than 100', () => {
      const result = signalListQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('rejects negative offset', () => {
      const result = signalListQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = signalListQuerySchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });
});


