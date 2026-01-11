import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { getOptionalEnvVar } from '../../config/env-loader.js';
import { parseWriteKeys, validateWriteKey as validateWriteKeyShared } from '../middleware/auth.js';

/**
 * Validates the x-analytics-write-key header against the configured write key(s)
 * Supports both direct env var and Azure Key Vault reference
 * Supports comma-separated keys for rotation
 * Uses constant-time comparison to prevent timing attacks
 */
export async function validateWriteKey(request: HttpRequest): Promise<{ valid: boolean; error?: HttpResponseInit }> {
  const writeKeyConfig = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
  
  if (!writeKeyConfig) {
    return {
      valid: false,
      error: {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Write key not configured',
          },
        }),
      },
    };
  }

  const providedKey = request.headers.get('x-analytics-write-key');
  
  if (!providedKey) {
    return {
      valid: false,
      error: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Missing x-analytics-write-key header',
          },
        }),
      },
    };
  }

  // Parse comma-separated keys and validate using shared helper
  const validKeys = parseWriteKeys(writeKeyConfig);
  const isValid = validateWriteKeyShared(providedKey, validKeys);

  if (!isValid) {
    return {
      valid: false,
      error: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid write key',
          },
        }),
      },
    };
  }

  return { valid: true };
}
