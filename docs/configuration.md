# Configuration Module Documentation

**Version:** 1.0.0  
**Status:** Implemented  
**Last Updated:** 2026-01-07

## Overview

The configuration module provides typed, fail-fast configuration loading with environment-specific settings and comprehensive validation. All configuration is loaded from environment variables with clear error messages on startup failure.

## File Structure

```
src/config/
├── types.ts           # TypeScript type definitions
├── env-loader.ts      # Environment variable loading utilities
├── limits.ts          # Application limits configuration
├── cloud.ts           # Cloud provider detection and config
├── config.ts          # Main configuration loader
└── index.ts           # Public API
```

## Configuration Structure

### Service Configuration
- `serviceName`: Service identifier (always "analytics-service")
- `env`: Environment (`dev` | `staging` | `prod`)
- `logLevel`: Logging level (`debug` | `info` | `warn` | `error`)

### Security Configuration
- `analyticsWriteKey`: Secret key for ingestion API authentication (required)
- `corsAllowedOrigins`: Array of allowed CORS origins (default: `['*']`)

### Limits Configuration
All limits have sensible defaults and can be overridden via environment variables:
- `maxEventsPerBatch`: 50
- `minEventsPerBatch`: 1
- `maxPropertyDepth`: 3
- `maxKeysPerLevel`: 50
- `maxStringLength`: 2048
- `maxArrayLength`: 100
- `maxPayloadSizeBytes`: 32768 (32 KB)
- `maxQueryWindowDays`: 31
- `defaultQueryLimit`: 50
- `maxQueryLimit`: 200

### Cloud Provider Configuration
Supports both AWS and Azure with automatic detection:
- **AWS**: DynamoDB, S3, SQS
- **Azure**: Cosmos DB, Blob Storage, Storage Queue

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANALYTICS_WRITE_KEY` | Secret key for API authentication | `your-secret-key-here` |

### Optional Service Variables

| Variable | Default | Valid Values | Description |
|----------|---------|--------------|-------------|
| `NODE_ENV` | `development` → `dev` | `dev`, `staging`, `prod` | Environment name |
| `LOG_LEVEL` | `debug` (dev), `info` (prod) | `debug`, `info`, `warn`, `error` | Logging level |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated URLs or `*` | CORS whitelist |

### Optional Limits Variables

All limits can be overridden via environment variables:
- `MAX_EVENTS_PER_BATCH`
- `MIN_EVENTS_PER_BATCH`
- `MAX_PROPERTY_DEPTH`
- `MAX_KEYS_PER_LEVEL`
- `MAX_STRING_LENGTH`
- `MAX_ARRAY_LENGTH`
- `MAX_PAYLOAD_SIZE_BYTES`
- `MAX_QUERY_WINDOW_DAYS`
- `DEFAULT_QUERY_LIMIT`
- `MAX_QUERY_LIMIT`

### Cloud Provider Variables

**Explicit provider selection:**
- `CLOUD_PROVIDER`: `aws` | `azure` (optional, auto-detected if not set)

**AWS (all required if using AWS):**
- `AWS_REGION`: AWS region (e.g., `us-east-1`)
- `DYNAMODB_TABLE_NAME`: DynamoDB table name
- `S3_RAW_BUCKET_NAME`: S3 bucket for raw events
- `SQS_QUEUE_URL`: SQS queue URL

**Azure (all required if using Azure):**
- `AZURE_COSMOS_ENDPOINT`: Cosmos DB endpoint URL
- `AZURE_COSMOS_KEY`: Cosmos DB access key
- `AZURE_STORAGE_CONNECTION_STRING`: Blob Storage connection string
- `AZURE_QUEUE_NAME`: Storage Queue name

## Usage

### Loading Configuration

```typescript
import { loadConfig, ConfigurationError } from './config';

try {
  const config = loadConfig();
  
  // Access configuration
  console.log(config.service.env);
  console.log(config.limits.maxEventsPerBatch);
  
  if (config.cloudProvider === 'aws') {
    console.log(config.aws?.region);
  }
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
    process.exit(1);
  }
  throw error;
}
```

### Configuration Caching

Configuration is loaded once and cached. To reset the cache (useful for testing):

```typescript
import { resetConfigCache } from './config';

resetConfigCache();
```

## Fail-Fast Behavior

The configuration module follows fail-fast principles:

### Missing Required Variables
```bash
# Missing ANALYTICS_WRITE_KEY
ConfigurationError: Missing required environment variable: ANALYTICS_WRITE_KEY
```

### Invalid Environment Values
```bash
# NODE_ENV=invalid
ConfigurationError: NODE_ENV must be one of: dev, staging, prod, got: invalid
```

### Invalid Integer Values
```bash
# MAX_EVENTS_PER_BATCH=not-a-number
ConfigurationError: Environment variable MAX_EVENTS_PER_BATCH must be a valid integer, got: not-a-number
```

### Empty CORS Origins
```bash
# CORS_ALLOWED_ORIGINS=""
ConfigurationError: CORS_ALLOWED_ORIGINS must not be empty
```

### Ambiguous Cloud Configuration
```bash
# Both AWS and Azure vars present without explicit CLOUD_PROVIDER
ConfigurationError: Both AWS and Azure configurations detected. Please set CLOUD_PROVIDER explicitly to "aws" or "azure".
```

## Cloud Provider Detection

The module automatically detects which cloud provider to use based on environment variables:

1. **Explicit**: If `CLOUD_PROVIDER` is set, use that provider
2. **Auto-detect**: Check which cloud variables are present
   - If only AWS vars → use AWS
   - If only Azure vars → use Azure
   - If both → fail with error (require explicit choice)
   - If neither → no cloud provider (local dev mode)

## Type Safety

All configuration values are strongly typed:

```typescript
interface Config {
  service: ServiceConfig;
  security: SecurityConfig;
  limits: LimitsConfig;
  cloudProvider?: 'aws' | 'azure';
  aws?: AwsConfig;
  azure?: AzureConfig;
}
```

No `any` types are used. All optional fields are explicitly marked with `?`.

## Testing

Comprehensive unit tests cover:
- ✅ Valid configuration loading (23 tests)
- ✅ Default value handling
- ✅ Required variable validation
- ✅ Environment value validation
- ✅ Log level defaults per environment
- ✅ CORS origin parsing
- ✅ Limits override
- ✅ Cloud provider detection
- ✅ Configuration caching
- ✅ Error messages

**Test Results:** 23/23 tests passing

## Example Configurations

### Local Development (No Cloud)
```bash
NODE_ENV=dev
ANALYTICS_WRITE_KEY=local-dev-key
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### AWS Production
```bash
NODE_ENV=prod
LOG_LEVEL=info
ANALYTICS_WRITE_KEY=prod-secret-key
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
CLOUD_PROVIDER=aws
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=analytics_events_prod
S3_RAW_BUCKET_NAME=analytics-raw-prod
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/analytics-events-prod
```

### Azure Staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
ANALYTICS_WRITE_KEY=staging-secret-key
CORS_ALLOWED_ORIGINS=https://staging.example.com
CLOUD_PROVIDER=azure
AZURE_COSMOS_ENDPOINT=https://analytics-staging.documents.azure.com:443/
AZURE_COSMOS_KEY=staging-cosmos-key
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=analyticsstaging;AccountKey=...
AZURE_QUEUE_NAME=analytics-events-staging
```

## Compliance

This implementation fully complies with:
- Amua Apps Coding Standards (agents.md)
  - TypeScript strict mode
  - No `any` types
  - Fail-fast on invalid config
  - Type-safe configuration
  - Comprehensive test coverage
  - Clear error messages
