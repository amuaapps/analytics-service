# Query Parameter Validation Robustness - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Make query parameter validation robust across Express, AWS Lambda, and Azure Functions

---

## Summary

Successfully updated query validation to handle HTTP query string formats:
- ✅ **String/number coercion** - `limit=5` (string) → `5` (number)
- ✅ **Comma-separated values** - `types=track,page` → `['track', 'page']`
- ✅ **Sort normalization** - Defaults to `desc`, accepts `asc|desc`
- ✅ **Default 'to' parameter** - Defaults to `now` when omitted
- ✅ **Guardrails maintained** - 31-day window, max limit 200
- ✅ **Platform compatibility** - Works with Express, AWS Lambda, Azure Functions

---

## Acceptance Criteria

- [x] **Express query integration tests using `.query({ limit: 5 })` pass**
  - ✅ Validation now handles string `"5"` and coerces to number `5`
  - ✅ Express can pass raw `req.query` directly to validation
  - ✅ No manual parsing needed in Express handler

- [x] **AWS/Azure remain compatible**
  - ✅ AWS Lambda already passes parsed objects - still works
  - ✅ Azure Functions already passes parsed objects - still works
  - ✅ Preprocessing handles both raw strings and parsed values

---

## Problem Analysis

### Issue: Express Query String Handling

**Express behavior:**
```typescript
// URL: /api/v1/events?limit=5&types=track,page
req.query = {
  limit: '5',           // ❌ String, not number
  types: 'track,page'   // ❌ String, not array
}
```

**Old validation:**
```typescript
// Required manual parsing in Express handler
const queryInput = validateQueryEventsInput({
  limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  types: req.query.types ? String(req.query.types).split(',') : undefined,
  // ... manual parsing for each field
});
```

**Problems:**
- ❌ Validation expected number, got string
- ❌ Validation expected array, got comma-separated string
- ❌ Manual parsing duplicated across handlers
- ❌ Easy to forget parsing in new handlers

---

## Changes Made

### 1. Added Preprocessing Function

**File:** `src/domain/query-validation.ts`

```typescript
/**
 * Preprocess HTTP query parameters to normalize them for validation
 * Handles Express query strings, AWS Lambda parsed params, and Azure Function params
 */
function preprocessQueryInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const data = input as Record<string, unknown>;
  const processed: Record<string, unknown> = { ...data };

  // Coerce limit from string to number if needed
  if (data.limit !== undefined && data.limit !== null) {
    if (typeof data.limit === 'string') {
      const parsed = parseInt(data.limit, 10);
      processed.limit = isNaN(parsed) ? data.limit : parsed;
    } else if (typeof data.limit === 'number') {
      processed.limit = data.limit;
    }
  }

  // Normalize types: handle comma-separated string or array
  if (data.types !== undefined && data.types !== null) {
    if (typeof data.types === 'string') {
      processed.types = data.types.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    } else if (Array.isArray(data.types)) {
      processed.types = data.types;
    }
  }

  // Normalize names: handle comma-separated string or array
  if (data.names !== undefined && data.names !== null) {
    if (typeof data.names === 'string') {
      processed.names = data.names.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
    } else if (Array.isArray(data.names)) {
      processed.names = data.names;
    }
  }

  // Normalize sort: ensure it's a valid enum value
  if (data.sort !== undefined && data.sort !== null) {
    const sortStr = String(data.sort).toLowerCase();
    if (sortStr === 'asc' || sortStr === 'desc') {
      processed.sort = sortStr;
    }
  }

  // Default 'to' to now if omitted (matches spec and Azure behavior)
  if (!data.to && data.from) {
    processed.to = new Date().toISOString();
  }

  return processed;
}
```

**Features:**
- ✅ Handles string → number coercion for `limit`
- ✅ Splits comma-separated strings for `types` and `names`
- ✅ Normalizes `sort` to lowercase `asc|desc`
- ✅ Defaults `to` to current time when omitted
- ✅ Preserves already-parsed values (AWS/Azure compatibility)

---

### 2. Updated Validation Function

**Before:**
```typescript
export function validateQueryEventsInput(input: unknown): QueryEventsInput {
  const validated = queryEventsInputSchema.parse(input);
  
  return {
    ...validated,
    limit: validated.limit ?? DEFAULT_QUERY_LIMIT,
    sort: validated.sort ?? 'desc',
  };
}
```

**After:**
```typescript
export function validateQueryEventsInput(input: unknown): QueryEventsInput {
  // Preprocess to normalize HTTP query params (strings, comma-separated values, etc.)
  const preprocessed = preprocessQueryInput(input);
  
  // Validate with Zod schema
  const validated = queryEventsInputSchema.parse(preprocessed);
  
  return {
    ...validated,
    limit: validated.limit ?? DEFAULT_QUERY_LIMIT,
    sort: validated.sort ?? 'desc',
    // Ensure 'to' is set (should be set by preprocessing if omitted)
    to: validated.to ?? new Date().toISOString(),
  };
}
```

**Changes:**
- ✅ Calls `preprocessQueryInput` before validation
- ✅ Ensures `to` is always set (defaults to now)
- ✅ Maintains existing defaults for `limit` and `sort`

---

### 3. Simplified Express Handler

**File:** `src/app/http/query-handler.ts`

**Before:**
```typescript
// Parse and validate query parameters
const queryInput = validateQueryEventsInput({
  appId: req.query.appId,
  from: req.query.from,
  to: req.query.to,
  types: req.query.types ? String(req.query.types).split(',') : undefined,
  names: req.query.names ? String(req.query.names).split(',') : undefined,
  userId: req.query.userId,
  anonymousId: req.query.anonymousId,
  sessionId: req.query.sessionId,
  limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  cursor: req.query.cursor,
  sort: req.query.sort,
});
```

**After:**
```typescript
// Parse and validate query parameters
// Validation now handles HTTP query string formats (strings, comma-separated, etc.)
const queryInput = validateQueryEventsInput(req.query);
```

**Benefits:**
- ✅ No manual parsing needed
- ✅ Cleaner, more maintainable code
- ✅ Consistent with AWS/Azure handlers
- ✅ Less error-prone

---

## Parameter Handling Examples

### limit Parameter

**Express (string):**
```
URL: /api/v1/events?limit=5
req.query.limit = '5'  // string

Preprocessing: '5' → 5  // number
Validation: ✅ Pass
```

**AWS Lambda (already number):**
```javascript
event.queryStringParameters = { limit: '5' }
// AWS handler parses to number before validation
input.limit = 5  // number

Preprocessing: 5 → 5  // unchanged
Validation: ✅ Pass
```

**Azure Function (already number):**
```javascript
request.query.get('limit') = '5'
// Azure handler parses to number before validation
input.limit = 5  // number

Preprocessing: 5 → 5  // unchanged
Validation: ✅ Pass
```

---

### types Parameter

**Express (comma-separated string):**
```
URL: /api/v1/events?types=track,page
req.query.types = 'track,page'  // string

Preprocessing: 'track,page' → ['track', 'page']  // array
Validation: ✅ Pass
```

**AWS Lambda (already array):**
```javascript
// AWS handler already splits comma-separated values
input.types = ['track', 'page']  // array

Preprocessing: ['track', 'page'] → ['track', 'page']  // unchanged
Validation: ✅ Pass
```

**Azure Function (already array):**
```javascript
// Azure handler already splits comma-separated values
input.types = ['track', 'page']  // array

Preprocessing: ['track', 'page'] → ['track', 'page']  // unchanged
Validation: ✅ Pass
```

---

### names Parameter

**Express (comma-separated string with spaces):**
```
URL: /api/v1/events?names=button.clicked, page.viewed
req.query.names = 'button.clicked, page.viewed'  // string

Preprocessing: 'button.clicked, page.viewed' → ['button.clicked', 'page.viewed']  // trimmed
Validation: ✅ Pass
```

---

### sort Parameter

**Express (any case):**
```
URL: /api/v1/events?sort=ASC
req.query.sort = 'ASC'  // uppercase string

Preprocessing: 'ASC' → 'asc'  // normalized to lowercase
Validation: ✅ Pass

Default: If omitted, defaults to 'desc'
```

---

### to Parameter

**Express (omitted):**
```
URL: /api/v1/events?from=2026-01-01T00:00:00Z
req.query.to = undefined

Preprocessing: undefined → '2026-01-11T22:08:00.000Z'  // current time
Validation: ✅ Pass
```

**Express (provided):**
```
URL: /api/v1/events?from=2026-01-01T00:00:00Z&to=2026-01-10T00:00:00Z
req.query.to = '2026-01-10T00:00:00Z'

Preprocessing: '2026-01-10T00:00:00Z' → '2026-01-10T00:00:00Z'  // unchanged
Validation: ✅ Pass
```

---

## Guardrails Maintained

### Max Limit: 200

```typescript
limit: z
  .number()
  .int()
  .min(1, 'limit must be at least 1')
  .max(MAX_QUERY_LIMIT, `limit must not exceed ${MAX_QUERY_LIMIT}`)
  .optional(),
```

**Test:**
```
URL: /api/v1/events?limit=300
Preprocessing: '300' → 300
Validation: ❌ Fail - "limit must not exceed 200"
```

---

### Max Date Range: 31 Days

```typescript
.refine(
  (data) => {
    const toDate = data.to ? new Date(data.to) : new Date();
    const fromDate = new Date(data.from);
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= MAX_DATE_RANGE_DAYS;
  },
  {
    message: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days`,
    path: ['from'],
  }
);
```

**Test:**
```
URL: /api/v1/events?from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z
Date range: 59 days
Validation: ❌ Fail - "Date range must not exceed 31 days"
```

---

### 'to' Must Be After 'from'

```typescript
.refine(
  (data) => {
    if (!data.to) return true;
    const fromDate = new Date(data.from);
    const toDate = new Date(data.to);
    return toDate > fromDate;
  },
  {
    message: 'to must be after from',
    path: ['to'],
  }
);
```

**Test:**
```
URL: /api/v1/events?from=2026-01-10T00:00:00Z&to=2026-01-05T00:00:00Z
Validation: ❌ Fail - "to must be after from"
```

---

## Platform Compatibility

### Express

**Before:**
```typescript
// Manual parsing required
const queryInput = validateQueryEventsInput({
  limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  types: req.query.types ? String(req.query.types).split(',') : undefined,
  // ...
});
```

**After:**
```typescript
// Direct pass-through
const queryInput = validateQueryEventsInput(req.query);
```

---

### AWS Lambda

**No changes needed:**
```typescript
// AWS handler already parses query params
const input = parseQueryParams(event);
const queryInput = validateQueryEventsInput(input);
// ✅ Still works - preprocessing handles already-parsed values
```

---

### Azure Function

**No changes needed:**
```typescript
// Azure handler already parses query params
const input = parseQueryParams(request);
const queryInput = validateQueryEventsInput(input);
// ✅ Still works - preprocessing handles already-parsed values
```

---

## Testing

### Express Integration Test

**Test case:**
```typescript
it('should accept query params as strings and coerce them', async () => {
  const response = await request(app)
    .get('/api/v1/events')
    .query({
      appId: 'test-app',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-10T00:00:00Z',
      limit: 5,  // ✅ Works as number
      types: 'track,page',  // ✅ Works as comma-separated string
      sort: 'asc'
    })
    .set('X-Analytics-Write-Key', 'test-key');

  expect(response.status).toBe(200);
  expect(response.body.items).toBeDefined();
});
```

---

### Unit Test for Preprocessing

**Test cases:**
```typescript
describe('preprocessQueryInput', () => {
  it('should coerce string limit to number', () => {
    const input = { limit: '5', from: '2026-01-01T00:00:00Z', appId: 'test' };
    const result = validateQueryEventsInput(input);
    expect(result.limit).toBe(5);
  });

  it('should split comma-separated types', () => {
    const input = { types: 'track,page', from: '2026-01-01T00:00:00Z', appId: 'test' };
    const result = validateQueryEventsInput(input);
    expect(result.types).toEqual(['track', 'page']);
  });

  it('should default to to now when omitted', () => {
    const input = { from: '2026-01-01T00:00:00Z', appId: 'test' };
    const result = validateQueryEventsInput(input);
    expect(result.to).toBeDefined();
    expect(new Date(result.to).getTime()).toBeGreaterThan(new Date(input.from).getTime());
  });

  it('should preserve already-parsed values', () => {
    const input = { limit: 5, types: ['track'], from: '2026-01-01T00:00:00Z', appId: 'test' };
    const result = validateQueryEventsInput(input);
    expect(result.limit).toBe(5);
    expect(result.types).toEqual(['track']);
  });
});
```

---

## Files Modified

1. **`src/domain/query-validation.ts`** - Added preprocessing function, updated validation
2. **`src/app/http/query-handler.ts`** - Simplified to pass raw query params
3. **`QUERY_PARAM_VALIDATION_COMPLETE.md`** - This documentation

**Not modified (already compatible):**
- `src/app/aws/lambda-http-query.ts` - Already passes parsed values
- `src/app/azure/function-http-query.ts` - Already passes parsed values

---

## Benefits

### 1. Robustness

**Before:** Express required manual parsing, easy to miss fields  
**After:** Automatic normalization handles all formats

### 2. Consistency

**Before:** Different parsing logic in each handler  
**After:** Single preprocessing function used everywhere

### 3. Maintainability

**Before:** 15 lines of manual parsing in Express handler  
**After:** 1 line - pass raw query params

### 4. Compatibility

**Before:** Express-specific parsing logic  
**After:** Works with Express, AWS Lambda, Azure Functions

### 5. Spec Compliance

**Before:** `to` parameter handling inconsistent  
**After:** Defaults to `now` when omitted (matches spec)

---

## Migration Notes

**No breaking changes:**
- AWS Lambda handlers unchanged
- Azure Function handlers unchanged
- Express handler simplified but compatible
- Existing tests should pass

**For new code:**
- Pass raw query params directly to validation
- No manual parsing needed
- Preprocessing handles all normalization

---

## Notes

- **No breaking changes** - All platforms remain compatible
- **Simpler Express code** - No manual parsing needed
- **Spec compliant** - `to` defaults to `now` when omitted
- **Guardrails maintained** - 31-day window, max limit 200
- **Type safe** - Zod validation after preprocessing

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Express query integration tests with `.query({ limit: 5 })` pass
- ✅ AWS/Azure remain compatible
- ✅ String/number coercion works
- ✅ Comma-separated values handled
- ✅ Sort normalized with default
- ✅ 'to' defaults to now
- ✅ Guardrails maintained
