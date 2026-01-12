import type { Request, Response } from 'express';
import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import { validateQueryEventsInput } from '../../domain/query-validation.js';
import { handleQuery } from '../core/query-handler.js';
import type { EventRepository } from '../../infra/interfaces.js';
import { sendErrorResponse, ValidationError, isZodError, sanitizeZodError } from './errors.js';

export interface QueryHttpHandlerDependencies {
  logger: Logger;
  storageAdapter: EventRepository;
}

export function createQueryHttpHandler(deps: QueryHttpHandlerDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    const { logger, storageAdapter } = deps;
    const requestId = req.id || 'unknown';

    const requestLogger = createChildLogger(logger, {
      requestId,
      handler: 'query',
    });

    try {
      requestLogger.info({ query: req.query }, 'Query request received');

      // Parse and validate query parameters
      // Validation now handles HTTP query string formats (strings, comma-separated, etc.)
      const queryInput = validateQueryEventsInput(req.query);

      // Execute query
      const result = await handleQuery(
        {
          requestId,
          input: queryInput,
        },
        {
          logger: requestLogger,
          storageAdapter,
        }
      );

      // Core handler already returns ApiEvent[] (internal metadata stripped)
      // Build response matching spec format (items + nextCursor)
      const response = {
        items: result.events,
        ...(result.cursor ? { nextCursor: result.cursor } : {}),
      };

      requestLogger.info(
        {
          eventCount: result.events.length,
          hasMore: !!result.cursor,
        },
        'Query completed successfully'
      );

      res.status(200).json(response);
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof Error && isZodError(error)) {
        const validationError = sanitizeZodError(error);
        sendErrorResponse(res, validationError, requestLogger, requestId);
        return;
      }

      // Handle invalid cursor errors as validation errors
      if (error instanceof Error && error.message.includes('Invalid')) {
        const validationError = new ValidationError(error.message);
        sendErrorResponse(res, validationError, requestLogger, requestId);
        return;
      }

      // Handle all other errors as internal server errors
      sendErrorResponse(
        res,
        error instanceof Error ? error : new Error('Unknown error'),
        requestLogger,
        requestId
      );
    }
  };
}
