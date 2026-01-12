import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../../utils/logger.js';
import { createValidateIngestRequestEnvelope } from '../../domain/validation.js';
import { ValidationError, sendErrorResponse } from '../http/errors.js';
import type { LimitsConfig } from '../../config/types.js';

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

export function createValidationMiddleware(logger: Logger, limits: LimitsConfig) {
  const validateIngestRequestEnvelope = createValidateIngestRequestEnvelope(limits);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.id ?? 'unknown';
    
    try {
      const result = validateIngestRequestEnvelope(req.body);

      if (!result.success) {
        const sanitizedErrors = sanitizeZodError(result.error);
        const error = new ValidationError('Invalid request payload', sanitizedErrors);
        
        sendErrorResponse(res, error, logger, requestId);
        return;
      }

      // Use normalized payload (sessionId canonicalized to context.sessionId)
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
      const validationError = new ValidationError(sanitizedMessage);

      sendErrorResponse(res, validationError, logger, requestId);
    }
  };
}
