# Interface Layer Consolidation

This document explains the resolution of the "two interface layers" drift in the Analytics Service.

## Problem

The codebase had two competing interface layers:

### Layer 1: `src/app/core/types.ts`
```typescript
export interface QueueAdapter { ... }
export interface OperationalStorageAdapter { ... }
export interface RawStorageAdapter { ... }
```

### Layer 2: `src/infra/interfaces.ts`
```typescript
export interface QueuePublisher { ... }
export interface EventRepository { ... }
export interface RawEventStore { ... }
```

**Issues:**
- Core handlers used interfaces from `core/types.ts`
- AWS/Azure adapters implemented interfaces from `infra/interfaces.ts`
- This created a mismatch requiring "adapter for adapter" wrappers
- Confusion about which interface set to use
- Drift risk as changes to one layer wouldn't affect the other

## Solution

**Consolidated to `src/infra/interfaces.ts` as the single canonical ports layer.**

### Rationale

1. **Better naming**: `EventRepository` > `OperationalStorageAdapter`
2. **Better documentation**: Infra interfaces have detailed JSDoc comments
3. **Already implemented**: All AWS/Azure adapters already implement these
4. **Cleaner separation**: Infrastructure defines contracts, application uses them
5. **Standard ports & adapters pattern**: Ports belong in infrastructure layer

## Changes Made

### 1. Updated Core Handlers

**Ingest Handler (`src/app/core/ingest-handler.ts`):**
```typescript
// Before
import type { QueueAdapter } from './types.js';

export interface IngestHandlerDependencies {
  queueAdapter: QueueAdapter;
}

// After
import type { QueuePublisher } from '../../infra/interfaces.js';

export interface IngestHandlerDependencies {
  queueAdapter: QueuePublisher;
}
```

**Query Handler (`src/app/core/query-handler.ts`):**
```typescript
// Before
import type { OperationalStorageAdapter } from './types.js';

export interface QueryHandlerDependencies {
  storageAdapter: OperationalStorageAdapter;
}

// After
import type { EventRepository } from '../../infra/interfaces.js';

export interface QueryHandlerDependencies {
  storageAdapter: EventRepository;
}
```

**Processor Handler (`src/app/core/processor-handler.ts`):**
```typescript
// Before
import type { OperationalStorageAdapter, RawStorageAdapter } from './types.js';

export interface ProcessorHandlerDependencies {
  operationalStorage: OperationalStorageAdapter;
  rawStorage: RawStorageAdapter;
}

// After
import type { EventRepository, RawEventStore } from '../../infra/interfaces.js';

export interface ProcessorHandlerDependencies {
  operationalStorage: EventRepository;
  rawStorage: RawEventStore;
}
```

### 2. Updated In-Memory Adapters

**InMemoryQueueAdapter:**
```typescript
// Before
import type { QueueAdapter } from '../../app/core/types.js';

export class InMemoryQueueAdapter implements QueueAdapter {
  enqueue(message: CoreProcessorRequest): Promise<void> { ... }
}

// After
import type { QueuePublisher, QueueMessage } from '../interfaces.js';

export class InMemoryQueueAdapter implements QueuePublisher {
  enqueue(message: QueueMessage): Promise<void> { ... }
}
```

**InMemoryOperationalStorage:**
```typescript
// Before
import type { OperationalStorageAdapter, CoreQueryResponse } from '../../app/core/types.js';

export class InMemoryOperationalStorage implements OperationalStorageAdapter {
  queryEvents(input: QueryEventsInput): Promise<CoreQueryResponse> { ... }
}

// After
import type { EventRepository, QueryEventsResult } from '../interfaces.js';

export class InMemoryOperationalStorage implements EventRepository {
  queryEvents(input: QueryEventsInput): Promise<QueryEventsResult> { ... }
}
```

### 3. Updated All Entrypoints

**AWS Lambda Entrypoints:**
- `lambda-http-ingest.ts`: Uses `QueuePublisher`
- `lambda-http-query.ts`: Uses `EventRepository`
- `lambda-sqs-processor.ts`: Uses `EventRepository`, `RawEventStore`

**Azure Function Entrypoints:**
- `function-http-ingest.ts`: Uses `QueuePublisher`
- `function-queue-processor.ts`: Uses `EventRepository`, `RawEventStore`

**HTTP Server:**
- `server.ts`: Uses `QueuePublisher`, `EventRepository`
- `query-handler.ts`: Uses `EventRepository`

### 4. Removed Old Interfaces from core/types.ts

```typescript
/**
 * Adapter interfaces have been moved to src/infra/interfaces.ts
 * 
 * Use these canonical ports:
 * - QueuePublisher (was QueueAdapter)
 * - EventRepository (was OperationalStorageAdapter)
 * - RawEventStore (was RawStorageAdapter)
 * 
 * @deprecated Import from '../../infra/interfaces.js' instead
 */
```

## Canonical Ports Layer

### Location: `src/infra/interfaces.ts`

**QueuePublisher** - Message queue for async processing
```typescript
export interface QueuePublisher {
  enqueue(batch: QueueMessage): Promise<void>;
}

export interface QueueMessage {
  requestId: string;
  batchId: string;
  events: IngestRequestEnvelope['events'];
}
```

**Implementations:**
- `SQSQueuePublisher` (AWS)
- `AzureQueuePublisher` (Azure)
- `InMemoryQueueAdapter` (Local dev)

---

**EventRepository** - Operational storage for queryable events
```typescript
export interface EventRepository {
  storeEvents(events: StoredEvent[]): Promise<void>;
  queryEvents(input: QueryEventsInput): Promise<QueryEventsResult>;
  checkEventExists(eventId: string): Promise<boolean>;
}

export interface QueryEventsResult {
  events: StoredEvent[];
  hasMore: boolean;
  cursor?: string;
}
```

**Implementations:**
- `DynamoDBEventRepository` (AWS)
- `CosmosEventRepository` (Azure)
- `InMemoryOperationalStorage` (Local dev)

---

**RawEventStore** - Immutable storage for audit trail
```typescript
export interface RawEventStore {
  storeRawBatch(batch: RawBatch): Promise<void>;
}

export interface RawBatch {
  batchId: string;
  requestId: string;
  receivedAt: string;
  events: IngestRequestEnvelope['events'];
}
```

**Implementations:**
- `S3RawEventStore` (AWS)
- `BlobRawEventStore` (Azure)

## Benefits

### ✅ Single Source of Truth
- Only one set of adapter interfaces
- No confusion about which to use
- No drift between duplicate definitions

### ✅ Straightforward Wiring
- Core handlers depend on infra interfaces
- AWS/Azure adapters implement infra interfaces directly
- In-memory adapters implement infra interfaces
- No "adapter for adapter" wrappers needed

### ✅ Better Naming
- `EventRepository` is clearer than `OperationalStorageAdapter`
- `QueuePublisher` is clearer than `QueueAdapter`
- `RawEventStore` is clearer than `RawStorageAdapter`

### ✅ Better Documentation
- Infra interfaces have comprehensive JSDoc comments
- Clear purpose and usage for each interface
- Implementation examples documented

### ✅ Standard Pattern
- Follows ports & adapters (hexagonal) architecture
- Ports defined in infrastructure layer
- Application core depends on ports
- Adapters implement ports

## Migration Guide

### For New Code

Always import from `src/infra/interfaces.ts`:

```typescript
// ✅ Correct
import type { QueuePublisher, EventRepository, RawEventStore } from '../../infra/interfaces.js';

// ❌ Wrong (deprecated)
import type { QueueAdapter, OperationalStorageAdapter, RawStorageAdapter } from '../core/types.js';
```

### For Existing Code

Old imports will show deprecation warnings. Update them:

```typescript
// Before
import type { QueueAdapter } from '../core/types.js';
const queue: QueueAdapter = ...;

// After
import type { QueuePublisher } from '../../infra/interfaces.js';
const queue: QueuePublisher = ...;
```

## Verification

### Check Interface Usage

```bash
# Should return 0 (no old interface usage)
grep -r "QueueAdapter\|OperationalStorageAdapter\|RawStorageAdapter" src/app --exclude="*.md"

# Should show canonical interface usage
grep -r "QueuePublisher\|EventRepository\|RawEventStore" src/app
```

### Check Implementations

```bash
# All adapters should implement canonical interfaces
grep -r "implements.*Repository\|implements.*Publisher\|implements.*Store" src/infra
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Application Core (src/app/core)                             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Ingest       │  │ Query        │  │ Processor    │     │
│  │ Handler      │  │ Handler      │  │ Handler      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         │ depends on       │ depends on       │ depends on  │
│         ↓                  ↓                  ↓              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────┐
│         │                  │                  │               │
│ Canonical Ports (src/infra/interfaces.ts)                    │
│         │                  │                  │               │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐      │
│  │ Queue        │  │ Event        │  │ RawEvent     │      │
│  │ Publisher    │  │ Repository   │  │ Store        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ▲                  ▲                  ▲               │
│         │ implements       │ implements       │ implements   │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼───────────────┐
│         │                  │                  │                │
│ Infrastructure Adapters                                       │
│         │                  │                  │                │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐       │
│  │ AWS:         │  │ AWS:         │  │ AWS:         │       │
│  │ SQSQueue     │  │ DynamoDB     │  │ S3RawEvent   │       │
│  │ Publisher    │  │ EventRepo    │  │ Store        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Azure:       │  │ Azure:       │  │ Azure:       │       │
│  │ AzureQueue   │  │ Cosmos       │  │ BlobRawEvent │       │
│  │ Publisher    │  │ EventRepo    │  │ Store        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ Local:       │  │ Local:       │                          │
│  │ InMemory     │  │ InMemory     │                          │
│  │ Queue        │  │ Operational  │                          │
│  └──────────────┘  └──────────────┘                          │
└───────────────────────────────────────────────────────────────┘
```

## Files Changed

### Core Handlers
- `src/app/core/ingest-handler.ts` - Uses `QueuePublisher`
- `src/app/core/query-handler.ts` - Uses `EventRepository`
- `src/app/core/processor-handler.ts` - Uses `EventRepository`, `RawEventStore`
- `src/app/core/types.ts` - Removed old interfaces, added deprecation notice

### HTTP Layer
- `src/app/http/server.ts` - Uses `QueuePublisher`, `EventRepository`
- `src/app/http/query-handler.ts` - Uses `EventRepository`

### AWS Entrypoints
- `src/app/aws/lambda-http-ingest.ts` - Uses `QueuePublisher`
- `src/app/aws/lambda-http-query.ts` - Uses `EventRepository`
- `src/app/aws/lambda-sqs-processor.ts` - Uses `EventRepository`, `RawEventStore`

### Azure Entrypoints
- `src/app/azure/function-http-ingest.ts` - Uses `QueuePublisher`
- `src/app/azure/function-queue-processor.ts` - Uses `EventRepository`, `RawEventStore`

### In-Memory Adapters
- `src/infra/queue/in-memory-queue-adapter.ts` - Implements `QueuePublisher`
- `src/infra/storage/in-memory-operational-storage.ts` - Implements `EventRepository`

### Local Server
- `src/local-server.ts` - Uses in-memory adapters (now implement canonical interfaces)

## References

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Ports and Adapters Pattern](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
