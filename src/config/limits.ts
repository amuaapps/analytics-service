import type { LimitsConfig } from './types.js';
import { getEnvVarAsInt } from './env-loader.js';

// Hard contract maximums - these can never be exceeded
const HARD_MAX_PAYLOAD_SIZE_BYTES = 1048576; // 1MB
const HARD_MAX_EVENTS_PER_BATCH = 100;
const HARD_MAX_PROPERTY_DEPTH = 3;
const HARD_MAX_KEYS_PER_LEVEL = 50;
const HARD_MAX_STRING_LENGTH = 2048;
const HARD_MAX_ARRAY_LENGTH = 100;
const HARD_MAX_QUERY_WINDOW_DAYS = 90;
const HARD_MAX_QUERY_LIMIT = 1000;

export function loadLimitsConfig(): LimitsConfig {
  return {
    // Ingest limits
    maxEventsPerBatch: getEnvVarAsInt('MAX_EVENTS_PER_BATCH', 100, { 
      min: 1, 
      max: HARD_MAX_EVENTS_PER_BATCH 
    }),
    minEventsPerBatch: getEnvVarAsInt('MIN_EVENTS_PER_BATCH', 1, { min: 1 }),
    maxPayloadSizeBytes: getEnvVarAsInt('MAX_PAYLOAD_SIZE_BYTES', HARD_MAX_PAYLOAD_SIZE_BYTES, { 
      min: 1024, 
      max: HARD_MAX_PAYLOAD_SIZE_BYTES 
    }),
    
    // Validation limits
    maxPropertyDepth: getEnvVarAsInt('MAX_PROPERTY_DEPTH', 3, { 
      min: 1, 
      max: HARD_MAX_PROPERTY_DEPTH 
    }),
    maxKeysPerLevel: getEnvVarAsInt('MAX_KEYS_PER_LEVEL', 50, { 
      min: 1, 
      max: HARD_MAX_KEYS_PER_LEVEL 
    }),
    maxStringLength: getEnvVarAsInt('MAX_STRING_LENGTH', 2048, { 
      min: 1, 
      max: HARD_MAX_STRING_LENGTH 
    }),
    maxArrayLength: getEnvVarAsInt('MAX_ARRAY_LENGTH', 100, { 
      min: 1, 
      max: HARD_MAX_ARRAY_LENGTH 
    }),
    
    // Query limits
    maxQueryWindowDays: getEnvVarAsInt('MAX_QUERY_WINDOW_DAYS', 31, { 
      min: 1, 
      max: HARD_MAX_QUERY_WINDOW_DAYS 
    }),
    defaultQueryLimit: getEnvVarAsInt('DEFAULT_QUERY_LIMIT', 50, { min: 1 }),
    maxQueryLimit: getEnvVarAsInt('MAX_QUERY_LIMIT', 200, { 
      min: 1, 
      max: HARD_MAX_QUERY_LIMIT 
    }),
  };
}
