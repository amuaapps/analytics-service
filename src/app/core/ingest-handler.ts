import type { Logger } from '../../utils/logger.js';
import { generateBatchId, createChildLogger } from '../../utils/index.js';
import type { CoreIngestRequest, CoreIngestResponse } from './types.js';
import type { QueuePublisher } from '../../infra/interfaces.js';

export interface IngestHandlerDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
}

export async function handleIngest(
  request: CoreIngestRequest,
  deps: IngestHandlerDependencies
): Promise<CoreIngestResponse> {
  const { requestId, payload } = request;
  const { logger, queueAdapter } = deps;

  const requestLogger = createChildLogger(logger, {
    requestId,
    eventCount: payload.events.length,
    schemaVersion: payload.schemaVersion,
  });

  requestLogger.info('Processing ingest request');

  const batchId = generateBatchId();
  const eventIds = payload.events.map((event) => event.eventId);

  const batchLogger = createChildLogger(requestLogger, {
    batchId,
    eventIds,
  });

  try {
    batchLogger.info('Enqueuing events for processing');

    await queueAdapter.enqueue({
      requestId,
      batchId,
      events: payload.events,
    });

    batchLogger.info('Events enqueued successfully');

    return {
      accepted: true,
      eventCount: payload.events.length,
      batchId,
    };
  } catch (error) {
    batchLogger.error({ err: error }, 'Failed to enqueue events');
    throw error;
  }
}
