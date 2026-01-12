import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../../src/app/core/types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Processor Handler - Error Handling', () => {
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

  it('should handle storage failures gracefully', async () => {
    mockOperationalStorage.storeEvents.mockRejectedValue(new Error('Storage failure'));

    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track',
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
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
    expect(result.errors).toHaveLength(1);
  });

  it('should handle getRawBatch failures', async () => {
    mockRawStorage.getRawBatch.mockRejectedValue(new Error('Failed to fetch raw batch'));

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

    await expect(handleProcessor(request, deps)).rejects.toThrow('Failed to fetch raw batch');
  });
});
