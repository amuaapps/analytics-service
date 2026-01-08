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

export interface QueueAdapter {
  enqueue(message: CoreProcessorRequest): Promise<void>;
}

export interface StorageAdapter {
  storeEvents(events: StoredEvent[]): Promise<void>;
  queryEvents(input: QueryEventsInput): Promise<CoreQueryResponse>;
}
