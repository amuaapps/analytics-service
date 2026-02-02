import { z } from 'zod';
import { SCHEMA_VERSION } from './base-types.js';
import type { LimitsConfig } from '../config/types.js';

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

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

// Context schema uses fixed limits (not configurable)
// Uses passthrough() to preserve unknown keys for extensibility
// while validating known fields
const contextSchema = z
  .object({
    sessionId: z.string().max(255).optional(),
    locale: z.string().max(50).optional(),
    timezone: z.string().max(100).optional(),
    page: z
      .object({
        url: z.string().max(2048).optional(),
        path: z.string().max(2048).optional(),
        referrer: z.string().max(2048).optional(),
        title: z.string().max(2048).optional(),
      })
      .optional(),
    userAgent: z.string().max(2048).optional(),
    device: z.record(z.unknown()).optional(),
  })
  .passthrough() // Preserve unknown keys for extensibility (e.g., testRun, ip, custom metadata)
  .optional();

const consentSchema = z
  .object({
    analytics: z.boolean(),
    experimentation: z.boolean(),
    personalization: z.boolean(),
    timestamp: z.string().datetime(),
  })
  .optional();

const validatePropertyKey = (key: string): boolean => {
  if (key.startsWith('_')) return false;
  return PROPERTY_KEY_PATTERN.test(key);
};

function createValidatePropertiesDepth(limits: LimitsConfig) {
  return (obj: unknown, maxDepth: number, currentDepth = 0): boolean => {
    if (currentDepth > maxDepth) return false;
    if (typeof obj !== 'object' || obj === null) return true;

    if (Array.isArray(obj)) {
      if (obj.length > limits.maxArrayLength) return false;
      return obj.every((item) =>
        createValidatePropertiesDepth(limits)(item, maxDepth, currentDepth + 1)
      );
    }

    const keys = Object.keys(obj);
    if (keys.length > limits.maxKeysPerLevel) return false;
    if (!keys.every(validatePropertyKey)) return false;

    return keys.every((key) =>
      createValidatePropertiesDepth(limits)(
        (obj as Record<string, unknown>)[key],
        maxDepth,
        currentDepth + 1
      )
    );
  };
}

function createValidateStringLength(limits: LimitsConfig) {
  const validate = (obj: unknown): boolean => {
    if (typeof obj === 'string') {
      return obj.length <= limits.maxStringLength;
    }
    if (typeof obj !== 'object' || obj === null) return true;

    if (Array.isArray(obj)) {
      return obj.every(validate);
    }

    return Object.values(obj).every(validate);
  };
  return validate;
}

function createPropertiesSchema(limits: LimitsConfig) {
  const validatePropertiesDepth = createValidatePropertiesDepth(limits);
  const validateStringLength = createValidateStringLength(limits);

  return z
    .record(z.unknown())
    .refine((data) => validatePropertiesDepth(data, limits.maxPropertyDepth), {
      message: `Properties must not exceed depth of ${limits.maxPropertyDepth}`,
    })
    .refine((data) => validateStringLength(data), {
      message: `String values must not exceed ${limits.maxStringLength} characters`,
    })
    .optional();
}

function createTraitsSchema(limits: LimitsConfig) {
  const validatePropertiesDepth = createValidatePropertiesDepth(limits);
  const validateStringLength = createValidateStringLength(limits);

  return z
    .record(z.unknown())
    .refine((data) => validatePropertiesDepth(data, limits.maxPropertyDepth), {
      message: `Traits must not exceed depth of ${limits.maxPropertyDepth}`,
    })
    .refine((data) => validateStringLength(data), {
      message: `String values must not exceed ${limits.maxStringLength} characters`,
    })
    .optional();
}

const baseEventSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: sourceSchema,
  actor: actorSchema,
  context: contextSchema,
  consent: consentSchema,
});

function createTrackEventSchema(limits: LimitsConfig) {
  const propertiesSchema = createPropertiesSchema(limits);

  return baseEventSchema.extend({
    type: z.literal('track'),
    name: z.string().regex(EVENT_NAME_PATTERN, {
      message: 'Event name must be lowercase snake_case with optional dot namespaces',
    }),
    properties: propertiesSchema,
  });
}

function createPageEventSchema(limits: LimitsConfig) {
  const propertiesSchema = createPropertiesSchema(limits);

  return baseEventSchema.extend({
    type: z.literal('page'),
    name: z.string().regex(EVENT_NAME_PATTERN, {
      message: 'Event name must be lowercase snake_case with optional dot namespaces',
    }),
    properties: propertiesSchema,
  });
}

function createIdentifyEventSchema(limits: LimitsConfig) {
  const traitsSchema = createTraitsSchema(limits);

  return baseEventSchema.extend({
    type: z.literal('identify'),
    traits: traitsSchema,
  });
}

function createIngestEventSchema(limits: LimitsConfig) {
  return z.discriminatedUnion('type', [
    createTrackEventSchema(limits),
    createPageEventSchema(limits),
    createIdentifyEventSchema(limits),
  ]);
}

export function createIngestRequestEnvelopeSchema(limits: LimitsConfig) {
  const ingestEventSchema = createIngestEventSchema(limits);

  return z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      sentAt: z.string().datetime().optional(),
      events: z
        .array(ingestEventSchema)
        .min(
          limits.minEventsPerBatch,
          `Batch must contain at least ${limits.minEventsPerBatch} event`
        )
        .max(
          limits.maxEventsPerBatch,
          `Batch must not exceed ${limits.maxEventsPerBatch} events per request`
        ),
    })
    .refine(
      (data) => {
        const size = JSON.stringify(data).length;
        return size <= limits.maxPayloadSizeBytes;
      },
      {
        message: `Payload size must not exceed ${limits.maxPayloadSizeBytes} bytes`,
      }
    );
}

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

export const VALIDATION_PATTERNS = {
  EVENT_NAME_PATTERN,
  PROPERTY_KEY_PATTERN,
} as const;

export function createValidateIngestRequestEnvelope(limits: LimitsConfig) {
  const schema = createIngestRequestEnvelopeSchema(limits);
  return (data: unknown) => {
    const result = schema.safeParse(data);

    // Normalize actor.sessionId to context.sessionId for backward compatibility
    if (result.success) {
      result.data.events = result.data.events.map((event) => {
        // If actor.sessionId is present but context.sessionId is not, move it
        if (event.actor.sessionId && !event.context?.sessionId) {
          return {
            ...event,
            context: {
              ...event.context,
              sessionId: event.actor.sessionId,
            },
            actor: {
              ...event.actor,
              sessionId: undefined, // Remove from actor after moving
            },
          };
        }
        return event;
      });
    }

    return result;
  };
}
