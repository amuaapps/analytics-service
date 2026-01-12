import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '../../utils/logger.js';
import { AuthenticationError, sendErrorResponse } from '../http/errors.js';

export interface AuthConfig {
  writeKeys: string[];
}

export function parseWriteKeys(writeKeyConfig: string): string[] {
  return writeKeyConfig
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function validateWriteKey(providedKey: string, validKeys: string[]): boolean {
  if (!providedKey || providedKey.trim() === '') {
    return false;
  }

  const trimmedKey = providedKey.trim();

  return validKeys.some((validKey) => {
    if (validKey.length !== trimmedKey.length) {
      return false;
    }

    let matches = true;
    for (let i = 0; i < validKey.length; i++) {
      if (validKey.charCodeAt(i) !== trimmedKey.charCodeAt(i)) {
        matches = false;
      }
    }
    return matches;
  });
}

export function createAuthMiddleware(config: AuthConfig, logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const writeKey = req.headers['x-analytics-write-key'];
    const requestId = req.id || 'unknown';

    if (!writeKey || typeof writeKey !== 'string') {
      const error = new AuthenticationError('Missing or invalid write key');
      sendErrorResponse(res, error, logger, requestId);
      return;
    }

    const isValid = validateWriteKey(writeKey, config.writeKeys);

    if (!isValid) {
      const error = new AuthenticationError('Invalid write key');
      sendErrorResponse(res, error, logger, requestId);
      return;
    }

    next();
  };
}
