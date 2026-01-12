import { getUserDatabase, closeUserDatabase } from './src/config/userDatabase.js';
import { loadEnv } from './src/config/env.js';

console.log('Testing user database configuration...\n');

loadEnv();

try {
  const db = getUserDatabase();
  console.log('✅ User database created');
  
  // Verify schema
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  
  const expectedTables = ['users', 'user_sessions', 'project_owners'];
  const tableNames = tables.map(t => t.name);
  
  console.log('  Found tables:', tableNames);
  
  for (const expected of expectedTables) {
    if (!tableNames.includes(expected)) {
      throw new Error(`Missing table: ${expected}`);
    }
  }
  console.log('✅ All expected user tables exist');
  
  // Verify users table structure
  const usersInfo = db.prepare(`PRAGMA table_info(users)`).all();
  const userColumns = usersInfo.map((col: any) => col.name);
  const requiredColumns = ['id', 'email', 'password_hash', 'role'];
  
  for (const col of requiredColumns) {
    if (!userColumns.includes(col)) {
      throw new Error(`Missing column in users: ${col}`);
    }
  }
  console.log('✅ Users table structure correct');
  
  closeUserDatabase();
  
  console.log('\n✅ All user database tests passed!');
} catch (error) {
  console.error('❌ User database test failed:', error);
  process.exit(1);
}


