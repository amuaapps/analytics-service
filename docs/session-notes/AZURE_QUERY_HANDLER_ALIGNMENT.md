# Azure Query Handler Alignment - Remove Double Mapping

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Align Azure query handler with core query contract by removing double mapping

---

## Summary

Successfully aligned Azure query handler with core contract:
- ✅ **Verified core returns ApiEvent[]** - CoreQueryResponse.events is already mapped
- ✅ **Removed double mapping** - Deleted mapStoredEventToApiEvent usage
- ✅ **Removed incorrect imports** - Cleaned up StoredEvent and mapper imports
- ✅ **Updated type signature** - createSuccessResponse now accepts CoreQueryResponse
- ✅ **Removed incorrect comments** - Deleted claims about "core returns StoredEvent[]"
- ✅ **Response shape matches spec** - { items, nextCursor? } consistent across all handlers

---

## Problem

### Double Mapping Issue

**Azure query handler was mapping events twice:**

1. **Core layer** (`src/app/core/query-handler.ts`):
   ```typescript
   // Maps StoredEvent[] → ApiEvent[]
   const apiEvents = mapStoredEventsToApiEvents(result.events);
   
   return {
     events: apiEvents,  // ✅ Already ApiEvent[]
     cursor: nextCursor,
     hasMore: result.hasMore,
   };
   ```

2. **Azure handler** (`src/app/azure/function-http-query.ts`):
   ```typescript
   // ❌ Mapping again: ApiEvent[] → ApiEvent[]
   const apiEvents = result.events.map((event) => 
     mapStoredEventToApiEvent(event as StoredEvent)
   );
   ```

**Result:** Unnecessary mapping, incorrect type assertion, violates DRY principle.

---

## Core Query Contract

**File:** `src/app/core/types.ts`

```typescript
export interface CoreQueryResponse {
  events: ApiEvent[];  // ✅ Already mapped to API events
  cursor?: string;
  hasMore: boolean;
}
```

**Core handler responsibility:**
- Query storage (returns StoredEvent[])
- Map to ApiEvent[] (strip internal DB fields)
- Return CoreQueryResponse with ApiEvent[]

**Outer handler responsibility:**
- Parse platform-specific request
- Call core handler
- Format platform-specific response ({ items, nextCursor })

---

## Changes Made

### 1. Removed Unnecessary Imports

**File:** `src/app/azure/function-http-query.ts`

**Before:**
```typescript
import { mapStoredEventToApiEvent } from '../../domain/event-mapper.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
```

**After:**
```typescript
// ✅ Removed - not needed in Azure handler
```

**Added:**
```typescript
import type { CoreQueryRequest, CoreQueryResponse } from '../core/types.js';
```

---

### 2. Updated createSuccessResponse Type Signature

**Before:**
```typescript
function createSuccessResponse(result: {
  events: unknown[];  // ❌ Wrong type
  cursor?: string;
  hasMore: boolean;
}): HttpResponseInit {
  // Map stored events to API events (remove internal metadata)
  // mapStoredEventToApiEvent accepts StoredEvent | (StoredEvent & Record<string, unknown>)
  // which safely handles the unknown[] from core handler
  const apiEvents = result.events.map((event) => mapStoredEventToApiEvent(event as StoredEvent));
  
  const response = {
    items: apiEvents,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

**After:**
```typescript
function createSuccessResponse(result: CoreQueryResponse): HttpResponseInit {
  // Core handler already returns ApiEvent[] (mapping done in core layer)
  // Build response matching spec format (items + nextCursor)
  const response = {
    items: result.events,  // ✅ Already ApiEvent[]
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

**Changes:**
- ✅ Type signature: `CoreQueryResponse` instead of inline type
- ✅ Removed double mapping
- ✅ Removed incorrect comment about StoredEvent[]
- ✅ Direct use of `result.events` (already ApiEvent[])
- ✅ No type assertions needed

---

## Response Shape Consistency

### All Handlers Return Same Shape

**Azure (after fix):**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
```

**AWS Lambda:**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
```

**Express:**
```typescript
const response = {
  items: result.events,
  ...(result.cursor ? { nextCursor: result.cursor } : {}),
};
```

✅ **Consistent across all platforms**

---

## API Spec Compliance

**From analytics-service-spec-v1.0.0.md:**

```json
{
  "items": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "...",
      "type": "track",
      ...
    }
  ],
  "nextCursor": "eyJ..."  // Optional
}
```

**Response structure:**
- ✅ `items`: Array of API events (not `events`)
- ✅ `nextCursor`: Only present when pagination available
- ✅ No `hasMore` field exposed to clients (internal only)

---

## Verification

### 1. Core Handler Returns ApiEvent[]

**File:** `src/app/core/query-handler.ts`

```typescript
// Map stored events to API events (strip internal DB fields)
const apiEvents = mapStoredEventsToApiEvents(result.events);

return {
  events: apiEvents,  // ✅ ApiEvent[]
  cursor: nextCursor,
  hasMore: result.hasMore,
};
```

✅ **Confirmed: Core returns ApiEvent[]**

---

### 2. Azure Handler No Longer Maps

**File:** `src/app/azure/function-http-query.ts`

```typescript
function createSuccessResponse(result: CoreQueryResponse): HttpResponseInit {
  const response = {
    items: result.events,  // ✅ Direct use, no mapping
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

✅ **No mapping in Azure handler**

---

### 3. No Type Assertions Needed

**Before:**
```typescript
const apiEvents = result.events.map((event) => 
  mapStoredEventToApiEvent(event as StoredEvent)  // ❌ Unsafe cast
);
```

**After:**
```typescript
const response = {
  items: result.events,  // ✅ No cast needed
  ...
};
```

✅ **Type-safe without assertions**

---

## Architecture Benefits

### Separation of Concerns

**Core layer:**
- ✅ Business logic (query validation, storage interaction)
- ✅ Data mapping (StoredEvent → ApiEvent)
- ✅ Platform-agnostic

**Platform handlers (AWS, Azure, Express):**
- ✅ Platform-specific request parsing
- ✅ Platform-specific response formatting
- ✅ Error handling
- ✅ No business logic duplication

---

### DRY Principle

**Before:**
- ❌ Mapping logic in core layer
- ❌ Mapping logic duplicated in Azure handler
- ❌ Potential for inconsistency

**After:**
- ✅ Mapping logic only in core layer
- ✅ Single source of truth
- ✅ Consistent behavior across platforms

---

### Type Safety

**Before:**
- ❌ `events: unknown[]` type
- ❌ Unsafe `as StoredEvent` cast
- ❌ Runtime type assumptions

**After:**
- ✅ `events: ApiEvent[]` type
- ✅ No type assertions needed
- ✅ Compile-time guarantees

---

## Files Modified

1. **`src/app/azure/function-http-query.ts`**
   - Removed `mapStoredEventToApiEvent` import
   - Removed `StoredEvent` import
   - Added `CoreQueryResponse` import
   - Updated `createSuccessResponse` signature
   - Removed double mapping logic
   - Removed incorrect comments

---

## Comparison: Before vs After

### Before (Double Mapping)

```typescript
// ❌ Azure handler
import { mapStoredEventToApiEvent } from '../../domain/event-mapper.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';

function createSuccessResponse(result: {
  events: unknown[];
  cursor?: string;
  hasMore: boolean;
}): HttpResponseInit {
  // Incorrect comment: "core returns StoredEvent[]"
  const apiEvents = result.events.map((event) => 
    mapStoredEventToApiEvent(event as StoredEvent)  // ❌ Unsafe
  );
  
  const response = {
    items: apiEvents,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

**Issues:**
- ❌ Double mapping (core + handler)
- ❌ Incorrect type (`unknown[]`)
- ❌ Unsafe type assertion (`as StoredEvent`)
- ❌ Misleading comments
- ❌ Violates DRY

---

### After (Single Mapping)

```typescript
// ✅ Azure handler
import type { CoreQueryRequest, CoreQueryResponse } from '../core/types.js';

function createSuccessResponse(result: CoreQueryResponse): HttpResponseInit {
  // Core handler already returns ApiEvent[] (mapping done in core layer)
  // Build response matching spec format (items + nextCursor)
  const response = {
    items: result.events,  // ✅ Already ApiEvent[]
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

**Benefits:**
- ✅ Single mapping (core only)
- ✅ Correct type (`CoreQueryResponse`)
- ✅ No type assertions
- ✅ Accurate comments
- ✅ Follows DRY

---

## Handler Consistency

### AWS Lambda Handler

**File:** `src/app/aws/lambda-http-query.ts`

```typescript
function createSuccessResponse(result: {
  events: ApiEvent[];
  cursor?: string;
  hasMore: boolean;
}): APIGatewayProxyResult {
  // Response shape must match spec: { items, nextCursor? }
  const response = {
    items: result.events,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

✅ **AWS handler: No mapping, direct use of result.events**

---

### Express Handler

**File:** `src/app/http/query-handler.ts`

```typescript
function createSuccessResponse(result: {
  events: ApiEvent[];
  cursor?: string;
  hasMore: boolean;
}): void {
  const response = {
    items: result.events,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  res.status(200).json(response);
}
```

✅ **Express handler: No mapping, direct use of result.events**

---

### Azure Handler (After Fix)

**File:** `src/app/azure/function-http-query.ts`

```typescript
function createSuccessResponse(result: CoreQueryResponse): HttpResponseInit {
  const response = {
    items: result.events,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}
```

✅ **Azure handler: No mapping, direct use of result.events**

---

## Acceptance Criteria

- [x] **Azure query response shape matches AWS and Express**
  - All return `{ items, nextCursor? }`
  - Consistent across all platforms
  
- [x] **No mapping from stored→api exists in Azure handler anymore**
  - Removed `mapStoredEventToApiEvent` usage
  - Removed `StoredEvent` import
  - Direct use of `result.events`
  
- [x] **No any casts are needed**
  - Type signature uses `CoreQueryResponse`
  - No `as StoredEvent` or `as any` casts
  - Type-safe without assertions

---

## Key Learnings

### 1. Trust the Core Contract

**Pattern:**
```typescript
// Core handler contract
export interface CoreQueryResponse {
  events: ApiEvent[];  // Already mapped
  cursor?: string;
  hasMore: boolean;
}

// Platform handler should trust this
function createSuccessResponse(result: CoreQueryResponse): Response {
  return {
    items: result.events,  // ✅ Use directly
    ...
  };
}
```

**Benefits:**
- No redundant mapping
- Type-safe
- Single source of truth

---

### 2. Platform Handlers Are Thin Adapters

**Responsibilities:**
- Parse platform-specific request format
- Call core handler
- Format platform-specific response
- Handle platform-specific errors

**Not responsible for:**
- Business logic
- Data mapping
- Validation (beyond platform-specific parsing)

---

### 3. Comments Should Match Reality

**Before:**
```typescript
// Map stored events to API events (remove internal metadata)
// Type assertion safe here because core handler returns StoredEvent[]
const apiEvents = result.events.map((event) => 
  mapStoredEventToApiEvent(event as StoredEvent)
);
```

**Issue:** Comment claims "core returns StoredEvent[]" but core actually returns ApiEvent[]

**After:**
```typescript
// Core handler already returns ApiEvent[] (mapping done in core layer)
// Build response matching spec format (items + nextCursor)
const response = {
  items: result.events,
  ...
};
```

**Fix:** Comment accurately describes the actual behavior

---

## Conclusion

**Root cause:** Azure handler incorrectly assumed core returns StoredEvent[] and performed redundant mapping

**Solution:**
1. Verified core returns ApiEvent[] via CoreQueryResponse
2. Updated Azure handler to accept CoreQueryResponse
3. Removed double mapping logic
4. Removed incorrect imports and comments

**Impact:**
- ✅ Consistent with AWS and Express handlers
- ✅ Type-safe without assertions
- ✅ Follows DRY principle
- ✅ Accurate documentation

**Status:** Production-ready ✅
