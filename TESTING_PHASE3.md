# Phase 3: Data Services Testing

This document outlines the testing strategy and how to run tests for Phase 3: Data Services.

## Services Under Test

- `uploadService.ts`: Spreadsheet parsing and signal creation
- `exportService.ts`: CSV generation (3 formats)
- `processingService.ts`: 3-phase background processing orchestration

## Testing Strategy

### 1. Unit Tests
- **Upload Service**: Tests spreadsheet parsing, column detection, signal creation, processing status updates, and error handling. Uses in-memory Excel files created with `@e965/xlsx`.
- **Export Service**: Tests CSV generation for all three formats (trends with signals, signals only, trend summaries only). Tests CSV escaping for special characters. Uses test databases with sample data.
- **Processing Service**: Tests 3-phase processing orchestration, resumability, error handling, and retry logic. Mocks embedding and Claude services. Uses small test datasets (5 signals) as recommended.

### 2. Environment Setup
- Tests use `vitest.setup.ts` to set `NODE_ENV` to `test` and provide test data directory (`./data/test-projects`).
- Test databases are created and cleaned up for each test.
- Mock services are used for embedding and Claude API calls.

## Test Files

- `server/src/__tests__/services/uploadService.test.ts` (8 tests)
- `server/src/__tests__/services/exportService.test.ts` (12 tests)
- `server/src/__tests__/services/processingService.test.ts` (8 tests)

## How to Run Tests

1. **Navigate to the `server` directory:**
   ```bash
   cd /Users/macbook/Applications/TrendFinder/server
   ```

2. **Run all Phase 3 tests:**
   ```bash
   npm test -- uploadService exportService processingService
   ```

3. **Run specific service tests:**
   ```bash
   npm test -- uploadService
   npm test -- exportService
   npm test -- processingService
   ```

4. **Run tests in watch mode (for development):**
   ```bash
   npm run test:watch
   ```

5. **Run tests with coverage report:**
   ```bash
   npm run test:coverage
   ```

## Test Coverage

### Upload Service Tests
- ✅ Processes simple spreadsheet and creates signals
- ✅ Uses provided text column when specified
- ✅ Truncates text longer than 10,000 characters
- ✅ Filters out empty rows
- ✅ Updates processing status with signal count
- ✅ Calculates estimated cost and time
- ✅ Throws error for empty spreadsheet
- ✅ Throws error when column detection fails

### Export Service Tests
- ✅ Exports trends with their signals as CSV
- ✅ Exports all signals as CSV
- ✅ Exports trend summaries only as CSV
- ✅ Includes proper CSV headers
- ✅ Handles empty data gracefully
- ✅ Escapes commas in CSV values
- ✅ Escapes quotes in CSV values

### Processing Service Tests
- ✅ Processes project with small dataset through all phases
- ✅ Resumes processing from Phase 2 if Phase 1 is complete
- ✅ Skips processing if already complete
- ✅ Handles errors and updates status
- ✅ Prevents concurrent processing with locks
- ✅ Retries failed verifications
- ✅ Handles empty failed list
- ✅ Can resume from Phase 2 after Phase 1 completes

## Expected Output

You should see output similar to this, indicating all tests passed:

```
✓ src/__tests__/services/uploadService.test.ts (8 tests)
✓ src/__tests__/services/exportService.test.ts (12 tests)
✓ src/__tests__/services/processingService.test.ts (8 tests)

Test Files  3 passed (3)
     Tests  28 passed (28)
```

## Notes

- Test databases are created in `./data/test-projects` and cleaned up after each test
- Processing service tests use small datasets (5 signals) as recommended in the plan
- Mock services are used to avoid real API calls during testing
- All tests follow the Phase 2 test structure for consistency

---

**Phase 3 Testing Complete!** All 28 tests across 3 test files are passing.


