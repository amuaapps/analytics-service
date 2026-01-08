# Infrastructure Layer

This directory contains cloud-specific implementations behind clean interfaces.

## Interfaces (`interfaces.ts`)

Core business logic depends **only** on these interfaces:

- **`EventRepository`**: Operational storage for queryable events
  - `storeEvents()`: Persist events
  - `queryEvents()`: Query with filters and pagination
  - `checkEventExists()`: Idempotency check

- **`RawEventStore`**: Immutable audit trail storage
  - `storeRawBatch()`: Store raw batch for compliance/debugging

- **`QueuePublisher`**: Async message queue
  - `enqueue()`: Send batch for processing

## AWS Implementations (`aws/`)

### DynamoDB Event Repository
- **Table schema**: 
  - PK: `appId` (partition key)
  - SK: `occurredAt#eventId` (sort key)
  - GSI1: `userId` index for user queries
  - GSI2: `sessionId` index for session queries
- **Features**: Batch writes, efficient time-range queries, cross-partition query support

### S3 Raw Event Store
- **Key structure**: `{prefix}{appId}/{year}/{month}/{day}/{batchId}_{timestamp}.json`
- **Features**: Date-based partitioning, lifecycle policies support, metadata tagging

### SQS Queue Publisher
- **Configuration**: Standard or FIFO queues
- **Features**: Message attributes for filtering, DLQ support, deduplication for FIFO

## Azure Implementations (`azure/`)

### Cosmos DB Event Repository
- **Container schema**:
  - Partition key: `/source/appId`
  - Composite indexes on `occurredAt`, `userId`, `sessionId`
- **Features**: Bulk operations, SQL queries, cross-partition support, TTL

### Blob Storage Raw Event Store
- **Blob structure**: `{prefix}{appId}/{year}/{month}/{day}/{batchId}_{timestamp}.json`
- **Features**: Date-based partitioning, lifecycle management, metadata

### Azure Queue Publisher
- **Queue**: Azure Storage Queue
- **Features**: Base64 encoding, TTL support, poison message handling

## Usage

```typescript
// AWS
import { 
  DynamoDBEventRepository, 
  S3RawEventStore, 
  SQSQueuePublisher 
} from './infra/aws/index.js';

const eventRepo = new DynamoDBEventRepository({
  tableName: 'analytics-events',
  region: 'us-east-1',
  logger,
});

// Azure
import { 
  CosmosEventRepository, 
  BlobRawEventStore, 
  AzureQueuePublisher 
} from './infra/azure/index.js';

const eventRepo = new CosmosEventRepository({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  databaseId: 'analytics',
  containerId: 'events',
  logger,
});
```

## Design Principles

1. **Interface segregation**: Core logic never imports cloud SDKs
2. **Dependency inversion**: Handlers depend on abstractions, not concretions
3. **Single responsibility**: Each adapter does one thing well
4. **Cloud parity**: AWS and Azure implementations are functionally equivalent
