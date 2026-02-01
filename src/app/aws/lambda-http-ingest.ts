import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
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

export interface LambdaIngestDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
  rawStorage: RawEventStore;
  limits?: LimitsConfig;
}

// Load limits config once at module level
const limits = loadLimitsConfig();
const validateIngestRequest = createValidateIngestRequestEnvelope(limits);

function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) {
    const error = new Error('VALIDATION_ERROR: Missing request body');
    throw error;
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error('VALIDATION_ERROR: Invalid JSON in request body');
  }
}

function validateAndParseBody(event: APIGatewayProxyEvent): IngestRequestEnvelope {
  const body = parseBody(event);

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

function createCoreRequest(event: APIGatewayProxyEvent): CoreIngestRequest {
  const requestId = getOrGenerateRequestId(event.headers['x-request-id']);
  const payload = validateAndParseBody(event);

  return {
    requestId,
    payload,
  };
}

function createSuccessResponse(result: {
  accepted: boolean;
  eventCount: number;
  batchId: string;
}): APIGatewayProxyResult {
  return {
    statusCode: 202,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted: result.accepted,
      eventCount: result.eventCount,
      batchId: result.batchId,
    }),
  };
}

function createErrorResponse(
  error: unknown,
  statusCode: number = 500,
  requestId?: string
): APIGatewayProxyResult {
  const message =
    error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : 'Internal server error';
  const code =
    statusCode === 400
      ? 'VALIDATION_ERROR'
      : statusCode === 401
        ? 'AUTHENTICATION_ERROR'
        : statusCode === 413
          ? 'PAYLOAD_TOO_LARGE'
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
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function createLambdaIngestHandler(deps: LambdaIngestDependencies) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId: string = context.awsRequestId;

    try {
      const coreRequest = createCoreRequest(event);
      const result = await handleIngest(coreRequest, deps);
      return createSuccessResponse(result);
    } catch (error) {
      // Handle validation errors with 400 status
      if (
        error instanceof Error &&
        (error.message === 'VALIDATION_ERROR' || error.message.startsWith('VALIDATION_ERROR:'))
      ) {
        deps.logger.warn({ err: error, requestId }, 'Validation error at ingress');
        return createErrorResponse(error, 400, requestId);
      }

      // Handle other errors
      deps.logger.error({ err: error, requestId }, 'Lambda ingest handler error');
      return createErrorResponse(error, 500, requestId);
    }
  };
}
