# Error Response Standardization

This document summarizes the changes made to standardize error responses across the Analytics Service.

## Problem

The service had inconsistent error response formats across different layers:

**Validation middleware:**
```json
{
  "error": "Bad Request",
  "message": "Invalid payload"
}
```

**Lambda handlers:**
```json
{
  "error": "Internal Server Error",
  "message": "Something went wrong"
}
```

**HTTP server:**
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  },
  "requestId": "uuid"
}
```

**Issues:**
- Inconsistent structure (`error` as string vs object)
- Missing error codes in some responses
- Missing requestId in some responses
- Validation errors returning 500 instead of 400
- No structured validation details

## Solution

Standardized all error responses to follow this canonical format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { }
  },
  "requestId": "uuid-v4-request-id"
}
```

## Changes Made

### 1. Validation Middleware (`src/app/middleware/validation.ts`)

**Before:**
```typescript
res.status(400).json({
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request payload',
    details: sanitizedErrors,
  },
  requestId,
});
```

**After:**
```typescript
const error = new ValidationError('Invalid request payload', sanitizedErrors);
sendErrorResponse(res, error, logger, requestId);
```

**Benefits:**
- Uses centralized error handling
- Consistent format
- Proper logging
- No duplicate ValidationError class

### 2. HTTP Server (`src/app/http/server.ts`)

**Added:**
- Import `sendErrorResponse` from `errors.ts`
- Import `PayloadTooLargeError` for payload size validation
- Proper type annotations for express.json verify callback

**Global error handler:**
```typescript
function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.id || 'unknown';
    sendError(res, err, logger, requestId);
  };
}
```

**Payload size validation:**
```typescript
app.use(express.json({ 
  limit: config.limits.maxPayloadSizeBytes,
  verify: (_req: Request, _res: Response, buf: Buffer) => {
    if (buf.length > config.limits.maxPayloadSizeBytes) {
      throw new PayloadTooLargeError(`Payload exceeds maximum size of ${config.limits.maxPayloadSizeBytes} bytes`);
    }
  }
}));
```

### 3. AWS Lambda Handlers

**Ingest (`src/app/aws/lambda-http-ingest.ts`):**
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

**Query (`src/app/aws/lambda-http-query.ts`):**
```typescript
function createErrorResponse(error: unknown, statusCode: number = 500): APIGatewayProxyResult {
  const code = statusCode === 400 ? 'VALIDATION_ERROR'
    : statusCode === 401 ? 'AUTHENTICATION_ERROR'
    : statusCode === 404 ? 'NOT_FOUND'
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

**Entrypoints (`src/app/aws/entrypoints.ts`):**
```typescript
function createAuthErrorResponse(error: Error): APIGatewayProxyResult {
  const isAuthError = error.message.includes('write key') || error.message.includes('Missing X-Analytics-Write-Key');
  
  return {
    statusCode: isAuthError ? 401 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: {
        code: isAuthError ? 'AUTHENTICATION_ERROR' : 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    }),
  };
}
```

### 4. Azure Function Handlers

**Ingest (`src/app/azure/function-http-ingest.ts`):**
```typescript
function createErrorResponse(error: unknown, status: number = 500): HttpResponseInit {
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

## Error Codes

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request payload, malformed JSON, validation failures |
| 401 | `AUTHENTICATION_ERROR` | Missing or invalid write key |
| 404 | `NOT_FOUND` | Resource not found |
| 413 | `PAYLOAD_TOO_LARGE` | Request payload exceeds size limit |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error |

## Benefits

### ✅ Consistent Structure
- All errors follow the same format
- `error` is always an object with `code` and `message`
- `requestId` included when available

### ✅ Machine-Readable Error Codes
- Clients can programmatically handle errors
- No string parsing needed
- Clear error categorization

### ✅ Proper Status Codes
- Validation errors return 400 (not 500)
- Auth errors return 401
- Payload size errors return 413
- Server errors return 500

### ✅ Structured Validation Details
- Validation errors include `details` array
- Each detail has `path` and `message`
- Easy to map errors to form fields

### ✅ Security
- No stack traces exposed to clients
- Sensitive patterns sanitized from error messages
- Full error details logged server-side only

### ✅ Observability
- Request IDs for correlation
- Proper log levels (WARN for 4xx, ERROR for 5xx)
- Stack traces in server logs

## Testing

Tests should verify the canonical error format:

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

it('returns 401 with AUTHENTICATION_ERROR for missing write key', async () => {
  const response = await request(app)
    .post('/api/v1/events')
    .send(validPayload);

  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({
    error: {
      code: 'AUTHENTICATION_ERROR',
      message: expect.stringContaining('write key'),
    },
  });
});
```

## Documentation

See [`docs/ERROR_RESPONSES.md`](../../docs/ERROR_RESPONSES.md) for:
- Complete error response specification
- Error code reference
- Implementation guidelines
- Security considerations
- Testing examples

## Migration Notes

### Breaking Changes

**Old format:**
```json
{
  "error": "Bad Request",
  "message": "Invalid payload"
}
```

**New format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Client Updates Required

Clients must update error parsing:

```typescript
// Before
if (response.error === 'Bad Request') { ... }

// After
if (response.error.code === 'VALIDATION_ERROR') { ... }
```

### Backward Compatibility

No backward compatibility provided. This is a breaking change to the error response format.

## Files Changed

- `src/app/middleware/validation.ts` - Use sendErrorResponse
- `src/app/http/server.ts` - Standardize error handler, add payload validation
- `src/app/aws/lambda-http-ingest.ts` - Add error codes
- `src/app/aws/lambda-http-query.ts` - Add error codes
- `src/app/aws/entrypoints.ts` - Add error codes
- `src/app/azure/function-http-ingest.ts` - Add error codes
- `docs/ERROR_RESPONSES.md` - Complete error specification (NEW)

## References

- [Analytics Service Spec v1.0.0](../../docs/analytics-service-spec-v1.0.0.md#113-responses)
- [Error Response Specification](../../docs/ERROR_RESPONSES.md)
- [Amua Apps Coding Standards](../../docs/agents.md#53-error-handling)
