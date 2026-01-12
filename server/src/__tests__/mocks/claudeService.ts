import { vi } from 'vitest';

export const mockVerifySimilarities = vi.fn().mockResolvedValue([
  { number: 1, score: 9 },
  { number: 2, score: 7 }
]);

export const mockGenerateTrendSummary = vi.fn().mockResolvedValue({
  title: 'Mock Trend Title',
  summary: 'This is a mock trend summary describing the pattern.'
});

