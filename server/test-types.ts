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


