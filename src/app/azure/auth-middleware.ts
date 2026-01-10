import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { getOptionalEnvVar } from '../../config/env-loader.js';

/**
 * Validates the x-analytics-write-key header against the configured write key
 * Supports both direct env var and Azure Key Vault reference
 */
export async function validateWriteKey(request: HttpRequest): Promise<{ valid: boolean; error?: HttpResponseInit }> {
  const writeKey = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
  
  if (!writeKey) {
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

  if (providedKey !== writeKey) {
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
