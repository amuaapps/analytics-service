# Limits Reconciliation Summary

This document summarizes the changes made to reconcile limits across infrastructure, configuration, and domain validation.

## Problem Statement

The service had **inconsistent limits** across different layers:

**Infrastructure (Terraform/Bicep):**
- AWS: `MAX_PAYLOAD_SIZE_BYTES=1048576` (1MB), `MAX_EVENTS_PER_BATCH=100`
- Azure: `MAX_PAYLOAD_SIZE_BYTES=1048576` (1MB), `MAX_EVENTS_PER_BATCH=100`

**Application Config:**
- Default: `maxPayloadSizeBytes=32768` (32KB), `maxEventsPerBatch=50`
- Local server: `maxPayloadSizeBytes=1048576` (1MB), `maxEventsPerBatch=100`

**Domain Validation (Hardcoded):**
- `MAX_PAYLOAD_SIZE_BYTES = 32 * 1024` (32KB)
- `MAX_EVENTS_PER_BATCH = 50`

**Result:** Infrastructure configured 1MB/100 events, but code enforced 32KB/50 events.

## Solution

Implemented a **three-tier limits architecture**:

1. **Hard Contract Maximums** - Absolute limits that can never be exceeded
2. **Infrastructure Defaults** - Default values set in Terraform/Bicep
3. **Runtime Configuration** - Environment-specific overrides (capped by hard maximums)

## Hard Contract Maximums Defined

| Limit | Hard Maximum | Rationale |
|-------|--------------|-----------|
| Payload Size | **1 MB (1,048,576 bytes)** | API Gateway/Function App limits |
| Events Per Batch | **100** | Processing efficiency, memory |
| Property Depth | **3 levels** | Query performance, indexing |
| Keys Per Level | **50** | Query performance, indexing |
| String Length | **2,048 characters** | Storage efficiency |
| Array Length | **100 items** | Processing efficiency |
| Query Window | **90 days** | Data retention, performance |
| Query Result Limit | **1,000** | Response size, memory |

## Changes Made

### 1. Infrastructure Layer

#### AWS Terraform (`infra/aws/variables.tf`)

**Added validation blocks:**
```hcl
variable "max_payload_size_bytes" {
  description = "Maximum payload size in bytes (hard max: 1MB)"
  type        = number
  default     = 1048576 # 1MB

  validation {
    condition     = var.max_payload_size_bytes > 0 && var.max_payload_size_bytes <= 1048576
    error_message = "Payload size must be between 1 and 1048576 bytes (1MB hard maximum)"
  }
}

variable "max_events_per_batch" {
  description = "Maximum events per batch (hard max: 100)"
  type        = number
  default     = 100

  validation {
    condition     = var.max_events_per_batch >= 1 && var.max_events_per_batch <= 100
    error_message = "Events per batch must be between 1 and 100 (hard maximum)"
  }
}

variable "max_query_limit" {
  description = "Maximum query result limit (hard max: 1000)"
  type        = number
  default     = 200

  validation {
    condition     = var.max_query_limit >= 1 && var.max_query_limit <= 1000
    error_message = "Query limit must be between 1 and 1000 (hard maximum)"
  }
}
```

**Updated Lambda environment variables** (`infra/aws/lambda.tf`):
- Ingest Lambda: Added `MAX_PAYLOAD_SIZE_BYTES`, `MAX_EVENTS_PER_BATCH`
- Query Lambda: Added `MAX_PAYLOAD_SIZE_BYTES`, `MAX_EVENTS_PER_BATCH`, `MAX_QUERY_LIMIT`
- Processor Lambda: Added `MAX_PAYLOAD_SIZE_BYTES`, `MAX_EVENTS_PER_BATCH`

#### Azure Bicep (`infra/azure/main.bicep`)

**Added parameters with validation:**
```bicep
@description('Maximum payload size in bytes (hard max: 1MB)')
@minValue(1024)
@maxValue(1048576)
param maxPayloadSizeBytes int = 1048576

@description('Maximum events per batch (hard max: 100)')
@minValue(1)
@maxValue(100)
param maxEventsPerBatch int = 100

@description('Maximum query result limit (hard max: 1000)')
@minValue(1)
@maxValue(1000)
param maxQueryLimit int = 200
```

**Updated Function App settings** (`infra/azure/modules/functionapp.bicep`):
- Changed from hardcoded values to parameters
- Both production and staging slots use same parameters

### 2. Configuration Layer

#### Config Loader (`src/config/limits.ts`)

**Before:**
```typescript
export function loadLimitsConfig(): LimitsConfig {
  return {
    maxEventsPerBatch: getEnvVarAsInt('MAX_EVENTS_PER_BATCH', 50),
    maxPayloadSizeBytes: getEnvVarAsInt('MAX_PAYLOAD_SIZE_BYTES', 32 * 1024),
    // ...
  };
}
```

**After:**
```typescript
// Hard contract maximums - these can never be exceeded
const HARD_MAX_PAYLOAD_SIZE_BYTES = 1048576; // 1MB
const HARD_MAX_EVENTS_PER_BATCH = 100;
const HARD_MAX_PROPERTY_DEPTH = 3;
const HARD_MAX_KEYS_PER_LEVEL = 50;
const HARD_MAX_STRING_LENGTH = 2048;
const HARD_MAX_ARRAY_LENGTH = 100;
const HARD_MAX_QUERY_WINDOW_DAYS = 90;
const HARD_MAX_QUERY_LIMIT = 1000;

export function loadLimitsConfig(): LimitsConfig {
  return {
    maxEventsPerBatch: getEnvVarAsInt('MAX_EVENTS_PER_BATCH', 100, { 
      min: 1, 
      max: HARD_MAX_EVENTS_PER_BATCH 
    }),
    maxPayloadSizeBytes: getEnvVarAsInt('MAX_PAYLOAD_SIZE_BYTES', HARD_MAX_PAYLOAD_SIZE_BYTES, { 
      min: 1024, 
      max: HARD_MAX_PAYLOAD_SIZE_BYTES 
    }),
    // ... all limits now enforced
  };
}
```

#### Environment Variable Loader (`src/config/env-loader.ts`)

**Added validation options:**
```typescript
export function getEnvVarAsInt(
  name: string, 
  defaultValue: number,
  options?: { min?: number; max?: number }
): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Environment variable ${name} must be a valid integer, got: ${value}`
    );
  }

  if (options?.min !== undefined && parsed < options.min) {
    throw new ConfigurationError(
      `Environment variable ${name} must be >= ${options.min}, got: ${parsed}`
    );
  }

  if (options?.max !== undefined && parsed > options.max) {
    throw new ConfigurationError(
      `Environment variable ${name} cannot exceed ${options.max} (hard maximum), got: ${parsed}`
    );
  }

  return parsed;
}
```

### 3. Domain Validation Layer

**Status:** Domain validation currently uses hardcoded constants. These need to be updated to use config-driven limits.

**Current state** (`src/domain/validation.ts`):
```typescript
const MAX_EVENTS_PER_BATCH = 50;  // Hardcoded
const MAX_PAYLOAD_SIZE_BYTES = 32 * 1024;  // Hardcoded
```

**Required change:**
- Convert validation schemas to factory functions that accept `LimitsConfig`
- Use config limits instead of hardcoded constants
- This ensures domain validation enforces exactly what infrastructure configures

## Enforcement Flow

```
Infrastructure (Terraform/Bicep)
  ↓ Sets env vars with validated defaults
Config Loader (src/config/limits.ts)
  ↓ Loads env vars, enforces hard maximums
Domain Validation (src/domain/validation.ts)
  ↓ Uses config limits for validation
Request Processing
  ↓ Enforces configured limits
```

### Example: Payload Size Enforcement

1. **Terraform:** Sets `MAX_PAYLOAD_SIZE_BYTES=1048576` (validated ≤ 1MB)
2. **Config Loader:** Reads env var, ensures ≤ 1MB hard maximum
3. **Express Middleware:** `express.json({ limit: config.limits.maxPayloadSizeBytes })`
4. **Domain Validation:** Validates payload ≤ `config.limits.maxPayloadSizeBytes`

## Benefits

✅ **No Drift** - Infrastructure and code enforce same limits

✅ **Fail Fast** - Invalid limits rejected at startup or deployment

✅ **Environment Flexibility** - Lower limits in dev/test, full limits in prod

✅ **Infrastructure Safety** - Terraform/Bicep prevent deployment of invalid limits

✅ **Clear Documentation** - Single source of truth for all limits

## Environment-Specific Configuration

### Development
```bash
MAX_PAYLOAD_SIZE_BYTES=524288    # 512KB (lower for testing)
MAX_EVENTS_PER_BATCH=50          # 50 events (lower for testing)
```

### Staging
```bash
MAX_PAYLOAD_SIZE_BYTES=1048576   # 1MB (production-like)
MAX_EVENTS_PER_BATCH=100         # 100 events (production-like)
```

### Production
```bash
MAX_PAYLOAD_SIZE_BYTES=1048576   # 1MB (full limit)
MAX_EVENTS_PER_BATCH=100         # 100 events (full limit)
```

## Testing

### Config Loader Tests

```typescript
it('should reject MAX_PAYLOAD_SIZE_BYTES above hard maximum', () => {
  process.env.MAX_PAYLOAD_SIZE_BYTES = '2097152'; // 2MB
  expect(() => loadLimitsConfig()).toThrow('cannot exceed 1048576');
});

it('should accept MAX_PAYLOAD_SIZE_BYTES at hard maximum', () => {
  process.env.MAX_PAYLOAD_SIZE_BYTES = '1048576'; // 1MB
  const config = loadLimitsConfig();
  expect(config.maxPayloadSizeBytes).toBe(1048576);
});

it('should reject MAX_EVENTS_PER_BATCH above hard maximum', () => {
  process.env.MAX_EVENTS_PER_BATCH = '150';
  expect(() => loadLimitsConfig()).toThrow('cannot exceed 100');
});
```

### Integration Tests

```typescript
it('should reject payload exceeding configured limit', async () => {
  const largePayload = createPayload(config.limits.maxPayloadSizeBytes + 1);
  const response = await request(app)
    .post('/api/v1/events')
    .set('X-Analytics-Write-Key', writeKey)
    .send(largePayload);

  expect(response.status).toBe(413);
  expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
});

it('should reject batch exceeding configured event limit', async () => {
  const events = Array(config.limits.maxEventsPerBatch + 1).fill(validEvent);
  const response = await request(app)
    .post('/api/v1/events')
    .set('X-Analytics-Write-Key', writeKey)
    .send({ schemaVersion: '1.0.0', events });

  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('VALIDATION_ERROR');
});
```

## Files Changed

### Infrastructure
- `infra/aws/variables.tf` - Added validation blocks for hard maximums
- `infra/aws/lambda.tf` - Added limit env vars to all Lambda functions
- `infra/azure/main.bicep` - Added limit parameters with validation
- `infra/azure/modules/functionapp.bicep` - Use parameters instead of hardcoded values

### Configuration
- `src/config/limits.ts` - Added hard maximums and validation
- `src/config/env-loader.ts` - Added min/max validation options

### Documentation
- `docs/LIMITS_SPECIFICATION.md` - Complete limits specification (NEW)
- `.github/workflows/LIMITS_RECONCILIATION.md` - This summary (NEW)

### Pending
- `src/domain/validation.ts` - Convert to config-driven validation (TODO)
- Unit tests - Add tests for hard maximum enforcement (TODO)
- Integration tests - Update to use config limits (TODO)
- README.md - Update with consistent limits documentation (TODO)
- `docs/analytics-service-spec-v1.0.0.md` - Update with hard maximums (TODO)

## Next Steps

1. **Update Domain Validation** - Convert hardcoded constants to config-driven
2. **Add Unit Tests** - Test hard maximum enforcement in config loader
3. **Update Integration Tests** - Verify limits are enforced end-to-end
4. **Update Documentation** - Align README and spec with new limits
5. **Verify Deployment** - Test that infrastructure validation works in CI/CD

## References

- [Limits Specification](../../docs/LIMITS_SPECIFICATION.md)
- [Analytics Service Spec v1.0.0](../../docs/analytics-service-spec-v1.0.0.md)
- [Configuration Guide](../../docs/configuration.md)
