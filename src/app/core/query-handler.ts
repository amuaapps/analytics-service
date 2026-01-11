import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { CoreQueryRequest, CoreQueryResponse } from './types.js';
import type { EventRepository } from '../../infra/interfaces.js';
import { isValidCursor } from '../../utils/cursor.js';
import { mapStoredEventsToApiEvents } from '../../domain/event-mapper.js';

export interface QueryHandlerDependencies {
  logger: Logger;
  storageAdapter: EventRepository;
}

export async function handleQuery(
  request: CoreQueryRequest,
  deps: QueryHandlerDependencies
): Promise<CoreQueryResponse> {
  const { requestId, input } = request;
  const { logger, storageAdapter } = deps;

  const requestLogger = createChildLogger(logger, {
    requestId,
    handler: 'query',
    appId: input.appId,
  });

  requestLogger.info(
    {
      from: input.from,
      to: input.to,
      types: input.types,
      limit: input.limit,
      hasCursor: !!input.cursor,
    },
    'Processing query request'
  );

  try {
    // Validate cursor if provided (but treat as opaque - don't parse)
    if (input.cursor) {
      if (!isValidCursor(input.cursor)) {
        requestLogger.warn({ cursor: input.cursor }, 'Invalid cursor format');
        throw new Error('Invalid pagination cursor');
      }
      requestLogger.debug('Valid pagination cursor provided');
    }

    // Query storage with opaque cursor (adapters handle decoding internally)
    const result = await storageAdapter.queryEvents(input);

    // Map stored events to API events (strip internal DB fields)
    const apiEvents = mapStoredEventsToApiEvents(result.events);

    // Cursor from storage adapter is already in canonical format
    const nextCursor = result.cursor;

    requestLogger.info(
      {
        eventCount: apiEvents.length,
        hasMore: result.hasMore,
        hasNextCursor: !!nextCursor,
      },
      'Query completed successfully'
    );

    return {
      events: apiEvents,
      cursor: nextCursor,
      hasMore: result.hasMore,
    };
  } catch (error) {
    requestLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Query failed'
    );
    throw error;
  }
}
