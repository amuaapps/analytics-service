import { describe, it, expect } from '@jest/globals';
import { validateQueryEventsInput } from '../../../src/domain/query-validation.js';

describe('Query Validation', () => {
  // Use a recent date within 31-day window for all tests
  const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday

  describe('Required Parameters', () => {
    it('should validate query with minimal required fields', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
      });

      expect(result.appId).toBe('web-storefront');
      expect(result.from).toBe(recentDate);
    });

    it('should require appId', () => {
      expect(() =>
        validateQueryEventsInput({
          from: recentDate,
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
          from: recentDate,
          limit: 201, // Max is 200
        })
      ).toThrow();
    });

    it('should reject negative limit', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: recentDate,
          limit: -1,
        })
      ).toThrow();
    });

    it('should reject zero limit', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: recentDate,
          limit: 0,
        })
      ).toThrow();
    });

    it('should accept valid limit', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        limit: 100,
      });

      expect(result.limit).toBe(100);
    });
  });

  describe('Sort Parameter', () => {
    it('should accept asc sort', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        sort: 'asc',
      });

      expect(result.sort).toBe('asc');
    });

    it('should accept desc sort', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        sort: 'desc',
      });

      expect(result.sort).toBe('desc');
    });

    it('should reject invalid sort value', () => {
      expect(() =>
        validateQueryEventsInput({
          appId: 'web-storefront',
          from: recentDate,
          sort: 'invalid',
        } as any)
      ).toThrow();
    });
  });

  describe('Optional Filters', () => {
    it('should accept query with all optional filters', () => {
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
      const toDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // Yesterday

      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: fromDate,
        to: toDate,
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
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      const toDate = new Date().toISOString(); // Now

      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: fromDate,
        to: toDate,
      });

      expect(result.to).toBe(toDate);
    });

    it('should accept query with event types filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        types: ['track', 'page'],
      });

      expect(result.types).toEqual(['track', 'page']);
    });

    it('should accept query with event names filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        names: ['button.clicked'],
      });

      expect(result.names).toEqual(['button.clicked']);
    });

    it('should accept query with userId filter', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        userId: 'user_123',
      });

      expect(result.userId).toBe('user_123');
    });

    it('should accept query with cursor for pagination', () => {
      const result = validateQueryEventsInput({
        appId: 'web-storefront',
        from: recentDate,
        cursor: 'eyJwayI6InRlc3QiLCJzayI6InRlc3QifQ==',
      });

      expect(result.cursor).toBe('eyJwayI6InRlc3QiLCJzayI6InRlc3QifQ==');
    });
  });
});
