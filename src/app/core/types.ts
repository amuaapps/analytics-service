import type { IngestRequestEnvelope } from '../../domain/ingest-types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';

export interface CoreIngestRequest {
  requestId: string;
  payload: IngestRequestEnvelope;
}

export interface CoreIngestResponse {
  accepted: boolean;
  eventCount: number;
  batchId: string;
}

export interface CoreQueryRequest {
  requestId: string;
  input: QueryEventsInput;
}

export interface CoreQueryResponse {
  events: StoredEvent[];
  cursor?: string;
  hasMore: boolean;
}

export interface CoreProcessorRequest {
  requestId: string;
  batchId: string;
  events: IngestRequestEnvelope['events'];
}

export interface CoreProcessorResponse {
  processed: number;
  failed: number;
  errors?: Array<{ eventId: string; error: string }>;
}

/**
 * QueueAdapter interface for message enqueueing
 */
export interface QueueAdapter {
  enqueue(message: { requestId: string; batchId: string; events: IngestRequestEnvelope['events'] }): Promise<void>;
}

/**
 * OperationalStorageAdapter interface for queryable storage
 */
export interface OperationalStorageAdapter {
  storeEvents(events: StoredEvent[]): Promise<void>;
  queryEvents(input: QueryEventsInput): Promise<CoreQueryResponse>;
  checkEventExists(eventId: string): Promise<boolean>;
}

/**
 * RawStorageAdapter interface for immutable storage
 */
export interface RawStorageAdapter {
  storeRawBatch(batch: { batchId: string; requestId: string; receivedAt: string; events: IngestRequestEnvelope['events'] }): Promise<void>;
}
