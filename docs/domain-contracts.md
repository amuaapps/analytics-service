# Domain Contracts Documentation

**Version:** 1.0.0  
**Status:** Implemented  
**Last Updated:** 2026-01-07

## Overview

This document describes the TypeScript domain contracts implemented for the Analytics Service, matching the Analytics Microservice Contract & Storage Specification v1.0.0.

## File Structure

```
src/domain/
├── base-types.ts              # Shared base types and enums
├── ingest-types.ts            # Ingest API request/response types
├── stored-event-types.ts      # Canonical stored event records
├── query-types.ts             # Query API input/output types
├── validation.ts              # Zod schemas for runtime validation
├── types.ts                   # Consolidated exports
└── index.ts                   # Public API
```

## Base Types (`base-types.ts`)

### Constants
- `SCHEMA_VERSION = '1.0.0'` - Current schema version

### Enums
- `EventType`: `'track' | 'page' | 'identify'`
- `Platform`: `'web' | 'ios' | 'android' | 'server'`
- `Environment`: `'dev' | 'staging' | 'prod'`
- `SortOrder`: `'asc' | 'desc'`

### Shared Interfaces
- `Source` - Application source metadata
- `Actor` - User/session identification (requires userId OR anonymousId)
- `Context` - Optional runtime context (page, locale, device, etc.)
- `Consent` - Analytics consent tracking

## Ingest API Types (`ingest-types.ts`)

### Request Types
- `IngestRequestEnvelope` - Top-level request wrapper
  - `schemaVersion: string` (must be "1.0.0")
  - `sentAt?: string` (ISO 8601)
  - `events: IngestEvent[]` (1-50 events)

### Event Types (Discriminated Union)
- `TrackEvent` - Custom events with name and properties
- `PageEvent` - Page/screen views with name and properties
- `IdentifyEvent` - User trait updates with traits object

All events share:
- `schemaVersion`, `eventId`, `type`, `occurredAt`
- `source`, `actor`, `context?`, `consent?`

### Response Types
- `IngestResponse` - Success response with event count
- `IngestErrorResponse` - Error details

## Stored Event Types (`stored-event-types.ts`)

### Canonical Event Records
Same structure as ingest events but with added:
- `receivedAt: string` - Server timestamp when event was processed

### Event Types
- `StoredTrackEvent`
- `StoredPageEvent`
- `StoredIdentifyEvent`
- `StoredEvent` - Union type

### Internal Metadata
- `InternalMetadata` - Database-specific fields (NOT exposed via API)
  - Partition keys (`pk`, `sk`)
  - GSI keys (`gsi1pk`, `gsi1sk`, `gsi2pk`, `gsi2sk`)
  - `occurredAtEpochMs` - Numeric timestamp for sorting
  - `expiresAt` - TTL timestamp

- `StoredEventWithMetadata` - Intersection type for internal use

## Query API Types (`query-types.ts`)

### Input
- `QueryEventsInput` - Query parameters
  - Required: `appId`, `from`
  - Optional: `to`, `types`, `names`, `userId`, `anonymousId`, `sessionId`, `limit`, `cursor`, `sort`

### Output
- `QueryEventsResponse` - Paginated results
  - `items: StoredEvent[]` - Array of canonical events (without internal metadata)
  - `nextCursor?: string` - Opaque pagination cursor

### Pagination
- `PaginationCursor` - Internal cursor structure (pk/sk)

## Validation (`validation.ts`)

### Zod Schemas
All validation schemas enforce spec requirements:

#### `ingestEventSchema`
Validates individual events with:
- Event name pattern: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$`
- Property key pattern: same as event names, no leading underscore
- Max property depth: 3 levels
- Max keys per level: 50
- Max string length: 2,048 characters
- Max array length: 100 items

#### `ingestRequestEnvelopeSchema`
Validates request envelope with:
- Schema version must be "1.0.0"
- Events array: 1-50 events
- Total payload size: ≤32 KB

#### `queryEventsInputSchema`
Validates query parameters with:
- Required fields: `appId`, `from`
- Limit: 1-200 (default 50)
- ISO 8601 datetime validation
- Event type and name pattern validation

### Validation Constants
Exported as `VALIDATION_CONSTANTS`:
- `MAX_EVENTS_PER_BATCH = 50`
- `MIN_EVENTS_PER_BATCH = 1`
- `MAX_PROPERTY_DEPTH = 3`
- `MAX_KEYS_PER_LEVEL = 50`
- `MAX_STRING_LENGTH = 2048`
- `MAX_ARRAY_LENGTH = 100`
- `MAX_PAYLOAD_SIZE_BYTES = 32768`

## Type Safety Features

### Discriminated Unions
Event types use TypeScript discriminated unions on the `type` field, enabling:
- Exhaustive type checking
- Automatic type narrowing
- Compile-time validation of event-specific fields

### Strict Typing
- No `any` types used
- All optional fields explicitly marked with `?`
- Union types for enums instead of string literals
- Readonly where appropriate

### Runtime Validation
- Zod schemas provide runtime type checking at API boundaries
- Validation errors include detailed messages
- Safe parsing with `.safeParse()` returns success/error discriminated union

## Separation of Concerns

### API-Facing Types
Located in `ingest-types.ts` and `query-types.ts`:
- Used for HTTP request/response contracts
- No internal implementation details
- Stable across versions (backward compatible)

### Internal Types
Located in `stored-event-types.ts`:
- `InternalMetadata` - Database-specific fields
- `StoredEventWithMetadata` - Full record with internal fields
- Never exposed via API responses

### Clear Boundaries
- Ingest → Storage: Add `receivedAt` timestamp
- Storage → Query: Remove internal metadata before returning
- Validation happens at boundaries (HTTP layer)

## Usage Examples

### Validating Ingest Request
```typescript
import { ingestRequestEnvelopeSchema } from './domain';

const result = ingestRequestEnvelopeSchema.safeParse(requestBody);
if (!result.success) {
  // Handle validation errors
  return { status: 400, errors: result.error.issues };
}
// Use validated data
const validatedRequest = result.data;
```

### Type-Safe Event Handling
```typescript
import type { IngestEvent } from './domain';

function processEvent(event: IngestEvent) {
  switch (event.type) {
    case 'track':
      // TypeScript knows event.name and event.properties exist
      return processTrackEvent(event);
    case 'page':
      // TypeScript knows event.name and event.properties exist
      return processPageEvent(event);
    case 'identify':
      // TypeScript knows event.traits exists
      return processIdentifyEvent(event);
  }
}
```

### Converting to Stored Event
```typescript
import type { IngestEvent, StoredEvent } from './domain';

function toStoredEvent(ingestEvent: IngestEvent, receivedAt: string): StoredEvent {
  return {
    ...ingestEvent,
    receivedAt,
  };
}
```

## Testing

Comprehensive unit tests in `tests/unit/domain/validation.test.ts` cover:
- ✅ Valid event validation for all types
- ✅ Invalid event rejection (name patterns, property rules)
- ✅ Actor validation (userId/anonymousId requirements)
- ✅ Property depth and size limits
- ✅ Batch size limits
- ✅ Schema version enforcement
- ✅ Query parameter validation

**Test Results:** 22 tests passing

## Compliance

This implementation fully complies with:
- Analytics Microservice Contract & Storage Specification v1.0.0
- Amua Apps Coding Standards (agents.md)
  - TypeScript strict mode enabled
  - No `any` types
  - Runtime validation at boundaries
  - Clear separation of concerns
  - Comprehensive test coverage
