import { describe, it, expect, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../src/app/core/types.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { InMemoryRawStorage } from '../../../src/infra/storage/in-memory-raw-storage.js';
import { createLogger } from '../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';

describe('Processor Integration - Deduplication', () => {
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

  it('should skip duplicate events', async () => {
    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track' as const,
        name: 'duplicate.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      },
    ];

    // Process first time
    const pointer1 = await rawStorage.storeRawBatch({
      batchId: 'batch-1',
      requestId: 'req-1',
      receivedAt: '2026-01-08T06:00:00Z',
      events: testEvents,
    });

    const request1: CoreProcessorRequest = {
      requestId: 'req-1',
      batchId: pointer1.batchId,
      receivedAt: '2026-01-08T06:00:00Z',
      storageLocation: pointer1.storageLocation,
    };

    const result1 = await handleProcessor(request1, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    expect(result1.processed).toBe(1);
    expect(result1.failed).toBe(0);

    // Process same event again (duplicate)
    const pointer2 = await rawStorage.storeRawBatch({
      batchId: 'batch-2',
      requestId: 'req-2',
      receivedAt: '2026-01-08T06:01:00Z',
      events: testEvents,
    });

    const request2: CoreProcessorRequest = {
      requestId: 'req-2',
      batchId: pointer2.batchId,
      receivedAt: '2026-01-08T06:01:00Z',
      storageLocation: pointer2.storageLocation,
    };

    const result2 = await handleProcessor(request2, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    expect(result2.processed).toBe(0);
    expect(result2.failed).toBe(0);

    // Verify only one event in operational storage
    const queryResult = await operationalStorage.queryEvents({
      appId: 'test-app',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });

    expect(queryResult.events).toHaveLength(1);
  });

  it('should handle partial duplicates in batch', async () => {
    const event1 = {
      schemaVersion: SCHEMA_VERSION,
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'track' as const,
      name: 'event.one',
      occurredAt: '2026-01-08T06:00:00Z',
      source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
      actor: { userId: 'user-1' },
    };

    const event2 = {
      schemaVersion: SCHEMA_VERSION,
      eventId: '550e8400-e29b-41d4-a716-446655440002',
      type: 'track' as const,
      name: 'event.two',
      occurredAt: '2026-01-08T06:00:01Z',
      source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
      actor: { userId: 'user-1' },
    };

    // Process first event
    const pointer1 = await rawStorage.storeRawBatch({
      batchId: 'batch-1',
      requestId: 'req-1',
      receivedAt: '2026-01-08T06:00:00Z',
      events: [event1],
    });

    await handleProcessor(
      {
        requestId: 'req-1',
        batchId: pointer1.batchId,
        receivedAt: '2026-01-08T06:00:00Z',
        storageLocation: pointer1.storageLocation,
      },
      { logger, operationalStorage, rawStorage, limits }
    );

    // Process batch with duplicate and new event
    const pointer2 = await rawStorage.storeRawBatch({
      batchId: 'batch-2',
      requestId: 'req-2',
      receivedAt: '2026-01-08T06:01:00Z',
      events: [event1, event2],
    });

    const result = await handleProcessor(
      {
        requestId: 'req-2',
        batchId: pointer2.batchId,
        receivedAt: '2026-01-08T06:01:00Z',
        storageLocation: pointer2.storageLocation,
      },
      { logger, operationalStorage, rawStorage, limits }
    );

    expect(result.processed).toBe(1); // Only event2 processed
    expect(result.failed).toBe(0);

    const queryResult = await operationalStorage.queryEvents({
      appId: 'test-app',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });

    expect(queryResult.events).toHaveLength(2);
  });
});
