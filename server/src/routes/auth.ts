import { Router, Response } from 'express';
import { z } from 'zod';
import { 
  createUser, 
  authenticateUser, 
  generateToken, 
  getUserByEmail,
  createPasswordResetToken,
  verifyPasswordResetToken,
  updateUserPassword
} from '../services/authService';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../config/logger';
import { sendPasswordResetEmail } from '../services/emailService';
import { getEnv } from '../config/env';

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

// Forgot password - request password reset
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

router.post('/forgot-password', async (req, res: Response) => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    const env = getEnv();
    const isDevelopment = env.NODE_ENV !== 'production';
    
    // Find user by email
    const user = getUserByEmail(validated.email);
    
    // Always return success (don't reveal if email exists)
    // This prevents email enumeration attacks
    let resetLink: string | undefined;
    
    if (user) {
      try {
        const resetToken = await createPasswordResetToken(user.id);
        // Use origin from request (where the frontend is actually running), fallback to env var, then default
        const requestOrigin = req.headers.origin;
        const envFrontendUrl = process.env.FRONTEND_URL;
        const frontendUrl = requestOrigin || envFrontendUrl || 'http://localhost:5174';
        resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
        await sendPasswordResetEmail(user.email, resetToken, req.body.resetUrl || resetLink);
        logger.info({ userId: user.id, email: user.email }, 'Password reset email sent');
        
        // In development, log the reset link prominently
        if (isDevelopment) {
          logger.info('═══════════════════════════════════════════════════════════');
          logger.info('🔗 PASSWORD RESET LINK (Development Mode):');
          logger.info(`   ${resetLink}`);
          logger.info('═══════════════════════════════════════════════════════════');
        }
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to send password reset email');
        // Still return success to prevent email enumeration
      }
    } else {
      logger.warn({ email: validated.email }, 'Password reset requested for non-existent user');
    }
    
    // In development, include reset link in response for convenience
    const response: any = { 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    };
    
    if (isDevelopment && resetLink && user) {
      response.devResetLink = resetLink;
      response.devNote = 'Development mode: Reset link included below. Check server console for details.';
    }
    
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => e.message).join(', ')
      });
    }
    
    logger.error({ error }, 'Forgot password request failed');
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password - use token to set new password
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

router.post('/reset-password', async (req, res: Response) => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    
    // Verify token
    const userId = await verifyPasswordResetToken(validated.token);
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset token. Please request a new password reset.' 
      });
    }
    
    // Update password
    await updateUserPassword(userId, validated.password);
    
    logger.info({ userId }, 'Password reset completed');
    
    res.json({ 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => e.message).join(', ')
      });
    }
    
    logger.error({ error }, 'Password reset failed');
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;

