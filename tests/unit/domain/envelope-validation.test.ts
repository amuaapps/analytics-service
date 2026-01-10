import { describe, it, expect } from '@jest/globals';
import { SCHEMA_VERSION } from '../../../src/domain/index.js';
import { createValidateIngestRequestEnvelope } from '../../../src/domain/validation.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';

describe('Request Envelope Validation', () => {
  const limits = loadLimitsConfig();
  const validate = createValidateIngestRequestEnvelope(limits);

  describe('Envelope Structure', () => {
    it('should validate a valid request envelope', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
            actor: { userId: 'user-123' },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should require schemaVersion', () => {
      const result = validate({
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web', env: 'test' },
            actor: { userId: 'user-123' },
          },
        ],
      } as any);

      expect(result.success).toBe(false);
    });

    it('should require events array', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
      } as any);

      expect(result.success).toBe(false);
    });

    it('should reject empty events array', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Batch Size Limits', () => {
    it('should accept batch at max size limit', () => {
      const maxEvents = limits.maxEventsPerBatch;
      const events = Array.from({ length: maxEvents }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-123' },
      }));

      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events,
      });

      expect(result.success).toBe(true);
    });

    it('should reject batch exceeding max size', () => {
      const tooManyEvents = limits.maxEventsPerBatch + 1;
      const events = Array.from({ length: tooManyEvents }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-123' },
      }));

      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Schema Version', () => {
    it('should accept correct schema version', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track' as const,
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
            actor: { userId: 'user-123' },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid schema version', () => {
      const result = validate({
        schemaVersion: '2.0.0', // Invalid version
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web', env: 'test' },
            actor: { userId: 'user-123' },
          },
        ],
      } as any);

      expect(result.success).toBe(false);
    });
  });
});
