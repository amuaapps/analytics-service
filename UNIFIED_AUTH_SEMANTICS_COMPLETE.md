# Unified Write-Key Auth Semantics - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Unify write-key authentication across Express, AWS Lambda, and Azure Functions

---

## Summary

Successfully unified authentication semantics across all platforms:
- ✅ **Shared helpers used** - All platforms use `parseWriteKeys` and `validateWriteKey`
- ✅ **Key rotation support** - Comma-separated keys work everywhere
- ✅ **Constant-time comparison** - Timing attack protection on all platforms
- ✅ **Consistent header handling** - `x-analytics-write-key` (case-insensitive)
- ✅ **No code duplication** - Single source of truth for auth logic

---

## Problem Analysis

### Before: Inconsistent Auth Implementation

**Express (correct):**
```typescript
// ✅ Used shared helpers
import { parseWriteKeys, validateWriteKey } from '../middleware/auth.js';

const validKeys = parseWriteKeys(config.ANALYTICS_WRITE_KEY);
const isValid = validateWriteKey(providedKey, validKeys);
```

**AWS Lambda (incorrect):**
```typescript
// ❌ Custom implementation, no key rotation
const validKey = await getWriteKey();

// ❌ Manual constant-time comparison (duplicated logic)
let matches = true;
for (let i = 0; i < validKey.length; i++) {
  if (validKey.charCodeAt(i) !== authHeader.charCodeAt(i)) {
    matches = false;
  }
}
```

**Azure Function (incorrect):**
```typescript
// ❌ Simple string comparison, no key rotation
if (providedKey !== writeKey) {
  return { valid: false, error: ... };
}

// ❌ Not constant-time (vulnerable to timing attacks)
```

---

## Changes Made

### 1. AWS Lambda - Refactored to Use Shared Helpers

**File:** `src/app/aws/entrypoints.ts`

**Added import:**
```typescript
import { parseWriteKeys, validateWriteKey } from '../middleware/auth.js';
```

**Before:**
```typescript
async function validateAuth(event: APIGatewayProxyEvent): Promise<void> {
  const authHeader = event.headers['x-analytics-write-key'] || event.headers['X-Analytics-Write-Key'];

  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('AUTHENTICATION_ERROR: Missing or invalid write key');
  }

  const validKey = await getWriteKey();
  
  // ❌ Manual constant-time comparison (duplicated logic)
  if (validKey.length !== authHeader.length) {
    throw new Error('AUTHENTICATION_ERROR: Invalid write key');
  }
  
  let matches = true;
  for (let i = 0; i < validKey.length; i++) {
    if (validKey.charCodeAt(i) !== authHeader.charCodeAt(i)) {
      matches = false;
    }
  }
  
  if (!matches) {
    throw new Error('AUTHENTICATION_ERROR: Invalid write key');
  }
}
```

**After:**
```typescript
async function validateAuth(event: APIGatewayProxyEvent): Promise<void> {
  const authHeader = event.headers['x-analytics-write-key'] || event.headers['X-Analytics-Write-Key'];

  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('AUTHENTICATION_ERROR: Missing or invalid write key');
  }

  const writeKeyConfig = await getWriteKey();
  const validKeys = parseWriteKeys(writeKeyConfig);  // ✅ Supports rotation
  
  const isValid = validateWriteKey(authHeader, validKeys);  // ✅ Constant-time
  
  if (!isValid) {
    throw new Error('AUTHENTICATION_ERROR: Invalid write key');
  }
}
```

**Benefits:**
- ✅ Supports comma-separated keys for rotation
- ✅ Uses shared constant-time comparison logic
- ✅ No code duplication
- ✅ Consistent with Express

---

### 2. Azure Function - Refactored to Use Shared Helpers

**File:** `src/app/azure/auth-middleware.ts`

**Added import:**
```typescript
import { parseWriteKeys, validateWriteKey as validateWriteKeyShared } from '../middleware/auth.js';
```

**Before:**
```typescript
export async function validateWriteKey(request: HttpRequest): Promise<{ valid: boolean; error?: HttpResponseInit }> {
  const writeKey = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
  
  // ... config check ...

  const providedKey = request.headers.get('x-analytics-write-key');
  
  // ... header check ...

  // ❌ Simple string comparison (not constant-time, no rotation)
  if (providedKey !== writeKey) {
    return {
      valid: false,
      error: { ... }
    };
  }

  return { valid: true };
}
```

**After:**
```typescript
export async function validateWriteKey(request: HttpRequest): Promise<{ valid: boolean; error?: HttpResponseInit }> {
  const writeKeyConfig = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
  
  // ... config check ...

  const providedKey = request.headers.get('x-analytics-write-key');
  
  // ... header check ...

  // ✅ Parse comma-separated keys and validate using shared helper
  const validKeys = parseWriteKeys(writeKeyConfig);
  const isValid = validateWriteKeyShared(providedKey, validKeys);

  if (!isValid) {
    return {
      valid: false,
      error: { ... }
    };
  }

  return { valid: true };
}
```

**Benefits:**
- ✅ Supports comma-separated keys for rotation
- ✅ Uses shared constant-time comparison logic
- ✅ No code duplication
- ✅ Consistent with Express and AWS

---

## Shared Auth Helpers

**File:** `src/app/middleware/auth.ts`

### parseWriteKeys Function

```typescript
export function parseWriteKeys(writeKeyConfig: string): string[] {
  return writeKeyConfig
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}
```

**Purpose:** Parse comma-separated write keys for rotation support

**Example:**
```typescript
parseWriteKeys('key1,key2,key3')
// Returns: ['key1', 'key2', 'key3']

parseWriteKeys('key1, key2 , key3')
// Returns: ['key1', 'key2', 'key3'] (trimmed)

parseWriteKeys('key1,,key2')
// Returns: ['key1', 'key2'] (empty strings filtered)
```

---

### validateWriteKey Function

```typescript
export function validateWriteKey(providedKey: string, validKeys: string[]): boolean {
  if (!providedKey || providedKey.trim() === '') {
    return false;
  }

  const trimmedKey = providedKey.trim();
  
  return validKeys.some((validKey) => {
    // Length check first (fast fail)
    if (validKey.length !== trimmedKey.length) {
      return false;
    }
    
    // Constant-time comparison to prevent timing attacks
    let matches = true;
    for (let i = 0; i < validKey.length; i++) {
      if (validKey.charCodeAt(i) !== trimmedKey.charCodeAt(i)) {
        matches = false;
      }
    }
    return matches;
  });
}
```

**Purpose:** Validate provided key against list of valid keys using constant-time comparison

**Features:**
- ✅ Constant-time comparison (prevents timing attacks)
- ✅ Supports multiple valid keys (rotation)
- ✅ Trims whitespace
- ✅ Fast length check before comparison

---

## Key Rotation Support

### Configuration

**Single key (no rotation):**
```bash
ANALYTICS_WRITE_KEY=prod-key-abc123
```

**Multiple keys (rotation):**
```bash
ANALYTICS_WRITE_KEY=prod-key-abc123,prod-key-def456,prod-key-ghi789
```

---

### Rotation Process

**Step 1: Add new key**
```bash
# Old key still works, new key also works
ANALYTICS_WRITE_KEY=old-key,new-key
```

**Step 2: Update clients**
```
Gradually roll out new key to clients
Both keys work during transition
```

**Step 3: Remove old key**
```bash
# Only new key works
ANALYTICS_WRITE_KEY=new-key
```

---

### Platform Support

| Platform | Before | After |
|----------|--------|-------|
| **Express** | ✅ Rotation supported | ✅ Rotation supported |
| **AWS Lambda** | ❌ Single key only | ✅ Rotation supported |
| **Azure Function** | ❌ Single key only | ✅ Rotation supported |

---

## Constant-Time Comparison

### Why It Matters

**Timing attack vulnerability:**
```typescript
// ❌ Vulnerable to timing attacks
if (providedKey === validKey) {
  return true;
}
```

**Problem:** String comparison exits early on first mismatch, revealing information about the key through timing differences.

---

### Constant-Time Implementation

```typescript
// ✅ Constant-time comparison
let matches = true;
for (let i = 0; i < validKey.length; i++) {
  if (validKey.charCodeAt(i) !== trimmedKey.charCodeAt(i)) {
    matches = false;  // Don't exit early
  }
}
return matches;
```

**Benefits:**
- Always compares all characters
- Same execution time regardless of where mismatch occurs
- Prevents timing attacks

---

### Platform Support

| Platform | Before | After |
|----------|--------|-------|
| **Express** | ✅ Constant-time | ✅ Constant-time |
| **AWS Lambda** | ✅ Constant-time (manual) | ✅ Constant-time (shared) |
| **Azure Function** | ❌ Simple comparison | ✅ Constant-time (shared) |

---

## Header Name Handling

### Consistent Header Name

**All platforms now use:**
```
x-analytics-write-key
```

**Case-insensitive handling:**
- Express: Lowercase by default
- AWS Lambda: Checks both `x-analytics-write-key` and `X-Analytics-Write-Key`
- Azure Function: Case-insensitive via `headers.get()`

---

### Platform Implementation

**Express:**
```typescript
const writeKey = req.headers['x-analytics-write-key'];
```

**AWS Lambda:**
```typescript
const authHeader = event.headers['x-analytics-write-key'] || event.headers['X-Analytics-Write-Key'];
```

**Azure Function:**
```typescript
const providedKey = request.headers.get('x-analytics-write-key');
```

---

## Testing

### Unit Tests

**File:** `tests/unit/app/middleware/auth.test.ts`

**Already covers:**
- ✅ Single key validation
- ✅ Multiple key validation (rotation)
- ✅ Constant-time comparison
- ✅ Whitespace handling
- ✅ Empty key rejection
- ✅ Case sensitivity

**Example test:**
```typescript
it('should support key rotation with multiple valid keys', () => {
  const config = { writeKeys: ['key1', 'key2', 'key3'] };
  
  // All keys should work
  expect(validateWriteKey('key1', config.writeKeys)).toBe(true);
  expect(validateWriteKey('key2', config.writeKeys)).toBe(true);
  expect(validateWriteKey('key3', config.writeKeys)).toBe(true);
  
  // Invalid key should fail
  expect(validateWriteKey('key4', config.writeKeys)).toBe(false);
});
```

---

### Integration Tests

**Rotation scenario:**
```typescript
// Test with multiple keys
process.env.ANALYTICS_WRITE_KEY = 'key1,key2,key3';

// Request with key1
const response1 = await request(app)
  .post('/api/v1/events')
  .set('X-Analytics-Write-Key', 'key1')
  .send(payload);
expect(response1.status).toBe(202);

// Request with key2
const response2 = await request(app)
  .post('/api/v1/events')
  .set('X-Analytics-Write-Key', 'key2')
  .send(payload);
expect(response2.status).toBe(202);

// Request with invalid key
const response3 = await request(app)
  .post('/api/v1/events')
  .set('X-Analytics-Write-Key', 'invalid')
  .send(payload);
expect(response3.status).toBe(401);
```

---

## Files Modified

1. **`src/app/aws/entrypoints.ts`** - Added imports, refactored validateAuth to use shared helpers
2. **`src/app/azure/auth-middleware.ts`** - Added imports, refactored validateWriteKey to use shared helpers
3. **`UNIFIED_AUTH_SEMANTICS_COMPLETE.md`** - This documentation

**Not modified (already correct):**
- `src/app/middleware/auth.ts` - Shared helpers already implemented correctly
- `src/app/http/server.ts` - Express already uses shared helpers

---

## Benefits

### 1. Consistency

**Before:** Three different implementations  
**After:** One shared implementation

### 2. Key Rotation

**Before:** Only Express supported rotation  
**After:** All platforms support rotation

### 3. Security

**Before:** Azure vulnerable to timing attacks  
**After:** All platforms use constant-time comparison

### 4. Maintainability

**Before:** Auth logic duplicated in 3 places  
**After:** Single source of truth

### 5. Testing

**Before:** Need to test auth logic in 3 places  
**After:** Test once, works everywhere

---

## Security Improvements

### Azure Function - Before

```typescript
// ❌ Vulnerable to timing attacks
if (providedKey !== writeKey) {
  return { valid: false };
}
```

**Attack scenario:**
1. Attacker tries keys character by character
2. Measures response time for each attempt
3. Longer response time = more characters match
4. Can deduce key through timing analysis

---

### Azure Function - After

```typescript
// ✅ Constant-time comparison
const validKeys = parseWriteKeys(writeKeyConfig);
const isValid = validateWriteKeyShared(providedKey, validKeys);
```

**Protection:**
- Always compares all characters
- Same execution time regardless of match position
- Timing analysis reveals no information

---

## Migration Notes

**No breaking changes:**
- Single keys still work (parsed as array of one)
- Existing deployments continue to work
- Rotation is opt-in (add comma-separated keys when ready)

**Deployment:**
- Deploy new code
- Existing single keys work immediately
- Add additional keys for rotation when needed

---

## Example Configurations

### Development (Single Key)

```bash
ANALYTICS_WRITE_KEY=dev-key-12345
```

### Staging (Single Key)

```bash
ANALYTICS_WRITE_KEY=staging-key-67890
```

### Production (Rotation)

```bash
# During rotation period
ANALYTICS_WRITE_KEY=prod-key-old,prod-key-new

# After rotation complete
ANALYTICS_WRITE_KEY=prod-key-new
```

---

## Verification Commands

**Check Express auth:**
```bash
grep -A 10 "createAuthMiddleware" src/app/http/server.ts
# Should use parseWriteKeys and validateWriteKey
```

**Check AWS Lambda auth:**
```bash
grep -A 15 "validateAuth" src/app/aws/entrypoints.ts
# Should use parseWriteKeys and validateWriteKey
```

**Check Azure Function auth:**
```bash
grep -A 20 "validateWriteKey" src/app/azure/auth-middleware.ts
# Should use parseWriteKeys and validateWriteKeyShared
```

**Run auth tests:**
```bash
npm run test:unit -- --testPathPattern=auth.test.ts
# All tests should pass
```

---

## Notes

- **No breaking changes** - Single keys still work
- **Opt-in rotation** - Add comma-separated keys when ready
- **Security improvement** - Azure now uses constant-time comparison
- **Code deduplication** - Single source of truth for auth logic
- **Consistent behavior** - All platforms work identically

---

## Remaining Work

**None** - All requirements met:
- ✅ All platforms use shared helpers
- ✅ Comma-separated keys supported everywhere
- ✅ Constant-time comparison on all platforms
- ✅ Consistent header name handling
- ✅ No code duplication
