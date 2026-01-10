import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { handleIngest } from '../core/ingest-handler.js';
import type { CoreIngestRequest } from '../core/types.js';
import type { QueuePublisher } from '../../infra/interfaces.js';
import type { IngestRequestEnvelope } from '../../domain/ingest-types.js';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';
import { createValidateIngestRequestEnvelope } from '../../domain/validation.js';
import { loadLimitsConfig } from '../../config/limits.js';
import type { ZodError } from 'zod';
import type { RawEventStore } from '../../infra/interfaces.js';
import type { LimitsConfig } from '../../config/types.js';

export interface AzureFunctionIngestDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
  rawStorage: RawEventStore;
  limits: LimitsConfig;
}

// Load limits config once at module level
const limits = loadLimitsConfig();
const validateIngestRequest = createValidateIngestRequestEnvelope(limits);

async function parseBody(request: HttpRequest): Promise<unknown> {
  try {
    const body = await request.text();
    if (!body) {
      throw new Error('Missing request body');
    }
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

async function validateAndParseBody(request: HttpRequest): Promise<IngestRequestEnvelope> {
  const body = await parseBody(request);
  
  // Validate with Zod schema
  const result = validateIngestRequest(body);
  
  if (!result.success) {
    // Create validation error with structured details
    const validationError = new Error('VALIDATION_ERROR') as Error & { zodError: ZodError };
    validationError.zodError = result.error;
    throw validationError;
  }
  
  // Type assertion: Zod validation ensures this matches IngestRequestEnvelope
  return result.data as IngestRequestEnvelope;
}

async function createCoreRequest(request: HttpRequest): Promise<CoreIngestRequest> {
  const requestId = getOrGenerateRequestId(request.headers.get('x-request-id') ?? undefined);
  const payload = await validateAndParseBody(request);

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

function createErrorResponse(
  error: unknown,
  status: number = 500,
  requestId?: string
): HttpResponseInit {
  const message = error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : 'Internal server error';
  const code = status === 400 ? 'VALIDATION_ERROR'
    : status === 401 ? 'AUTHENTICATION_ERROR'
    : status === 413 ? 'PAYLOAD_TOO_LARGE'
    : 'INTERNAL_SERVER_ERROR';

  const body: {
    error: { code: string; message: string; details?: unknown };
    requestId?: string;
  } = {
    error: {
      code,
      message,
    },
  };

  // Add validation details if available
  if (error && typeof error === 'object' && 'zodError' in error) {
    const zodError = (error as { zodError: ZodError }).zodError;
    body.error.details = zodError.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }

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

export function createAzureFunctionIngestHandler(deps: AzureFunctionIngestDependencies) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const requestId: string = context.invocationId;

    try {
      const coreRequest = await createCoreRequest(request);
      const result = await handleIngest(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      // Handle validation errors with 400 status
      if (error instanceof Error && error.message === 'VALIDATION_ERROR') {
        deps.logger.warn({ err: error, invocationId: requestId }, 'Validation error at ingress');
        return createErrorResponse(error, 400, requestId);
      }

      // Handle other errors
      deps.logger.error({ err: error, invocationId: requestId }, 'Azure Function ingest handler error');
      return createErrorResponse(error, 500, requestId);
    }
  };
}
