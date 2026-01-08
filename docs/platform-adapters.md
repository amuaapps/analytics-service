# Platform Adapters Documentation

**Version:** 1.0.0  
**Status:** Implemented  
**Last Updated:** 2026-01-08

## Overview

The platform adapters module implements cloud-agnostic core business logic with thin wrappers for AWS Lambda and Azure Functions. This architecture ensures business logic is testable without cloud runtimes and enables multi-cloud deployment.

## Architecture Principles

### Separation of Concerns

**Core Layer (Platform-Agnostic)**
- Contains all business logic
- No dependencies on AWS or Azure SDKs
- Testable with simple mocks
- Reusable across cloud providers

**Adapter Layer (Cloud-Specific)**
- Thin translation layer
- Converts cloud event formats to core types
- Converts core responses to cloud response formats
- Minimal logic - only format translation

### Dependency Injection

Core handlers accept dependencies via interfaces:
- `QueueAdapter` - For enqueueing messages
- `StorageAdapter` - For storing and querying events
- `Logger` - For structured logging

This enables:
- Easy testing with mocks
- Swapping implementations without changing core logic
- Cloud-specific adapters implement these interfaces

## File Structure

```
src/app/
├── core/                      # Platform-agnostic business logic
│   ├── types.ts              # Core request/response types and adapter interfaces
│   ├── ingest-handler.ts     # Ingest business logic
│   ├── query-handler.ts      # Query business logic
│   ├── processor-handler.ts  # Event processing logic
│   └── index.ts              # Public API exports
├── aws/                       # AWS Lambda wrappers
│   ├── lambda-http-ingest.ts # HTTP API Gateway → Core ingest
│   ├── lambda-sqs-processor.ts # SQS trigger → Core processor
│   └── index.ts              # Public API exports
└── azure/                     # Azure Functions wrappers
    ├── function-http-ingest.ts # HTTP trigger → Core ingest
    ├── function-queue-processor.ts # Queue trigger → Core processor
    └── index.ts              # Public API exports

tests/unit/app/core/
├── ingest-handler.test.ts    # 5 tests - Core ingest logic
├── query-handler.test.ts     # 6 tests - Core query logic
└── processor-handler.test.ts # 5 tests - Core processor logic
```

## Core Handlers

### Ingest Handler

**Purpose:** Accept validated events and enqueue them for processing.

**Interface:**
```typescript
interface IngestHandlerDependencies {
  logger: Logger;
  queueAdapter: QueueAdapter;
}

async function handleIngest(
  request: CoreIngestRequest,
  deps: IngestHandlerDependencies
): Promise<CoreIngestResponse>
```

**Request:**
```typescript
interface CoreIngestRequest {
  requestId: string;
  payload: IngestRequestEnvelope; // Already validated
}
```

**Response:**
```typescript
interface CoreIngestResponse {
  accepted: boolean;
  eventCount: number;
  batchId: string;
}
```

**Logic:**
1. Generate unique batch ID
2. Extract event IDs for correlation
3. Enqueue batch for async processing
4. Return acceptance response

**No cloud dependencies** - Works with any queue implementation.

### Query Handler

**Purpose:** Query stored events based on filters.

**Interface:**
```typescript
interface QueryHandlerDependencies {
  logger: Logger;
  storageAdapter: StorageAdapter;
}

async function handleQuery(
  request: CoreQueryRequest,
  deps: QueryHandlerDependencies
): Promise<CoreQueryResponse>
```

**Request:**
```typescript
interface CoreQueryRequest {
  requestId: string;
  input: QueryEventsInput;
}
```

**Response:**
```typescript
interface CoreQueryResponse {
  events: StoredEvent[];
  cursor?: string;
  hasMore: boolean;
}
```

**Logic:**
1. Delegate to storage adapter
2. Return results with pagination info

**No cloud dependencies** - Works with any storage implementation.

### Processor Handler

**Purpose:** Transform and store events from queue.

**Interface:**
```typescript
interface ProcessorHandlerDependencies {
  logger: Logger;
  storageAdapter: StorageAdapter;
}

async function handleProcessor(
  request: CoreProcessorRequest,
  deps: ProcessorHandlerDependencies
): Promise<CoreProcessorResponse>
```

**Request:**
```typescript
interface CoreProcessorRequest {
  requestId: string;
  batchId: string;
  events: IngestRequestEnvelope['events'];
}
```

**Response:**
```typescript
interface CoreProcessorResponse {
  processed: number;
  failed: number;
  errors?: Array<{ eventId: string; error: string }>;
}
```

**Logic:**
1. Add `receivedAt` and `processedAt` timestamps
2. Transform to `StoredEvent` format
3. Store via storage adapter
4. Return processing results

**No cloud dependencies** - Works with any storage implementation.

## Adapter Interfaces

### QueueAdapter

```typescript
interface QueueAdapter {
  enqueue(message: CoreProcessorRequest): Promise<void>;
}
```

**Implementations:**
- AWS: SQS client
- Azure: Queue Storage or Service Bus client
- Local: In-memory queue for testing

### StorageAdapter

```typescript
interface StorageAdapter {
  storeEvents(events: StoredEvent[]): Promise<void>;
  queryEvents(input: QueryEventsInput): Promise<CoreQueryResponse>;
}
```

**Implementations:**
- AWS: DynamoDB client
- Azure: Cosmos DB client
- Local: In-memory store for testing

## AWS Lambda Wrappers

### HTTP Ingest Wrapper

**File:** `src/app/aws/lambda-http-ingest.ts`

**Purpose:** Translate API Gateway events to core requests.

**Translation Logic:**
```typescript
// Extract request ID from header or generate
const requestId = getOrGenerateRequestId(event.headers['x-request-id']);

// Parse JSON body
const payload = JSON.parse(event.body);

// Create core request
const coreRequest: CoreIngestRequest = { requestId, payload };

// Call core handler
const result = await handleIngest(coreRequest, deps);

// Translate to API Gateway response
return {
  statusCode: 202,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accepted: result.accepted, eventCount: result.eventCount }),
};
```

**Error Handling:**
- Catches all errors
- Logs with AWS request ID
- Returns 500 with sanitized error message

### SQS Processor Wrapper

**File:** `src/app/aws/lambda-sqs-processor.ts`

**Purpose:** Translate SQS events to core requests.

**Translation Logic:**
```typescript
// Parse SQS message body
const coreRequest: CoreProcessorRequest = JSON.parse(record.body);

// Call core handler
const result = await handleProcessor(coreRequest, deps);

// Log failures (SQS handles retries)
if (result.failed > 0) {
  logger.error({ failed: result.failed, errors: result.errors });
}
```

**Error Handling:**
- Throws on parse errors (triggers SQS retry)
- Logs processing failures
- SQS DLQ handles repeated failures

## Azure Functions Wrappers

### HTTP Ingest Wrapper

**File:** `src/app/azure/function-http-ingest.ts`

**Purpose:** Translate Azure HTTP requests to core requests.

**Translation Logic:**
```typescript
// Extract request ID from header or generate
const requestId = getOrGenerateRequestId(request.headers.get('x-request-id'));

// Parse JSON body (async in Azure)
const body = await request.text();
const payload = JSON.parse(body);

// Create core request
const coreRequest: CoreIngestRequest = { requestId, payload };

// Call core handler
const result = await handleIngest(coreRequest, deps);

// Translate to Azure HTTP response
return {
  status: 202,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accepted: result.accepted, eventCount: result.eventCount }),
};
```

**Error Handling:**
- Catches all errors
- Logs with Azure invocation ID
- Returns 500 with sanitized error message

### Queue Processor Wrapper

**File:** `src/app/azure/function-queue-processor.ts`

**Purpose:** Translate Azure Queue messages to core requests.

**Translation Logic:**
```typescript
// Parse queue message (can be string or object)
const coreRequest: CoreProcessorRequest = 
  typeof queueItem === 'string' ? JSON.parse(queueItem) : queueItem;

// Call core handler
const result = await handleProcessor(coreRequest, deps);

// Log failures (Azure handles retries)
if (result.failed > 0) {
  logger.error({ failed: result.failed, errors: result.errors });
}
```

**Error Handling:**
- Throws on parse errors (triggers Azure retry)
- Logs processing failures
- Azure poison queue handles repeated failures

## Testing Strategy

### Core Handler Tests

**No cloud runtimes required** - Tests use simple mocks:

```typescript
const mockQueueAdapter: jest.Mocked<QueueAdapter> = {
  enqueue: jest.fn<(message: CoreProcessorRequest) => Promise<void>>()
    .mockResolvedValue(undefined),
};

const mockStorageAdapter: jest.Mocked<StorageAdapter> = {
  storeEvents: jest.fn<(events: StoredEvent[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  queryEvents: jest.fn<(input: QueryEventsInput) => Promise<CoreQueryResponse>>()
    .mockResolvedValue({ events: [], hasMore: false }),
};
```

**Test Coverage:**
- ✅ 5 ingest handler tests
- ✅ 6 query handler tests
- ✅ 5 processor handler tests
- ✅ **16 total tests - All passing**

**What's Tested:**
- Happy path scenarios
- Error handling
- Batch processing
- Unique ID generation
- Correlation context
- Pagination
- Filtering
- Timestamp addition

### Wrapper Tests

Wrappers are thin translation layers - integration tests will verify:
- Event format translation
- Error response formatting
- Request ID propagation

## Usage Examples

### AWS Lambda Ingest

```typescript
import { createLambdaIngestHandler } from './app/aws';
import { createLogger } from './utils/logger';
import { SQSQueueAdapter } from './infra/aws/sqs-adapter';
import { loadConfig } from './config';

const config = loadConfig();
const logger = createLogger({
  serviceName: config.service.serviceName,
  level: config.service.logLevel,
  env: config.service.env,
});

const queueAdapter = new SQSQueueAdapter({
  queueUrl: config.aws.sqsQueueUrl,
  region: config.aws.region,
});

export const handler = createLambdaIngestHandler({
  logger,
  queueAdapter,
});
```

### Azure Function Ingest

```typescript
import { app } from '@azure/functions';
import { createAzureFunctionIngestHandler } from './app/azure';
import { createLogger } from './utils/logger';
import { QueueStorageAdapter } from './infra/azure/queue-adapter';
import { loadConfig } from './config';

const config = loadConfig();
const logger = createLogger({
  serviceName: config.service.serviceName,
  level: config.service.logLevel,
  env: config.service.env,
});

const queueAdapter = new QueueStorageAdapter({
  connectionString: config.azure.storageConnectionString,
  queueName: 'analytics-events',
});

const handler = createAzureFunctionIngestHandler({
  logger,
  queueAdapter,
});

app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler,
});
```

## Benefits

### Testability

**Core logic tested without cloud SDKs:**
- Fast test execution
- No AWS/Azure credentials needed
- No network calls
- Deterministic results

**145 tests passing** - Including 16 core handler tests with zero cloud dependencies.

### Portability

**Easy to add new cloud providers:**
1. Implement adapter interfaces
2. Create thin wrapper for cloud event format
3. Core logic unchanged

**Example:** Adding GCP Cloud Functions:
- Implement `PubSubQueueAdapter`
- Implement `FirestoreStorageAdapter`
- Create `function-http-ingest.ts` wrapper
- Core handlers work unchanged

### Maintainability

**Business logic changes in one place:**
- Update core handler
- All cloud wrappers benefit
- Tests remain valid

**Cloud-specific changes isolated:**
- Update wrapper only
- Core logic unchanged
- Other clouds unaffected

### Compliance

Fully compliant with Amua Apps Coding Standards (agents.md):
- ✅ MACH principles (Microservices, API-first, Cloud-native, Headless)
- ✅ Component independence
- ✅ Loose coupling, strong contracts (adapter interfaces)
- ✅ Secure by design (fail closed, no secrets)
- ✅ Automation & testability (16 core tests, no cloud runtimes)
- ✅ TypeScript strict mode
- ✅ Multi-cloud infrastructure support (AWS + Azure)

## Next Steps

To complete the implementation:

1. **Implement Adapter Interfaces:**
   - AWS: SQS queue adapter, DynamoDB storage adapter
   - Azure: Queue Storage adapter, Cosmos DB storage adapter

2. **Create Infrastructure:**
   - `infra/aws/` - Terraform for Lambda, SQS, DynamoDB
   - `infra/azure/` - Bicep for Functions, Queue, Cosmos DB

3. **Integration Tests:**
   - Test wrappers with real cloud events
   - Test end-to-end flows
   - Test error scenarios

4. **Deployment:**
   - GitHub Actions workflows
   - Environment-specific configurations
   - Monitoring and alerting
