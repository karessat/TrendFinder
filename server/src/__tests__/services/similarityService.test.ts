import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findTopCandidates } from '../../services/similarityService';

describe('similarityService', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 0, 0, 0];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
    });
    
    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0, 0];
      const b = [0, 1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });
    
    it('returns -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });
    
    it('handles empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('throws error for vectors of different lengths', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
    });

    it('returns correct similarity for normalized vectors', () => {
      const a = [1, 1, 0];
      const b = [1, 0, 1];
      const result = cosineSimilarity(a, b);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('handles zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });
  
  describe('findTopCandidates', () => {
    it('returns top N candidates sorted by similarity', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0, 1, 0] },
        { id: 'c', embedding: [0.5, 0.5, 0] }
      ];
      
      const result = findTopCandidates(target, candidates, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[0].score).toBeGreaterThan(result[1].score);
      expect(result[1].id).toBe('c');
    });

    it('returns empty array for empty candidates', () => {
      const target = [1, 0, 0];
      const result = findTopCandidates(target, [], 5);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when topN is 0', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0] }
      ];
      const result = findTopCandidates(target, candidates, 0);
      expect(result).toHaveLength(0);
    });

    it('returns all candidates when topN exceeds candidate count', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0, 1, 0] }
      ];
      const result = findTopCandidates(target, candidates, 10);
      expect(result).toHaveLength(2);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });

    it('filters out invalid embeddings', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0, 1] }, // Wrong length - should be filtered
        { id: 'c', embedding: [0.5, 0.5, 0] }
      ];
      
      const result = findTopCandidates(target, candidates, 5);
      
      // Should only return valid candidates
      expect(result.length).toBeLessThanOrEqual(2);
      expect(result.every(r => r.id === 'a' || r.id === 'c')).toBe(true);
    });

    it('sorts by score descending', () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: 'low', embedding: [0, 1, 0] },
        { id: 'high', embedding: [0.9, 0.1, 0] },
        { id: 'mid', embedding: [0.5, 0.5, 0] }
      ];
      
      const result = findTopCandidates(target, candidates, 3);
      
      expect(result[0].score).toBeGreaterThan(result[1].score);
      expect(result[1].score).toBeGreaterThan(result[2].score);
      expect(result[0].id).toBe('high');
    });
  });
});


