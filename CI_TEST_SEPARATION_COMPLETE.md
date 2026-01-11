# CI Test Separation - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Prevent post-deploy tests from running in Stage 1/2 (build/test) while keeping them available for Stage 4 (post-deploy verification)

---

## Summary

Successfully separated CI tests from post-deploy tests:
- ✅ **Created `test:ci` script** that excludes post-deploy tests
- ✅ **Updated Stage 1 workflow** to use `test:ci` instead of `test:coverage`
- ✅ **Stage 4 unchanged** - still uses `test:post-deploy` correctly
- ✅ **No localhost:3000 calls** in Stage 1/2

---

## Acceptance Criteria

- [x] **Stage 2 build job does not try to call http://localhost:3000**
  - ✅ Stage 1 now runs `npm run test:ci` which excludes `tests/integration/post-deploy/`
  - ✅ Post-deploy tests (which call localhost:3000 by default) are not executed
  - ✅ Only unit tests and local integration tests run in Stage 1

- [x] **Stage 4 still runs post-deploy harness only**
  - ✅ AWS Stage 4: Uses `npm run test:post-deploy` (line 605)
  - ✅ Azure Stage 4: Uses `npm run test:post-deploy` (line 749)
  - ✅ Post-deploy tests run against deployed environment with proper `API_BASE_URL`

---

## Changes Made

### 1. Added `test:ci` Script

**File:** `package.json`

**Added:**
```json
"test:ci": "NODE_OPTIONS=--experimental-vm-modules jest --coverage --ci --testPathIgnorePatterns=post-deploy"
```

**Features:**
- ✅ Runs all tests with coverage
- ✅ Uses `--ci` flag for CI-optimized output
- ✅ Excludes `post-deploy` directory via `--testPathIgnorePatterns`
- ✅ Includes unit tests (`tests/unit/`)
- ✅ Includes local integration tests (`tests/integration/http/`, `tests/integration/processor/`)
- ❌ Excludes post-deploy tests (`tests/integration/post-deploy/`)

**What gets tested in CI:**
```
tests/
├── unit/                          ✅ Included
│   ├── app/
│   ├── config/
│   ├── domain/
│   ├── infra/
│   └── utils/
└── integration/
    ├── http/                      ✅ Included (local Express tests)
    ├── processor/                 ✅ Included (local handler tests)
    └── post-deploy/               ❌ EXCLUDED (requires deployed environment)
        └── harness.test.ts
```

---

### 2. Updated Stage 1 Workflow

**File:** `.github/workflows/deploy.yml`

**Before:**
```yaml
- name: Run unit tests with coverage
  run: npm run test:coverage
```

**After:**
```yaml
- name: Run CI tests with coverage
  run: npm run test:ci
```

**Impact:**
- Stage 1 no longer attempts to run post-deploy tests
- No calls to `http://localhost:3000` (default for post-deploy tests)
- Coverage still collected and uploaded to Codecov
- JUnit reporting still works (via `--ci` flag)

---

### 3. Stage 4 Unchanged (Verification)

**AWS Stage 4 (switch-aws job):**
```yaml
- name: Run integration tests against GREEN
  run: npm run test:post-deploy
  env:
    API_BASE_URL: ${{ needs.deploy-aws-green.outputs.api_url }}
    ANALYTICS_WRITE_KEY: ${{ secrets.ANALYTICS_WRITE_KEY }}
    TEST_MAX_RETRIES: '30'
    TEST_RETRY_DELAY_MS: '2000'
    TEST_REQUEST_TIMEOUT_MS: '10000'
```

**Azure Stage 4 (switch-azure job):**
```yaml
- name: Run integration tests against GREEN (staging slot)
  run: npm run test:post-deploy
  env:
    API_BASE_URL: ${{ needs.deploy-azure-green.outputs.staging_url }}
    ANALYTICS_WRITE_KEY: ${{ secrets.ANALYTICS_WRITE_KEY }}
    TEST_MAX_RETRIES: '30'
    TEST_RETRY_DELAY_MS: '2000'
    TEST_REQUEST_TIMEOUT_MS: '10000'
```

**Key points:**
- ✅ Still uses `npm run test:post-deploy`
- ✅ Provides proper `API_BASE_URL` from deployment outputs
- ✅ Tests run against actual deployed environment
- ✅ Proper retry configuration for eventual consistency

---

## Test Script Comparison

### `npm test` (default)
```bash
NODE_OPTIONS=--experimental-vm-modules jest
```
- Runs **all** tests (unit + integration + post-deploy)
- No coverage
- For local development

### `npm run test:coverage`
```bash
NODE_OPTIONS=--experimental-vm-modules jest --coverage
```
- Runs **all** tests (unit + integration + post-deploy)
- With coverage
- For local development

### `npm run test:ci` ✨ NEW
```bash
NODE_OPTIONS=--experimental-vm-modules jest --coverage --ci --testPathIgnorePatterns=post-deploy
```
- Runs **CI-safe** tests (unit + local integration)
- **Excludes** post-deploy tests
- With coverage
- CI-optimized output
- **For CI Stage 1**

### `npm run test:unit`
```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/unit
```
- Runs **only** unit tests
- No coverage
- For local development

### `npm run test:integration`
```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/integration --testPathIgnorePatterns=post-deploy
```
- Runs **only** local integration tests
- Excludes post-deploy
- No coverage
- For local development

### `npm run test:post-deploy`
```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/integration/post-deploy
```
- Runs **only** post-deploy tests
- Requires deployed environment
- **For CI Stage 4**

---

## Workflow Stages

### Stage 1: Test (Lines 140-184)
```yaml
- name: Run CI tests with coverage
  run: npm run test:ci  # ✅ Excludes post-deploy
```

**Tests executed:**
- ✅ Unit tests
- ✅ Local integration tests (Express server, handlers)
- ❌ Post-deploy tests (excluded)

**Environment:**
- Local CI runner
- No deployed services
- No external dependencies

---

### Stage 2: Build (Lines 211-265)
```yaml
- name: Build TypeScript
  run: npm run build
```

**No tests executed** - only builds deployment package

---

### Stage 3: Deploy (AWS/Azure)
**No tests executed** - only deploys infrastructure and code

---

### Stage 4: Test & Switch (Lines 490-787)

**AWS:**
```yaml
- name: Run integration tests against GREEN
  run: npm run test:post-deploy  # ✅ Post-deploy only
  env:
    API_BASE_URL: ${{ needs.deploy-aws-green.outputs.api_url }}
```

**Azure:**
```yaml
- name: Run integration tests against GREEN (staging slot)
  run: npm run test:post-deploy  # ✅ Post-deploy only
  env:
    API_BASE_URL: ${{ needs.deploy-azure-green.outputs.staging_url }}
```

**Tests executed:**
- ❌ Unit tests (not needed)
- ❌ Local integration tests (not needed)
- ✅ Post-deploy tests (against deployed environment)

**Environment:**
- Deployed AWS Lambda or Azure Functions
- Real API Gateway / Function App
- Actual cloud infrastructure

---

## Post-Deploy Test Details

**File:** `tests/integration/post-deploy/harness.test.ts`

**Default configuration:**
```typescript
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
```

**Why this was problematic in Stage 1:**
- Stage 1 runs on CI runner with no deployed services
- No server running on `localhost:3000`
- Tests would fail or hang trying to connect

**How it's fixed:**
- Stage 1 now uses `test:ci` which excludes this test
- Stage 4 provides proper `API_BASE_URL` from deployment outputs
- Test only runs when environment is ready

---

## Coverage Impact

**Before:**
- Stage 1 attempted to run post-deploy tests
- Post-deploy tests would fail (no localhost:3000)
- Coverage might be incomplete or test run would fail

**After:**
- Stage 1 runs all testable code (unit + local integration)
- Coverage is complete for code that can be tested locally
- Post-deploy tests run separately in Stage 4 (no coverage needed)

**Coverage thresholds still enforced:**
```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

---

## Files Modified

1. **`package.json`** - Added `test:ci` script
2. **`.github/workflows/deploy.yml`** - Updated Stage 1 to use `test:ci`
3. **`CI_TEST_SEPARATION_COMPLETE.md`** - This documentation

---

## Benefits

### 1. CI Reliability

**Before:** Stage 1 might fail trying to connect to localhost:3000  
**After:** Stage 1 only runs tests that can execute in CI environment

### 2. Faster CI

**Before:** Attempted to run post-deploy tests (which would fail/timeout)  
**After:** Skips post-deploy tests in Stage 1, runs them only in Stage 4

### 3. Clear Separation

**Before:** Unclear which tests run where  
**After:** 
- Stage 1: `test:ci` (unit + local integration)
- Stage 4: `test:post-deploy` (deployed environment)

### 4. Better Error Messages

**Before:** Confusing errors about localhost:3000 in Stage 1  
**After:** Tests only run when environment is appropriate

---

## Verification Commands

**Run CI tests locally:**
```bash
npm run test:ci
# Should run unit + local integration tests
# Should exclude post-deploy tests
```

**Run post-deploy tests locally (requires local server):**
```bash
# Terminal 1: Start local server
npm run dev

# Terminal 2: Run post-deploy tests
npm run test:post-deploy
# Should test against http://localhost:3000
```

**Run post-deploy tests against deployed environment:**
```bash
API_BASE_URL=https://your-api.execute-api.us-east-1.amazonaws.com \
ANALYTICS_WRITE_KEY=your-key \
npm run test:post-deploy
```

---

## CI Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Test                                               │
│ ✅ npm run test:ci                                          │
│    - Unit tests                                             │
│    - Local integration tests                                │
│    - Coverage collection                                    │
│    ❌ NO post-deploy tests                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Build                                              │
│ ✅ npm run build                                            │
│    - TypeScript compilation                                 │
│    - Deployment package creation                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Deploy (AWS/Azure)                                 │
│ ✅ Terraform/Bicep apply                                    │
│ ✅ Lambda/Function deployment                               │
│ ✅ Alias update to GREEN                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Test & Switch                                      │
│ ✅ npm run test:post-deploy                                 │
│    - Post-deploy harness tests                              │
│    - Tests against deployed GREEN environment               │
│    - Uses API_BASE_URL from deployment outputs             │
│ ✅ Blue/Green switch (if tests pass)                        │
│ ✅ Rollback (if tests fail)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Stage 1/2 does not call localhost:3000
- ✅ Stage 4 still runs post-deploy harness
- ✅ CI-safe test script created
- ✅ Workflow updated correctly

---

## Notes

- **`--testPathIgnorePatterns=post-deploy`** is a Jest CLI flag that excludes any test file path containing "post-deploy"
- **`--ci`** flag optimizes Jest for CI environments (better output, fail fast, etc.)
- **Post-deploy tests unchanged** - they still work locally and in Stage 4
- **Coverage thresholds unchanged** - still enforced at 80%
- **All existing test scripts preserved** - only added new `test:ci` script
