import { logger } from './src/config/logger.js';

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


