import { Router } from 'express';
import { getEnv } from '../config/env';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

router.get('/ready', async (req, res) => {
  try {
    // Check if we can access data directory
    const env = getEnv();
    // Could add database connectivity check here
    
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: String(error) });
  }
});

export default router;

