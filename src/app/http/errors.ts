import type { Response } from 'express';
import type { Logger } from '../../utils/logger.js';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string = 'Payload too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
    this.name = 'PayloadTooLargeError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
    this.name = 'InternalServerError';
  }
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export function formatErrorResponse(error: AppError | Error, requestId?: string): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      ...(requestId ? { requestId } : {}),
    };
  }

  // Generic error - don't expose details
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    ...(requestId ? { requestId } : {}),
  };
}

export function sendErrorResponse(
  res: Response,
  error: AppError | Error,
  logger: Logger,
  requestId?: string
): void {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const errorResponse = formatErrorResponse(error, requestId);

  // Log server-side with full details including stack
  if (statusCode >= 500) {
    logger.error(
      {
        err: error,
        statusCode,
        requestId,
        stack: error.stack,
      },
      'Server error occurred'
    );
  } else if (statusCode >= 400) {
    logger.warn(
      {
        error: error.message,
        statusCode,
        requestId,
        code: error instanceof AppError ? error.code : 'UNKNOWN',
      },
      'Client error occurred'
    );
  }

  res.status(statusCode).json(errorResponse);
}

export function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

export function sanitizeZodError(error: Error): ValidationError {
  // Parse Zod error to extract validation issues
  let message = 'Validation failed';
  let details: unknown;

  try {
    const zodError = error as { issues?: Array<{ path: string[]; message: string }> };
    if (zodError.issues && zodError.issues.length > 0) {
      const firstIssue = zodError.issues[0];
      message = firstIssue.message;
      details = zodError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    }
  } catch {
    // If parsing fails, use generic message
  }

  return new ValidationError(message, details);
}
