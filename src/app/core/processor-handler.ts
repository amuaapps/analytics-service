import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { CoreProcessorRequest, CoreProcessorResponse } from './types.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
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
  event: CoreProcessorRequest['events'][0],
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
  const { requestId, batchId, events } = request;
  const { logger, operationalStorage, rawStorage, limits } = deps;

  const eventIds = events.map((e) => e.eventId);

  const batchLogger = createChildLogger(logger, {
    requestId,
    batchId,
    eventIds,
    eventCount: events.length,
  });
  const validateIngestRequestEnvelope = createValidateIngestRequestEnvelope(limits);

  batchLogger.info({ eventCount: events.length }, 'Processing batch');

  // Defensive validation - do not assume ingest validated
  try {
    validateIngestRequestEnvelope({ schemaVersion: '1.0.0', events });
  } catch (error) {
    batchLogger.error({ err: error }, 'Batch failed validation');
    return {
      processed: 0,
      failed: events.length,
      errors: [{ eventId: 'batch', error: 'Batch validation failed' }],
    };
  }

  const receivedAt = new Date().toISOString();
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
      batchLogger.debug({ eventId: event.eventId }, 'Skipping duplicate event');
    } else {
      newEvents.push(event);
    }
  });

  if (newEvents.length === 0) {
    batchLogger.info('All events were duplicates, skipping batch');
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

  // Write to raw storage (immutable, always succeeds or throws)
  try {
    // RawBatch type only includes: batchId, requestId, receivedAt, events
    const rawBatch = {
      batchId,
      requestId,
      receivedAt,
      events: newEvents,
    };

    await rawStorage.storeRawBatch(rawBatch);
    batchLogger.debug('Raw batch stored successfully');
  } catch (error) {
    batchLogger.error({ err: error }, 'Failed to store raw batch');
    // Raw storage failure is critical - fail the entire batch
    return {
      processed: 0,
      failed: newEvents.length,
      errors: newEvents.map((event) => ({
        eventId: event.eventId,
        error: error instanceof Error ? error.message : 'Raw storage failed',
      })),
    };
  }

  // Write to operational storage (queryable)
  try {
    await operationalStorage.storeEvents(storedEvents);
    results.processed = newEvents.length;
    batchLogger.info({ processed: results.processed }, 'Batch processed successfully');
  } catch (error) {
    batchLogger.error({ err: error }, 'Failed to store events in operational storage');
    results.failed = newEvents.length;
    results.errors = newEvents.map((event) => ({
      eventId: event.eventId,
      error: error instanceof Error ? error.message : 'Operational storage failed',
    }));
  }

  return results;
}
