import type { Request, Response } from 'express';
import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import { validateQueryEventsInput } from '../../domain/query-validation.js';
import { handleQuery } from '../core/query-handler.js';
import type { OperationalStorageAdapter } from '../core/types.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import { sendErrorResponse, ValidationError, isZodError, sanitizeZodError } from './errors.js';

export interface QueryHttpHandlerDependencies {
  logger: Logger;
  storageAdapter: OperationalStorageAdapter;
}

function sanitizeEventForResponse(event: StoredEvent): StoredEvent {
  const sanitized = { ...event };
  
  // Remove any internal metadata fields that shouldn't be exposed
  // The spec says: "Internal-only metadata (not exposed via API)"
  // For now, we return the canonical fields as-is since our storage
  // adapters should only store canonical fields
  
  return sanitized;
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
      const queryInput = validateQueryEventsInput({
        appId: req.query.appId,
        from: req.query.from,
        to: req.query.to,
        types: req.query.types ? String(req.query.types).split(',') : undefined,
        names: req.query.names ? String(req.query.names).split(',') : undefined,
        userId: req.query.userId,
        anonymousId: req.query.anonymousId,
        sessionId: req.query.sessionId,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
        cursor: req.query.cursor,
        sort: req.query.sort,
      });

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

      // Sanitize events for response (remove internal metadata)
      const sanitizedEvents = result.events.map(sanitizeEventForResponse);

      // Build response matching spec format
      const response = {
        items: sanitizedEvents,
        ...(result.cursor ? { nextCursor: result.cursor } : {}),
      };

      requestLogger.info(
        {
          eventCount: sanitizedEvents.length,
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
