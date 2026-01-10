import { describe, it, expect } from '@jest/globals';
import { SCHEMA_VERSION } from '../../../src/domain/index.js';
import { createValidateIngestRequestEnvelope } from '../../../src/domain/validation.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';

describe('Event Validation', () => {
  const limits = loadLimitsConfig();
  const validate = createValidateIngestRequestEnvelope(limits);

  describe('Track Events', () => {
    it('should validate a valid track event', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'button.clicked',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user-123' },
            properties: { button_id: 'checkout_btn', page_name: 'cart' },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject track event with invalid name pattern', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'ButtonClicked', // Invalid: should be snake_case or dot.case
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject track event without required name', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web', env: 'prod' },
            actor: { userId: 'user_123' },
          } as any,
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Page Events', () => {
    it('should validate a valid page event', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'page' as const,
            name: 'home.viewed',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
            page: { url: 'https://example.com/home', title: 'Home Page' },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept page event with optional referrer', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'page' as const,
            name: 'product.viewed',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
            page: {
              url: 'https://example.com/products/123',
              title: 'Product Page',
              referrer: 'https://google.com',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Identify Events', () => {
    it('should validate a valid identify event', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'identify' as const,
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
            traits: { email: 'user@example.com', plan: 'premium' },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject identify event without traits', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'identify',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web', env: 'prod' },
            actor: { userId: 'user_123' },
          } as any,
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Common Event Fields', () => {
    it('should require valid UUID for eventId', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'not-a-uuid',
            type: 'track' as const,
            name: 'test.event',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should require ISO 8601 timestamp for occurredAt', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'test.event',
            occurredAt: '2026-01-07 20:00:00', // Invalid format
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: { userId: 'user_123' },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should require either userId or anonymousId in actor', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'test.event',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
            actor: {}, // Missing userId or anonymousId
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });
});
