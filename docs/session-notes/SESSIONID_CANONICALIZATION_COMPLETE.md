# SessionId Canonicalization - Complete Implementation

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Ensure sessionId canonicalization applies everywhere - stored events always have sessionId in context.sessionId

---

## Summary

Successfully implemented sessionId canonicalization across all ingestion paths:
- ✅ **Express middleware** - Uses createValidateIngestRequestEnvelope for canonicalization
- ✅ **Processor handler** - Uses normalized events from validation result
- ✅ **AWS Lambda** - Already using createValidateIngestRequestEnvelope ✓
- ✅ **Azure Functions** - Already using createValidateIngestRequestEnvelope ✓
- ✅ **Consistent storage** - All paths store events with context.sessionId
- ✅ **Session filtering** - Works consistently across all platforms

---

## Problem

### Inconsistent SessionId Location

**API spec allows sessionId in two locations:**

1. **Legacy location** (deprecated):
   ```json
   {
     "actor": {
       "sessionId": "sess_123"  // ❌ Deprecated
     }
   }
   ```

2. **Canonical location** (preferred):
   ```json
   {
     "context": {
       "sessionId": "sess_123"  // ✅ Canonical
     }
   }
   ```

**Issue:** Without canonicalization:
- Some events stored with `actor.sessionId`
- Some events stored with `context.sessionId`
- Session filtering/indexing inconsistent
- Query results incomplete

---

## Canonicalization Strategy

### Validation Layer Handles Canonicalization

**Function:** `createValidateIngestRequestEnvelope(limits)`

**Location:** `src/domain/validation.ts`

**Behavior:**
1. Accepts both `actor.sessionId` and `context.sessionId`
2. Moves `actor.sessionId` → `context.sessionId` if present
3. Removes `actor.sessionId` from output
4. Returns normalized events

**Example:**

**Input:**
```json
{
  "actor": {
    "userId": "user_123",
    "sessionId": "sess_456"  // ❌ Legacy location
  },
  "context": {}
}
```

**Output (normalized):**
```json
{
  "actor": {
    "userId": "user_123"
    // sessionId removed
  },
  "context": {
    "sessionId": "sess_456"  // ✅ Moved to canonical location
  }
}
```

---

## Changes Made

### 1. Express Validation Middleware

**File:** `src/app/middleware/validation.ts`

**Before:**
```typescript
import { createIngestRequestEnvelopeSchema } from '../../domain/validation.js';

export function createValidationMiddleware(logger: Logger, limits: LimitsConfig) {
  const ingestRequestEnvelopeSchema = createIngestRequestEnvelopeSchema(limits);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // ...
    const result = ingestRequestEnvelopeSchema.safeParse(req.body);
    
    if (!result.success) {
      // Handle error
    }
    
    req.body = result.data;  // ❌ Not normalized
    next();
  };
}
```

**After:**
```typescript
import { createValidateIngestRequestEnvelope } from '../../domain/validation.js';

export function createValidationMiddleware(logger: Logger, limits: LimitsConfig) {
  const validateIngestRequestEnvelope = createValidateIngestRequestEnvelope(limits);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // ...
    const result = validateIngestRequestEnvelope(req.body);
    
    if (!result.success) {
      // Handle error
    }
    
    // Use normalized payload (sessionId canonicalized to context.sessionId)
    req.body = result.data;  // ✅ Normalized
    next();
  };
}
```

**Changes:**
- ✅ Replaced `createIngestRequestEnvelopeSchema` with `createValidateIngestRequestEnvelope`
- ✅ Validator performs sessionId canonicalization
- ✅ `req.body` contains normalized events
- ✅ Downstream handlers receive canonical format

---

### 2. Processor Handler

**File:** `src/app/core/processor-handler.ts`

**Before:**
```typescript
// Defensive validation
const validationResult = validateIngestRequestEnvelope({ schemaVersion: '1.0.0', events });

if (!validationResult.success) {
  // Handle error
}

// ❌ Using original events (not normalized)
const duplicateChecks = await Promise.allSettled(
  events.map((event) => operationalStorage.checkEventExists(event.eventId))
);

const newEvents: typeof events = [];
events.forEach((event, index) => {
  // ...
  newEvents.push(event);  // ❌ Original event
});

const storedEvents: StoredEvent[] = newEvents.map((event) =>
  transformToStoredEvent(event, { receivedAt, processedAt })  // ❌ Original event
);
```

**After:**
```typescript
// Defensive validation
const validationResult = validateIngestRequestEnvelope({ schemaVersion: '1.0.0', events });

if (!validationResult.success) {
  // Handle error
}

// ✅ Use normalized events from validation (sessionId canonicalized)
const normalizedEvents = validationResult.data.events;

// ✅ Check duplicates using normalized events
const duplicateChecks = await Promise.allSettled(
  normalizedEvents.map((event) => operationalStorage.checkEventExists(event.eventId))
);

const newEvents: typeof normalizedEvents = [];
normalizedEvents.forEach((event, index) => {
  // ...
  newEvents.push(event);  // ✅ Normalized event
});

// ✅ Transform normalized events to stored events
const storedEvents: StoredEvent[] = newEvents.map((event) =>
  transformToStoredEvent(event, { receivedAt, processedAt })  // ✅ Normalized event
);
```

**Changes:**
- ✅ Extract normalized events from `validationResult.data.events`
- ✅ Use normalized events for duplicate checks
- ✅ Use normalized events for transformation
- ✅ Use normalized events for persistence
- ✅ All stored events have canonical `context.sessionId`

---

## Ingestion Paths Coverage

### 1. Express → Queue → Processor

**Flow:**
1. **Express middleware** validates and normalizes
2. **Express ingest handler** stores raw batch (original)
3. **Queue message** points to raw batch
4. **Processor** validates raw batch and normalizes again
5. **Processor** stores normalized events

**Result:** ✅ Stored events have `context.sessionId`

---

### 2. AWS Lambda → Queue → Processor

**Flow:**
1. **Lambda handler** validates and normalizes (already using `createValidateIngestRequestEnvelope`)
2. **Lambda** stores raw batch (original)
3. **Queue message** points to raw batch
4. **Processor** validates raw batch and normalizes again
5. **Processor** stores normalized events

**Result:** ✅ Stored events have `context.sessionId`

---

### 3. Azure Functions → Queue → Processor

**Flow:**
1. **Azure handler** validates and normalizes (already using `createValidateIngestRequestEnvelope`)
2. **Azure** stores raw batch (original)
3. **Queue message** points to raw batch
4. **Processor** validates raw batch and normalizes again
5. **Processor** stores normalized events

**Result:** ✅ Stored events have `context.sessionId`

---

## Raw Batch Semantics

### Raw Batches Remain Unchanged

**Important:** Raw batches stored in S3/Blob Storage are NOT normalized.

**Rationale:**
- Raw batches are immutable audit trail
- Store exactly what client sent
- Normalization happens during processing

**Example:**

**Client sends:**
```json
{
  "events": [{
    "actor": { "sessionId": "sess_123" },
    "context": {}
  }]
}
```

**Raw batch stored:**
```json
{
  "events": [{
    "actor": { "sessionId": "sess_123" },  // ✅ Original preserved
    "context": {}
  }]
}
```

**Operational storage (queryable):**
```json
{
  "actor": {},
  "context": { "sessionId": "sess_123" }  // ✅ Normalized
}
```

---

## Session Filtering & Indexing

### DynamoDB GSI

**Index:** `GSI2` - Session index

**Keys:**
- `GSI2PK`: `{appId}#{sessionId}`
- `GSI2SK`: `{occurredAt}`

**Query:**
```typescript
const result = await queryEvents({
  appId: 'app_123',
  sessionId: 'sess_456',  // ✅ Filters by context.sessionId
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T23:59:59Z'
});
```

**Result:** ✅ Returns all events with `context.sessionId === 'sess_456'`

---

### Cosmos DB Query

**Query:**
```sql
SELECT * FROM c 
WHERE c.pk = @appId 
  AND c.context.sessionId = @sessionId  -- ✅ Canonical location
  AND c.occurredAt >= @from 
  AND c.occurredAt < @to
```

**Result:** ✅ Returns all events with `context.sessionId`

---

### In-Memory Storage

**Filter:**
```typescript
if (input.sessionId) {
  results = results.filter((e) => e.context?.sessionId === input.sessionId);
  //                                ^^^^^^^^ Canonical location
}
```

**Result:** ✅ Returns all events with `context.sessionId`

---

## Verification

### Test Scenario 1: Legacy Client

**Client sends:**
```json
POST /api/v1/events
{
  "schemaVersion": "1.0.0",
  "events": [{
    "eventId": "evt_1",
    "type": "track",
    "name": "page_viewed",
    "occurredAt": "2024-01-15T10:00:00Z",
    "source": { "appId": "app_123", "platform": "web", "env": "production" },
    "actor": {
      "userId": "user_456",
      "sessionId": "sess_789"  // ❌ Legacy location
    },
    "context": {}
  }]
}
```

**Stored in operational storage:**
```json
{
  "eventId": "evt_1",
  "type": "track",
  "name": "page_viewed",
  "occurredAt": "2024-01-15T10:00:00Z",
  "receivedAt": "2024-01-15T10:00:00.123Z",
  "processedAt": "2024-01-15T10:00:01.456Z",
  "source": { "appId": "app_123", "platform": "web", "env": "production" },
  "actor": {
    "userId": "user_456"
    // sessionId removed ✅
  },
  "context": {
    "sessionId": "sess_789"  // ✅ Moved to canonical location
  }
}
```

**Query by sessionId:**
```typescript
const result = await queryEvents({
  appId: 'app_123',
  sessionId: 'sess_789',
  from: '2024-01-15T00:00:00Z'
});
```

**Result:** ✅ Event found (sessionId in canonical location)

---

### Test Scenario 2: Modern Client

**Client sends:**
```json
POST /api/v1/events
{
  "schemaVersion": "1.0.0",
  "events": [{
    "eventId": "evt_2",
    "type": "track",
    "name": "button_clicked",
    "occurredAt": "2024-01-15T10:05:00Z",
    "source": { "appId": "app_123", "platform": "web", "env": "production" },
    "actor": {
      "userId": "user_456"
    },
    "context": {
      "sessionId": "sess_789"  // ✅ Already canonical
    }
  }]
}
```

**Stored in operational storage:**
```json
{
  "eventId": "evt_2",
  "type": "track",
  "name": "button_clicked",
  "occurredAt": "2024-01-15T10:05:00Z",
  "receivedAt": "2024-01-15T10:05:00.123Z",
  "processedAt": "2024-01-15T10:05:01.456Z",
  "source": { "appId": "app_123", "platform": "web", "env": "production" },
  "actor": {
    "userId": "user_456"
  },
  "context": {
    "sessionId": "sess_789"  // ✅ Unchanged (already canonical)
  }
}
```

**Query by sessionId:**
```typescript
const result = await queryEvents({
  appId: 'app_123',
  sessionId: 'sess_789',
  from: '2024-01-15T00:00:00Z'
});
```

**Result:** ✅ Both events found (evt_1 and evt_2)

---

## Files Modified

1. **`src/app/middleware/validation.ts`**
   - Replaced `createIngestRequestEnvelopeSchema` with `createValidateIngestRequestEnvelope`
   - Validator performs sessionId canonicalization
   - `req.body` contains normalized events

2. **`src/app/core/processor-handler.ts`**
   - Extract normalized events from `validationResult.data.events`
   - Use normalized events for duplicate checks
   - Use normalized events for transformation and persistence

---

## Architecture Benefits

### Single Source of Truth

**Before:**
- Express: Schema validation only (no canonicalization)
- AWS/Azure: Validator with canonicalization
- Processor: No canonicalization
- **Result:** Inconsistent storage

**After:**
- Express: Validator with canonicalization ✅
- AWS/Azure: Validator with canonicalization ✅
- Processor: Uses normalized events ✅
- **Result:** Consistent storage

---

### Defensive Validation

**Processor validates raw batches:**
- Raw batches may contain legacy `actor.sessionId`
- Processor normalizes during validation
- Stored events always canonical

**Benefits:**
- Handles legacy data
- Handles corrupted batches
- Ensures consistency

---

### Query Consistency

**All storage backends query canonical location:**

**DynamoDB:**
```typescript
GSI2PK = `${appId}#${sessionId}`  // Uses context.sessionId
```

**Cosmos DB:**
```sql
WHERE c.context.sessionId = @sessionId  -- Canonical location
```

**In-Memory:**
```typescript
e.context?.sessionId === input.sessionId  // Canonical location
```

**Result:** ✅ Session filtering works consistently

---

## Acceptance Criteria

- [x] **Even if a client sends actor.sessionId, stored/queryable events use context.sessionId**
  - Express middleware normalizes
  - Processor normalizes
  - All stored events canonical
  
- [x] **Session filtering/indexing works consistently across AWS/Azure/local**
  - DynamoDB GSI2 uses `context.sessionId`
  - Cosmos DB queries `context.sessionId`
  - In-memory filters `context.sessionId`

---

## Key Learnings

### 1. Normalize at Validation Boundary

**Pattern:**
```typescript
// Validation function returns normalized data
const result = validateIngestRequestEnvelope(rawData);

if (result.success) {
  const normalizedEvents = result.data.events;  // ✅ Use normalized
  // ...
}
```

**Benefits:**
- Single normalization point
- Consistent across all paths
- Type-safe

---

### 2. Use Normalized Data Downstream

**Pattern:**
```typescript
// ❌ Don't use original events after validation
const events = rawBatch.events;
const storedEvents = events.map(transform);

// ✅ Use normalized events from validation
const normalizedEvents = validationResult.data.events;
const storedEvents = normalizedEvents.map(transform);
```

**Benefits:**
- Ensures canonicalization applied
- Prevents storage of non-canonical data

---

### 3. Raw Batches vs Operational Storage

**Raw batches:**
- Immutable audit trail
- Store exactly what client sent
- May contain legacy formats

**Operational storage:**
- Queryable, indexed
- Always canonical format
- Normalized during processing

---

## Conclusion

**Root cause:** Express middleware and processor handler not using normalized events from validation

**Solution:**
1. Express middleware uses `createValidateIngestRequestEnvelope`
2. Processor handler uses normalized events from `validationResult.data.events`
3. All ingestion paths now canonicalize sessionId

**Impact:**
- ✅ Consistent storage across all platforms
- ✅ Session filtering works reliably
- ✅ Backward compatible with legacy clients
- ✅ Forward compatible with modern clients

**Status:** Production-ready ✅
