import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { CoreProcessorRequest, CoreProcessorResponse } from './types.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import type { IngestEvent } from '../../domain/ingest-types.js';
import type { EventRepository, RawEventStore } from '../../infra/interfaces.js';
import { createValidateIngestRequestEnvelope } from '../../domain/validation.js';
import type { LimitsConfig } from '../../config/types.js';

export interface ProcessorHandlerDependencies {
  logger: Logger;
  operationalStorage: EventRepository;
  rawStorage: RawEventStore;
  limits: LimitsConfig;
}

function transformToStoredEvent(
  event: IngestEvent,
  metadata: { receivedAt: string; processedAt: string }
): StoredEvent {
  const base = {
    ...event,
    receivedAt: metadata.receivedAt,
    processedAt: metadata.processedAt,
  };

  return base as StoredEvent;
}

export async function handleProcessor(
  request: CoreProcessorRequest,
  deps: ProcessorHandlerDependencies
): Promise<CoreProcessorResponse> {
  const { requestId, batchId, receivedAt, storageLocation } = request;
  const { logger, operationalStorage, rawStorage, limits } = deps;

  const batchLogger = createChildLogger(logger, {
    requestId,
    batchId,
    storageLocation,
  });

  batchLogger.info('Processing batch - fetching from storage');

  // Step 1: Fetch raw batch from storage using pointer
  let rawBatch;
  try {
    rawBatch = await rawStorage.getRawBatch({
      batchId,
      storageLocation,
    });
    
    batchLogger.info(
      { eventCount: rawBatch.events.length },
      'Raw batch fetched successfully'
    );
  } catch (error) {
    batchLogger.error(
      { err: error, storageLocation },
      'Failed to fetch raw batch from storage'
    );
    return {
      processed: 0,
      failed: 0,
      errors: [{ 
        eventId: 'batch', 
        error: `Failed to fetch raw batch: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }],
    };
  }

  const events = rawBatch.events;
  const eventIds = events.map((e) => e.eventId);

  // Update logger with event details
  const enrichedLogger = createChildLogger(batchLogger, {
    eventIds,
    eventCount: events.length,
  });

  const validateIngestRequestEnvelope = createValidateIngestRequestEnvelope(limits);

  enrichedLogger.info({ eventCount: events.length }, 'Validating batch');

  // Defensive validation - do not assume ingest validated
  const validationResult = validateIngestRequestEnvelope({ schemaVersion: '1.0.0', events });
  
  if (!validationResult.success) {
    // Poison message - log structured warning and reject without processing
    enrichedLogger.warn(
      {
        validationErrors: validationResult.error.issues,
        eventCount: events.length,
        batchId,
      },
      'Batch failed validation - treating as poison message'
    );
    
    return {
      processed: 0,
      failed: events.length,
      errors: [{ 
        eventId: 'batch', 
        error: `Validation failed: ${validationResult.error.issues[0]?.message || 'Invalid batch format'}` 
      }],
    };
  }

  // Use receivedAt from the pointer message (set during ingest)
  const processedAt = new Date().toISOString();

  // Check for duplicates (idempotency)
  const duplicateChecks = await Promise.allSettled(
    events.map((event) => operationalStorage.checkEventExists(event.eventId))
  );

  const newEvents: typeof events = [];
  const skippedEvents: Array<{ eventId: string; reason: string }> = [];

  events.forEach((event, index) => {
    const checkResult = duplicateChecks[index];
    if (checkResult.status === 'fulfilled' && checkResult.value === true) {
      skippedEvents.push({
        eventId: event.eventId,
        reason: 'Duplicate event (already processed)',
      });
      enrichedLogger.debug({ eventId: event.eventId }, 'Skipping duplicate event');
    } else {
      newEvents.push(event);
    }
  });

  if (newEvents.length === 0) {
    enrichedLogger.info('All events were duplicates, skipping batch');
    return {
      processed: 0,
      failed: 0,
    };
  }

  const storedEvents: StoredEvent[] = newEvents.map((event) =>
    transformToStoredEvent(event, { receivedAt, processedAt })
  );

  const results = {
    processed: 0,
    failed: 0,
    errors: [] as Array<{ eventId: string; error: string }>,
  };

  // Note: Raw batch was already stored in ingest path before enqueuing
  // We only write to operational storage (queryable) here

  // Write to operational storage (queryable)
  try {
    await operationalStorage.storeEvents(storedEvents);
    results.processed = newEvents.length;
    enrichedLogger.info({ processed: results.processed }, 'Batch processed successfully');
  } catch (error) {
    enrichedLogger.error({ err: error }, 'Failed to store events in operational storage');
    results.failed = newEvents.length;
    results.errors = newEvents.map((event) => ({
      eventId: event.eventId,
      error: error instanceof Error ? error.message : 'Operational storage failed',
    }));
  }

  return results;
}
