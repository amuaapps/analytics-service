import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest, CoreQueryResponse, StorageAdapter } from '../../../../src/app/core/types.js';
import type { QueryEventsInput } from '../../../../src/domain/query-types.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Core Processor Handler', () => {
  let mockStorageAdapter: jest.Mocked<StorageAdapter>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockStorageAdapter = {
      storeEvents: jest.fn<(events: StoredEvent[]) => Promise<void>>().mockResolvedValue(undefined),
      queryEvents: jest.fn<(input: QueryEventsInput) => Promise<CoreQueryResponse>>().mockResolvedValue({
        events: [],
        hasMore: false,
      }),
    } as jest.Mocked<StorageAdapter>;

    logger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });
  });

  describe('handleProcessor', () => {
    it('should process events and store them', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'web-storefront', platform: 'web', env: 'prod' },
            actor: { userId: 'user-123' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockStorageAdapter.storeEvents).toHaveBeenCalledTimes(1);
      expect(mockStorageAdapter.storeEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            receivedAt: expect.any(String),
            processedAt: expect.any(String),
          }),
        ])
      );
    });

    it('should process multiple events in batch', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'evt-001',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'evt-002',
            type: 'track',
            name: 'event.two',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'evt-003',
            type: 'page',
            name: 'page.viewed',
            occurredAt: '2026-01-08T06:00:02Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockStorageAdapter.storeEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventId: 'evt-001' }),
          expect.objectContaining({ eventId: 'evt-002' }),
          expect.objectContaining({ eventId: 'evt-003' }),
        ])
      );
    });

    it('should add receivedAt and processedAt timestamps', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      await handleProcessor(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      const storedEvents = mockStorageAdapter.storeEvents.mock.calls[0][0];
      expect(storedEvents[0].receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(storedEvents[0].processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return error response when storage fails', async () => {
      mockStorageAdapter.storeEvents.mockRejectedValue(new Error('Storage error'));

      const request: CoreProcessorRequest = {
        requestId: 'req-error',
        batchId: 'batch-error',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'evt-001',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'evt-002',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(2);
      expect(result.errors?.[0]).toEqual({
        eventId: 'evt-001',
        error: 'Storage error',
      });
      expect(result.errors?.[1]).toEqual({
        eventId: 'evt-002',
        error: 'Storage error',
      });
    });

    it('should handle identify events', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'identify',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-123' },
            traits: {
              email: 'user@example.com',
              plan: 'premium',
            },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        storageAdapter: mockStorageAdapter,
      });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
