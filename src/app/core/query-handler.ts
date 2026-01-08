import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { CoreQueryRequest, CoreQueryResponse, OperationalStorageAdapter } from './types.js';
import { parseCursor, encodeCursor } from '../../domain/query-validation.js';

export interface QueryHandlerDependencies {
  logger: Logger;
  storageAdapter: OperationalStorageAdapter;
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
    // Parse cursor if provided
    let parsedCursor: { pk: string; sk: string } | undefined;
    if (input.cursor) {
      try {
        parsedCursor = parseCursor(input.cursor);
        requestLogger.debug({ cursor: parsedCursor }, 'Parsed pagination cursor');
      } catch (error) {
        requestLogger.warn({ error: error instanceof Error ? error.message : 'Unknown' }, 'Invalid cursor provided');
        throw new Error('Invalid pagination cursor');
      }
    }

    // Query storage with parsed cursor
    const queryInput = {
      ...input,
      cursor: parsedCursor ? JSON.stringify(parsedCursor) : undefined,
    };

    const result = await storageAdapter.queryEvents(queryInput);

    // Encode cursor for response if hasMore
    let nextCursor: string | undefined;
    if (result.hasMore && result.cursor) {
      try {
        const cursorData = JSON.parse(result.cursor);
        nextCursor = encodeCursor(cursorData.pk, cursorData.sk);
      } catch (error) {
        requestLogger.warn({ error: error instanceof Error ? error.message : 'Unknown' }, 'Failed to encode cursor');
      }
    }

    requestLogger.info(
      {
        eventCount: result.events.length,
        hasMore: result.hasMore,
        hasNextCursor: !!nextCursor,
      },
      'Query completed successfully'
    );

    return {
      events: result.events,
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
