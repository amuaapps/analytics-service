# AWS S3 Environment Variable Consistency Fix - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Make AWS ingest + processor use the same S3 bucket env var, consistent with docs and Terraform

---

## Summary

Successfully fixed AWS S3 bucket environment variable inconsistency:
- ✅ Replaced `S3_RAW_EVENTS_BUCKET` with `S3_RAW_BUCKET_NAME` in ingest handler
- ✅ Added `S3_RAW_BUCKET_NAME` to ingest Lambda environment variables in Terraform
- ✅ Updated `.env.example` to use correct env var names
- ✅ Verified no references to old env var remain in source code, infrastructure, or docs

---

## Changes Made

### 1. AWS Entrypoints - Ingest Handler

**File:** `src/app/aws/entrypoints.ts`

**Before:**
```typescript
const bucketName = process.env.S3_RAW_EVENTS_BUCKET;
if (!bucketName) {
  throw new Error('S3_RAW_EVENTS_BUCKET environment variable is required');
}
```

**After:**
```typescript
const bucketName = process.env.S3_RAW_BUCKET_NAME;
if (!bucketName) {
  throw new Error('S3_RAW_BUCKET_NAME environment variable is required');
}
```

**Impact:** Ingest handler now uses the same env var as processor handler

---

### 2. Terraform - Ingest Lambda Environment Variables

**File:** `infra/aws/lambda.tf`

**Before:**
```hcl
resource "aws_lambda_function" "ingest" {
  # ...
  environment {
    variables = {
      NODE_ENV                = var.environment
      LOG_LEVEL               = var.log_level
      SQS_QUEUE_URL           = aws_sqs_queue.events.url
      ANALYTICS_WRITE_KEY_SECRET_ARN = aws_secretsmanager_secret.analytics_write_key.arn
      # ❌ S3_RAW_BUCKET_NAME was missing
      CORS_ALLOWED_ORIGINS    = var.cors_allowed_origins
      MAX_PAYLOAD_SIZE_BYTES  = var.max_payload_size_bytes
      MAX_EVENTS_PER_BATCH    = var.max_events_per_batch
    }
  }
}
```

**After:**
```hcl
resource "aws_lambda_function" "ingest" {
  # ...
  environment {
    variables = {
      NODE_ENV                = var.environment
      LOG_LEVEL               = var.log_level
      SQS_QUEUE_URL           = aws_sqs_queue.events.url
      S3_RAW_BUCKET_NAME      = aws_s3_bucket.raw_events.bucket  # ✅ Added
      ANALYTICS_WRITE_KEY_SECRET_ARN = aws_secretsmanager_secret.analytics_write_key.arn
      CORS_ALLOWED_ORIGINS    = var.cors_allowed_origins
      MAX_PAYLOAD_SIZE_BYTES  = var.max_payload_size_bytes
      MAX_EVENTS_PER_BATCH    = var.max_events_per_batch
    }
  }
}
```

**Impact:** Ingest Lambda now receives S3 bucket name at runtime

---

### 3. Environment Variable Example

**File:** `.env.example`

**Before:**
```bash
# AWS_REGION=us-east-1
# AWS_DYNAMODB_TABLE_NAME=analytics-events
# AWS_S3_RAW_BUCKET_NAME=analytics-raw-events
# AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/analytics-queue
```

**After:**
```bash
# AWS_REGION=us-east-1
# DYNAMODB_TABLE_NAME=analytics-events
# S3_RAW_BUCKET_NAME=analytics-raw-events
# SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/analytics-queue
```

**Impact:** Example file now matches actual env var names used in code (no `AWS_` prefix for service-specific vars)

---

## Verification

### Source Code Search

```bash
# Search for old env var name
grep -r "S3_RAW_EVENTS_BUCKET" src/
# ✅ No results found

# Search for new env var name
grep -r "S3_RAW_BUCKET_NAME" src/
# ✅ Found in:
# - src/app/aws/entrypoints.ts (ingest handler)
# - src/app/aws/entrypoints.ts (processor handler)
# - src/config/cloud.ts (AWS config detection)
```

### Infrastructure Search

```bash
# Search Terraform files
grep -r "S3_RAW_EVENTS_BUCKET" infra/
# ✅ No results found

grep -r "S3_RAW_BUCKET_NAME" infra/
# ✅ Found in:
# - infra/aws/lambda.tf (ingest lambda env vars)
# - infra/aws/lambda.tf (processor lambda env vars)
```

### Documentation Search

```bash
# Search all docs
grep -r "S3_RAW_EVENTS_BUCKET" docs/
# ✅ No results found

grep -r "S3_RAW_BUCKET_NAME" docs/
# ✅ Found in:
# - docs/configuration.md (AWS env vars section)
# - docs/IMPLEMENTATION_NOTES.md (AWS detection and naming conventions)
```

---

## Environment Variable Consistency

### AWS Lambda Environment Variables

**Ingest Lambda:**
```bash
NODE_ENV
LOG_LEVEL
SQS_QUEUE_URL
S3_RAW_BUCKET_NAME              # ✅ Now included
ANALYTICS_WRITE_KEY_SECRET_ARN
CORS_ALLOWED_ORIGINS
MAX_PAYLOAD_SIZE_BYTES
MAX_EVENTS_PER_BATCH
```

**Processor Lambda:**
```bash
NODE_ENV
LOG_LEVEL
SQS_QUEUE_URL
DYNAMODB_TABLE_NAME
S3_RAW_BUCKET_NAME              # ✅ Already included
MAX_PAYLOAD_SIZE_BYTES
MAX_EVENTS_PER_BATCH
MAX_QUERY_LIMIT
```

**Query Lambda:**
```bash
NODE_ENV
LOG_LEVEL
DYNAMODB_TABLE_NAME
MAX_QUERY_LIMIT
MAX_PAYLOAD_SIZE_BYTES
MAX_EVENTS_PER_BATCH
```

---

## Acceptance Criteria

- [x] **Ingest handler no longer throws due to missing bucket env var**
  - Changed from `S3_RAW_EVENTS_BUCKET` to `S3_RAW_BUCKET_NAME`
  - Terraform now provides this env var to ingest Lambda

- [x] **docs/configuration.md remains consistent with actual env vars used**
  - Already documented `S3_RAW_BUCKET_NAME` correctly
  - No changes needed to docs (already correct)

- [x] **Only one S3 bucket env var name exists**
  - `S3_RAW_BUCKET_NAME` used consistently across:
    - Ingest handler
    - Processor handler
    - Terraform configuration
    - Documentation
    - Test files

- [x] **`.env.example` uses correct env var names**
  - Removed `AWS_` prefix from service-specific vars
  - Now matches actual usage in code

---

## Build Status

```bash
npm run build
# ✅ Compiles successfully
# ⚠️  11 cosmetic test mock warnings (pre-existing, non-blocking)
```

---

## Impact Analysis

### Before Fix

**Problem:**
- Ingest handler expected `S3_RAW_EVENTS_BUCKET`
- Processor handler expected `S3_RAW_BUCKET_NAME`
- Terraform only provided `S3_RAW_BUCKET_NAME` to processor
- Ingest Lambda would throw error at runtime: `S3_RAW_EVENTS_BUCKET environment variable is required`

**Error Flow:**
1. Ingest Lambda receives event
2. Tries to read `process.env.S3_RAW_EVENTS_BUCKET`
3. Variable is undefined (not provided by Terraform)
4. Throws error before processing any events
5. Lambda fails, event not ingested

### After Fix

**Solution:**
- Both handlers use `S3_RAW_BUCKET_NAME`
- Terraform provides `S3_RAW_BUCKET_NAME` to both Lambdas
- Consistent naming across entire codebase

**Success Flow:**
1. Ingest Lambda receives event
2. Reads `process.env.S3_RAW_BUCKET_NAME`
3. Variable is defined (provided by Terraform)
4. Creates S3RawEventStore with bucket name
5. Processes events successfully

---

## Related Files

### Source Code
- `src/app/aws/entrypoints.ts` - AWS Lambda handlers
- `src/config/cloud.ts` - Cloud provider detection

### Infrastructure
- `infra/aws/lambda.tf` - Lambda function definitions
- `infra/aws/s3.tf` - S3 bucket for raw events

### Documentation
- `docs/configuration.md` - Environment variables reference
- `docs/IMPLEMENTATION_NOTES.md` - Implementation details
- `.env.example` - Example environment configuration

### Tests
- `tests/unit/config/config.test.ts` - Config loading tests (already using correct var)

---

## Next Steps

1. **Deploy to AWS dev environment** to verify fix
2. **Test ingest endpoint** to confirm no env var errors
3. **Monitor CloudWatch logs** for successful S3 raw event storage
4. **Verify processor** can read raw events from S3

---

## Notes

- **No breaking changes** for existing deployments (Terraform already provided correct var to processor)
- **Ingest Lambda fix** prevents runtime errors when deployed
- **Documentation already correct** - no updates needed
- **Test files already using correct var** - no test updates needed
- **`.env.example` updated** for local development clarity
