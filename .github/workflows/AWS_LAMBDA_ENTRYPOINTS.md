# AWS Lambda Entrypoints Documentation

This document explains the AWS Lambda entrypoint implementation for the Analytics Service.

## Overview

The Analytics Service uses three Lambda functions:
1. **Ingest** - Accepts event batches via API Gateway and enqueues them to SQS
2. **Query** - Retrieves events from DynamoDB via API Gateway  
3. **Processor** - Processes events from SQS queue and stores them in DynamoDB and S3

## Handler Configuration

### Terraform Handler Strings

Each Lambda function is configured in `infra/aws/lambda.tf` with specific handler paths:

```hcl
# Ingest Lambda
handler = "app/aws/entrypoints.ingestHandler"

# Query Lambda  
handler = "app/aws/entrypoints.queryHandler"

# Processor Lambda
handler = "app/aws/entrypoints.processorHandler"
```

### Handler Exports

The handlers are exported from `src/app/aws/entrypoints.ts`:

```typescript
export async function ingestHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult>

export async function queryHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult>

export async function processorHandler(
  event: SQSEvent,
  context: Context
): Promise<void>
```

## Handler Implementation

### 1. Ingest Handler

**Purpose:** Accept event batches and enqueue to SQS

**Flow:**
```
API Gateway → Lambda → Validate Auth → Parse Body → Enqueue to SQS → Return 202
```

**Authentication:**
- Validates `X-Analytics-Write-Key` header
- Returns 401 if missing or invalid

**Environment Variables:**
- `ANALYTICS_WRITE_KEY` (required) - Write key for authentication
- `SQS_QUEUE_URL` (required) - SQS queue URL for event processing
- `NODE_ENV` - Environment (dev/staging/prod)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

**Response:**
```json
{
  "accepted": true,
  "eventCount": 5
}
```

### 2. Query Handler

**Purpose:** Query events from DynamoDB

**Flow:**
```
API Gateway → Lambda → Parse Query Params → Query DynamoDB → Return Results
```

**Query Parameters:**
- `appId` - Filter by application ID
- `userId` - Filter by user ID
- `eventType` - Filter by event type (track/page/identify)
- `startDate` - Filter by start date (ISO 8601)
- `endDate` - Filter by end date (ISO 8601)
- `limit` - Maximum number of results (default: 50, max: 100)
- `cursor` - Pagination cursor

**Environment Variables:**
- `DYNAMODB_TABLE_NAME` (required) - DynamoDB table name
- `AWS_REGION` - AWS region (default: us-east-1)
- `NODE_ENV` - Environment
- `LOG_LEVEL` - Logging level

**Response:**
```json
{
  "events": [...],
  "nextCursor": "eyJwayI6...",
  "hasMore": true
}
```

### 3. Processor Handler

**Purpose:** Process events from SQS and store in DynamoDB + S3

**Flow:**
```
SQS → Lambda → Parse Messages → Store in DynamoDB → Store in S3 → Delete from Queue
```

**Environment Variables:**
- `DYNAMODB_TABLE_NAME` (required) - DynamoDB table name
- `S3_RAW_BUCKET_NAME` (required) - S3 bucket for raw events
- `AWS_REGION` - AWS region (default: us-east-1)
- `NODE_ENV` - Environment
- `LOG_LEVEL` - Logging level

**Processing:**
- Batch size: 10 messages
- Automatic retry on failure
- Dead letter queue for failed messages

## Dependency Initialization

### Lazy Initialization

Handlers use lazy initialization to improve cold start performance:

```typescript
let ingestHandlerInstance: ReturnType<typeof createLambdaIngestHandler> | null = null;

export async function ingestHandler(event, context) {
  if (!ingestHandlerInstance) {
    // Initialize dependencies
    const logger = createLogger({...});
    const queueAdapter = new SQSQueue({...});
    ingestHandlerInstance = createLambdaIngestHandler({ logger, queueAdapter });
  }
  
  return await ingestHandlerInstance(event, context);
}
```

**Benefits:**
- Dependencies initialized once per container
- Reused across invocations (warm starts)
- Faster subsequent invocations

### Configuration Loading

Configuration is loaded from environment variables:

```typescript
function loadConfig() {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
  };
}
```

**Validation:**
- Required variables throw errors if missing
- Errors logged with context
- Lambda fails fast on misconfiguration

## Error Handling

### Authentication Errors (Ingest Only)

```typescript
try {
  validateAuth(event);
  // ... handler logic
} catch (error) {
  if (error.message.includes('write key')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized', message: error.message })
    };
  }
  throw error;
}
```

### Validation Errors (Query)

```typescript
catch (error) {
  const statusCode = error.message.includes('required') ? 400 : 500;
  return createErrorResponse(error, statusCode);
}
```

### Processing Errors (Processor)

```typescript
catch (error) {
  logger.error({ err: error, requestId: context.awsRequestId }, 'Processor error');
  throw error; // SQS will retry
}
```

## Logging

### Logger Configuration

```typescript
const logger = createLogger({
  serviceName: 'analytics-ingest',
  env: config.NODE_ENV,
  level: config.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
});
```

### Correlation IDs

Each request includes correlation tracking:

```typescript
const requestId = getOrGenerateRequestId(event.headers['x-request-id']);
```

**Benefits:**
- Trace requests across services
- Debug issues in production
- Monitor performance

## Deployment

### Build Process

```bash
# TypeScript compilation
npm run build

# Output: dist/app/aws/entrypoints.js
```

### Lambda Package Structure

```
lambda-deployment.zip
├── app/
│   └── aws/
│       └── entrypoints.js  ← Handler exports
├── domain/
├── infra/
├── utils/
├── node_modules/
└── package.json
```

### Handler Resolution

Lambda resolves handlers as:
```
handler = "app/aws/entrypoints.ingestHandler"
         ↓
file: app/aws/entrypoints.js
export: ingestHandler
```

## Testing

### Local Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (with mocks)
npm run test:integration

# Post-deploy tests (against live Lambda)
npm run test:post-deploy
```

### Manual Testing

**Ingest:**
```bash
curl -X POST https://api.example.com/api/v1/events \
  -H "X-Analytics-Write-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "schemaVersion": "1.0.0",
    "sentAt": "2026-01-08T12:00:00Z",
    "events": [...]
  }'
```

**Query:**
```bash
curl "https://api.example.com/api/v1/events?appId=web-storefront&limit=10"
```

## Troubleshooting

### Error: "Handler not found"

**Cause:** Handler path doesn't match export

**Solution:**
1. Check Terraform handler string matches export name
2. Verify build output includes entrypoints.js
3. Check Lambda package structure

### Error: "Missing environment variable"

**Cause:** Required env var not set in Terraform

**Solution:**
```hcl
environment {
  variables = {
    ANALYTICS_WRITE_KEY = var.analytics_write_key
    SQS_QUEUE_URL       = aws_sqs_queue.events.url
    # ... other vars
  }
}
```

### Error: "Cannot find module"

**Cause:** Missing dependency in Lambda package

**Solution:**
1. Check package.json includes dependency
2. Verify npm ci --production includes it
3. Check Lambda package size limits

### Cold Start Performance

**Symptoms:** First invocation slow

**Optimization:**
- Use lazy initialization (already implemented)
- Minimize dependencies
- Use Lambda provisioned concurrency (optional)

## Best Practices

### 1. Environment Variables

✅ **Good:**
```typescript
const queueUrl = process.env.SQS_QUEUE_URL;
if (!queueUrl) {
  throw new Error('SQS_QUEUE_URL required');
}
```

❌ **Bad:**
```typescript
const queueUrl = process.env.SQS_QUEUE_URL || 'default-url';
```

### 2. Error Handling

✅ **Good:**
```typescript
try {
  await handler(event, context);
} catch (error) {
  logger.error({ err: error, requestId }, 'Handler error');
  throw error;
}
```

❌ **Bad:**
```typescript
try {
  await handler(event, context);
} catch (error) {
  console.log(error); // No context
}
```

### 3. Dependency Initialization

✅ **Good:**
```typescript
let handlerInstance = null;

export async function handler(event, context) {
  if (!handlerInstance) {
    handlerInstance = createHandler({...});
  }
  return await handlerInstance(event, context);
}
```

❌ **Bad:**
```typescript
export async function handler(event, context) {
  const handler = createHandler({...}); // Every invocation
  return await handler(event, context);
}
```

## References

- [AWS Lambda Handler Documentation](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
- [API Gateway Lambda Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-integrations.html)
- [Lambda SQS Event Source](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
