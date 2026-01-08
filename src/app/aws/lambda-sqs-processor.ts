import type { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { handleProcessor } from '../core/processor-handler.js';
import type { CoreProcessorRequest } from '../core/types.js';
import type { EventRepository, RawEventStore } from '../../infra/interfaces.js';
import type { Logger } from '../../utils/logger.js';

export interface LambdaProcessorDependencies {
  logger: Logger;
  operationalStorage: EventRepository;
  rawStorage: RawEventStore;
}

function parseSQSMessage(record: SQSRecord): CoreProcessorRequest {
  try {
    const message = JSON.parse(record.body) as CoreProcessorRequest;
    return message;
  } catch (error) {
    throw new Error(`Failed to parse SQS message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function createLambdaSQSProcessorHandler(deps: LambdaProcessorDependencies) {
  return async (event: SQSEvent, context: Context): Promise<void> => {
    const { logger, operationalStorage, rawStorage } = deps;

    for (const record of event.Records) {
      try {
        const coreRequest = parseSQSMessage(record);

        const result = await handleProcessor(
          {
            requestId: coreRequest.requestId,
            batchId: coreRequest.batchId,
            events: coreRequest.events,
          },
          {
            logger,
            operationalStorage,
            rawStorage,
          }
        );

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
        const requestId: string = context.awsRequestId;
        logger.error(
          {
            err: error,
            messageId: record.messageId,
            requestId,
          },
          'Failed to process SQS message'
        );
        throw error;
      }
    }
  };
}
