import { describe, it, expect } from '@jest/globals';
import {
  ingestEventSchema,
  ingestRequestEnvelopeSchema,
  queryEventsInputSchema,
  VALIDATION_CONSTANTS,
  type IngestEvent,
  type IngestRequestEnvelope,
  SCHEMA_VERSION,
} from '../../../src/domain/index.js';

describe('Domain Validation', () => {
  describe('ingestEventSchema', () => {
    describe('track event', () => {
      it('should validate a valid track event', () => {
        const validTrackEvent: IngestEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
            sessionId: 'session_456',
          },
          properties: {
            button_id: 'checkout_btn',
            page_name: 'cart',
          },
        };

        const result = ingestEventSchema.safeParse(validTrackEvent);
        expect(result.success).toBe(true);
      });

      it('should reject track event with invalid name pattern', () => {
        const invalidEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'ButtonClicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
        };

        const result = ingestEventSchema.safeParse(invalidEvent);
        expect(result.success).toBe(false);
      });

      it('should reject track event with property key starting with underscore', () => {
        const invalidEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
          properties: {
            _internal: 'value',
          },
        };

        const result = ingestEventSchema.safeParse(invalidEvent);
        expect(result.success).toBe(false);
      });

      it('should reject track event with properties exceeding max depth', () => {
        const invalidEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
          properties: {
            level1: {
              level2: {
                level3: {
                  level4: 'too deep',
                },
              },
            },
          },
        };

        const result = ingestEventSchema.safeParse(invalidEvent);
        expect(result.success).toBe(false);
      });

      it('should accept track event with properties at max depth', () => {
        const validEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
          properties: {
            level1: {
              level2: {
                level3: 'ok',
              },
            },
          },
        };

        const result = ingestEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      });
    });

    describe('page event', () => {
      it('should validate a valid page event', () => {
        const validPageEvent: IngestEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440001',
          type: 'page',
          name: 'page.viewed',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            anonymousId: 'anon_789',
          },
          context: {
            page: {
              url: 'https://example.com/products',
              path: '/products',
              title: 'Products',
            },
          },
        };

        const result = ingestEventSchema.safeParse(validPageEvent);
        expect(result.success).toBe(true);
      });
    });

    describe('identify event', () => {
      it('should validate a valid identify event', () => {
        const validIdentifyEvent: IngestEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440002',
          type: 'identify',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
          traits: {
            email: 'user@example.com',
            plan: 'premium',
          },
        };

        const result = ingestEventSchema.safeParse(validIdentifyEvent);
        expect(result.success).toBe(true);
      });

      it('should reject identify event without traits', () => {
        const invalidEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440002',
          type: 'identify',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
        };

        const result = ingestEventSchema.safeParse(invalidEvent);
        expect(result.success).toBe(false);
      });
    });

    describe('actor validation', () => {
      it('should reject event without userId or anonymousId', () => {
        const invalidEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            sessionId: 'session_456',
          },
        };

        const result = ingestEventSchema.safeParse(invalidEvent);
        expect(result.success).toBe(false);
      });

      it('should accept event with only userId', () => {
        const validEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            userId: 'user_123',
          },
        };

        const result = ingestEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      });

      it('should accept event with only anonymousId', () => {
        const validEvent = {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-07T20:00:00Z',
          source: {
            appId: 'web-storefront',
            platform: 'web',
            env: 'prod',
          },
          actor: {
            anonymousId: 'anon_789',
          },
        };

        const result = ingestEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ingestRequestEnvelopeSchema', () => {
    it('should validate a valid request envelope', () => {
      const validEnvelope: IngestRequestEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        sentAt: '2026-01-07T20:00:00Z',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'prod',
            },
            actor: {
              userId: 'user_123',
            },
          },
        ],
      };

      const result = ingestRequestEnvelopeSchema.safeParse(validEnvelope);
      expect(result.success).toBe(true);
    });

    it('should reject envelope with empty events array', () => {
      const invalidEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        events: [],
      };

      const result = ingestRequestEnvelopeSchema.safeParse(invalidEnvelope);
      expect(result.success).toBe(false);
    });

    it('should reject envelope exceeding max events per batch', () => {
      const events = Array.from({ length: VALIDATION_CONSTANTS.MAX_EVENTS_PER_BATCH + 1 }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-07T20:00:00Z',
        source: {
          appId: 'test-app',
          platform: 'web' as const,
          env: 'dev' as const,
        },
        actor: {
          userId: 'user_123',
        },
      }));

      const invalidEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        events,
      };

      const result = ingestRequestEnvelopeSchema.safeParse(invalidEnvelope);
      expect(result.success).toBe(false);
    });

    it('should reject envelope with wrong schema version', () => {
      const invalidEnvelope = {
        schemaVersion: '2.0.0',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'prod',
            },
            actor: {
              userId: 'user_123',
            },
          },
        ],
      };

      const result = ingestRequestEnvelopeSchema.safeParse(invalidEnvelope);
      expect(result.success).toBe(false);
    });
  });

  describe('queryEventsInputSchema', () => {
    it('should validate valid query input', () => {
      const validQuery = {
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-07T23:59:59Z',
        types: ['track', 'page'],
        limit: 50,
        sort: 'desc',
      };

      const result = queryEventsInputSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate query with minimal required fields', () => {
      const validQuery = {
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
      };

      const result = queryEventsInputSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should reject query with limit exceeding max', () => {
      const invalidQuery = {
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        limit: 201,
      };

      const result = queryEventsInputSchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject query with invalid event type', () => {
      const invalidQuery = {
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        types: ['invalid_type'],
      };

      const result = queryEventsInputSchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should accept query with all optional filters', () => {
      const validQuery = {
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-07T23:59:59Z',
        types: ['track'],
        names: ['button.clicked', 'page.viewed'],
        userId: 'user_123',
        anonymousId: 'anon_456',
        sessionId: 'session_789',
        limit: 100,
        cursor: 'eyJwayI6InRlc3QifQ==',
        sort: 'asc',
      };

      const result = queryEventsInputSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });
});
