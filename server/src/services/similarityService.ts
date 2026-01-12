import { SimilarityScore } from '../types';

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  if (vecA.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Find top N candidates by cosine similarity
 * Returns sorted array of SimilarityScore objects (highest similarity first)
 */
export function findTopCandidates(
  targetEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[] }>,
  topN: number
): SimilarityScore[] {
  if (candidates.length === 0 || topN <= 0) {
    return [];
  }
  
  // Calculate similarities for all candidates
  const scores: SimilarityScore[] = candidates
    .map(candidate => {
      try {
        const similarity = cosineSimilarity(targetEmbedding, candidate.embedding);
        return {
          id: candidate.id,
          score: similarity
        };
      } catch (error) {
        // Skip candidates with invalid embeddings
        return null;
      }
    })
    .filter((item): item is SimilarityScore => item !== null);
  
  // Sort by score descending and take top N
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}


