import { describe, it, expect, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../src/app/core/types.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { InMemoryRawStorage } from '../../../src/infra/storage/in-memory-raw-storage.js';
import { createLogger } from '../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';

describe('Processor Integration - Basic Flow', () => {
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

  it('should process events and store in both storages', async () => {
    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track' as const,
        name: 'button.clicked',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'web-storefront', platform: 'web' as const, env: 'prod' as const },
        actor: { userId: 'user-123' },
      },
    ];

    // Store raw batch first
    const pointer = await rawStorage.storeRawBatch({
      batchId: 'batch-456',
      requestId: 'req-123',
      receivedAt: '2026-01-08T06:00:00Z',
      events: testEvents,
    });

    const request: CoreProcessorRequest = {
      requestId: 'req-123',
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

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Verify raw storage
    const rawBatch = await rawStorage.getRawBatch(pointer);
    expect(rawBatch.events).toHaveLength(1);
    expect(rawBatch.events[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440000');

    // Verify operational storage
    const queryResult = await operationalStorage.queryEvents({
      appId: 'web-storefront',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });

    expect(queryResult.events).toHaveLength(1);
    expect(queryResult.events[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should process multiple events in a batch', async () => {
    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'track' as const,
        name: 'event.one',
        occurredAt: '2026-01-08T07:00:00Z',
        source: { appId: 'web-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        type: 'page' as const,
        name: 'page.viewed',
        occurredAt: '2026-01-08T07:00:01Z',
        source: { appId: 'web-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440003',
        type: 'identify' as const,
        occurredAt: '2026-01-08T07:00:02Z',
        source: { appId: 'web-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
        traits: { email: 'user@example.com' },
      },
    ];

    const pointer = await rawStorage.storeRawBatch({
      batchId: 'batch-789',
      requestId: 'req-123',
      receivedAt: '2026-01-08T07:00:00Z',
      events: testEvents,
    });

    const request: CoreProcessorRequest = {
      requestId: 'req-123',
      batchId: pointer.batchId,
      receivedAt: '2026-01-08T07:00:00Z',
      storageLocation: pointer.storageLocation,
    };

    const result = await handleProcessor(request, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);

    const queryResult = await operationalStorage.queryEvents({
      appId: 'web-app',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });

    expect(queryResult.events).toHaveLength(3);
  });

  it('should add receivedAt and processedAt timestamps', async () => {
    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'test-app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      },
    ];

    const pointer = await rawStorage.storeRawBatch({
      batchId: 'batch-123',
      requestId: 'req-123',
      receivedAt: '2026-01-08T06:00:00Z',
      events: testEvents,
    });

    const request: CoreProcessorRequest = {
      requestId: 'req-123',
      batchId: pointer.batchId,
      receivedAt: '2026-01-08T06:00:00Z',
      storageLocation: pointer.storageLocation,
    };

    await handleProcessor(request, {
      logger,
      operationalStorage,
      rawStorage,
      limits,
    });

    const queryResult = await operationalStorage.queryEvents({
      appId: 'test-app',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });

    const storedEvent = queryResult.events[0];
    expect(storedEvent.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(storedEvent.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
