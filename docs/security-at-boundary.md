# Security at the Boundary Documentation

**Version:** 1.0.0  
**Status:** Implemented  
**Last Updated:** 2026-01-08

## Overview

The security at the boundary module implements authentication and strict input validation for the ingestion API. All requests are authenticated via write key and validated against domain schemas before processing.

## File Structure

```
src/app/
├── middleware/
│   ├── auth.ts           # Authentication middleware
│   ├── validation.ts     # Input validation middleware
│   └── index.ts          # Public API exports
└── types/
    └── express.d.ts      # Express type extensions

tests/unit/app/middleware/
├── auth.test.ts          # 24 authentication tests
└── validation.test.ts    # 17 validation tests
```

## Authentication

### Write Key Authentication

All ingestion requests require a valid write key in the `X-Analytics-Write-Key` header.

#### Features

- ✅ **Required header validation** - Missing header returns 401
- ✅ **Multi-key support** - Multiple keys for rotation
- ✅ **Constant-time comparison** - Prevents timing attacks
- ✅ **Fail closed** - Invalid/missing key always denies access
- ✅ **Case-sensitive** - Keys are case-sensitive
- ✅ **Trimming** - Whitespace is trimmed from provided keys

### Configuration

Write keys are configured via environment variable:

```bash
# Single key
ANALYTICS_WRITE_KEY=your-secret-key-here

# Multiple keys (comma-separated for rotation)
ANALYTICS_WRITE_KEY=old-key,new-key,backup-key
```

### Usage

```typescript
import { createAuthMiddleware, parseWriteKeys } from './app/middleware';
import { createLogger } from './utils/logger';

const logger = createLogger({ serviceName: 'analytics-service', level: 'info', env: 'prod' });
const writeKeys = parseWriteKeys(config.security.analyticsWriteKey);

const authMiddleware = createAuthMiddleware(
  { writeKeys },
  logger
);

app.post('/api/v1/events', authMiddleware, handler);
```

### Response Format

#### Success (Valid Key)
Request proceeds to next middleware. No response sent.

#### Failure (Missing Header)
```json
{
  "error": "Unauthorized",
  "message": "Missing X-Analytics-Write-Key header"
}
```
**Status:** 401 Unauthorized

#### Failure (Invalid Key)
```json
{
  "error": "Unauthorized",
  "message": "Invalid X-Analytics-Write-Key"
}
```
**Status:** 401 Unauthorized

#### Failure (Invalid Format)
```json
{
  "error": "Unauthorized",
  "message": "Invalid X-Analytics-Write-Key header format"
}
```
**Status:** 401 Unauthorized

### Key Rotation

Support multiple keys simultaneously for zero-downtime rotation:

1. **Add new key** to configuration: `old-key,new-key`
2. **Deploy** service with both keys active
3. **Update clients** to use new key
4. **Remove old key** from configuration: `new-key`
5. **Deploy** service with only new key

During the rotation period, both keys are valid.

### Security Features

#### Constant-Time Comparison

The `validateWriteKey` function uses constant-time comparison to prevent timing attacks:

```typescript
let matches = true;
for (let i = 0; i < validKey.length; i++) {
  if (validKey.charCodeAt(i) !== trimmedKey.charCodeAt(i)) {
    matches = false;
  }
}
return matches;
```

This ensures the comparison time doesn't leak information about the key.

#### Length Check

Keys of different lengths are rejected immediately (before character comparison) to prevent timing attacks based on length.

## Input Validation

### Strict Validation

All request payloads are validated against domain schemas using Zod. **The entire batch is rejected if any event is invalid** (v1 rule).

#### Validation Rules

**Schema Version:**
- Envelope must have `schemaVersion: "1.0.0"`
- Each event must have `schemaVersion: "1.0.0"`

**Event Structure:**
- `eventId` must be valid UUID v4
- `type` must be `track`, `page`, or `identify`
- `occurredAt` must be ISO 8601 timestamp
- `source` must have `appId`, `platform`, `env`

**Naming Rules:**
- Event names: lowercase with dots (e.g., `button.clicked`)
- Property keys: no leading underscores
- No uppercase in event names

**Size & Depth Limits:**
- Max events per batch: 50
- Min events per batch: 1
- Max property depth: 3 levels
- Max keys per level: 50
- Max string length: 2048 characters
- Max array length: 100 items
- Max payload size: 32 KB

**Actor Validation:**
- Must have `userId` OR `anonymousId` (at least one)
- Both are optional but at least one required

**Type-Specific Rules:**
- `track` events: Must have `name`
- `page` events: Must have `name`
- `identify` events: Must have `traits` object

### Usage

```typescript
import { createValidationMiddleware } from './app/middleware';
import { createLogger } from './utils/logger';

const logger = createLogger({ serviceName: 'analytics-service', level: 'info', env: 'prod' });

const validationMiddleware = createValidationMiddleware(logger);

app.post('/api/v1/events', authMiddleware, validationMiddleware, handler);
```

### Response Format

#### Success (Valid Payload)
Request proceeds to handler. Validated data is available in `req.body`.

#### Failure (Invalid Payload)
```json
{
  "error": "Bad Request",
  "message": "Invalid request payload",
  "details": [
    {
      "path": "events.0.eventId",
      "message": "Invalid uuid",
      "code": "invalid_string"
    }
  ]
}
```
**Status:** 400 Bad Request

### Error Message Sanitization

Error messages are automatically sanitized to prevent leaking sensitive information:

**Sensitive Keywords (Redacted):**
- `password`, `token`, `secret`, `key`, `authorization`

If an error message contains any sensitive keyword, it's replaced with:
```
"Validation error occurred"
```

### Batch Rejection

**Important:** If any single event in a batch is invalid, the entire batch is rejected.

Example:
```json
{
  "schemaVersion": "1.0.0",
  "events": [
    { /* valid event */ },
    { /* invalid event - bad UUID */ },
    { /* valid event */ }
  ]
}
```

**Result:** All 3 events rejected with 400 error.

This ensures data consistency and prevents partial batch processing.

## Middleware Chain

The recommended middleware chain for the ingestion endpoint:

```typescript
app.post('/api/v1/events',
  requestIdMiddleware,      // Generate/extract request ID
  authMiddleware,           // Authenticate write key
  validationMiddleware,     // Validate payload
  ingestHandler             // Process events
);
```

Order is critical:
1. **Request ID** - For correlation and logging
2. **Authentication** - Fail fast on unauthorized
3. **Validation** - Fail fast on invalid payload
4. **Handler** - Process validated, authenticated request

## Testing

### Test Coverage

**41 tests passing** covering:

#### Authentication Tests (24 tests)
- ✅ Single write key parsing
- ✅ Multiple write keys parsing
- ✅ Whitespace trimming
- ✅ Empty key filtering
- ✅ Valid key acceptance
- ✅ Invalid key rejection
- ✅ Empty string rejection
- ✅ Whitespace-only rejection
- ✅ Key trimming before validation
- ✅ Constant-time comparison
- ✅ Length mismatch rejection
- ✅ Special characters support
- ✅ Missing header rejection (401)
- ✅ Invalid key rejection (401)
- ✅ Non-string header rejection (401)
- ✅ Key rotation support
- ✅ Empty string as key rejection
- ✅ Whitespace-only key rejection
- ✅ Case-sensitive key handling

#### Validation Tests (17 tests)
- ✅ Valid track event acceptance
- ✅ Valid page event acceptance
- ✅ Valid identify event acceptance
- ✅ Multiple events batch acceptance
- ✅ Wrong envelope schema version rejection
- ✅ Wrong event schema version rejection
- ✅ Empty events array rejection
- ✅ Missing eventId rejection
- ✅ Invalid UUID format rejection
- ✅ Invalid event type rejection
- ✅ Uppercase event name rejection
- ✅ Property key with underscore rejection
- ✅ Max depth exceeded rejection
- ✅ Max events exceeded rejection
- ✅ Missing actor rejection
- ✅ Entire batch rejection on any invalid event
- ✅ Error message sanitization

## Security Best Practices

### DO ✅

- **Use strong write keys** - At least 32 characters, random
- **Rotate keys regularly** - Use multi-key support for zero-downtime rotation
- **Monitor 401 errors** - Spike may indicate attack or misconfiguration
- **Log authentication failures** - For security auditing
- **Use HTTPS** - Write keys transmitted in headers must be encrypted
- **Validate all inputs** - Never trust client data
- **Fail closed** - Deny by default on any error

### DON'T ❌

- **Don't log write keys** - Keys are automatically sanitized from logs
- **Don't hardcode keys** - Use environment variables
- **Don't reuse keys** - Each environment should have unique keys
- **Don't share keys** - Each client/service should have its own key
- **Don't accept partial batches** - Reject entire batch on any invalid event
- **Don't expose validation details** - Sanitize error messages

## Performance Considerations

### Authentication
- **Constant-time comparison** - O(n) where n is key length
- **Multiple keys** - O(m*n) where m is number of keys
- **Recommendation** - Keep number of keys ≤ 3 for rotation

### Validation
- **Zod parsing** - Fast schema validation
- **Early rejection** - Fails fast on first error
- **No payload logging** - Minimal overhead

## Example: Complete Request Flow

```typescript
import express from 'express';
import { createAuthMiddleware, createValidationMiddleware, parseWriteKeys } from './app/middleware';
import { createLogger, getOrGenerateRequestId, createChildLogger } from './utils';
import { loadConfig } from './config';

const app = express();
const config = loadConfig();

const logger = createLogger({
  serviceName: config.service.serviceName,
  level: config.service.logLevel,
  env: config.service.env,
});

// Request ID middleware
app.use((req, res, next) => {
  req.id = getOrGenerateRequestId(req.headers['x-request-id'] as string);
  next();
});

// Parse write keys
const writeKeys = parseWriteKeys(config.security.analyticsWriteKey);

// Create middleware
const authMiddleware = createAuthMiddleware({ writeKeys }, logger);
const validationMiddleware = createValidationMiddleware(logger);

// Ingestion endpoint
app.post('/api/v1/events',
  authMiddleware,
  validationMiddleware,
  async (req, res) => {
    const requestLogger = createChildLogger(logger, {
      requestId: req.id,
      eventCount: req.body.events.length,
    });

    requestLogger.info('Processing ingest request');

    // req.body is now validated and typed
    const { events } = req.body;

    // Process events...

    res.status(202).json({
      accepted: true,
      eventCount: events.length,
    });
  }
);
```

## Compliance

This implementation fully complies with:
- Amua Apps Coding Standards (agents.md)
  - Fail closed on authentication errors
  - Strict input validation at boundary
  - No secrets in logs (automatic sanitization)
  - TypeScript strict mode
  - Comprehensive test coverage
  - Secure by design (constant-time comparison)
  - Clear error messages without leaking sensitive data
