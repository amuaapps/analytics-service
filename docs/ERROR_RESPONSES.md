# Error Response Specification

This document defines the canonical error response format for the Analytics Service.

## Canonical Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { }
  },
  "requestId": "uuid-v4-request-id"
}
```

### Fields

- **`error`** (required): Error object containing error details
  - **`code`** (required): Machine-readable error code (SCREAMING_SNAKE_CASE)
  - **`message`** (required): Human-readable error message
  - **`details`** (optional): Additional structured error details (e.g., validation errors)
- **`requestId`** (optional): Correlation ID for request tracking (included when available)

## Error Codes and Status Codes

### 400 Bad Request - VALIDATION_ERROR

**When:** Invalid request payload, malformed JSON, validation failures

**Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      {
        "path": "events.0.type",
        "message": "Invalid enum value. Expected 'track' | 'page' | 'identify', received 'invalid'"
      }
    ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Missing required fields
- Invalid field types
- Invalid enum values
- Malformed JSON
- Schema validation failures

### 401 Unauthorized - AUTHENTICATION_ERROR

**When:** Missing or invalid write key

**Response:**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Missing or invalid write key"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Missing `X-Analytics-Write-Key` header
- Invalid write key value
- Expired write key

### 404 Not Found - NOT_FOUND

**When:** Resource not found

**Response:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Invalid endpoint path
- Non-existent resource ID

### 413 Payload Too Large - PAYLOAD_TOO_LARGE

**When:** Request payload exceeds size limit

**Response:**
```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Payload exceeds maximum size of 1048576 bytes"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Request body exceeds configured limit (default: 1MB)
- Too many events in single batch
- Large property/trait objects

### 429 Too Many Requests - RATE_LIMIT_EXCEEDED

**When:** Rate limit exceeded

**Response:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Too many requests in time window
- Per-key rate limit exceeded

### 500 Internal Server Error - INTERNAL_SERVER_ERROR

**When:** Unexpected server error

**Response:**
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common causes:**
- Database connection failures
- Queue unavailable
- Unhandled exceptions

**Note:** Stack traces and internal error details are NEVER exposed to clients. They are logged server-side only.

## Implementation Guidelines

### HTTP Server (Express)

Use the `sendErrorResponse` utility from `src/app/http/errors.ts`:

```typescript
import { ValidationError, sendErrorResponse } from '../http/errors.js';

// Validation error
const error = new ValidationError('Invalid request payload', validationDetails);
sendErrorResponse(res, error, logger, requestId);

// Auth error
const authError = new AuthenticationError('Missing or invalid write key');
sendErrorResponse(res, authError, logger, requestId);

// Generic error (500)
sendErrorResponse(res, new Error('Something went wrong'), logger, requestId);
```

### AWS Lambda

Use consistent error response helpers:

```typescript
function createErrorResponse(error: unknown, statusCode: number = 500): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const code = statusCode === 400 ? 'VALIDATION_ERROR'
    : statusCode === 401 ? 'AUTHENTICATION_ERROR'
    : statusCode === 413 ? 'PAYLOAD_TOO_LARGE'
    : 'INTERNAL_SERVER_ERROR';

  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: { code, message },
    }),
  };
}
```

### Azure Functions

Use consistent error response helpers:

```typescript
function createErrorResponse(error: unknown, status: number = 500): HttpResponseInit {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const code = status === 400 ? 'VALIDATION_ERROR'
    : status === 401 ? 'AUTHENTICATION_ERROR'
    : status === 413 ? 'PAYLOAD_TOO_LARGE'
    : 'INTERNAL_SERVER_ERROR';

  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: { code, message },
    }),
  };
}
```

## Logging

### Client Errors (4xx)

Log at **WARN** level with sanitized details:

```typescript
logger.warn({
  error: error.message,
  statusCode: 400,
  requestId,
  code: 'VALIDATION_ERROR',
}, 'Client error occurred');
```

### Server Errors (5xx)

Log at **ERROR** level with full details including stack trace:

```typescript
logger.error({
  err: error,
  statusCode: 500,
  requestId,
  stack: error.stack,
}, 'Server error occurred');
```

**Never log:**
- Sensitive data (passwords, tokens, secrets)
- PII (personally identifiable information)
- Full request/response bodies (unless explicitly sanitized)

## Testing

### Unit Tests

Test error responses match the canonical format:

```typescript
it('returns 400 with VALIDATION_ERROR for invalid payload', async () => {
  const response = await request(app)
    .post('/api/v1/events')
    .send({ invalid: 'payload' });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    },
    requestId: expect.any(String),
  });
});
```

### Integration Tests

Verify error responses across all endpoints:

```typescript
describe('Error handling', () => {
  it('returns 401 for missing write key', async () => {
    const response = await request(app)
      .post('/api/v1/events')
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 413 for payload too large', async () => {
    const largePayload = createLargePayload();
    const response = await request(app)
      .post('/api/v1/events')
      .set('X-Analytics-Write-Key', writeKey)
      .send(largePayload);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
```

## Security Considerations

### Never Expose

- Stack traces
- Internal error details
- Database error messages
- File paths
- Environment variables
- Secrets or tokens

### Always Sanitize

- Error messages (remove sensitive patterns)
- Validation details (remove sensitive field names)
- User input in error messages

### Example: Sanitization

```typescript
function sanitizeErrorMessage(message: string): string {
  const sensitivePatterns = [
    /password/gi,
    /token/gi,
    /secret/gi,
    /key/gi,
    /authorization/gi,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return 'Validation error occurred';
    }
  }

  return message;
}
```

## Migration from Old Format

### Old Format (Inconsistent)

```json
{
  "error": "Bad Request",
  "message": "Invalid payload"
}
```

### New Format (Canonical)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Breaking Changes

- `error` is now an object (was a string)
- `code` field added for machine-readable error codes
- `requestId` added for correlation tracking
- `details` field added for structured validation errors

## References

- [Analytics Service Spec v1.0.0](./analytics-service-spec-v1.0.0.md#113-responses)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [RFC 7807 - Problem Details for HTTP APIs](https://tools.ietf.org/html/rfc7807)
