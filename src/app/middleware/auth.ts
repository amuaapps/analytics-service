import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '../../utils/logger.js';

export interface AuthConfig {
  writeKeys: string[];
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
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
    const requestId = req.id ?? 'unknown';

    if (!writeKey) {
      logger.warn({ requestId }, 'Missing X-Analytics-Write-Key header');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing X-Analytics-Write-Key header',
      });
      return;
    }

    if (typeof writeKey !== 'string') {
      logger.warn({ requestId }, 'Invalid X-Analytics-Write-Key header format');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid X-Analytics-Write-Key header format',
      });
      return;
    }

    const isValid = validateWriteKey(writeKey, config.writeKeys);

    if (!isValid) {
      logger.warn({ requestId }, 'Invalid X-Analytics-Write-Key');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid X-Analytics-Write-Key',
      });
      return;
    }

    logger.debug({ requestId }, 'Authentication successful');
    next();
  };
}
