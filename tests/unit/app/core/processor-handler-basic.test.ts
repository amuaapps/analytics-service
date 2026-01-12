import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../../src/app/core/processor-handler.js';
import type { CoreProcessorRequest } from '../../../../src/app/core/types.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Processor Handler - Basic Functionality', () => {
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

  it('should process a single event successfully', async () => {
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

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockRawStorage.getRawBatch).toHaveBeenCalledWith({
      batchId: 'batch-456',
      storageLocation: 's3://bucket/key',
    });
    expect(mockOperationalStorage.storeEvents).toHaveBeenCalledTimes(1);
  });

  it('should process multiple events in a batch', async () => {
    const testEvents = [
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

    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
    expect(mockOperationalStorage.storeEvents).toHaveBeenCalledTimes(1);

    const storedEvents = mockOperationalStorage.storeEvents.mock.calls[0][0];
    expect(storedEvents).toHaveLength(3);
    expect(storedEvents.map((e: StoredEvent) => e.eventId)).toEqual(
      expect.arrayContaining([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
      ])
    );
  });

  it('should add receivedAt and processedAt timestamps', async () => {
    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track',
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'app', platform: 'web', env: 'prod' },
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

    await handleProcessor(request, deps);

    const storedEvents = mockOperationalStorage.storeEvents.mock.calls[0][0];
    expect(storedEvents[0].receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(storedEvents[0].processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should skip duplicate events', async () => {
    mockOperationalStorage.checkEventExists.mockResolvedValue(true);

    const testEvents = [
      {
        schemaVersion: SCHEMA_VERSION,
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'track',
        name: 'duplicate.event',
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
    expect(result.failed).toBe(0);
    expect(mockOperationalStorage.storeEvents).not.toHaveBeenCalled();
  });
});
