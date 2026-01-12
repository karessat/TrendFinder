import { Router, Response } from 'express';
import { z } from 'zod';
import { createUser, authenticateUser, generateToken, getUserByEmail } from '../services/authService';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../config/logger';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

// Register new user
router.post('/register', async (req, res: Response) => {
  try {
    const validated = registerSchema.parse(req.body);
    
    // Check if user already exists (by email only)
    const existingUser = getUserByEmail(validated.email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const user = await createUser(validated.email, validated.password, validated.name);
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Set token in HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token // Also return token for clients that prefer header-based auth
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => e.message).join(', ')
      });
    }

    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    logger.error({ error }, 'Registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res: Response) => {
  try {
    const validated = loginSchema.parse(req.body);
    
    const user = await authenticateUser(validated.email, validated.password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Set token in HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token // Also return token for clients that prefer header-based auth
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => e.message).join(', ')
      });
    }

    logger.error({ error }, 'Login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user (requires authentication)
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({
    user: {
      id: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role
    }
  });
});

export default router;

