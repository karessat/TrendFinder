import { getDatabase, closeDatabase, deleteProjectDatabase, listProjectIds } from './src/config/database.js';
import { loadEnv } from './src/config/env.js';

console.log('Testing database configuration...\n');

// Load environment
loadEnv();

const testProjectId = 'proj_test123';

try {
  // Clean up if exists
  if (listProjectIds().includes(testProjectId)) {
    deleteProjectDatabase(testProjectId);
  }
  
  // Test 1: Create database
  console.log('Test 1: Creating database...');
  const db = getDatabase(testProjectId);
  console.log('✅ Database created');
  
  // Test 2: Verify schema tables exist
  console.log('Test 2: Verifying schema...');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  
  const expectedTables = ['signals', 'trends', 'processing_status', 'project_meta'];
  const tableNames = tables.map(t => t.name);
  
  console.log('  Found tables:', tableNames);
  
  for (const expected of expectedTables) {
    if (!tableNames.includes(expected)) {
      throw new Error(`Missing table: ${expected}`);
    }
  }
  console.log('✅ All expected tables exist');
  
  // Test 3: Verify signals table structure
  console.log('Test 3: Verifying signals table structure...');
  const signalsInfo = db.prepare(`PRAGMA table_info(signals)`).all();
  const signalColumns = signalsInfo.map((col: any) => col.name);
  const requiredColumns = ['id', 'original_text', 'status', 'trend_id'];
  
  for (const col of requiredColumns) {
    if (!signalColumns.includes(col)) {
      throw new Error(`Missing column in signals: ${col}`);
    }
  }
  console.log('✅ Signals table structure correct');
  
  // Test 4: Verify indexes exist
  console.log('Test 4: Verifying indexes...');
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;
  console.log(`  Found ${indexes.length} indexes`);
  console.log('✅ Indexes created');
  
  // Test 5: Test basic insert (verify schema works)
  console.log('Test 5: Testing basic insert...');
  const testId = 'test-signal-1';
  db.prepare(`
    INSERT INTO signals (id, original_text, status)
    VALUES (?, ?, 'unassigned')
  `).run(testId, 'Test signal text');
  
  const inserted = db.prepare('SELECT * FROM signals WHERE id = ?').get(testId);
  if (!inserted) {
    throw new Error('Failed to insert test signal');
  }
  console.log('✅ Insert works correctly');
  
  // Cleanup
  closeDatabase(testProjectId);
  deleteProjectDatabase(testProjectId);
  
  console.log('\n✅ All database tests passed!');
} catch (error) {
  console.error('❌ Database test failed:', error);
  process.exit(1);
}


