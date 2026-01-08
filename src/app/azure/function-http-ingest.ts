import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { handleIngest } from '../core/ingest-handler.js';
import type { CoreIngestRequest } from '../core/types.js';
import type { QueuePublisher } from '../../infra/interfaces.js';
import type { IngestRequestEnvelope } from '../../domain/ingest-types.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';

export interface AzureFunctionIngestDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
}

async function parseBody(request: HttpRequest): Promise<IngestRequestEnvelope> {
  try {
    const body = await request.text();
    if (!body) {
      throw new Error('Missing request body');
    }
    return JSON.parse(body) as IngestRequestEnvelope;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

async function createCoreRequest(request: HttpRequest): Promise<CoreIngestRequest> {
  const requestId = getOrGenerateRequestId(request.headers.get('x-request-id') ?? undefined);
  const payload = await parseBody(request);

  return {
    requestId,
    payload,
  };
}

function createSuccessResponse(result: { accepted: boolean; eventCount: number; batchId: string }): HttpResponseInit {
  return {
    status: 202,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted: result.accepted,
      eventCount: result.eventCount,
    }),
  };
}

function createErrorResponse(error: unknown, status: number = 500): HttpResponseInit {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const code = status === 400 ? 'VALIDATION_ERROR'
    : status === 401 ? 'AUTHENTICATION_ERROR'
    : status === 413 ? 'PAYLOAD_TOO_LARGE'
    : 'INTERNAL_SERVER_ERROR';

  return {
    status,
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

export function createAzureFunctionIngestHandler(deps: AzureFunctionIngestDependencies) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const coreRequest = await createCoreRequest(request);
      const result = await handleIngest(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      deps.logger.error({ err: error, invocationId: context.invocationId }, 'Azure Function ingest handler error');
      return createErrorResponse(error);
    }
  };
}
