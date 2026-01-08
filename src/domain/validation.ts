import { z } from 'zod';
import { SCHEMA_VERSION } from './base-types.js';

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

const MAX_EVENTS_PER_BATCH = 50;
const MIN_EVENTS_PER_BATCH = 1;
const MAX_PROPERTY_DEPTH = 3;
const MAX_KEYS_PER_LEVEL = 50;
const MAX_STRING_LENGTH = 2048;
const MAX_ARRAY_LENGTH = 100;
const MAX_PAYLOAD_SIZE_BYTES = 32 * 1024;

const platformSchema = z.enum(['web', 'ios', 'android', 'server']);

const environmentSchema = z.enum(['dev', 'staging', 'prod', 'test']);

const eventTypeSchema = z.enum(['track', 'page', 'identify']);

const sourceSchema = z.object({
  appId: z.string().min(1).max(255),
  platform: platformSchema,
  env: environmentSchema,
  appVersion: z.string().max(255).optional(),
});

const actorSchema = z
  .object({
    userId: z.string().max(255).optional(),
    anonymousId: z.string().max(255).optional(),
    sessionId: z.string().max(255).optional(),
  })
  .refine((data) => data.userId || data.anonymousId, {
    message: 'At least one of userId or anonymousId must be present',
  });

const contextSchema = z
  .object({
    locale: z.string().max(50).optional(),
    timezone: z.string().max(100).optional(),
    page: z
      .object({
        url: z.string().max(MAX_STRING_LENGTH).optional(),
        path: z.string().max(MAX_STRING_LENGTH).optional(),
        referrer: z.string().max(MAX_STRING_LENGTH).optional(),
        title: z.string().max(MAX_STRING_LENGTH).optional(),
      })
      .optional(),
    userAgent: z.string().max(MAX_STRING_LENGTH).optional(),
    device: z.record(z.unknown()).optional(),
  })
  .optional();

const consentSchema = z
  .object({
    analytics: z.boolean(),
    timestamp: z.string().datetime(),
  })
  .optional();

const validatePropertyKey = (key: string): boolean => {
  if (key.startsWith('_')) return false;
  return PROPERTY_KEY_PATTERN.test(key);
};

const validatePropertiesDepth = (obj: unknown, maxDepth: number, currentDepth = 0): boolean => {
  if (currentDepth > maxDepth) return false;
  if (typeof obj !== 'object' || obj === null) return true;

  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_LENGTH) return false;
    return obj.every((item) => validatePropertiesDepth(item, maxDepth, currentDepth + 1));
  }

  const keys = Object.keys(obj);
  if (keys.length > MAX_KEYS_PER_LEVEL) return false;
  if (!keys.every(validatePropertyKey)) return false;

  return keys.every((key) =>
    validatePropertiesDepth((obj as Record<string, unknown>)[key], maxDepth, currentDepth + 1)
  );
};

const validateStringLength = (obj: unknown): boolean => {
  if (typeof obj === 'string') {
    return obj.length <= MAX_STRING_LENGTH;
  }
  if (typeof obj !== 'object' || obj === null) return true;

  if (Array.isArray(obj)) {
    return obj.every(validateStringLength);
  }

  return Object.values(obj).every(validateStringLength);
};

const propertiesSchema = z
  .record(z.unknown())
  .refine((data) => validatePropertiesDepth(data, MAX_PROPERTY_DEPTH), {
    message: `Properties must not exceed depth of ${MAX_PROPERTY_DEPTH}`,
  })
  .refine((data) => validateStringLength(data), {
    message: `String values must not exceed ${MAX_STRING_LENGTH} characters`,
  })
  .optional();

const traitsSchema = z
  .record(z.unknown())
  .refine((data) => validatePropertiesDepth(data, MAX_PROPERTY_DEPTH), {
    message: `Traits must not exceed depth of ${MAX_PROPERTY_DEPTH}`,
  })
  .refine((data) => validateStringLength(data), {
    message: `String values must not exceed ${MAX_STRING_LENGTH} characters`,
  });

const baseEventSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: sourceSchema,
  actor: actorSchema,
  context: contextSchema,
  consent: consentSchema,
});

const trackEventSchema = baseEventSchema.extend({
  type: z.literal('track'),
  name: z.string().regex(EVENT_NAME_PATTERN, {
    message: 'Event name must be lowercase snake_case with optional dot namespaces',
  }),
  properties: propertiesSchema,
});

const pageEventSchema = baseEventSchema.extend({
  type: z.literal('page'),
  name: z.string().regex(EVENT_NAME_PATTERN, {
    message: 'Event name must be lowercase snake_case with optional dot namespaces',
  }),
  properties: propertiesSchema,
});

const identifyEventSchema = baseEventSchema.extend({
  type: z.literal('identify'),
  traits: traitsSchema,
});

export const ingestEventSchema = z.discriminatedUnion('type', [
  trackEventSchema,
  pageEventSchema,
  identifyEventSchema,
]);

export const ingestRequestEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sentAt: z.string().datetime().optional(),
    events: z
      .array(ingestEventSchema)
      .min(MIN_EVENTS_PER_BATCH, `Batch must contain at least ${MIN_EVENTS_PER_BATCH} event`)
      .max(
        MAX_EVENTS_PER_BATCH,
        `Batch must not exceed ${MAX_EVENTS_PER_BATCH} events per request`
      ),
  })
  .refine(
    (data) => {
      const size = JSON.stringify(data).length;
      return size <= MAX_PAYLOAD_SIZE_BYTES;
    },
    {
      message: `Payload size must not exceed ${MAX_PAYLOAD_SIZE_BYTES} bytes`,
    }
  );

const sortOrderSchema = z.enum(['asc', 'desc']).optional();

export const queryEventsInputSchema = z.object({
  appId: z.string().min(1).max(255),
  from: z.string().datetime(),
  to: z.string().datetime().optional(),
  types: z.array(eventTypeSchema).optional(),
  names: z.array(z.string().regex(EVENT_NAME_PATTERN)).optional(),
  userId: z.string().max(255).optional(),
  anonymousId: z.string().max(255).optional(),
  sessionId: z.string().max(255).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  sort: sortOrderSchema,
});

export const VALIDATION_CONSTANTS = {
  MAX_EVENTS_PER_BATCH,
  MIN_EVENTS_PER_BATCH,
  MAX_PROPERTY_DEPTH,
  MAX_KEYS_PER_LEVEL,
  MAX_STRING_LENGTH,
  MAX_ARRAY_LENGTH,
  MAX_PAYLOAD_SIZE_BYTES,
  EVENT_NAME_PATTERN,
  PROPERTY_KEY_PATTERN,
} as const;
