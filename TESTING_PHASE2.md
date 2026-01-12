# Testing Phase 2: Core Services

## Overview

Phase 2 services have been implemented and test files created. This document describes how to run and understand the tests.

---

## Test Files Created

### 1. Similarity Service Tests
**File:** `server/src/__tests__/services/similarityService.test.ts`

**Status:** ✅ Complete - All tests passing

**What it tests:**
- Cosine similarity calculations (identical, orthogonal, opposite vectors)
- Edge cases (empty vectors, zero vectors, different lengths)
- `findTopCandidates` function (sorting, filtering, top N selection)
- Invalid embedding handling

**Run:**
```bash
cd server
npm test -- similarityService
```

**Expected:** All 13 tests pass ✅

---

### 2. Embedding Service Tests
**File:** `server/src/__tests__/services/embeddingService.test.ts`

**Status:** ✅ Basic tests complete

**What it tests:**
- Input validation (empty text, whitespace)
- Error handling
- Text truncation logic (documented)

**Note:** Full integration tests require actual model loading. The embedding service uses `@xenova/transformers` which loads a real ML model. These tests focus on input validation only.

**Run:**
```bash
cd server
npm test -- embeddingService
```

**Integration Testing (Optional):**
For full integration tests with the actual model:
1. Ensure `ANTHROPIC_API_KEY` is set
2. First run will download the model (~80MB)
3. Test actual embedding generation
4. Verify embeddings are valid arrays

---

### 3. Claude Service Tests
**File:** `server/src/__tests__/services/claudeService.test.ts`

**Status:** ✅ Complete - All tests passing with mocks

**What it tests:**
- `verifySimilarities` function (API calls, JSON parsing, validation)
- `generateTrendSummary` function (API calls, text generation)
- Error handling and retry logic
- Invalid response handling
- Rate limit handling

**Run:**
```bash
cd server
npm test -- claudeService
```

**Expected:** All 12 tests pass ✅

**Note:** Tests use mocked Anthropic SDK to avoid API costs.

---

### 4. Mock File
**File:** `server/src/__tests__/mocks/claudeService.ts`

Provides mock functions for Claude service that can be used in other tests.

---

## Running All Phase 2 Tests

### Run All Tests
```bash
cd server
npm test
```

### Run Tests in Watch Mode
```bash
cd server
npm run test:watch
```

### Run with Coverage
```bash
cd server
npm run test:coverage
```

### Run Specific Service Tests
```bash
# Similarity service only
npm test -- similarityService

# Claude service only
npm test -- claudeService

# Embedding service only
npm test -- embeddingService
```

---

## Test Results Summary

### Similarity Service
- ✅ **13 tests passing**
- Pure math functions, fully testable
- No external dependencies

### Claude Service
- ✅ **12 tests passing**
- Uses mocked Anthropic SDK
- Tests retry logic, error handling, JSON parsing

### Embedding Service
- ✅ **Basic tests passing**
- Input validation tests pass
- Integration tests require actual model (optional)

---

## Testing Strategy

### Unit Tests (Current)
- ✅ Similarity Service - Fully tested (pure math)
- ✅ Claude Service - Fully tested with mocks
- ⚠️ Embedding Service - Input validation only (requires model for full tests)

### Integration Tests (Optional)
The plan notes that integration tests with the real embedding model are optional. To run integration tests:

1. Set `ANTHROPIC_API_KEY` in `.env`
2. First run downloads the model (slow)
3. Tests actual embedding generation
4. Verifies embeddings are valid

**Why Optional:**
- Model download is large (~80MB)
- First run is slow (model loading)
- Unit tests with mocks are sufficient for development
- Integration tests useful for verifying end-to-end behavior

---

## Next Steps

### Recommended
1. ✅ **Similarity Service** - Fully tested, ready to use
2. ✅ **Claude Service** - Fully tested with mocks, ready to use
3. ✅ **Embedding Service** - Basic tests pass, can proceed to Phase 3

### Optional
- Run embedding service integration tests (requires model download)
- Test embedding + similarity together (small integration test)
- Test end-to-end flow (embedding → similarity → Claude)

---

## Notes

- All tests use `vitest` as the test framework
- Mocking strategy: Mock external APIs (Claude), test pure logic directly (similarity)
- Embedding service tests focus on validation; full tests require model
- Test files follow the pattern: `serviceName.test.ts`
- Mocks are in `__tests__/mocks/` directory

---

## Verification

Run all tests to verify Phase 2 is complete:

```bash
cd server
npm test
```

**Expected Result:**
- Similarity Service: ✅ All tests pass
- Claude Service: ✅ All tests pass
- Embedding Service: ✅ Basic tests pass

**Phase 2 is ready for Phase 3!** 🎉


