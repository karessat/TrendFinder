import { getEnv } from '../config/env';
import { logger } from '../config/logger';

/**
 * Email service for sending emails
 * 
 * For development: Logs to console
 * For production: Can be extended to use SendGrid, AWS SES, etc.
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    // In production, integrate with actual email service
    // Example: SendGrid, AWS SES, etc.
    logger.info({ to: options.to, subject: options.subject }, 'Email would be sent in production');
    
    // TODO: Implement actual email sending service
    // For now, log the email content
    logger.info({ 
      to: options.to, 
      subject: options.subject,
      preview: options.text || options.html.substring(0, 100)
    }, 'Email service not configured - email not sent');
    
    throw new Error('Email service not configured. Please configure an email service for production use.');
  } else {
    // In development, log to console
    logger.info('=== EMAIL (Development Mode) ===');
    logger.info(`To: ${options.to}`);
    logger.info(`Subject: ${options.subject}`);
    logger.info('---');
    if (options.text) {
      logger.info(options.text);
    } else {
      logger.info(options.html);
    }
    logger.info('================================');
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void> {
  const subject = 'Reset Your TrendFinder Password';
  // Use the provided resetUrl (which should already have correct origin from request)
  const resetLink = resetUrl || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reset Your Password</h1>
        <p>You requested to reset your password for TrendFinder. Click the button below to reset your password:</p>
        <a href="${resetLink}" class="button">Reset Password</a>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #2563eb;">${resetLink}</p>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <div class="footer">
          <p>This is an automated message from TrendFinder. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Reset Your TrendFinder Password

You requested to reset your password. Click the link below or copy it into your browser:

${resetLink}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

---
This is an automated message from TrendFinder.
  `;
  
  await sendEmail({
    to: email,
    subject,
    html,
    text
  });
}

