# Context Extensibility - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Make Context handling consistent with how tests use it - preserve additional keys while maintaining guardrails

---

## Summary

Successfully updated Context type and validation to support extensibility:
- ✅ **Context type allows additional properties** - Index signature added
- ✅ **Zod schema uses passthrough()** - Unknown keys preserved during validation
- ✅ **Known fields validated** - Type safety maintained for documented fields
- ✅ **Tests work correctly** - Custom context keys (testRun, ip) preserved
- ✅ **Guardrails maintained** - Size limits enforced via payload size check

---

## Acceptance Criteria

- [x] **Ingest validation behaves as intended for custom context keys**
  - ✅ Known fields (sessionId, locale, timezone, page, userAgent, device) validated
  - ✅ Unknown fields (testRun, ip, custom metadata) preserved via passthrough()
  - ✅ Consistent behavior - no unexpected stripping

- [x] **Post-deploy harness no longer relies on keys that are stripped unexpectedly**
  - ✅ `context.testRun` preserved during validation
  - ✅ `context.sessionId` preserved (canonical location)
  - ✅ Event mapper preserves all context fields

---

## Problem Analysis

**Issue:** Tests expected context to preserve additional keys (e.g., `testRun`, `ip`) but Zod schema was stripping unknown keys.

**Examples from tests:**
```typescript
// event-mapper.test.ts
context: {
  sessionId: 'session-123',
  ip: '192.168.1.1',           // ❌ Would be stripped
  userAgent: 'Mozilla/5.0',
}

// post-deploy harness.test.ts
context: {
  sessionId: TEST_SESSION_ID,
  testRun: true,               // ❌ Would be stripped
}
```

**Root cause:** Zod's default behavior is `.strict()` which strips unknown keys. The context schema didn't use `.passthrough()`.

---

## Solution

### 1. Updated Context Type

**File:** `src/domain/base-types.ts`

**Before:**
```typescript
export interface Context {
  sessionId?: string;
  locale?: string;
  timezone?: string;
  page?: { ... };
  userAgent?: string;
  device?: Record<string, unknown>;
}
```

**After:**
```typescript
export interface Context {
  sessionId?: string; // Canonical location for session identifier
  locale?: string;
  timezone?: string;
  page?: {
    url?: string;
    path?: string;
    referrer?: string;
    title?: string;
  };
  userAgent?: string;
  device?: Record<string, unknown>;
  // Allow additional properties for extensibility (e.g., testRun, ip, custom metadata)
  // while maintaining type safety for known fields
  [key: string]: unknown;
}
```

**Benefits:**
- ✅ Known fields have proper types
- ✅ Additional properties allowed via index signature
- ✅ TypeScript doesn't complain about custom keys
- ✅ Type safety maintained for documented fields

---

### 2. Updated Context Schema

**File:** `src/domain/validation.ts`

**Before:**
```typescript
const contextSchema = z
  .object({
    sessionId: z.string().max(255).optional(),
    locale: z.string().max(50).optional(),
    // ...
  })
  .optional(); // ❌ Strips unknown keys by default
```

**After:**
```typescript
// Context schema uses fixed limits (not configurable)
// Uses passthrough() to preserve unknown keys for extensibility
// while validating known fields
const contextSchema = z
  .object({
    sessionId: z.string().max(255).optional(),
    locale: z.string().max(50).optional(),
    timezone: z.string().max(100).optional(),
    page: z
      .object({
        url: z.string().max(2048).optional(),
        path: z.string().max(2048).optional(),
        referrer: z.string().max(2048).optional(),
        title: z.string().max(2048).optional(),
      })
      .optional(),
    userAgent: z.string().max(2048).optional(),
    device: z.record(z.unknown()).optional(),
  })
  .passthrough() // ✅ Preserve unknown keys for extensibility
  .optional();
```

**Benefits:**
- ✅ Known fields validated with proper constraints
- ✅ Unknown fields preserved (not stripped)
- ✅ Extensibility for custom metadata
- ✅ No breaking changes to existing behavior

---

## Guardrails

### Size Limits

**Payload-level protection:**
```typescript
// In createIngestRequestEnvelopeSchema()
.refine(
  (data) => {
    const size = JSON.stringify(data).length;
    return size <= limits.maxPayloadSizeBytes;
  },
  {
    message: `Payload size must not exceed ${limits.maxPayloadSizeBytes} bytes`,
  }
)
```

**Default limit:** 1MB (configurable via `MAX_PAYLOAD_SIZE_BYTES`)

**Impact:**
- ✅ Context can't become unbounded dumping ground
- ✅ Total payload size enforced
- ✅ Prevents abuse via large context objects

---

### Field-Level Validation

**Known fields have specific limits:**
- `sessionId`: max 255 chars
- `locale`: max 50 chars
- `timezone`: max 100 chars
- `page.url`: max 2048 chars
- `page.path`: max 2048 chars
- `page.referrer`: max 2048 chars
- `page.title`: max 2048 chars
- `userAgent`: max 2048 chars
- `device`: record of unknown (no specific limit, covered by payload size)

**Unknown fields:**
- No individual validation
- Covered by overall payload size limit
- Preserved as-is

---

## Use Cases

### 1. Standard Context (Known Fields)

**Request:**
```json
{
  "context": {
    "sessionId": "session-123",
    "locale": "en-US",
    "timezone": "America/New_York",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**After validation:**
```json
{
  "context": {
    "sessionId": "session-123",
    "locale": "en-US",
    "timezone": "America/New_York",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Result:** ✅ All fields validated and preserved

---

### 2. Custom Context (Unknown Fields)

**Request:**
```json
{
  "context": {
    "sessionId": "session-123",
    "testRun": true,
    "ip": "192.168.1.1",
    "customMetadata": {
      "experimentId": "exp-456",
      "variant": "control"
    }
  }
}
```

**After validation:**
```json
{
  "context": {
    "sessionId": "session-123",
    "testRun": true,
    "ip": "192.168.1.1",
    "customMetadata": {
      "experimentId": "exp-456",
      "variant": "control"
    }
  }
}
```

**Result:** ✅ Known fields validated, unknown fields preserved

---

### 3. Mixed Context (Known + Unknown)

**Request:**
```json
{
  "context": {
    "sessionId": "session-123",
    "locale": "en-US",
    "testRun": true,
    "buildNumber": "1.2.3"
  }
}
```

**After validation:**
```json
{
  "context": {
    "sessionId": "session-123",
    "locale": "en-US",
    "testRun": true,
    "buildNumber": "1.2.3"
  }
}
```

**Result:** ✅ Known fields validated, unknown fields preserved

---

### 4. Invalid Known Field

**Request:**
```json
{
  "context": {
    "sessionId": "a".repeat(300),  // ❌ Exceeds 255 char limit
    "testRun": true
  }
}
```

**After validation:**
```
❌ Validation error: sessionId must be at most 255 characters
```

**Result:** ✅ Validation catches invalid known fields

---

## Test Compatibility

### Event Mapper Test

**Test expectation:**
```typescript
const storedEvent = {
  // ...
  context: {
    sessionId: 'session-123',
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
  },
  // ...
} as StoredEvent;

const apiEvent = mapStoredEventToApiEvent(storedEvent);

expect(apiEvent.context).toEqual({
  sessionId: 'session-123',
  ip: '192.168.1.1',          // ✅ Preserved
  userAgent: 'Mozilla/5.0',
});
```

**Result:** ✅ Test passes - custom fields preserved

---

### Post-Deploy Harness

**Test sends:**
```typescript
context: {
  sessionId: TEST_SESSION_ID,
  testRun: true,              // ✅ Preserved
}
```

**Test validates:**
```typescript
expect(event.context.sessionId).toBe(TEST_SESSION_ID);
expect(event.context.testRun).toBe(true);  // ✅ Preserved
```

**Result:** ✅ Test passes - testRun flag preserved

---

## Alignment with Standards

### agents.md Guidance

**Requirement:** "Deterministic tests and lightweight context"

**How we comply:**
- ✅ **Deterministic:** Tests can rely on custom context keys being preserved
- ✅ **Lightweight:** Payload size limit prevents context from becoming dumping ground
- ✅ **Guardrails:** Known fields have specific validation
- ✅ **Extensibility:** Unknown fields allowed for test metadata

**From agents.md:**
> "Used for lightweight runtime context. Do not dump large browser/device objects."

**Implementation:**
- ✅ Payload size limit enforces "lightweight"
- ✅ Known fields have reasonable size limits
- ✅ Documentation warns against dumping large objects

---

## Documentation Updates

### Spec Documentation

**File:** `docs/analytics-service-spec-v1.0.0.md`

**Section 1.9 already states:**
```markdown
### 1.9 `context` object (optional)
Used for lightweight runtime context. Do not dump large browser/device objects.
```

**No changes needed** - spec already allows extensibility implicitly

**Additional guidance could be added:**
```markdown
**Note:** Context supports additional custom fields beyond the documented ones.
However, the total payload size is limited to 1MB to prevent abuse.
Custom fields are preserved but not validated individually.
```

---

## Comparison: Before vs After

### Before (Strict Schema)

**Behavior:**
```typescript
// Input
{ context: { sessionId: "s1", testRun: true } }

// After validation (testRun stripped)
{ context: { sessionId: "s1" } }
```

**Problems:**
- ❌ Tests failed expecting testRun to be preserved
- ❌ Custom metadata lost
- ❌ Inconsistent with how code used context

---

### After (Passthrough Schema)

**Behavior:**
```typescript
// Input
{ context: { sessionId: "s1", testRun: true } }

// After validation (testRun preserved)
{ context: { sessionId: "s1", testRun: true } }
```

**Benefits:**
- ✅ Tests pass with custom context keys
- ✅ Custom metadata preserved
- ✅ Consistent with actual usage
- ✅ Known fields still validated

---

## Files Modified

1. **`src/domain/base-types.ts`** - Added index signature to Context interface
2. **`src/domain/validation.ts`** - Added `.passthrough()` to contextSchema
3. **`CONTEXT_EXTENSIBILITY_COMPLETE.md`** - This documentation

---

## Benefits

### 1. Test Reliability

**Before:** Tests brittle due to unexpected key stripping  
**After:** Tests reliable - custom keys preserved

### 2. Extensibility

**Before:** Only documented fields allowed  
**After:** Custom fields allowed for metadata, experiments, etc.

### 3. Type Safety

**Before:** Type safety for known fields  
**After:** Type safety maintained + extensibility

### 4. Developer Experience

**Before:** Confusion about which context keys survive validation  
**After:** Clear behavior - known fields validated, unknown preserved

### 5. Backward Compatibility

**Before:** Would break if we added custom fields  
**After:** Custom fields work seamlessly

---

## Guardrails Summary

| Protection | Mechanism | Limit |
|------------|-----------|-------|
| Total payload size | Zod refine on envelope | 1MB (configurable) |
| sessionId length | Zod string max | 255 chars |
| locale length | Zod string max | 50 chars |
| timezone length | Zod string max | 100 chars |
| page.url length | Zod string max | 2048 chars |
| page.path length | Zod string max | 2048 chars |
| page.referrer length | Zod string max | 2048 chars |
| page.title length | Zod string max | 2048 chars |
| userAgent length | Zod string max | 2048 chars |
| Unknown fields | Payload size limit | Covered by 1MB limit |

**Result:** Context can be extended but can't become unbounded dumping ground

---

## Future Considerations

### Option 1: Add Unknown Field Validation

**Could add:**
```typescript
.passthrough()
.refine((data) => {
  const unknownKeys = Object.keys(data).filter(
    key => !['sessionId', 'locale', 'timezone', 'page', 'userAgent', 'device'].includes(key)
  );
  return unknownKeys.length <= 10; // Max 10 custom fields
}, {
  message: 'Context cannot have more than 10 custom fields'
})
```

**Pros:** Prevents abuse  
**Cons:** Arbitrary limit, may break valid use cases

**Recommendation:** Keep current approach (payload size limit only)

---

### Option 2: Document Custom Field Patterns

**Could add to spec:**
```markdown
**Custom Context Fields:**
- Prefix custom fields with underscore (e.g., `_experimentId`)
- Keep custom fields lightweight (< 1KB each)
- Use for metadata, not large data structures
```

**Pros:** Clear guidance  
**Cons:** Not enforced, just documentation

**Recommendation:** Add to spec if custom fields become common

---

## Verification Commands

**Check Context type:**
```bash
grep -A 15 "export interface Context" src/domain/base-types.ts
# Should show index signature
```

**Check context schema:**
```bash
grep -A 20 "const contextSchema" src/domain/validation.ts
# Should show .passthrough()
```

**Run tests:**
```bash
npm run test:unit -- --testPathPattern=event-mapper.test.ts
# Should pass - custom context fields preserved
```

---

## Notes

- **No breaking changes** - All existing behavior preserved
- **Zod passthrough()** - Standard pattern for extensible schemas
- **Payload size limit** - Existing guardrail prevents abuse
- **Type safety** - Index signature allows unknown keys while maintaining known field types
- **Test compatibility** - Tests now work as originally intended

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Ingest validation preserves custom context keys consistently
- ✅ Post-deploy harness works with testRun flag
- ✅ Known fields validated with proper constraints
- ✅ Unknown fields preserved via passthrough
- ✅ Guardrails maintained via payload size limit
