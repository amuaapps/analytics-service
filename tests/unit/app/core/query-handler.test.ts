import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleQuery } from '../../../../src/app/core/query-handler.js';
import type { CoreQueryRequest, CoreQueryResponse } from '../../../../src/app/core/types.js';
import type { QueryEventsInput } from '../../../../src/domain/query-types.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Core Query Handler', () => {
  let mockStorageAdapter: any;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockStorageAdapter = {
      storeEvents: jest.fn<(events: StoredEvent[]) => Promise<void>>().mockResolvedValue(undefined),
      queryEvents: jest
        .fn<(input: QueryEventsInput) => Promise<CoreQueryResponse>>()
        .mockResolvedValue({
          events: [],
          hasMore: false,
        }),
      checkEventExists: jest.fn<(eventId: string) => Promise<boolean>>().mockResolvedValue(false),
    };

    logger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });
  });

  describe('handleQuery', () => {
    it('should query events and return results', async () => {
      const mockEvents: StoredEvent[] = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-08T06:00:00Z',
          source: { appId: 'web-storefront', platform: 'web', env: 'prod' },
          actor: { userId: 'user-123' },
          receivedAt: '2026-01-08T06:00:01Z',
          processedAt: '2026-01-08T06:00:02Z',
        },
      ];

      mockStorageAdapter.queryEvents.mockResolvedValue({
        events: mockEvents,
        hasMore: false,
      });

      const request: CoreQueryRequest = {
        requestId: 'req-123',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-31T23:59:59Z',
        },
      };

      const result = await handleQuery(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.events).toEqual(mockEvents);
      expect(result.hasMore).toBe(false);
      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(request.input);
    });

    it('should handle pagination with cursor', async () => {
      const mockEvents: StoredEvent[] = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: 'evt-001',
          type: 'track',
          name: 'test.event',
          occurredAt: '2026-01-08T06:00:00Z',
          receivedAt: '2026-01-08T06:00:01Z',
          processedAt: '2026-01-08T06:00:02Z',
          source: { appId: 'app', platform: 'web', env: 'prod' },
          actor: { userId: 'user-1' },
          properties: {},
        },
      ];

      const mockCursor = JSON.stringify({ pk: 'APP#app', sk: 'TS#123#EVT#evt-001' });
      mockStorageAdapter.queryEvents.mockResolvedValueOnce({
        events: mockEvents,
        hasMore: true,
        cursor: mockCursor,
      });

      // Create a valid base64url encoded cursor
      const validCursor = Buffer.from(
        JSON.stringify({ pk: 'APP#app', sk: 'TS#123#EVT#evt-000' }),
        'utf-8'
      ).toString('base64url');

      const request: CoreQueryRequest = {
        requestId: 'req-456',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          cursor: validCursor,
          limit: 50,
        },
      };

      const result = await handleQuery(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.events).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
      expect(typeof result.cursor).toBe('string');
    });

    it('should filter by event types', async () => {
      const request: CoreQueryRequest = {
        requestId: 'req-789',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          types: ['track', 'page'],
        },
      };

      await handleQuery(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['track', 'page'],
        })
      );
    });

    it('should filter by userId', async () => {
      const request: CoreQueryRequest = {
        requestId: 'req-user',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
          userId: 'user-123',
        },
      };

      await handleQuery(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        })
      );
    });

    it('should throw error when storage adapter fails', async () => {
      mockStorageAdapter.queryEvents.mockRejectedValue(new Error('Storage error'));

      const request: CoreQueryRequest = {
        requestId: 'req-error',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
        },
      };

      await expect(
        handleQuery(request, {
          logger,
          storageAdapter: mockStorageAdapter,
        })
      ).rejects.toThrow('Storage error');
    });

    it('should return empty results when no events match', async () => {
      mockStorageAdapter.queryEvents.mockResolvedValue({
        events: [],
        hasMore: false,
      });

      const request: CoreQueryRequest = {
        requestId: 'req-empty',
        input: {
          appId: 'web-storefront',
          from: '2026-01-01T00:00:00Z',
        },
      };

      const result = await handleQuery(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.events).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
