import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handleQuery } from '../core/query-handler.js';
import type { CoreQueryRequest } from '../core/types.js';
import type { EventRepository } from '../../infra/interfaces.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';
import { validateQueryEventsInput } from '../../domain/query-validation.js';
import { isZodError, sanitizeZodError } from '../http/errors.js';

export interface LambdaQueryDependencies {
  logger: Logger;
  storageAdapter: EventRepository;
}

function createCoreRequest(event: APIGatewayProxyEvent): CoreQueryRequest {
  const requestId = getOrGenerateRequestId(event.headers['x-request-id']);
  const queryParams = event.queryStringParameters || {};

  // Parse query parameters exactly as spec defines
  // Required: appId, from
  // Optional: to, types, names, userId, anonymousId, sessionId, limit, cursor, sort
  const rawInput = {
    appId: queryParams.appId,
    from: queryParams.from,
    to: queryParams.to,
    types: queryParams.types ? String(queryParams.types).split(',') : undefined,
    names: queryParams.names ? String(queryParams.names).split(',') : undefined,
    userId: queryParams.userId,
    anonymousId: queryParams.anonymousId,
    sessionId: queryParams.sessionId,
    limit: queryParams.limit ? parseInt(String(queryParams.limit), 10) : undefined,
    cursor: queryParams.cursor,
    sort: queryParams.sort,
  };

  // Validate using the same logic as Express
  const validatedInput = validateQueryEventsInput(rawInput);

  return {
    requestId,
    input: validatedInput,
  };
}

function createSuccessResponse(result: {
  events: unknown[];
  cursor?: string;
  hasMore: boolean;
}): APIGatewayProxyResult {
  // Response shape must match spec: { items, nextCursor? }
  // Do not return { events, hasMore } to external clients
  const response = {
    items: result.events,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  };
}

function createErrorResponse(error: unknown, statusCode: number = 500): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const code = statusCode === 400 ? 'VALIDATION_ERROR'
    : statusCode === 401 ? 'AUTHENTICATION_ERROR'
    : statusCode === 404 ? 'NOT_FOUND'
    : 'INTERNAL_SERVER_ERROR';

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: {
        code,
        message,
      },
    }),
  };
}

export function createLambdaQueryHandler(deps: LambdaQueryDependencies) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId = context.awsRequestId;
    
    try {
      const coreRequest = createCoreRequest(event);
      const result = await handleQuery(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      deps.logger.error({ err: error, requestId }, 'Lambda query handler error');
      
      // Handle Zod validation errors (same as Express)
      if (error instanceof Error && isZodError(error)) {
        const validationError = sanitizeZodError(error);
        return createErrorResponse(validationError, 400);
      }

      // Handle invalid cursor errors as validation errors
      if (error instanceof Error && error.message.includes('Invalid')) {
        return createErrorResponse(error, 400);
      }

      // All other errors are internal server errors
      return createErrorResponse(error, 500);
    }
  };
}
