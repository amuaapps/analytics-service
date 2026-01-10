import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest, CoreQueryResponse } from '../../../../src/app/core/types.js';
import type { Logger } from '../../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';
import type { QueryEventsInput } from '../../../../src/domain/query-types.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Core Processor Handler', () => {
  const limits = loadLimitsConfig();
  let mockLogger: Logger;
  let mockOperationalStorage: any;
  let mockRawStorage: any;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockOperationalStorage = {
      storeEvents: jest.fn<(events: StoredEvent[]) => Promise<void>>().mockResolvedValue(undefined),
      queryEvents: jest.fn<(input: QueryEventsInput) => Promise<CoreQueryResponse>>().mockResolvedValue({
        events: [],
        hasMore: false,
      }),
      checkEventExists: jest.fn<(eventId: string) => Promise<boolean>>().mockResolvedValue(false),
    };

    mockRawStorage = {
      storeRawBatch: jest.fn().mockResolvedValue({ batchId: 'test-batch', storageLocation: 'test-location' }),
      getRawBatch: jest.fn().mockResolvedValue({
        batchId: 'test-batch',
        requestId: 'test-request',
        receivedAt: '2026-01-08T06:00:00Z',
        events: [],
      }),
    } as any;

    logger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });

    mockLogger = logger;
  });

  describe('handleProcessor', () => {
    it('should process events and store them', async () => {
      const testEvents = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-08T06:00:00Z',
          source: { appId: 'web-storefront', platform: 'web', env: 'prod' },
          actor: { userId: 'user-123' },
        },
      ];

      (mockRawStorage.getRawBatch as jest.Mock).mockResolvedValueOnce({
        batchId: 'batch-456',
        requestId: 'req-123',
        receivedAt: '2026-01-08T06:00:00Z',
        events: testEvents,
      });

      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        receivedAt: '2026-01-08T06:00:00Z',
        storageLocation: 's3://bucket/key',
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(request, deps);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockOperationalStorage.storeEvents).toHaveBeenCalledTimes(1);
      expect(mockOperationalStorage.storeEvents).toHaveBeenCalledWith(
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
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'track',
            name: 'event.two',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440003',
            type: 'page',
            name: 'page.viewed',
            occurredAt: '2026-01-08T06:00:02Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(request, deps);

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockOperationalStorage.storeEvents).toHaveBeenCalledTimes(1);
      
      const storedEvents = mockOperationalStorage.storeEvents.mock.calls[0][0];
      expect(storedEvents).toHaveLength(3);
      expect(storedEvents.map((e: { eventId: string }) => e.eventId)).toEqual(
        expect.arrayContaining([
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440002',
          '550e8400-e29b-41d4-a716-446655440003'
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

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      await handleProcessor(request, deps);

      const storedEvents = mockOperationalStorage.storeEvents.mock.calls[0][0];
      expect(storedEvents[0].receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(storedEvents[0].processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return error response when storage fails', async () => {
      mockOperationalStorage.storeEvents.mockRejectedValueOnce(new Error('Storage failure'));

      const request: CoreProcessorRequest = {
        requestId: 'req-error',
        batchId: 'batch-error',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440010',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440011',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(request, deps);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(2);
      expect(result.errors?.[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440010');
      expect(result.errors?.[0].error).toBeDefined();
      expect(result.errors?.[1].eventId).toBe('550e8400-e29b-41d4-a716-446655440011');
      expect(result.errors?.[1].error).toBeDefined();
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

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(request, deps);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should reject malformed messages without storing events', async () => {
      const malformedRequest: CoreProcessorRequest = {
        requestId: 'req-malformed',
        batchId: 'batch-malformed',
        events: [
          {
            // Missing required fields - invalid event
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440099',
            type: 'track' as any,
            // Missing: name, occurredAt, source, actor
          } as any,
        ],
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(malformedRequest, deps);

      // Should not crash
      expect(result).toBeDefined();
      
      // Should not process any events
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      
      // Should not write to operational storage
      expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
      
      // Should not write to raw storage
      expect(mockRawStorage.storeRawBatch).not.toHaveBeenCalled();
      
      // Should return validation error
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].eventId).toBe('batch');
      expect(result.errors![0].error).toContain('Validation failed');
    });

    it('should reject batch with invalid event type', async () => {
      const invalidTypeRequest: CoreProcessorRequest = {
        requestId: 'req-invalid-type',
        batchId: 'batch-invalid-type',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440098',
            type: 'invalid_type' as any, // Invalid event type
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          } as any,
        ],
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(invalidTypeRequest, deps);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
      expect(mockRawStorage.storeRawBatch).not.toHaveBeenCalled();
    });

    it('should reject batch exceeding size limits', async () => {
      const largePropertiesRequest: CoreProcessorRequest = {
        requestId: 'req-large',
        batchId: 'batch-large',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440097',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
            properties: {
              // Create a very long string that exceeds maxStringLength
              longString: 'x'.repeat(limits.maxStringLength + 1000),
            },
          },
        ],
      };

      const deps = {
        logger: mockLogger,
        operationalStorage: mockOperationalStorage,
        rawStorage: mockRawStorage,
        limits,
      };

      const result = await handleProcessor(largePropertiesRequest, deps);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
      expect(mockRawStorage.storeRawBatch).not.toHaveBeenCalled();
      // Validation will fail on depth before checking string length
      expect(result.errors![0].error).toContain('Validation failed');
    });
  });
});
