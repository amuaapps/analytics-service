import type { LimitsConfig } from './types.js';
import { getEnvVarAsInt } from './env-loader.js';

export function loadLimitsConfig(): LimitsConfig {
  return {
    maxEventsPerBatch: getEnvVarAsInt('MAX_EVENTS_PER_BATCH', 50),
    minEventsPerBatch: getEnvVarAsInt('MIN_EVENTS_PER_BATCH', 1),
    maxPropertyDepth: getEnvVarAsInt('MAX_PROPERTY_DEPTH', 3),
    maxKeysPerLevel: getEnvVarAsInt('MAX_KEYS_PER_LEVEL', 50),
    maxStringLength: getEnvVarAsInt('MAX_STRING_LENGTH', 2048),
    maxArrayLength: getEnvVarAsInt('MAX_ARRAY_LENGTH', 100),
    maxPayloadSizeBytes: getEnvVarAsInt('MAX_PAYLOAD_SIZE_BYTES', 32 * 1024),
    maxQueryWindowDays: getEnvVarAsInt('MAX_QUERY_WINDOW_DAYS', 31),
    defaultQueryLimit: getEnvVarAsInt('DEFAULT_QUERY_LIMIT', 50),
    maxQueryLimit: getEnvVarAsInt('MAX_QUERY_LIMIT', 200),
  };
}
