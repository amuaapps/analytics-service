import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { handleQuery } from '../core/query-handler.js';
import type { CoreQueryRequest } from '../core/types.js';
import type { EventRepository } from '../../infra/interfaces.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';
import { validateQueryEventsInput } from '../../domain/query-validation.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import { mapStoredEventToApiEvent } from '../../domain/event-mapper.js';

export interface AzureFunctionQueryDependencies {
  logger: Logger;
  storageAdapter: EventRepository;
}

function parseQueryParams(request: HttpRequest): QueryEventsInput {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Required parameters
  const appId = params.get('appId');
  const from = params.get('from');

  if (!appId || !from) {
    throw new Error('Missing required query parameters: appId and from');
  }

  // Build query input
  const input: Record<string, unknown> = {
    appId,
    from,
  };

  // Optional parameters
  const to = params.get('to');
  if (to) input.to = to;

  const types = params.get('types');
  if (types) input.types = types.split(',');

  const names = params.get('names');
  if (names) input.names = names.split(',');

  const userId = params.get('userId');
  if (userId) input.userId = userId;

  const anonymousId = params.get('anonymousId');
  if (anonymousId) input.anonymousId = anonymousId;

  const sessionId = params.get('sessionId');
  if (sessionId) input.sessionId = sessionId;

  const limit = params.get('limit');
  if (limit) input.limit = parseInt(limit, 10);

  const cursor = params.get('cursor');
  if (cursor) input.cursor = cursor;

  const sort = params.get('sort');
  if (sort) input.sort = sort;

  // Validate and return
  return validateQueryEventsInput(input);
}

async function createCoreRequest(request: HttpRequest): Promise<CoreQueryRequest> {
  const requestId = getOrGenerateRequestId(request.headers.get('x-request-id') ?? undefined);
  const input = parseQueryParams(request);

  return {
    requestId,
    input,
  };
}

function createSuccessResponse(result: {
  events: unknown[];
  cursor?: string;
  hasMore: boolean;
}): HttpResponseInit {
  // Map stored events to API events (remove internal metadata)
  // Type assertion safe here because core handler returns StoredEvent[]
  const apiEvents = result.events.map((event) => mapStoredEventToApiEvent(event as any));

  // Build response matching spec format (items + nextCursor)
  const response = {
    items: apiEvents,
    ...(result.cursor ? { nextCursor: result.cursor } : {}),
  };

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response),
  };
}

function createErrorResponse(
  error: unknown,
  status: number = 500,
  requestId?: string
): HttpResponseInit {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const code = status === 400 ? 'VALIDATION_ERROR'
    : status === 401 ? 'AUTHENTICATION_ERROR'
    : 'INTERNAL_SERVER_ERROR';

  const body: {
    error: { code: string; message: string };
    requestId?: string;
  } = {
    error: {
      code,
      message,
    },
  };

  if (requestId) {
    body.requestId = requestId;
  }

  return {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function createAzureFunctionQueryHandler(deps: AzureFunctionQueryDependencies) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const requestId: string = context.invocationId;

    try {
      const coreRequest = await createCoreRequest(request);
      const result = await handleQuery(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      // Handle validation errors with 400 status
      if (error instanceof Error && (
        error.message.includes('Missing required query parameters') ||
        error.message.includes('validation')
      )) {
        deps.logger.warn({ err: error, invocationId: requestId }, 'Query validation error');
        return createErrorResponse(error, 400, requestId);
      }

      // Handle other errors
      deps.logger.error({ err: error, invocationId: requestId }, 'Azure Function query handler error');
      return createErrorResponse(error, 500, requestId);
    }
  };
}
