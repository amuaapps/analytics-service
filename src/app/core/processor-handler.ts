import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import type { CoreProcessorRequest, CoreProcessorResponse, StorageAdapter } from './types.js';

export interface ProcessorHandlerDependencies {
  logger: Logger;
  storageAdapter: StorageAdapter;
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
  const { logger, storageAdapter } = deps;

  const eventIds = events.map((e) => e.eventId);

  const batchLogger = createChildLogger(logger, {
    requestId,
    batchId,
    eventIds,
    eventCount: events.length,
  });

  batchLogger.info('Processing event batch');

  const receivedAt = new Date().toISOString();
  const processedAt = new Date().toISOString();

  const storedEvents: StoredEvent[] = events.map((event) =>
    transformToStoredEvent(event, { receivedAt, processedAt })
  );

  try {
    await storageAdapter.storeEvents(storedEvents);

    batchLogger.info('Batch processed successfully');

    return {
      processed: events.length,
      failed: 0,
    };
  } catch (error) {
    batchLogger.error({ err: error }, 'Failed to process batch');

    return {
      processed: 0,
      failed: events.length,
      errors: events.map((event) => ({
        eventId: event.eventId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
    };
  }
}
