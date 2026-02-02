import { describe, it, expect } from '@jest/globals';
import { SCHEMA_VERSION } from '../../../src/domain/index.js';
import { createValidateIngestRequestEnvelope } from '../../../src/domain/validation.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';

describe('Consent Validation', () => {
  const limits = loadLimitsConfig();
  const validate = createValidateIngestRequestEnvelope(limits);

  const baseEvent = {
    schemaVersion: SCHEMA_VERSION,
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'track' as const,
    name: 'test.event',
    occurredAt: '2026-01-08T06:00:00Z',
    source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
    actor: { userId: 'user-123' },
  };

  describe('Valid Consent', () => {
    it('should accept event with complete consent object', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: false,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept event with all consent flags set to true', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept event with all consent flags set to false', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: false,
              experimentation: false,
              personalization: false,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept event without consent (consent is optional)', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [baseEvent],
      });

      expect(result.success).toBe(true);
    });

    it('should accept consent with ISO 8601 datetime with milliseconds', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00.123Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept consent with UTC timezone (Z)', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: false,
              personalization: true,
              timestamp: '2026-01-08T06:00:00.000Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Consent - Missing Required Fields', () => {
    it('should reject consent missing analytics field', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent missing experimentation field', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent missing personalization field', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: false,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent missing timestamp field', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent with only analytics and timestamp (old format)', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Invalid Consent - Wrong Types', () => {
    it('should reject consent with analytics as string', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: 'true',
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent with experimentation as string', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: 'false',
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent with personalization as number', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: 1,
              timestamp: '2026-01-08T06:00:00Z',
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent with invalid timestamp format', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08 06:00:00',
            },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should reject consent with timestamp as number', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: 1704697200000,
            } as any,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Consent with Other Event Types', () => {
    it('should accept consent on page event', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'page' as const,
            name: 'home.viewed',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
            actor: { userId: 'user-123' },
            consent: {
              analytics: true,
              experimentation: true,
              personalization: false,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept consent on identify event', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'identify' as const,
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
            actor: { userId: 'user-123' },
            traits: { email: 'user@example.com' },
            consent: {
              analytics: false,
              experimentation: false,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Consent Does Not Affect Other Validations', () => {
    it('should still reject invalid eventId even with valid consent', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            eventId: 'not-a-uuid',
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should still reject invalid event name pattern even with valid consent', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            name: 'InvalidName',
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should still reject camelCase property keys even with valid consent', () => {
      const result = validate({
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            ...baseEvent,
            properties: { invalidKey: 'value' },
            consent: {
              analytics: true,
              experimentation: true,
              personalization: true,
              timestamp: '2026-01-08T06:00:00Z',
            },
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });
});
