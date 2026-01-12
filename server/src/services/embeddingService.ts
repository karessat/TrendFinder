import { pipeline } from '@xenova/transformers';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

// Singleton pattern: Load model once at startup
let embeddingPipeline: any = null;
let modelLoadingPromise: Promise<any> | null = null;

/**
 * Initialize embedding pipeline (loads model on first call)
 * Uses singleton pattern to avoid reloading model for each request
 */
async function getEmbeddingPipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }
  
  // If already loading, wait for that promise
  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }
  
  // Start loading
  modelLoadingPromise = (async () => {
    try {
      logger.info({ model: getEnv().EMBEDDING_MODEL }, 'Loading embedding model');
      embeddingPipeline = await pipeline(
        'feature-extraction',
        getEnv().EMBEDDING_MODEL,
        { quantized: true } // Use quantized model for faster loading and lower memory
      );
      logger.info('Embedding model loaded successfully');
      return embeddingPipeline;
    } catch (error) {
      logger.error({ error }, 'Failed to load embedding model');
      modelLoadingPromise = null; // Reset so we can retry
      throw error;
    }
  })();
  
  return modelLoadingPromise;
}

/**
 * Generate embedding vector for a text string
 * Returns normalized embedding as array of numbers
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    logger.warn('Empty text provided for embedding generation');
    return null;
  }
  
  // Truncate very long text (embedding models have token limits)
  const MAX_TEXT_LENGTH = 512; // Conservative limit for most models
  const truncatedText = text.length > MAX_TEXT_LENGTH 
    ? text.substring(0, MAX_TEXT_LENGTH) 
    : text;
  
  try {
    const pipeline = await getEmbeddingPipeline();
    const result = await pipeline(truncatedText, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array
    const embedding = Array.from(result.data);
    
    // Validate embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      logger.error({ textLength: truncatedText.length }, 'Invalid embedding result');
      return null;
    }
    
    return embedding as number[];
  } catch (error) {
    logger.error({ error, textLength: truncatedText.length }, 'Failed to generate embedding');
    return null;
  }
}


