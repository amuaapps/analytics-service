import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import type { CoreQueryRequest, CoreQueryResponse, StorageAdapter } from './types.js';

export interface QueryHandlerDependencies {
  logger: Logger;
  storageAdapter: StorageAdapter;
}

export async function handleQuery(
  request: CoreQueryRequest,
  deps: QueryHandlerDependencies
): Promise<CoreQueryResponse> {
  const { requestId, input } = request;
  const { logger, storageAdapter } = deps;

  const requestLogger = createChildLogger(logger, {
    requestId,
    appId: input.appId,
    types: input.types,
    limit: input.limit,
  });

  requestLogger.info('Processing query request');

  try {
    const result = await storageAdapter.queryEvents(input);

    requestLogger.info(
      {
        eventCount: result.events.length,
        hasMore: result.hasMore,
      },
      'Query completed successfully'
    );

    return result;
  } catch (error) {
    requestLogger.error({ err: error }, 'Failed to query events');
    throw error;
  }
}
