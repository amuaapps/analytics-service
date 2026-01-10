import type { Logger } from '../../utils/logger.js';
import { generateBatchId, createChildLogger } from '../../utils/index.js';
import type { CoreIngestRequest, CoreIngestResponse } from './types.js';
import type { QueuePublisher, RawEventStore } from '../../infra/interfaces.js';

export interface IngestHandlerDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
  rawStorage: RawEventStore;
}

export async function handleIngest(
  request: CoreIngestRequest,
  deps: IngestHandlerDependencies
): Promise<CoreIngestResponse> {
  const { requestId, payload } = request;
  const { logger, queueAdapter, rawStorage } = deps;

  const requestLogger = createChildLogger(logger, {
    requestId,
    eventCount: payload.events.length,
    schemaVersion: payload.schemaVersion,
  });

  requestLogger.info('Processing ingest request');

  const batchId = generateBatchId();
  const eventIds = payload.events.map((event) => event.eventId);
  const receivedAt = new Date().toISOString();

  const batchLogger = createChildLogger(requestLogger, {
    batchId,
    eventIds,
  });

  try {
    // Step 1: Store raw batch in immutable storage (S3/Blob)
    batchLogger.info('Storing raw batch in immutable storage');
    
    const pointer = await rawStorage.storeRawBatch({
      batchId,
      requestId,
      receivedAt,
      events: payload.events,
    });

    batchLogger.info(
      { storageLocation: pointer.storageLocation },
      'Raw batch stored successfully'
    );

    // Step 2: Enqueue lightweight pointer message
    batchLogger.info('Enqueuing pointer message for processing');

    await queueAdapter.enqueue({
      requestId,
      batchId,
      receivedAt,
      storageLocation: pointer.storageLocation,
    });

    batchLogger.info('Pointer message enqueued successfully');

    return {
      accepted: true,
      eventCount: payload.events.length,
      batchId,
    };
  } catch (error) {
    batchLogger.error({ err: error }, 'Failed to process ingest request');
    throw error;
  }
}
