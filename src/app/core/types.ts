import type { IngestRequestEnvelope } from '../../domain/ingest-types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { ApiEvent } from '../../domain/api-event-types.js';

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
  events: ApiEvent[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * CoreProcessorRequest: Pointer-based message for async processing
 * Contains reference to raw batch in storage, not the full events array
 * This keeps queue messages small (<256KB for SQS, <64KB for Azure Queue)
 */
export interface CoreProcessorRequest {
  requestId: string;
  batchId: string;
  receivedAt: string;
  storageLocation: string; // S3 key or Azure blob name
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
