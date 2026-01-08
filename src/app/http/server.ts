import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Logger } from '../../utils/logger.js';
import { getOrGenerateRequestId } from '../../utils/correlation.js';
import { createAuthMiddleware, parseWriteKeys } from '../middleware/auth.js';
import { createValidationMiddleware } from '../middleware/validation.js';
import { handleIngest } from '../core/ingest-handler.js';
import type { QueuePublisher, EventRepository } from '../../infra/interfaces.js';
import type { Config } from '../../config/types.js';
import { createQueryHttpHandler } from './query-handler.js';

export interface ServerDependencies {
  logger: Logger;
  queueAdapter: QueuePublisher;
  storageAdapter: EventRepository;
  config: Config;
}

function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = getOrGenerateRequestId(req.headers['x-request-id'] as string | undefined);
  res.setHeader('X-Request-ID', req.id);
  next();
}

function corsMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const allowedOrigins = config.security.corsAllowedOrigins;

    if (allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Analytics-Write-Key, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.id || 'unknown';

    // Log with full details server-side
    logger.error(
      {
        err,
        requestId,
        method: req.method,
        path: req.path,
        stack: err.stack,
      },
      'Unhandled error in request'
    );

    // Send sanitized error to client (no stack traces)
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
      requestId,
    });
  };
}

export function createServer(deps: ServerDependencies): Express {
  const { logger, queueAdapter, storageAdapter, config } = deps;
  const app = express();

  app.use(express.json({ limit: config.limits.maxPayloadSizeBytes }));
  app.use(requestIdMiddleware);
  app.use(corsMiddleware(config));

  const writeKeys = parseWriteKeys(config.security.analyticsWriteKey);
  const authMiddleware = createAuthMiddleware({ writeKeys }, logger);
  const validationMiddleware = createValidationMiddleware(logger);
  const queryHandler = createQueryHttpHandler({ logger, storageAdapter });

  app.post(
    '/api/v1/events',
    authMiddleware,
    validationMiddleware,
    (req: Request, res: Response, next: NextFunction): void => {
      const requestId: string = req.id ?? 'unknown';
      
      handleIngest(
        {
          requestId,
          payload: req.body,
        },
        {
          logger,
          queueAdapter,
        }
      )
        .then((result) => {
          res.status(202).json({
            accepted: result.accepted,
            eventCount: result.eventCount,
          });
        })
        .catch((error: unknown) => {
          next(error);
        });
    }
  );

  app.get('/api/v1/events', queryHandler);

  app.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'healthy',
      service: config.service.serviceName,
      version: '1.0.0',
    });
  });

  app.use(errorHandler(logger));

  return app;
}
