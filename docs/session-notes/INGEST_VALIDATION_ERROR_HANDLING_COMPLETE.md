# Ingest Validation Error Handling - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Fix Lambda/Azure ingest handlers to return 400 for invalid JSON and missing body

---

## Summary

Successfully fixed validation error handling across Lambda and Azure ingest handlers:
- ✅ **Lambda** - Returns 400 for missing body and invalid JSON
- ✅ **Azure** - Returns 400 for missing body and invalid JSON
- ✅ **Consistent structure** - Error responses include requestId and canonical format
- ✅ **Unit tests** - Added comprehensive tests for both handlers
- ✅ **Spec compliant** - Validation errors return 400, not 500

---

## Acceptance Criteria

- [x] **Lambda treats missing body and invalid JSON as VALIDATION_ERROR (400)**
  - ✅ Prefixed errors with `VALIDATION_ERROR:` in parseBody
  - ✅ Updated error handler to catch prefixed errors

- [x] **Azure treats missing body and invalid JSON as VALIDATION_ERROR (400)**
  - ✅ Prefixed errors with `VALIDATION_ERROR:` in parseBody
  - ✅ Updated error handler to catch prefixed errors

- [x] **Error responses match canonical structure**
  - ✅ Include `error.code` and `error.message`
  - ✅ Include `requestId` when available

- [x] **Unit tests added for each handler**
  - ✅ Lambda tests in `tests/unit/app/aws/lambda-http-ingest-validation.test.ts`
  - ✅ Azure tests in `tests/unit/app/azure/function-http-ingest-validation.test.ts`

---

## Problem Analysis

### Issue: Inconsistent Error Handling

**Before fix:**
- Missing body threw generic error → caught as 500
- Invalid JSON threw generic error → caught as 500
- Validation errors returned 400, but JSON errors returned 500

**Problem:**
- HTTP 500 suggests server error, not client error
- JSON parsing errors are client errors (malformed request)
- Inconsistent with REST API best practices

---

## Changes Made

### 1. Lambda Handler - Fixed JSON Parsing Errors

**File:** `src/app/aws/lambda-http-ingest.ts`

**Before:**
```typescript
function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) {
    throw new Error('Missing request body');  // ❌ Generic error
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    throw new Error('Invalid JSON in request body');  // ❌ Generic error
  }
}
```

**After:**
```typescript
function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) {
    const error = new Error('VALIDATION_ERROR: Missing request body');  // ✅ Prefixed
    throw error;
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    const validationError = new Error('VALIDATION_ERROR: Invalid JSON in request body');  // ✅ Prefixed
    throw validationError;
  }
}
```

**Updated error handler:**
```typescript
} catch (error) {
  // Handle validation errors with 400 status
  if (error instanceof Error && (error.message === 'VALIDATION_ERROR' || error.message.startsWith('VALIDATION_ERROR:'))) {
    deps.logger.warn({ err: error, requestId }, 'Validation error at ingress');
    return createErrorResponse(error, 400, requestId);
  }

  // Handle other errors
  deps.logger.error({ err: error, requestId }, 'Lambda ingest handler error');
  return createErrorResponse(error, 500, requestId);
}
```

**Benefits:**
- ✅ Missing body returns 400
- ✅ Invalid JSON returns 400
- ✅ Consistent with Zod validation errors
- ✅ Proper HTTP status codes

---

### 2. Azure Handler - Fixed JSON Parsing Errors

**File:** `src/app/azure/function-http-ingest.ts`

**Before:**
```typescript
async function parseBody(request: HttpRequest): Promise<unknown> {
  try {
    const body = await request.text();
    if (!body) {
      throw new Error('Missing request body');  // ❌ Generic error
    }
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON in request body');  // ❌ Generic error
  }
}
```

**After:**
```typescript
async function parseBody(request: HttpRequest): Promise<unknown> {
  try {
    const body = await request.text();
    if (!body) {
      throw new Error('VALIDATION_ERROR: Missing request body');  // ✅ Prefixed
    }
    return JSON.parse(body);
  } catch (error) {
    // If it's already our validation error, re-throw it
    if (error instanceof Error && error.message.startsWith('VALIDATION_ERROR:')) {
      throw error;
    }
    // Otherwise it's a JSON parse error
    throw new Error('VALIDATION_ERROR: Invalid JSON in request body');  // ✅ Prefixed
  }
}
```

**Updated error handler:**
```typescript
} catch (error) {
  // Handle validation errors with 400 status
  if (error instanceof Error && (error.message === 'VALIDATION_ERROR' || error.message.startsWith('VALIDATION_ERROR:'))) {
    deps.logger.warn({ err: error, invocationId: requestId }, 'Validation error at ingress');
    return createErrorResponse(error, 400, requestId);
  }

  // Handle other errors
  deps.logger.error({ err: error, invocationId: requestId }, 'Azure Function ingest handler error');
  return createErrorResponse(error, 500, requestId);
}
```

**Benefits:**
- ✅ Missing body returns 400
- ✅ Invalid JSON returns 400
- ✅ Handles re-throwing properly
- ✅ Consistent with Lambda handler

---

## Error Response Format

### Canonical Structure

**All validation errors (400) return:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing request body"
  },
  "requestId": "abc-123-def-456"
}
```

**With Zod validation details:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "path": "events.0.type",
        "message": "Required"
      }
    ]
  },
  "requestId": "abc-123-def-456"
}
```

---

## Unit Tests Added

### Lambda Tests

**File:** `tests/unit/app/aws/lambda-http-ingest-validation.test.ts`

**Test cases:**
1. **Missing request body** - `body: null` returns 400
2. **Invalid JSON** - `body: '{ invalid json }'` returns 400
3. **Empty string body** - `body: ''` returns 400
4. **RequestId included** - Verifies requestId in error response

**Example test:**
```typescript
it('should return 400 for invalid JSON', async () => {
  const event: APIGatewayProxyEvent = {
    body: '{ invalid json }',
    headers: { 'x-analytics-write-key': 'test-key' },
    // ...
  };

  const context: Context = {
    awsRequestId: 'test-request-id-2',
    // ...
  };

  const response = await handler(event, context);

  expect(response.statusCode).toBe(400);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  
  const body = JSON.parse(response.body);
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toContain('Invalid JSON');
  expect(body.requestId).toBe('test-request-id-2');
});
```

---

### Azure Tests

**File:** `tests/unit/app/azure/function-http-ingest-validation.test.ts`

**Test cases:**
1. **Missing request body** - Empty text returns 400
2. **Invalid JSON** - `'{ invalid json }'` returns 400
3. **Malformed JSON** - Trailing comma returns 400
4. **Null body** - `null` returns 400
5. **RequestId included** - Verifies invocationId in error response

**Example test:**
```typescript
it('should return 400 for invalid JSON', async () => {
  const request = {
    method: 'POST',
    url: 'https://example.com/v1/ingest',
    headers: new Map([['x-analytics-write-key', 'test-key']]),
    text: jest.fn().mockResolvedValue('{ invalid json }'),
  } as unknown as HttpRequest;

  const context = {
    invocationId: 'test-invocation-id-2',
  } as InvocationContext;

  const response = await handler(request, context);

  expect(response.status).toBe(400);
  expect(response.headers?.['Content-Type']).toBe('application/json');
  
  const body = JSON.parse(response.body as string);
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toContain('Invalid JSON');
  expect(body.requestId).toBe('test-invocation-id-2');
});
```

---

## Error Scenarios Covered

### 1. Missing Body

**Request:**
```http
POST /v1/ingest HTTP/1.1
Content-Type: application/json
X-Analytics-Write-Key: test-key

(no body)
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing request body"
  },
  "requestId": "abc-123"
}
```

---

### 2. Invalid JSON

**Request:**
```http
POST /v1/ingest HTTP/1.1
Content-Type: application/json
X-Analytics-Write-Key: test-key

{ invalid json }
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid JSON in request body"
  },
  "requestId": "abc-123"
}
```

---

### 3. Empty String

**Request:**
```http
POST /v1/ingest HTTP/1.1
Content-Type: application/json
X-Analytics-Write-Key: test-key


```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing request body"
  },
  "requestId": "abc-123"
}
```

---

### 4. Malformed JSON (Trailing Comma)

**Request:**
```http
POST /v1/ingest HTTP/1.1
Content-Type: application/json
X-Analytics-Write-Key: test-key

{"events": [],}
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid JSON in request body"
  },
  "requestId": "abc-123"
}
```

---

## HTTP Status Code Semantics

### 400 Bad Request (Client Error)

**Use for:**
- ✅ Missing request body
- ✅ Invalid JSON syntax
- ✅ Schema validation failures
- ✅ Invalid parameter values

**Meaning:** Client sent a malformed request

---

### 500 Internal Server Error (Server Error)

**Use for:**
- ✅ Database connection failures
- ✅ Queue publish failures
- ✅ Unexpected exceptions
- ✅ Infrastructure issues

**Meaning:** Server encountered an unexpected condition

---

## Consistency Across Platforms

### Before Fix

| Platform | Missing Body | Invalid JSON | Zod Validation |
|----------|--------------|--------------|----------------|
| **Express** | 400 ✅ | 400 ✅ | 400 ✅ |
| **Lambda** | 500 ❌ | 500 ❌ | 400 ✅ |
| **Azure** | 500 ❌ | 500 ❌ | 400 ✅ |

---

### After Fix

| Platform | Missing Body | Invalid JSON | Zod Validation |
|----------|--------------|--------------|----------------|
| **Express** | 400 ✅ | 400 ✅ | 400 ✅ |
| **Lambda** | 400 ✅ | 400 ✅ | 400 ✅ |
| **Azure** | 400 ✅ | 400 ✅ | 400 ✅ |

**Result:** Consistent validation behavior across all platforms ✅

---

## Files Modified

1. **`src/app/aws/lambda-http-ingest.ts`** - Fixed JSON parsing error handling
2. **`src/app/azure/function-http-ingest.ts`** - Fixed JSON parsing error handling
3. **`tests/unit/app/aws/lambda-http-ingest-validation.test.ts`** - Added Lambda tests
4. **`tests/unit/app/azure/function-http-ingest-validation.test.ts`** - Added Azure tests
5. **`INGEST_VALIDATION_ERROR_HANDLING_COMPLETE.md`** - This documentation

---

## Benefits

### 1. Correct HTTP Semantics

**Before:** JSON errors returned 500 (server error)  
**After:** JSON errors return 400 (client error)

### 2. Consistent Behavior

**Before:** Different status codes across platforms  
**After:** All platforms return 400 for validation errors

### 3. Better Client Experience

**Before:** Clients couldn't distinguish validation from server errors  
**After:** Clients know to fix their request (400) vs retry (500)

### 4. Spec Compliance

**Before:** Violated REST API best practices  
**After:** Follows standard HTTP status code semantics

---

## Migration Notes

**No migration needed:**
- Application code unchanged
- API contract unchanged
- Only error status codes changed (500 → 400)

**For API clients:**
- Validation errors now return 400 instead of 500
- Clients should handle 400 as "fix your request"
- Clients should handle 500 as "retry later"

---

## Notes

- **No breaking changes** - Fixes incorrect behavior
- **Spec compliant** - Proper HTTP status codes
- **Consistent** - All platforms behave identically
- **Well tested** - Comprehensive unit tests

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Lambda returns 400 for missing body and invalid JSON
- ✅ Azure returns 400 for missing body and invalid JSON
- ✅ Error responses include requestId and canonical structure
- ✅ Unit tests added for both handlers
- ✅ Consistent validation behavior across all platforms
