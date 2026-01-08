import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handleQuery } from '../core/query-handler.js';
import type { CoreQueryRequest, OperationalStorageAdapter } from '../core/types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';

export interface LambdaQueryDependencies {
  logger: Logger;
  storageAdapter: OperationalStorageAdapter;
}

function createCoreRequest(event: APIGatewayProxyEvent): CoreQueryRequest {
  const requestId = getOrGenerateRequestId(event.headers['x-request-id']);
  const queryParams = event.queryStringParameters || {};

  const input: QueryEventsInput = {
    appId: queryParams.appId || '',
    from: queryParams.startDate || queryParams.from || new Date(0).toISOString(),
    to: queryParams.endDate || queryParams.to,
    userId: queryParams.userId,
    limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
    cursor: queryParams.cursor,
  };

  return {
    requestId,
    input,
  };
}

function createSuccessResponse(result: {
  events: unknown[];
  nextCursor?: string;
  hasMore: boolean;
}): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(result),
  };
}

function createErrorResponse(error: unknown, statusCode: number = 500): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message : 'Internal server error';

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
      message,
    }),
  };
}

export function createLambdaQueryHandler(deps: LambdaQueryDependencies) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
      const coreRequest = createCoreRequest(event);
      const result = await handleQuery(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      const requestId: string = context.awsRequestId;
      deps.logger.error({ err: error, requestId }, 'Lambda query handler error');
      
      // Check if it's a validation error
      const statusCode = error instanceof Error && error.message.includes('required') ? 400 : 500;
      return createErrorResponse(error, statusCode);
    }
  };
}
