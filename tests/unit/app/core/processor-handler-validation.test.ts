import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../../src/app/core/types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';

describe('Processor Handler - Validation', () => {
  let mockOperationalStorage: any;
  let mockRawStorage: any;
  let mockLogger: any;
  let limits: ReturnType<typeof loadLimitsConfig>;

  beforeEach(() => {
    limits = loadLimitsConfig();

    mockOperationalStorage = {
      storeEvents: jest.fn(() => Promise.resolve()),
      queryEvents: jest.fn(() =>
        Promise.resolve({
          events: [],
          hasMore: false,
          cursor: undefined,
        })
      ),
      checkEventExists: jest.fn(() => Promise.resolve(false)),
    };

    mockRawStorage = {
      storeRawBatch: jest.fn(() =>
        Promise.resolve({ batchId: 'test-batch', storageLocation: 'test-location' })
      ),
      getRawBatch: jest.fn(() =>
        Promise.resolve({
          batchId: 'test-batch',
          requestId: 'test-request',
          receivedAt: '2026-01-08T06:00:00Z',
          events: [],
        })
      ),
    };

    const logger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });

    mockLogger = logger;
  });

  it('should reject messages with invalid event schema', async () => {
    const testEvents = [
      {
        // Missing required fields
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track',
      } as any,
    ];

    mockRawStorage.getRawBatch.mockResolvedValueOnce({
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

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
  });

  it('should not store events when validation fails', async () => {
    const testEvents = [
      {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'invalid-type',
        // Missing other required fields
      } as any,
    ];

    mockRawStorage.getRawBatch.mockResolvedValueOnce({
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

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
  });

  it('should return proper error response for poison messages', async () => {
    const testEvents = [
      {
        // Completely invalid structure
        invalid: 'data',
      } as any,
    ];

    mockRawStorage.getRawBatch.mockResolvedValueOnce({
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

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].error).toContain('Validation failed');
  });
});
