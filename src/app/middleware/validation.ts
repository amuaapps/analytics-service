import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../../utils/logger.js';
import { ingestRequestEnvelopeSchema } from '../../domain/validation.js';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function sanitizeZodError(error: ZodError): unknown {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function sanitizeErrorMessage(message: string): string {
  const sensitivePatterns = [
    /password/gi,
    /token/gi,
    /secret/gi,
    /key/gi,
    /authorization/gi,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return 'Validation error occurred';
    }
  }

  return message;
}

export function createValidationMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.id ?? 'unknown';
    
    try {
      const result = ingestRequestEnvelopeSchema.safeParse(req.body);

      if (!result.success) {
        const sanitizedErrors = sanitizeZodError(result.error);
        
        logger.warn(
          {
            requestId,
            validationErrors: sanitizedErrors,
          },
          'Request validation failed'
        );

        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request payload',
          details: sanitizedErrors,
        });
        return;
      }

      req.body = result.data;
      
      logger.debug(
        {
          requestId,
          eventCount: result.data.events.length,
          schemaVersion: result.data.schemaVersion,
        },
        'Request validation successful'
      );

      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      const sanitizedMessage = sanitizeErrorMessage(errorMessage);

      logger.error(
        {
          requestId,
          err: error,
        },
        'Validation middleware error'
      );

      res.status(400).json({
        error: 'Bad Request',
        message: sanitizedMessage,
      });
    }
  };
}
