# Limits Specification

This document defines the canonical limits for the Analytics Service, including hard contract maximums and configurable runtime limits.

## Overview

The service enforces limits at multiple layers:
1. **Hard Contract Maximums** - Absolute limits that can never be exceeded (defined in code)
2. **Infrastructure Defaults** - Default values set in Terraform/Bicep
3. **Runtime Configuration** - Environment-specific overrides (must not exceed hard maximums)

## Hard Contract Maximums

These are **absolute limits** enforced by the domain validation layer. They cannot be exceeded regardless of configuration.

| Limit | Hard Maximum | Rationale |
|-------|--------------|-----------|
| Payload Size | **1 MB (1,048,576 bytes)** | API Gateway/Function App limits, memory constraints |
| Events Per Batch | **100** | Processing efficiency, memory constraints |
| Property Depth | **3 levels** | Query performance, indexing complexity |
| Keys Per Object Level | **50** | Query performance, indexing complexity |
| String Length | **2,048 characters** | Storage efficiency, indexing limits |
| Array Length | **100 items** | Processing efficiency, memory constraints |
| Query Window | **90 days** | Data retention, query performance |
| Query Result Limit | **1,000** | Response size, memory constraints |

### Why Hard Maximums?

Hard maximums prevent:
- Memory exhaustion in serverless functions
- Database query timeouts
- Storage inefficiencies
- API Gateway/Function App payload limits
- Denial of service attacks

## Configurable Runtime Limits

These limits can be configured per environment but **must not exceed hard maximums**.

### Ingest Limits

| Limit | Environment Variable | Default | Hard Max | Description |
|-------|---------------------|---------|----------|-------------|
| Payload Size | `MAX_PAYLOAD_SIZE_BYTES` | 1048576 (1 MB) | 1 MB | Maximum request payload size |
| Events Per Batch | `MAX_EVENTS_PER_BATCH` | 100 | 100 | Maximum events in single request |
| Min Events Per Batch | `MIN_EVENTS_PER_BATCH` | 1 | 1 | Minimum events in single request |

### Validation Limits

| Limit | Environment Variable | Default | Hard Max | Description |
|-------|---------------------|---------|----------|-------------|
| Property Depth | `MAX_PROPERTY_DEPTH` | 3 | 3 | Maximum nesting depth for properties/traits |
| Keys Per Level | `MAX_KEYS_PER_LEVEL` | 50 | 50 | Maximum keys per object level |
| String Length | `MAX_STRING_LENGTH` | 2048 | 2048 | Maximum string length in properties |
| Array Length | `MAX_ARRAY_LENGTH` | 100 | 100 | Maximum array length in properties |

### Query Limits

| Limit | Environment Variable | Default | Hard Max | Description |
|-------|---------------------|---------|----------|-------------|
| Query Window | `MAX_QUERY_WINDOW_DAYS` | 31 | 90 | Maximum date range for queries |
| Default Result Limit | `DEFAULT_QUERY_LIMIT` | 50 | - | Default number of results |
| Max Result Limit | `MAX_QUERY_LIMIT` | 200 | 1000 | Maximum results per query |

## Infrastructure Configuration

### AWS (Terraform)

**File:** `infra/aws/variables.tf`

```hcl
variable "max_payload_size_bytes" {
  description = "Maximum payload size in bytes"
  type        = number
  default     = 1048576 # 1MB

  validation {
    condition     = var.max_payload_size_bytes <= 1048576
    error_message = "Payload size cannot exceed 1MB (hard maximum)"
  }
}

variable "max_events_per_batch" {
  description = "Maximum events per batch"
  type        = number
  default     = 100

  validation {
    condition     = var.max_events_per_batch <= 100
    error_message = "Events per batch cannot exceed 100 (hard maximum)"
  }
}

variable "max_query_limit" {
  description = "Maximum query result limit"
  type        = number
  default     = 200

  validation {
    condition     = var.max_query_limit <= 1000
    error_message = "Query limit cannot exceed 1000 (hard maximum)"
  }
}
```

**Lambda Environment Variables:**
- `MAX_PAYLOAD_SIZE_BYTES` = `var.max_payload_size_bytes`
- `MAX_EVENTS_PER_BATCH` = `var.max_events_per_batch`
- `MAX_QUERY_LIMIT` = `var.max_query_limit`

### Azure (Bicep)

**File:** `infra/azure/main.bicep`

```bicep
@description('Maximum payload size in bytes')
@minValue(1024)
@maxValue(1048576)
param maxPayloadSizeBytes int = 1048576

@description('Maximum events per batch')
@minValue(1)
@maxValue(100)
param maxEventsPerBatch int = 100

@description('Maximum query result limit')
@minValue(1)
@maxValue(1000)
param maxQueryLimit int = 200
```

**Function App Settings:**
- `MAX_PAYLOAD_SIZE_BYTES` = `maxPayloadSizeBytes`
- `MAX_EVENTS_PER_BATCH` = `maxEventsPerBatch`
- `MAX_QUERY_LIMIT` = `maxQueryLimit`

## Application Configuration

### Config Loading (`src/config/limits.ts`)

```typescript
export function loadLimitsConfig(): LimitsConfig {
  return {
    // Ingest limits
    maxEventsPerBatch: getEnvVarAsInt('MAX_EVENTS_PER_BATCH', 100, { max: 100 }),
    minEventsPerBatch: getEnvVarAsInt('MIN_EVENTS_PER_BATCH', 1, { min: 1 }),
    maxPayloadSizeBytes: getEnvVarAsInt('MAX_PAYLOAD_SIZE_BYTES', 1048576, { max: 1048576 }),
    
    // Validation limits
    maxPropertyDepth: getEnvVarAsInt('MAX_PROPERTY_DEPTH', 3, { max: 3 }),
    maxKeysPerLevel: getEnvVarAsInt('MAX_KEYS_PER_LEVEL', 50, { max: 50 }),
    maxStringLength: getEnvVarAsInt('MAX_STRING_LENGTH', 2048, { max: 2048 }),
    maxArrayLength: getEnvVarAsInt('MAX_ARRAY_LENGTH', 100, { max: 100 }),
    
    // Query limits
    maxQueryWindowDays: getEnvVarAsInt('MAX_QUERY_WINDOW_DAYS', 31, { max: 90 }),
    defaultQueryLimit: getEnvVarAsInt('DEFAULT_QUERY_LIMIT', 50),
    maxQueryLimit: getEnvVarAsInt('MAX_QUERY_LIMIT', 200, { max: 1000 }),
  };
}
```

### Domain Validation (`src/domain/validation.ts`)

Domain validation uses **config-driven limits** (passed as parameters) but enforces hard maximums:

```typescript
export function createIngestRequestEnvelopeSchema(limits: LimitsConfig) {
  // Use config limits (already capped by config loader)
  return z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    events: z
      .array(createIngestEventSchema(limits))
      .min(limits.minEventsPerBatch)
      .max(limits.maxEventsPerBatch),
  })
  .refine(
    (data) => {
      const size = JSON.stringify(data).length;
      return size <= limits.maxPayloadSizeBytes;
    },
    {
      message: `Payload size must not exceed ${limits.maxPayloadSizeBytes} bytes`,
    }
  );
}
```

## Enforcement Flow

```
Infrastructure (Terraform/Bicep)
  ↓ (sets env vars with defaults)
Config Loader (src/config/limits.ts)
  ↓ (loads env vars, caps at hard maximums)
Domain Validation (src/domain/validation.ts)
  ↓ (validates using config limits)
Request Processing
```

### Example: Payload Size

1. **Infrastructure:** Terraform sets `MAX_PAYLOAD_SIZE_BYTES=1048576` (1MB)
2. **Config Loader:** Reads env var, ensures ≤ 1MB hard maximum
3. **Express Middleware:** `express.json({ limit: config.limits.maxPayloadSizeBytes })`
4. **Domain Validation:** Validates payload size ≤ `config.limits.maxPayloadSizeBytes`

## Environment-Specific Overrides

### Development
```bash
MAX_PAYLOAD_SIZE_BYTES=524288    # 512KB (lower for testing)
MAX_EVENTS_PER_BATCH=50          # 50 events (lower for testing)
MAX_QUERY_LIMIT=100              # 100 results (lower for testing)
```

### Staging
```bash
MAX_PAYLOAD_SIZE_BYTES=1048576   # 1MB (production-like)
MAX_EVENTS_PER_BATCH=100         # 100 events (production-like)
MAX_QUERY_LIMIT=200              # 200 results (production-like)
```

### Production
```bash
MAX_PAYLOAD_SIZE_BYTES=1048576   # 1MB (full limit)
MAX_EVENTS_PER_BATCH=100         # 100 events (full limit)
MAX_QUERY_LIMIT=200              # 200 results (reasonable default)
```

## Validation Rules

### Config Loader Validation

The config loader **must** enforce hard maximums:

```typescript
function getEnvVarAsInt(
  name: string,
  defaultValue: number,
  options?: { min?: number; max?: number }
): number {
  const value = parseInt(process.env[name] || String(defaultValue), 10);
  
  if (isNaN(value)) {
    throw new ConfigurationError(`${name} must be a valid integer`);
  }
  
  if (options?.min !== undefined && value < options.min) {
    throw new ConfigurationError(`${name} must be >= ${options.min}`);
  }
  
  if (options?.max !== undefined && value > options.max) {
    throw new ConfigurationError(`${name} cannot exceed ${options.max} (hard maximum)`);
  }
  
  return value;
}
```

### Infrastructure Validation

Terraform and Bicep **must** include validation blocks:

```hcl
validation {
  condition     = var.max_payload_size_bytes <= 1048576
  error_message = "Payload size cannot exceed 1MB (hard maximum)"
}
```

```bicep
@maxValue(1048576)
param maxPayloadSizeBytes int = 1048576
```

## Documentation Alignment

### Spec Document (`docs/analytics-service-spec-v1.0.0.md`)

Must reference hard maximums:

```markdown
### Request Limits
- Max payload size: **1 MB** (hard maximum)
- Max events per batch: **100** (hard maximum)
- Max property depth: **3 levels**
- Max keys per level: **50**
- Max string length: **2,048 characters**
- Max array length: **100 items**
```

### README (`README.md`)

Must document configurable limits with hard maximums:

```markdown
## Configuration

### Limits (Environment Variables)

All limits have defaults and hard maximums:

| Variable | Default | Hard Max | Description |
|----------|---------|----------|-------------|
| `MAX_PAYLOAD_SIZE_BYTES` | 1048576 | 1048576 | Max request payload (1 MB) |
| `MAX_EVENTS_PER_BATCH` | 100 | 100 | Max events per request |
| `MAX_QUERY_LIMIT` | 200 | 1000 | Max query results |
```

## Testing

### Unit Tests

Test that config loader enforces hard maximums:

```typescript
it('should reject MAX_PAYLOAD_SIZE_BYTES above hard maximum', () => {
  process.env.MAX_PAYLOAD_SIZE_BYTES = '2097152'; // 2MB
  expect(() => loadLimitsConfig()).toThrow('cannot exceed 1048576');
});
```

### Integration Tests

Test that validation uses config limits:

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
```

## Migration Guide

### From Hardcoded Limits

**Before:**
```typescript
const MAX_EVENTS_PER_BATCH = 50; // Hardcoded
```

**After:**
```typescript
const schema = createIngestRequestEnvelopeSchema(config.limits);
// Uses config.limits.maxEventsPerBatch (default: 100, max: 100)
```

### Infrastructure Updates

**AWS:**
1. Add validation blocks to `infra/aws/variables.tf`
2. Pass limits as Lambda env vars in `infra/aws/lambda.tf`

**Azure:**
1. Add parameters with `@maxValue` to `infra/azure/main.bicep`
2. Pass limits as Function App settings in `infra/azure/modules/functionapp.bicep`

## Benefits

✅ **Single Source of Truth** - Hard maximums defined once, enforced everywhere

✅ **Environment Flexibility** - Lower limits in dev/test, full limits in prod

✅ **Fail Fast** - Config loader rejects invalid limits at startup

✅ **Infrastructure Safety** - Terraform/Bicep validation prevents deployment of invalid limits

✅ **No Drift** - Code enforces exactly what infrastructure configures

✅ **Clear Documentation** - Limits documented with rationale and hard maximums

## References

- [Analytics Service Spec v1.0.0](./analytics-service-spec-v1.0.0.md)
- [Configuration Guide](./configuration.md)
- [Amua Apps Coding Standards](./agents.md)
