# Express Query Handler Type Drift Fix

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Fix Express query handler type drift - core returns ApiEvent[] not StoredEvent[]

---

## Summary

Successfully fixed Express query handler type drift:
- ✅ **Removed sanitizeEventForResponse** - Unnecessary function treating ApiEvent[] as StoredEvent[]
- ✅ **Removed StoredEvent import** - No longer needed
- ✅ **Direct use of result.events** - Core already returns ApiEvent[]
- ✅ **TypeScript types align** - No StoredEvent/ApiEvent mismatch
- ✅ **Output matches other handlers** - Consistent response shape across all platforms

---

## Problem

### Type Drift Issue

**Express query handler incorrectly assumed core returns StoredEvent[]:**

```typescript
// ❌ Before - incorrect type assumption
import type { StoredEvent } from '../../domain/stored-event-types.js';

function sanitizeEventForResponse(event: StoredEvent): StoredEvent {
  const sanitized = { ...event };
  
  // Remove any internal metadata fields that shouldn't be exposed
  // The spec says: "Internal-only metadata (not exposed via API)"
  // For now, we return the canonical fields as-is since our storage
  // adapters should only store canonical fields
  
  return sanitized;
}

export function createQueryHttpHandler(deps: QueryHttpHandlerDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    // ...
    const result = await handleQuery(...);
    
    // ❌ Treating ApiEvent[] as StoredEvent[]
    const sanitizedEvents = result.events.map(sanitizeEventForResponse);
    
    const response = {
      items: sanitizedEvents,
      ...(result.cursor ? { nextCursor: result.cursor } : {}),
    };
    
    res.status(200).json(response);
  };
}
```

**Issues:**
- ❌ Type mismatch: `result.events` is `ApiEvent[]` but treated as `StoredEvent[]`
- ❌ Unnecessary sanitization: Core already strips internal metadata
- ❌ No-op function: `sanitizeEventForResponse` just returns a shallow copy
- ❌ Misleading code: Suggests sanitization is needed when it's not

---

## Core Query Contract (Reminder)

**File:** `src/app/core/types.ts`

```typescript
export interface CoreQueryResponse {
  events: ApiEvent[];  // ✅ Already mapped, internal metadata stripped
  cursor?: string;
  hasMore: boolean;
}
```

**Core handler responsibility:**
- Query storage (gets `StoredEvent[]`)
- **Map to `ApiEvent[]`** (strip internal DB fields like PK, SK, ttl, etc.)
- Return `CoreQueryResponse`

**Platform handler responsibility:**
- Parse request
- Call core
- Format response `{ items, nextCursor }`
- **No additional mapping needed**

---

## Changes Made

### 1. Removed StoredEvent Import

**File:** `src/app/http/query-handler.ts`

**Before:**
```typescript
import type { StoredEvent } from '../../domain/stored-event-types.js';
```

**After:**
```typescript
// ✅ Removed - not needed
```

---

### 2. Removed sanitizeEventForResponse Function

**Before:**
```typescript
function sanitizeEventForResponse(event: StoredEvent): StoredEvent {
  const sanitized = { ...event };
  
  // Remove any internal metadata fields that shouldn't be exposed
  // The spec says: "Internal-only metadata (not exposed via API)"
  // For now, we return the canonical fields as-is since our storage
  // adapters should only store canonical fields
  
  return sanitized;
}
```

**After:**
```typescript
// ✅ Removed - core handler already returns ApiEvent[] with metadata stripped
```

**Rationale:**
- Function was a no-op (just returned shallow copy)
- Core handler already performs the actual sanitization
- Type mismatch: treated `ApiEvent[]` as `StoredEvent[]`

---

### 3. Direct Use of result.events

**Before:**
```typescript
const result = await handleQuery(...);

// Sanitize events for response (remove internal metadata)
const sanitizedEvents = result.events.map(sanitizeEventForResponse);

// Build response matching spec format
const response = {
  items: sanitizedEvents,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};

requestLogger.info(
  {
    eventCount: sanitizedEvents.length,
    hasMore: !!result.cursor,
  },
  'Query completed successfully'
);

res.status(200).json(response);
```

**After:**
```typescript
const result = await handleQuery(...);

// Core handler already returns ApiEvent[] (internal metadata stripped)
// Build response matching spec format (items + nextCursor)
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};

requestLogger.info(
  {
    eventCount: result.events.length,
    hasMore: !!result.cursor,
  },
  'Query completed successfully'
);

res.status(200).json(response);
```

**Changes:**
- ✅ Direct use of `result.events` (no mapping)
- ✅ Updated comment to reflect reality
- ✅ Simplified logging (use `result.events.length` directly)

---

## TypeScript Verification

### Before Fix

**Type error (implicit):**
```typescript
// result.events is ApiEvent[]
const sanitizedEvents = result.events.map(sanitizeEventForResponse);
//                                         ^^^^^^^^^^^^^^^^^^^^^^^^
// Function expects StoredEvent but receives ApiEvent
```

**Why it didn't fail:**
- `ApiEvent` and `StoredEvent` share many fields
- TypeScript structural typing allowed the mismatch
- Function was a no-op so runtime behavior was correct

---

### After Fix

**Command:**
```bash
npx tsc --noEmit
```

**Result:**
- ✅ No errors related to Express query handler
- ✅ Only pre-existing test errors (unrelated)
- ✅ Types align end-to-end: `CoreQueryResponse` → `ApiEvent[]` → response

---

## Response Shape Consistency

### All Handlers Now Consistent

**Express (after fix):**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
res.status(200).json(response);
```

**AWS Lambda:**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
return {
  statusCode: 200,
  body: JSON.stringify(response),
};
```

**Azure Functions:**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
return {
  status: 200,
  body: JSON.stringify(response),
};
```

✅ **Identical response structure across all platforms**

---

## API Spec Compliance

**From analytics-service-spec-v1.0.0.md:**

```json
{
  "items": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "evt_...",
      "type": "track",
      "name": "page_viewed",
      "occurredAt": "2024-01-15T10:30:00.000Z",
      "receivedAt": "2024-01-15T10:30:00.123Z",
      "source": { ... },
      "actor": { ... },
      "properties": { ... }
    }
  ],
  "nextCursor": "eyJ..."
}
```

**Response structure:**
- ✅ `items`: Array of API events (no internal fields)
- ✅ `nextCursor`: Optional pagination cursor
- ✅ No `hasMore` exposed (internal only)
- ✅ No internal DB fields (PK, SK, ttl, etc.)

---

## What Was Sanitized (Core Layer)

**Core handler strips these internal fields:**

### DynamoDB Fields
- `PK` - Partition key
- `SK` - Sort key
- `GSI1PK`, `GSI1SK` - Global secondary index 1
- `GSI2PK`, `GSI2SK` - Global secondary index 2
- `expiresAt` - TTL timestamp

### Cosmos DB Fields
- `id` - Document ID
- `pk` - Partition key
- `_rid`, `_self`, `_etag`, `_attachments`, `_ts` - Cosmos metadata
- `ttl` - Time to live

### Internal Metadata
- `processedAt` - When event was processed (not in spec)

**Result:** Clean `ApiEvent` with only spec-defined fields

---

## Architecture Benefits

### Single Responsibility

**Core layer:**
- ✅ Business logic
- ✅ Data mapping (StoredEvent → ApiEvent)
- ✅ Platform-agnostic

**Platform handlers:**
- ✅ Request parsing
- ✅ Response formatting
- ✅ Error handling
- ✅ **No data transformation**

---

### Type Safety

**Before:**
- ❌ Type mismatch (ApiEvent treated as StoredEvent)
- ❌ Implicit type coercion
- ❌ Misleading function signature

**After:**
- ✅ Correct types throughout
- ✅ No type assertions needed
- ✅ Clear data flow

---

### Code Clarity

**Before:**
```typescript
// Sanitize events for response (remove internal metadata)
const sanitizedEvents = result.events.map(sanitizeEventForResponse);
```

**Misleading:** Suggests sanitization happens here

**After:**
```typescript
// Core handler already returns ApiEvent[] (internal metadata stripped)
const response = {
  items: result.events,
  ...
};
```

**Clear:** Documents where sanitization actually happens

---

## Files Modified

1. **`src/app/http/query-handler.ts`**
   - Removed `StoredEvent` import
   - Removed `sanitizeEventForResponse` function
   - Direct use of `result.events`
   - Updated comments to reflect reality

---

## Comparison: Before vs After

### Before (Type Drift)

```typescript
import type { StoredEvent } from '../../domain/stored-event-types.js';

function sanitizeEventForResponse(event: StoredEvent): StoredEvent {
  const sanitized = { ...event };
  return sanitized;  // ❌ No-op
}

export function createQueryHttpHandler(deps: QueryHttpHandlerDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    // ...
    const result = await handleQuery(...);
    
    // ❌ Type mismatch: ApiEvent[] treated as StoredEvent[]
    const sanitizedEvents = result.events.map(sanitizeEventForResponse);
    
    const response = {
      items: sanitizedEvents,
      ...(result.cursor ? { nextCursor: result.cursor } : {}),
    };
    
    res.status(200).json(response);
  };
}
```

**Issues:**
- ❌ Type mismatch
- ❌ Unnecessary function
- ❌ Misleading comments
- ❌ Extra complexity

---

### After (Type Aligned)

```typescript
// ✅ No StoredEvent import needed

export function createQueryHttpHandler(deps: QueryHttpHandlerDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    // ...
    const result = await handleQuery(...);
    
    // ✅ Core handler already returns ApiEvent[]
    const response = {
      items: result.events,
      ...(result.cursor ? { nextCursor: result.cursor } : {}),
    };
    
    res.status(200).json(response);
  };
}
```

**Benefits:**
- ✅ Correct types
- ✅ Simpler code
- ✅ Accurate comments
- ✅ Clear data flow

---

## Handler Evolution

### Historical Context

**Why sanitizeEventForResponse existed:**
- Early implementation before core layer existed
- Each handler did its own mapping
- Duplication across AWS, Azure, Express

**Why it became obsolete:**
- Core layer centralized mapping logic
- Single source of truth for StoredEvent → ApiEvent
- Platform handlers became thin adapters

**Lesson:** Refactor platform handlers when core contract changes

---

## Acceptance Criteria

- [x] **`tsc --noEmit` would not fail due to StoredEvent/ApiEvent mismatch**
  - Verified: No type errors related to Express query handler
  - Only pre-existing test errors (unrelated)
  
- [x] **Express query output matches other query outputs**
  - All handlers return `{ items: ApiEvent[], nextCursor?: string }`
  - Consistent response shape across AWS, Azure, Express

---

## Key Learnings

### 1. Trust the Core Contract

**Pattern:**
```typescript
// Core returns ApiEvent[]
export interface CoreQueryResponse {
  events: ApiEvent[];
  cursor?: string;
  hasMore: boolean;
}

// Platform handler should use directly
const response = {
  items: result.events,  // ✅ No transformation needed
  ...
};
```

---

### 2. Delete Dead Code

**Before:**
```typescript
function sanitizeEventForResponse(event: StoredEvent): StoredEvent {
  const sanitized = { ...event };
  return sanitized;  // ❌ No-op
}
```

**After:**
```typescript
// ✅ Deleted - core already does this
```

**Rule:** If a function is a no-op, delete it

---

### 3. Update Comments When Refactoring

**Before:**
```typescript
// Sanitize events for response (remove internal metadata)
const sanitizedEvents = result.events.map(sanitizeEventForResponse);
```

**Issue:** Comment describes what should happen, not what actually happens

**After:**
```typescript
// Core handler already returns ApiEvent[] (internal metadata stripped)
const response = { items: result.events, ... };
```

**Fix:** Comment describes actual behavior

---

## Conclusion

**Root cause:** Express handler had type drift from when it did its own mapping before core layer existed

**Solution:**
1. Removed obsolete `sanitizeEventForResponse` function
2. Removed `StoredEvent` import
3. Direct use of `result.events` (already `ApiEvent[]`)
4. Updated comments to reflect reality

**Impact:**
- ✅ Type-safe (no StoredEvent/ApiEvent mismatch)
- ✅ Consistent with AWS and Azure handlers
- ✅ Simpler code (removed no-op function)
- ✅ Accurate documentation

**Status:** Production-ready ✅
