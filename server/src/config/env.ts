import { z } from 'zod';
import { config } from 'dotenv';
import { resolve } from 'path';
import { logger } from './logger';

// Load .env file from project root (parent directory)
config({ path: resolve(process.cwd(), '../.env') });
// Also try loading from current directory (for when running from server/)
config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ANTHROPIC_API_KEY: z.string()
    .min(1, 'ANTHROPIC_API_KEY is required')
    .refine((key) => key.startsWith('sk-ant-'), {
      message: 'ANTHROPIC_API_KEY must start with sk-ant-'
    }),
  EMBEDDING_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),
  DATA_DIR: z.string().default('./data/projects'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  CLAUDE_RATE_LIMIT_DELAY_MS: z.coerce.number().default(150),
  PROCESSING_CONCURRENCY: z.coerce.number().default(5).describe('Number of parallel workers for processing (embeddings and Claude verification)'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5174'),
  JWT_SECRET: z.string().default('change-me-in-production'),
  JWT_EXPIRY: z.string().default('7d')
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  if (env) return env;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    logger.error({ errors: result.error.errors }, 'Environment validation failed');
    console.error('Environment validation failed:');
    result.error.errors.forEach(err => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  
  env = result.data;
  logger.info('Environment configuration loaded');
  return env;
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not loaded. Call loadEnv() first.');
  }
  return env;
}

