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

