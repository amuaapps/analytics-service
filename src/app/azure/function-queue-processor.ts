import type { InvocationContext } from '@azure/functions';
import { handleProcessor } from '../core/processor-handler.js';
import type { CoreProcessorRequest, OperationalStorageAdapter, RawStorageAdapter } from '../core/types.js';
import type { Logger } from '../../utils/logger.js';

export interface AzureFunctionProcessorDependencies {
  logger: Logger;
  operationalStorage: OperationalStorageAdapter;
  rawStorage: RawStorageAdapter;
}

function parseQueueMessage(message: unknown): CoreProcessorRequest {
  try {
    if (typeof message === 'string') {
      return JSON.parse(message) as CoreProcessorRequest;
    }
    return message as CoreProcessorRequest;
  } catch (error) {
    throw new Error(`Failed to parse queue message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function createAzureFunctionQueueProcessorHandler(deps: AzureFunctionProcessorDependencies) {
  return async (queueItem: unknown, _context: InvocationContext): Promise<void> => {
    const { logger, operationalStorage, rawStorage } = deps;

    try {
      const coreRequest = parseQueueMessage(queueItem);

      const result = await handleProcessor(coreRequest, {
        logger,
        operationalStorage,
        rawStorage,
      });

      if (result.failed > 0) {
        logger.error(
          {
            requestId: coreRequest.requestId,
            batchId: coreRequest.batchId,
            failed: result.failed,
            errors: result.errors,
          },
          'Batch processing had failures'
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId: 'unknown',
        },
        'Failed to process queue message'
      );
      throw error;
    }
  };
}
