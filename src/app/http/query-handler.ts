import type { Request, Response } from 'express';
import type { Logger } from '../../utils/logger.js';
import { createChildLogger } from '../../utils/index.js';
import { validateQueryEventsInput } from '../../domain/query-validation.js';
import { handleQuery } from '../core/query-handler.js';
import type { OperationalStorageAdapter } from '../core/types.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';

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
      if (error instanceof Error && error.name === 'ZodError') {
        requestLogger.warn({ error: error.message }, 'Query validation failed');
        res.status(400).json({
          error: 'Validation error',
          message: error.message,
        });
        return;
      }

      // Handle invalid cursor errors as 400
      if (error instanceof Error && error.message.includes('Invalid')) {
        requestLogger.warn({ error: error.message }, 'Invalid request parameter');
        res.status(400).json({
          error: 'Bad request',
          message: error.message,
        });
        return;
      }

      requestLogger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Query failed'
      );

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to query events',
      });
    }
  };
}
