import { describe, it, expect } from '@jest/globals';
import { validateQueryEventsInput } from '../../../src/domain/query-validation.js';

describe('Query Validation', () => {
  describe('Required Parameters', () => {
    it('should validate query with minimal required fields', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
      });

      expect(result.appId).toBe('web-storefront');
      expect(result.from).toBe('2026-01-01T00:00:00Z');
    });

    it('should require appId', () => {
      expect(() =>
        validateQueryEventsInput({
          from: '2026-01-01T00:00:00Z',
        } as any)
      ).toThrow();
    });

    it('should require from timestamp', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
        } as any)
      ).toThrow();
    });
  });

  describe('Limit Parameter', () => {
    it('should reject limit exceeding max', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          limit: 201, // Max is 200
        })
      ).toThrow();
    });

    it('should reject negative limit', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          limit: -1,
        })
      ).toThrow();
    });

    it('should reject zero limit', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          limit: 0,
        })
      ).toThrow();
    });

    it('should accept valid limit', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        limit: 100,
      });

      expect(result.limit).toBe(100);
    });
  });

  describe('Sort Parameter', () => {
    it('should accept asc sort', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        sort: 'asc',
      });

      expect(result.sort).toBe('asc');
    });

    it('should accept desc sort', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        sort: 'desc',
      });

      expect(result.sort).toBe('desc');
    });

    it('should reject invalid sort value', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          sort: 'invalid',
        } as any)
      ).toThrow();
    });
  });

  describe('Optional Filters', () => {
    it('should accept query with all optional filters', () => {
      const result = validateQueryEventsInput({
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
      });

      expect(result.appId).toBe('web-storefront');
      expect(result.types).toEqual(['track']);
      expect(result.userId).toBe('user_123');
    });

    it('should accept query with to timestamp', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });

      expect(result.to).toBe('2026-01-31T23:59:59Z');
    });

    it('should accept query with event types filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        types: ['track', 'page'],
      });

      expect(result.types).toEqual(['track', 'page']);
    });

    it('should accept query with event names filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        names: ['button.clicked'],
      });

      expect(result.names).toEqual(['button.clicked']);
    });

    it('should accept query with userId filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        userId: 'user_123',
      });

      expect(result.userId).toBe('user_123');
    });

    it('should accept query with cursor for pagination', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: '2026-01-01T00:00:00Z',
        cursor: 'eyJwayI6InRlc3QiLCJzayI6InRlc3QifQ==',
      });

      expect(result.cursor).toBe('eyJwayI6InRlc3QiLCJzayI6InRlc3QifQ==');
    });
  });
});
