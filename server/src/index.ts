import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { loadEnv, getEnv } from './config/env';
import { logger, requestLogger } from './config/logger';
import { rateLimit } from './middleware/security';
import { csrfProtection, getCsrfToken } from './middleware/csrf';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';
import signalsRouter from './routes/signals';
import trendsRouter from './routes/trends';
import exportRouter from './routes/export';

// Load and validate environment
loadEnv();

const app = express();
const env = getEnv();

// Security: Request size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Cookie parser for JWT tokens
app.use(cookieParser());

// CORS configuration
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Request logging
app.use(requestLogger);

// Root route - API information
app.get('/', (req, res) => {
  res.json({
    name: 'TrendFinder API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      projects: '/api/projects',
      signals: '/api/projects/:projectId/signals',
      trends: '/api/projects/:projectId/trends',
      export: '/api/projects/:projectId/export'
    },
    documentation: 'See plan.md for API documentation'
  });
});

// Handle favicon requests to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Health check (no rate limiting, no CSRF)
app.use('/api/health', healthRouter);

// CSRF token endpoint (public, no CSRF protection needed)
app.get('/api/csrf-token', getCsrfToken);

// Rate limiting for API endpoints (more lenient for status endpoints)
app.use('/api', rateLimit(200, 60000)); // 200 requests per minute per IP (increased from 100)

// CSRF protection for all API routes (except health and csrf-token which are above)
app.use('/api', csrfProtection);

// Auth routes (public, no auth required, but CSRF protected)
app.use('/api/auth', authRouter);

// API routes (protected)
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/signals', signalsRouter);
app.use('/api/projects/:projectId/trends', trendsRouter);
app.use('/api/projects/:projectId/export', exportRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ 
    error: err.message, 
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  }, 'Unhandled error');
  
  // Don't expose internal error details in production
  const isProduction = env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Export app for testing
export { app };
export default app;

