import { describe, it, expect, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../src/app/core/types.js';
import type { RawBatch, RawBatchPointer } from '../../../src/infra/interfaces.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { InMemoryRawStorage } from '../../../src/infra/storage/in-memory-raw-storage.js';
import { createLogger } from '../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';

class FailingRawStorage extends InMemoryRawStorage {
  async storeRawBatch(_batch: RawBatch): Promise<RawBatchPointer> {
    throw new Error('Storage failure');
  }

  async getRawBatch(_pointer: RawBatchPointer): Promise<RawBatch> {
    throw new Error('Failed to retrieve batch');
  }
}

describe('Processor Integration - Error Handling', () => {
  let operationalStorage: InMemoryOperationalStorage;
  let rawStorage: InMemoryRawStorage;
  let logger: ReturnType<typeof createLogger>;
  let limits: ReturnType<typeof loadLimitsConfig>;

  beforeEach(() => {
    logger = createLogger({
      serviceName: 'test-processor',
      level: 'error',
      env: 'test',
    });

    operationalStorage = new InMemoryOperationalStorage(logger);
    rawStorage = new InMemoryRawStorage(logger);
    limits = loadLimitsConfig();
  });

  it('should handle validation errors gracefully', async () => {
    const invalidEvents = [
      {
        // Missing required fields
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track',
      } as any,
    ];

    const pointer = await rawStorage.storeRawBatch({
      batchId: 'batch-invalid',
      requestId: 'req-invalid',
      receivedAt: '2026-01-08T06:00:00Z',
      events: invalidEvents,
    });

    const request: CoreProcessorRequest = {
      requestId: 'req-invalid',
      batchId: pointer.batchId,
      receivedAt: '2026-01-08T06:00:00Z',
      storageLocation: pointer.storageLocation,
    };

    const result = await handleProcessor(request, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].error).toContain('Validation failed');
  });

  it('should handle getRawBatch failures', async () => {
    const failingStorage = new FailingRawStorage(logger);

    const request: CoreProcessorRequest = {
      requestId: 'req-123',
      batchId: 'batch-456',
      receivedAt: '2026-01-08T06:00:00Z',
      storageLocation: 'some-location',
    };

    const deps = {
      logger,
      operationalStorage,
      rawStorage: failingStorage,
      limits,
    };

    const result = await handleProcessor(request, deps);

    // The handler now returns errors instead of throwing
    expect(result.errors).toBeDefined();
    expect(result.errors!).toHaveLength(1);
    expect(result.errors![0].error).toContain('Failed to retrieve batch');
  });

  it('should handle mixed valid and invalid events', async () => {
    const mixedEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'track' as const,
        name: 'valid.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      },
      {
        // Invalid event - missing required fields
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        type: 'track',
      } as any,
    ];

    const pointer = await rawStorage.storeRawBatch({
      batchId: 'batch-mixed',
      requestId: 'req-mixed',
      receivedAt: '2026-01-08T06:00:00Z',
      events: mixedEvents,
    });

    const request: CoreProcessorRequest = {
      requestId: 'req-mixed',
      batchId: pointer.batchId,
      receivedAt: '2026-01-08T06:00:00Z',
      storageLocation: pointer.storageLocation,
    };

    const result = await handleProcessor(request, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    // When there are validation errors in the batch, the entire batch fails
    expect(result.processed).toBe(0); // No events processed when batch has validation errors
    expect(result.failed).toBe(2); // Both events marked as failed
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0); // Validation errors are in the errors array
  });
});
