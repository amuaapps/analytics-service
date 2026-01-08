# Logging and Correlation Documentation

**Version:** 1.0.0  
**Status:** Implemented  
**Last Updated:** 2026-01-07

## Overview

The logging and correlation module provides structured JSON logging with pino and comprehensive request correlation tracking. All logs include required fields and automatically sanitize sensitive data to prevent PII and secrets leakage.

## File Structure

```
src/utils/
├── logger.ts          # Structured logging with pino and sanitization
├── correlation.ts     # Request ID generation and correlation context
└── index.ts           # Public API exports

tests/unit/utils/
├── logger.test.ts     # 19 tests for logger functionality
└── correlation.test.ts # 24 tests for correlation utilities
```

## Structured Logging

### Log Format

All logs are structured JSON with the following required fields:

```json
{
  "timestamp": "2026-01-07T20:00:00.000Z",
  "level": "info",
  "serviceName": "analytics-service",
  "env": "prod",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Event batch processed successfully",
  "batchId": "660e8400-e29b-41d4-a716-446655440001",
  "eventCount": 25
}
```

### Required Fields

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `timestamp` | string | ISO 8601 timestamp | Automatic (pino) |
| `level` | string | Log level (`debug`, `info`, `warn`, `error`) | Automatic (pino) |
| `serviceName` | string | Always "analytics-service" | Config |
| `env` | string | Environment (`dev`, `staging`, `prod`) | Config |
| `message` | string | Log message | Caller |
| `requestId` | string | Request correlation ID | Context |
| `correlationId` | string | Alternative to requestId | Context |

### Optional Context Fields

- `batchId` - Batch processing identifier
- `eventId` - Individual event identifier
- `eventIds` - Array of event IDs in a batch
- `userId` - User identifier (non-PII)
- `appId` - Application identifier
- Custom fields as needed

## Usage

### Creating a Logger

```typescript
import { createLogger } from './utils/logger';
import { loadConfig } from './config';

const config = loadConfig();

const logger = createLogger({
  serviceName: config.service.serviceName,
  level: config.service.logLevel,
  env: config.service.env,
});

logger.info('Service started');
```

### Request-Scoped Logging

```typescript
import { createChildLogger, generateRequestId } from './utils';

// Generate or extract request ID
const requestId = generateRequestId();

// Create child logger with request context
const requestLogger = createChildLogger(logger, {
  requestId,
  appId: 'web-storefront',
});

requestLogger.info('Processing request');
// Output: { ..., requestId: "...", appId: "web-storefront", message: "Processing request" }
```

### Batch Processing Logging

```typescript
import { generateBatchId, createChildLogger } from './utils';

const batchId = generateBatchId();
const eventIds = events.map(e => e.eventId);

const batchLogger = createChildLogger(requestLogger, {
  batchId,
  eventIds,
});

batchLogger.info({ eventCount: events.length }, 'Processing event batch');
// Output: { ..., requestId: "...", batchId: "...", eventIds: [...], eventCount: 25 }
```

### Error Logging

```typescript
try {
  await processEvents(events);
} catch (error) {
  logger.error({ err: error, batchId }, 'Failed to process events');
  // Output includes full error stack trace
}
```

## Request Correlation

### Request ID Generation

Request IDs are UUIDs (v4) generated using Node.js `crypto.randomUUID()`.

```typescript
import { generateRequestId } from './utils/correlation';

const requestId = generateRequestId();
// "550e8400-e29b-41d4-a716-446655440000"
```

### Request ID Propagation

Extract request ID from incoming HTTP headers or generate a new one:

```typescript
import { getOrGenerateRequestId } from './utils/correlation';

// From HTTP header
const requestId = getOrGenerateRequestId(req.headers['x-request-id']);

// If header is valid UUID → use it
// If header is invalid/missing → generate new UUID
```

### Correlation Context

Build correlation context for tracking related operations:

```typescript
import {
  createCorrelationContext,
  addBatchIdToContext,
  addEventIdsToContext,
} from './utils/correlation';

// Create base context
let context = createCorrelationContext(requestId);

// Add batch ID
context = addBatchIdToContext(context, batchId);

// Add event IDs
context = addEventIdsToContext(context, eventIds);

// Use context for logging
const logger = createChildLogger(parentLogger, context);
```

### Queue Processing Correlation

Link queue messages back to original requests:

```typescript
// When enqueuing
const message = {
  batchId: generateBatchId(),
  requestId: context.requestId,
  events: [...],
};

// When processing from queue
const queueLogger = createChildLogger(logger, {
  requestId: message.requestId,
  batchId: message.batchId,
  eventIds: message.events.map(e => e.eventId),
});

queueLogger.info('Processing queued batch');
```

## Data Sanitization

### Automatic Redaction

The logger automatically redacts sensitive fields and PII from all log context:

#### Sensitive Fields (Always Redacted)
- `password`, `token`, `secret`, `key`
- `authorization`, `cookie`, `session`
- `apiKey`, `api_key`, `writeKey`, `write_key`
- `analyticsWriteKey`, `analytics_write_key`

#### PII Fields (Always Redacted)
- `email`, `phone`, `phoneNumber`, `phone_number`
- `ssn`, `creditCard`, `credit_card`
- `address`, `ipAddress`, `ip_address`, `ip`

### Sanitization Examples

```typescript
// Input
const context = {
  requestId: 'req-123',
  email: 'user@example.com',
  password: 'secret123',
  userId: 'user-456',
};

// Output (after sanitization)
{
  requestId: 'req-123',
  email: '[REDACTED]',
  password: '[REDACTED]',
  userId: 'user-456'  // Safe field preserved
}
```

### Nested Object Sanitization

```typescript
// Input
const context = {
  requestId: 'req-123',
  user: {
    id: 'user-123',
    email: 'user@example.com',
    preferences: {
      apiKey: 'secret-key',
    },
  },
};

// Output
{
  requestId: 'req-123',
  user: {
    id: 'user-123',
    email: '[REDACTED]',
    preferences: {
      apiKey: '[REDACTED]'
    }
  }
}
```

### Array Sanitization

```typescript
// Input
const context = {
  requestId: 'req-123',
  users: [
    { id: 'user-1', email: 'user1@example.com' },
    { id: 'user-2', email: 'user2@example.com' },
  ],
};

// Output
{
  requestId: 'req-123',
  users: [
    { id: 'user-1', email: '[REDACTED]' },
    { id: 'user-2', email: '[REDACTED]' }
  ]
}
```

## No Payload Logging

**By default, request/response payloads are NOT logged.**

This prevents:
- Accidental PII leakage
- Excessive log volume
- Performance impact

### When to Log Payloads

Only log payloads in specific debugging scenarios:
- Development environment only
- Explicit debug flag enabled
- Always sanitize before logging

```typescript
// DON'T: Log raw payload
logger.info({ payload: req.body }, 'Request received');

// DO: Log metadata only
logger.info({ 
  eventCount: req.body.events?.length,
  schemaVersion: req.body.schemaVersion 
}, 'Request received');
```

## Log Levels

### Development (`dev`)
- Default level: `debug`
- Pretty-printed output (if pino-pretty available)
- Verbose logging for debugging

### Staging (`staging`)
- Default level: `info`
- JSON formatted output
- Balanced verbosity

### Production (`prod`)
- Default level: `info`
- JSON formatted output
- Minimal overhead

### Level Usage Guidelines

| Level | When to Use | Example |
|-------|-------------|---------|
| `debug` | Development debugging, detailed flow | `logger.debug({ step: 'validation' }, 'Validating event')` |
| `info` | Normal operations, key milestones | `logger.info({ eventCount: 50 }, 'Batch processed')` |
| `warn` | Recoverable errors, degraded state | `logger.warn({ retryCount: 3 }, 'Retrying failed operation')` |
| `error` | Unrecoverable errors, failures | `logger.error({ err }, 'Failed to process batch')` |

## Testing

### Unit Tests

**43 tests passing** covering:

#### Logger Tests (19 tests)
- ✅ Logger creation with all log levels
- ✅ Child logger creation with context
- ✅ Sensitive field redaction
- ✅ PII field redaction
- ✅ Nested object sanitization
- ✅ Array sanitization
- ✅ Case-insensitive field matching
- ✅ Authorization header redaction
- ✅ Analytics write key redaction
- ✅ Deep nesting support
- ✅ Empty object/array handling
- ✅ Null/undefined value handling

#### Correlation Tests (24 tests)
- ✅ Request ID generation (UUID v4)
- ✅ Batch ID generation
- ✅ UUID validation from headers
- ✅ Request ID extraction with whitespace handling
- ✅ Invalid UUID rejection
- ✅ Uppercase UUID support
- ✅ Correlation context creation
- ✅ Context immutability
- ✅ Context chaining
- ✅ Event ID array handling

## Performance Considerations

### Logger Caching
- Create logger once at startup
- Reuse child loggers where possible
- Avoid creating new loggers per request

### Context Sanitization
- Sanitization happens once per child logger creation
- Minimal overhead for safe fields
- Deep object traversal only when needed

### JSON Formatting
- Pino is one of the fastest Node.js loggers
- Structured JSON has minimal overhead
- No string concatenation or formatting

## Best Practices

### DO ✅
- Use child loggers for request-scoped logging
- Include correlation IDs in all logs
- Log at appropriate levels
- Log errors with full context
- Sanitize before logging (automatic)
- Use structured data (objects) not string concatenation

### DON'T ❌
- Log request/response payloads by default
- Log sensitive data (passwords, tokens, PII)
- Use console.log (ESLint will catch this)
- Create new loggers per request
- Log in tight loops without throttling
- Include secrets in log messages

## Example: Complete Request Flow

```typescript
import { createLogger, createChildLogger, getOrGenerateRequestId } from './utils';
import { loadConfig } from './config';

// 1. Initialize logger at startup
const config = loadConfig();
const rootLogger = createLogger({
  serviceName: config.service.serviceName,
  level: config.service.logLevel,
  env: config.service.env,
});

// 2. Handle incoming request
async function handleIngestRequest(req, res) {
  // Extract or generate request ID
  const requestId = getOrGenerateRequestId(req.headers['x-request-id']);
  
  // Create request-scoped logger
  const requestLogger = createChildLogger(rootLogger, {
    requestId,
    appId: req.body.events[0]?.source.appId,
  });
  
  requestLogger.info({ eventCount: req.body.events.length }, 'Ingest request received');
  
  try {
    // Generate batch ID for processing
    const batchId = generateBatchId();
    const eventIds = req.body.events.map(e => e.eventId);
    
    // Create batch logger
    const batchLogger = createChildLogger(requestLogger, {
      batchId,
      eventIds,
    });
    
    batchLogger.info('Enqueuing events for processing');
    
    // Process events
    await enqueueEvents({ requestId, batchId, events: req.body.events });
    
    batchLogger.info('Events enqueued successfully');
    
    res.status(202).json({ accepted: true, eventCount: req.body.events.length });
  } catch (error) {
    requestLogger.error({ err: error }, 'Failed to process ingest request');
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 3. Process from queue
async function processQueueMessage(message) {
  const queueLogger = createChildLogger(rootLogger, {
    requestId: message.requestId,
    batchId: message.batchId,
    eventIds: message.eventIds,
  });
  
  queueLogger.info('Processing queued batch');
  
  try {
    await storeEvents(message.events);
    queueLogger.info({ eventCount: message.events.length }, 'Batch processed successfully');
  } catch (error) {
    queueLogger.error({ err: error }, 'Failed to process batch');
    throw error;
  }
}
```

## Compliance

This implementation fully complies with:
- Amua Apps Coding Standards (agents.md)
  - Structured logging with pino
  - Required fields: timestamp, serviceName, level, message, requestId
  - No secrets or PII in logs
  - TypeScript strict mode
  - Comprehensive test coverage
  - No console.log usage (enforced by ESLint)
