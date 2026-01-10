import type { StoredEvent } from '../domain/stored-event-types.js';
import type { QueryEventsInput } from '../domain/query-types.js';
import type { IngestRequestEnvelope } from '../domain/ingest-types.js';

/**
 * EventRepository: Operational storage for queryable events
 * Implementations: DynamoDB (AWS), Cosmos DB (Azure)
 */
export interface EventRepository {
  /**
   * Store events in operational storage
   * @param events - Array of stored events to persist
   */
  storeEvents(events: StoredEvent[]): Promise<void>;

  /**
   * Query events from operational storage
   * @param input - Query parameters (filters, pagination, etc.)
   * @returns Paginated query results
   */
  queryEvents(input: QueryEventsInput): Promise<QueryEventsResult>;

  /**
   * Check if an event already exists (for idempotency)
   * @param eventId - Event ID to check
   * @returns true if event exists, false otherwise
   */
  checkEventExists(eventId: string): Promise<boolean>;
}

export interface QueryEventsResult {
  events: StoredEvent[];
  hasMore: boolean;
  cursor?: string;
}

/**
 * RawEventStore: Immutable storage for audit trail
 * Implementations: S3 (AWS), Blob Storage (Azure)
 */
export interface RawEventStore {
  /**
   * Store raw batch in immutable storage
   * @param batch - Raw batch metadata and events
   * @returns Storage location reference (key/blob name)
   */
  storeRawBatch(batch: RawBatch): Promise<RawBatchPointer>;

  /**
   * Retrieve raw batch from immutable storage
   * @param pointer - Storage location reference
   * @returns Raw batch data
   */
  getRawBatch(pointer: RawBatchPointer): Promise<RawBatch>;
}

export interface RawBatch {
  batchId: string;
  requestId: string;
  receivedAt: string;
  events: IngestRequestEnvelope['events'];
}

export interface RawBatchPointer {
  batchId: string;
  storageLocation: string; // S3 key or Azure blob name
}

/**
 * QueuePublisher: Message queue for async processing
 * Implementations: SQS (AWS), Storage Queue (Azure)
 */
export interface QueuePublisher {
  /**
   * Enqueue a batch for processing
   * @param message - Pointer message to enqueue
   */
  enqueue(message: QueueMessage): Promise<void>;
}

/**
 * QueueMessage: Lightweight pointer to raw batch in storage
 * This design keeps queue messages small (<256KB) to work within
 * SQS (256KB) and Azure Queue (64KB) limits
 */
export interface QueueMessage {
  requestId: string;
  batchId: string;
  receivedAt: string;
  storageLocation: string; // S3 key or Azure blob name
}
