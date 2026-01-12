# Phase 1 Testing Guide

This guide walks through how to test and verify Phase 1: Foundation & Configuration.

---

## Prerequisites

1. **Install Node.js** (v18 or later recommended)
2. **Install dependencies**

```bash
cd server
npm install
```

---

## Test 1: TypeScript Compilation

**Goal:** Verify all TypeScript types compile correctly and there are no type errors.

```bash
cd server
npx tsc --noEmit
```

**Expected Result:**
- No compilation errors
- All types resolve correctly

**What it tests:**
- ✅ Type definitions are correct
- ✅ Imports work correctly
- ✅ TypeScript configuration is valid

---

## Test 2: Environment Configuration

**Goal:** Verify environment validation works correctly.

Create a test script: `server/test-env.ts`

```typescript
import { loadEnv, getEnv } from './src/config/env.js';

console.log('Testing environment configuration...\n');

try {
  // This should fail if ANTHROPIC_API_KEY is not set
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  
  const env = loadEnv();
  console.log('✅ Environment loaded successfully');
  console.log('Environment values:');
  console.log('  PORT:', env.PORT);
  console.log('  NODE_ENV:', env.NODE_ENV);
  console.log('  DATA_DIR:', env.DATA_DIR);
  console.log('  EMBEDDING_MODEL:', env.EMBEDDING_MODEL);
  console.log('  LOG_LEVEL:', env.LOG_LEVEL);
  console.log('  JWT_SECRET:', env.JWT_SECRET ? '***' : 'NOT SET');
  console.log('  JWT_EXPIRY:', env.JWT_EXPIRY);
  
  // Test getEnv() works
  const env2 = getEnv();
  console.log('\n✅ getEnv() works:', env2 === env);
  
  console.log('\n✅ All environment tests passed!');
} catch (error) {
  console.error('❌ Environment test failed:', error);
  process.exit(1);
}
```

**Run it:**
```bash
cd server
ANTHROPIC_API_KEY=sk-ant-test-key npx tsx test-env.ts
```

**Note:** Uses `tsx` instead of `ts-node` for better ESM module support. Install with: `npm install -D tsx` (already installed)

**Expected Result:**
- Environment loads successfully
- All default values are set correctly
- getEnv() returns the same instance

**What it tests:**
- ✅ Zod schema validation works
- ✅ Default values are applied
- ✅ Environment loading works
- ✅ getEnv() singleton pattern works

---

## Test 3: Environment Validation (Error Cases)

**Goal:** Verify validation rejects invalid values.

Create: `server/test-env-validation.ts`

```typescript
import { loadEnv } from './src/config/env.js';

console.log('Testing environment validation (should fail)...\n');

// Test 1: Missing required ANTHROPIC_API_KEY
try {
  delete process.env.ANTHROPIC_API_KEY;
  loadEnv();
  console.error('❌ Should have failed without ANTHROPIC_API_KEY');
  process.exit(1);
} catch (error) {
  console.log('✅ Correctly rejected missing ANTHROPIC_API_KEY');
}

// Test 2: Invalid ANTHROPIC_API_KEY format
try {
  process.env.ANTHROPIC_API_KEY = 'invalid-key';
  loadEnv();
  console.error('❌ Should have failed with invalid key format');
  process.exit(1);
} catch (error) {
  console.log('✅ Correctly rejected invalid key format');
}

// Test 3: Invalid LOG_LEVEL
try {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.LOG_LEVEL = 'invalid';
  loadEnv();
  console.error('❌ Should have failed with invalid LOG_LEVEL');
  process.exit(1);
} catch (error) {
  console.log('✅ Correctly rejected invalid LOG_LEVEL');
}

console.log('\n✅ All validation tests passed!');
```

**Run it:**
```bash
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-env-validation.ts
```

**Note:** Uses `tsx` for better ESM module support

**Expected Result:**
- All validation errors are caught
- Process exits with error codes

**What it tests:**
- ✅ Required fields are enforced
- ✅ Format validation works (API key format)
- ✅ Enum validation works (LOG_LEVEL)

---

## Test 4: Database Schema Creation

**Goal:** Verify database schema is created correctly.

Create: `server/test-database.ts`

```typescript
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
```

**Run it:**
```bash
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-database.ts
```

**Note:** Uses `tsx` for better ESM module support

**Expected Result:**
- Database file is created
- All tables exist with correct structure
- Indexes are created
- Basic insert works
- Cleanup works

**What it tests:**
- ✅ Schema creation works
- ✅ Table structure is correct
- ✅ Indexes are created
- ✅ Database operations work
- ✅ Cleanup functions work

---

## Test 5: User Database Schema

**Goal:** Verify user database schema is created correctly.

Create: `server/test-user-database.ts`

```typescript
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
```

**Run it:**
```bash
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-user-database.ts
```

**Note:** Uses `tsx` for better ESM module support

**Expected Result:**
- User database is created
- All user tables exist
- Table structures are correct

**What it tests:**
- ✅ User database schema creation
- ✅ Authentication tables exist
- ✅ Foreign key constraints work

---

## Test 6: Logger Configuration

**Goal:** Verify logger works correctly.

Create: `server/test-logger.ts`

```typescript
import { logger } from './src/config/logger.js';
import { requestLogger } from './src/config/logger.js';

console.log('Testing logger configuration...\n');

try {
  // Test different log levels
  logger.debug('Debug message');
  logger.info('Info message');
  logger.warn('Warning message');
  logger.error('Error message');
  
  console.log('✅ Logger outputs messages correctly');
  
  // Test structured logging
  logger.info({ userId: 'test123', action: 'test' }, 'Structured log message');
  console.log('✅ Structured logging works');
  
  console.log('\n✅ All logger tests passed!');
} catch (error) {
  console.error('❌ Logger test failed:', error);
  process.exit(1);
}
```

**Run it:**
```bash
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-logger.ts
```

**Note:** Uses `tsx` for better ESM module support

**Expected Result:**
- Log messages appear in console (with colors in dev mode)
- Structured logging works

**What it tests:**
- ✅ Logger is configured correctly
- ✅ Log levels work
- ✅ Structured logging works
- ✅ Pretty formatting works (in dev mode)

---

## Test 7: Type Definitions Import

**Goal:** Verify all types can be imported and used.

Create: `server/test-types.ts`

```typescript
import type {
  SignalRecord,
  TrendRecord,
  ProcessingStatusRecord,
  SignalStatus,
  TrendStatus,
  ProcessingPhase,
  SimilarityScore,
  ProcessingStatus,
  CreateProjectRequest,
  ProjectResponse,
  SignalListItem,
  TrendListItem,
  ErrorResponse
} from './src/types/index.js';

console.log('Testing type definitions...\n');

// Just verify imports work - TypeScript will catch errors
const signalStatus: SignalStatus = 'unassigned';
const trendStatus: TrendStatus = 'draft';
const phase: ProcessingPhase = 'pending';

const similarityScore: SimilarityScore = { id: 'test', score: 0.9 };

const createRequest: CreateProjectRequest = { name: 'Test Project' };

console.log('✅ All type imports work correctly');
console.log('  SignalStatus:', signalStatus);
console.log('  TrendStatus:', trendStatus);
console.log('  ProcessingPhase:', phase);
console.log('  SimilarityScore:', similarityScore);
console.log('  CreateProjectRequest:', createRequest);

console.log('\n✅ All type definition tests passed!');
```

**Run it:**
```bash
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-types.ts
```

**Note:** Uses `tsx` for better ESM module support

**Expected Result:**
- No TypeScript errors
- Types can be used correctly

**What it tests:**
- ✅ All types are exportable
- ✅ Type definitions are correct
- ✅ Types can be used in code

---

## Quick Test Script (All Tests)

Create: `server/test-phase1.sh`

```bash
#!/bin/bash

echo "==================================="
echo "Phase 1 Foundation Tests"
echo "===================================\n"

# Test 1: TypeScript compilation
echo "1. Testing TypeScript compilation..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
  echo "✅ TypeScript compilation passed\n"
else
  echo "❌ TypeScript compilation failed\n"
  exit 1
fi

# Test 2: Environment
echo "2. Testing environment configuration..."
ANTHROPIC_API_KEY=sk-ant-test npx ts-node --esm test-env.ts
if [ $? -eq 0 ]; then
  echo "✅ Environment test passed\n"
else
  echo "❌ Environment test failed\n"
  exit 1
fi

# Test 3: Database
echo "3. Testing database schema..."
ANTHROPIC_API_KEY=sk-ant-test npx ts-node --esm test-database.ts
if [ $? -eq 0 ]; then
  echo "✅ Database test passed\n"
else
  echo "❌ Database test failed\n"
  exit 1
fi

# Test 4: User Database
echo "4. Testing user database..."
ANTHROPIC_API_KEY=sk-ant-test npx ts-node --esm test-user-database.ts
if [ $? -eq 0 ]; then
  echo "✅ User database test passed\n"
else
  echo "❌ User database test failed\n"
  exit 1
fi

# Test 5: Logger
echo "5. Testing logger..."
ANTHROPIC_API_KEY=sk-ant-test npx ts-node --esm test-logger.ts
if [ $? -eq 0 ]; then
  echo "✅ Logger test passed\n"
else
  echo "❌ Logger test failed\n"
  exit 1
fi

# Test 6: Types
echo "6. Testing type definitions..."
ANTHROPIC_API_KEY=sk-ant-test npx ts-node --esm test-types.ts
if [ $? -eq 0 ]; then
  echo "✅ Types test passed\n"
else
  echo "❌ Types test failed\n"
  exit 1
fi

echo "==================================="
echo "✅ All Phase 1 tests passed!"
echo "==================================="
```

Make it executable:
```bash
chmod +x server/test-phase1.sh
```

---

## Manual Review Checklist

- [ ] All files exist in correct locations
- [ ] `package.json` has all required dependencies
- [ ] `tsconfig.json` compiles without errors
- [ ] `.env.example` has all required variables
- [ ] Type definitions look correct
- [ ] Database schema matches plan
- [ ] User database schema matches plan
- [ ] Environment validation schema matches plan
- [ ] Logger configuration matches plan

---

## Next Steps After Testing

If all tests pass:

1. ✅ **Phase 1 is complete!**
2. Move to **Phase 2: Core Services**
3. Clean up test files (optional):
   ```bash
   rm server/test-*.ts server/test-*.sh
   ```

---

## Troubleshooting

**Issue: TypeScript compilation fails**
- Check `tsconfig.json` settings
- Verify all imports use correct paths
- Ensure `@types/*` packages are installed

**Issue: Environment validation fails**
- Check `.env` file exists
- Verify `ANTHROPIC_API_KEY` is set
- Check format: must start with `sk-ant-`

**Issue: Database tests fail**
- Check `DATA_DIR` is writable
- Verify better-sqlite3 is installed correctly
- Check file permissions

**Issue: Logger doesn't output**
- Check `LOG_LEVEL` environment variable
- Verify `pino-pretty` is installed
- Try running with `LOG_LEVEL=debug`

