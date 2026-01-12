import { generateToken, createUser, assignProjectToUser } from '../../services/authService';
import { getUserDatabase } from '../../config/userDatabase';

/**
 * Create a test user and return a JWT token for authentication
 */
export async function createTestUser(role: 'admin' | 'user' | 'viewer' = 'user'): Promise<{ userId: string; email: string; token: string }> {
  const email = `test-${Date.now()}@example.com`;
  const user = await createUser(email, 'test-password', 'Test User');
  
  // Update role if needed
  if (role !== 'user') {
    const db = getUserDatabase();
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  }
  
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: role
  });
  
  return {
    userId: user.id,
    email: user.email,
    token
  };
}

/**
 * Assign a project to a test user
 */
export function assignTestProject(projectId: string, userId: string): void {
  assignProjectToUser(projectId, userId);
}


