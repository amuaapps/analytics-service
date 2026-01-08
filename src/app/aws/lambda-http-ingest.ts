import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handleIngest } from '../core/ingest-handler.js';
import type { CoreIngestRequest, QueueAdapter } from '../core/types.js';
import type { IngestRequestEnvelope } from '../../domain/ingest-types.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';

export interface LambdaIngestDependencies {
  logger: Logger;
  queueAdapter: QueueAdapter;
}

function parseBody(event: APIGatewayProxyEvent): IngestRequestEnvelope {
  if (!event.body) {
    throw new Error('Missing request body');
  }

  try {
    return JSON.parse(event.body) as IngestRequestEnvelope;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

function createCoreRequest(event: APIGatewayProxyEvent): CoreIngestRequest {
  const requestId = getOrGenerateRequestId(event.headers['x-request-id']);
  const payload = parseBody(event);

  return {
    requestId,
    payload,
  };
}

function createSuccessResponse(result: { accepted: boolean; eventCount: number; batchId: string }): APIGatewayProxyResult {
  return {
    statusCode: 202,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted: result.accepted,
      eventCount: result.eventCount,
    }),
  };
}

function createErrorResponse(error: unknown): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message : 'Internal server error';

  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: 'Internal Server Error',
      message,
    }),
  };
}

export function createLambdaIngestHandler(deps: LambdaIngestDependencies) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
      const coreRequest = createCoreRequest(event);
      const result = await handleIngest(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      const requestId: string = context.awsRequestId;
      deps.logger.error({ err: error, requestId }, 'Lambda ingest handler error');
      return createErrorResponse(error);
    }
  };
}
