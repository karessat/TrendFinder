// Vitest setup file - runs before all tests
// This ensures environment variables are loaded before any modules are imported

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

import { loadEnv } from './src/config/env';

try {
  loadEnv();
} catch (e) {
  // Already loaded, ignore
}


