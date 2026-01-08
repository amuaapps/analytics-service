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
 * Adapter interfaces have been moved to src/infra/interfaces.ts
 * 
 * Use these canonical ports:
 * - QueuePublisher (was QueueAdapter)
 * - EventRepository (was OperationalStorageAdapter)
 * - RawEventStore (was RawStorageAdapter)
 * 
 * @deprecated Import from '../../infra/interfaces.js' instead
 */
