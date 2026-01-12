import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleIngest } from '../../../../src/app/core/ingest-handler.js';
import type { CoreIngestRequest, CoreProcessorRequest } from '../../../../src/app/core/types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Core Ingest Handler', () => {
  let mockQueueAdapter: any;
  let mockRawStorage: any;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockQueueAdapter = {
      enqueue: jest
        .fn<(message: CoreProcessorRequest) => Promise<void>>()
        .mockResolvedValue(undefined),
    } as any;

    mockRawStorage = {
      storeRawBatch: jest.fn(() =>
        Promise.resolve({ batchId: 'test-batch', storageLocation: 'test-location' })
      ),
    } as any;

    logger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });
  });

  describe('handleIngest', () => {
    it('should enqueue events and return success response', async () => {
      const request: CoreIngestRequest = {
        requestId: 'req-123',
        payload: {
          schemaVersion: SCHEMA_VERSION,
          events: [
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440000',
              type: 'track',
              name: 'button.clicked',
              occurredAt: '2026-01-08T06:00:00Z',
              source: {
                appId: 'web-storefront',
                platform: 'web',
                env: 'prod',
              },
              actor: {
                userId: 'user-123',
              },
            },
          ],
        },
      };

      const result = await handleIngest(request, {
        logger,
        queueAdapter: mockQueueAdapter,
        rawStorage: mockRawStorage,
      });

      expect(result.accepted).toBe(true);
      expect(result.eventCount).toBe(1);
      expect(result.batchId).toBeDefined();
      expect(mockQueueAdapter.enqueue).toHaveBeenCalledTimes(1);
      expect(mockQueueAdapter.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          batchId: expect.any(String),
          storageLocation: 'test-location',
          events: request.payload.events,
        })
      );
    });

    it('should handle multiple events in batch', async () => {
      const request: CoreIngestRequest = {
        requestId: 'req-456',
        payload: {
          schemaVersion: SCHEMA_VERSION,
          events: [
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440000',
              type: 'track',
              name: 'event.one',
              occurredAt: '2026-01-08T06:00:00Z',
              source: { appId: 'app', platform: 'web', env: 'prod' },
              actor: { userId: 'user-1' },
            },
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440001',
              type: 'track',
              name: 'event.two',
              occurredAt: '2026-01-08T06:00:01Z',
              source: { appId: 'app', platform: 'web', env: 'prod' },
              actor: { userId: 'user-1' },
            },
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440002',
              type: 'track',
              name: 'event.three',
              occurredAt: '2026-01-08T06:00:02Z',
              source: { appId: 'app', platform: 'web', env: 'prod' },
              actor: { userId: 'user-1' },
            },
          ],
        },
      };

      const result = await handleIngest(request, {
        logger,
        queueAdapter: mockQueueAdapter,
        rawStorage: mockRawStorage,
      });

      expect(result.accepted).toBe(true);
      expect(result.eventCount).toBe(3);
      expect(mockQueueAdapter.enqueue).toHaveBeenCalledTimes(1);
    });

    it('should generate unique batch IDs', async () => {
      const request: CoreIngestRequest = {
        requestId: 'req-789',
        payload: {
          schemaVersion: SCHEMA_VERSION,
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
        },
      };

      const result1 = await handleIngest(request, {
        logger,
        queueAdapter: mockQueueAdapter,
        rawStorage: {} as any,
      });

      const result2 = await handleIngest(request, {
        logger,
        queueAdapter: mockQueueAdapter,
        rawStorage: {} as any,
      });

      expect(result1.batchId).not.toBe(result2.batchId);
    });

    it('should throw error when queue adapter fails', async () => {
      mockQueueAdapter.enqueue.mockRejectedValue(new Error('Queue error'));

      const request: CoreIngestRequest = {
        requestId: 'req-error',
        payload: {
          schemaVersion: SCHEMA_VERSION,
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
        },
      };

      await expect(
        handleIngest(request, {
          logger,
          queueAdapter: mockQueueAdapter,
          rawStorage: {} as any,
        })
      ).rejects.toThrow('Queue error');
    });

    it('should include event IDs in queue message', async () => {
      const request: CoreIngestRequest = {
        requestId: 'req-123',
        payload: {
          schemaVersion: SCHEMA_VERSION,
          events: [
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: 'evt-001',
              type: 'track',
              name: 'test.one',
              occurredAt: '2026-01-08T06:00:00Z',
              source: { appId: 'app', platform: 'web', env: 'prod' },
              actor: { userId: 'user-1' },
            },
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: 'evt-002',
              type: 'track',
              name: 'test.two',
              occurredAt: '2026-01-08T06:00:01Z',
              source: { appId: 'app', platform: 'web', env: 'prod' },
              actor: { userId: 'user-1' },
            },
          ],
        },
      };

      await handleIngest(request, {
        logger,
        queueAdapter: mockQueueAdapter,
        rawStorage: {} as any,
      });

      const enqueuedMessage = mockQueueAdapter.enqueue.mock.calls[0][0];
      expect(enqueuedMessage.events.map((e: any) => e.eventId)).toEqual(['evt-001', 'evt-002']);
    });
  });
});
