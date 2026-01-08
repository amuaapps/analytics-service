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
   */
  storeRawBatch(batch: RawBatch): Promise<void>;
}

export interface RawBatch {
  batchId: string;
  requestId: string;
  receivedAt: string;
  events: IngestRequestEnvelope['events'];
}

/**
 * QueuePublisher: Message queue for async processing
 * Implementations: SQS (AWS), Storage Queue (Azure)
 */
export interface QueuePublisher {
  /**
   * Enqueue a batch for processing
   * @param batch - Batch to enqueue
   */
  enqueue(batch: QueueMessage): Promise<void>;
}

export interface QueueMessage {
  requestId: string;
  batchId: string;
  events: IngestRequestEnvelope['events'];
}
