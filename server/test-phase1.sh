#!/bin/bash

echo "==================================="
echo "Phase 1 Foundation Tests"
echo "==================================="
echo ""

# Test 1: TypeScript compilation
echo "1. Testing TypeScript compilation..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
  echo "✅ TypeScript compilation passed"
  echo ""
else
  echo "❌ TypeScript compilation failed"
  echo ""
  exit 1
fi

# Test 2: Environment
echo "2. Testing environment configuration..."
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-env.ts
if [ $? -eq 0 ]; then
  echo "✅ Environment test passed"
  echo ""
else
  echo "❌ Environment test failed"
  echo ""
  exit 1
fi

# Test 3: Database
echo "3. Testing database schema..."
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-database.ts
if [ $? -eq 0 ]; then
  echo "✅ Database test passed"
  echo ""
else
  echo "❌ Database test failed"
  echo ""
  exit 1
fi

# Test 4: User Database
echo "4. Testing user database..."
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-user-database.ts
if [ $? -eq 0 ]; then
  echo "✅ User database test passed"
  echo ""
else
  echo "❌ User database test failed"
  echo ""
  exit 1
fi

# Test 5: Logger
echo "5. Testing logger..."
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-logger.ts
if [ $? -eq 0 ]; then
  echo "✅ Logger test passed"
  echo ""
else
  echo "❌ Logger test failed"
  echo ""
  exit 1
fi

# Test 6: Types
echo "6. Testing type definitions..."
ANTHROPIC_API_KEY=sk-ant-test npx tsx test-types.ts
if [ $? -eq 0 ]; then
  echo "✅ Types test passed"
  echo ""
else
  echo "❌ Types test failed"
  echo ""
  exit 1
fi

echo "==================================="
echo "✅ All Phase 1 tests passed!"
echo "==================================="


