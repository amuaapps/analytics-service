import { describe, it, expect, beforeEach } from '@jest/globals';
import { handleProcessor } from '../../../src/app/core/processor-handler.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { InMemoryRawStorage } from '../../../src/infra/storage/in-memory-raw-storage.js';
import { createLogger } from '../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';
import type { CoreProcessorRequest } from '../../../src/app/core/types.js';

describe('Processor Integration Tests', () => {
  const limits = loadLimitsConfig();
  let operationalStorage: InMemoryOperationalStorage;
  let rawStorage: InMemoryRawStorage;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger({
      serviceName: 'test-processor',
      level: 'error',
      env: 'test',
    });

    operationalStorage = new InMemoryOperationalStorage(logger);
    rawStorage = new InMemoryRawStorage(logger);
  });

  describe('dual storage persistence', () => {
    it('should store events in both operational and raw storage', async () => {
      // Store raw batch first
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
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'web-app', platform: 'web', env: 'test' },
            actor: { userId: 'user-123' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify operational storage
      expect(operationalStorage.size()).toBe(1);
      const storedEvents = operationalStorage.getAll();
      expect(storedEvents[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(storedEvents[0].receivedAt).toBeDefined();
      expect(storedEvents[0].processedAt).toBeDefined();

      // Verify raw storage
      expect(rawStorage.size()).toBe(1);
      const rawBatch = rawStorage.getBatch('batch-456');
      expect(rawBatch).toBeDefined();
      expect(rawBatch!.batchId).toBe('batch-456');
      expect(rawBatch!.events.length).toBe(1);
      expect((rawBatch!.events[0] as { eventId: string }).eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should process multiple events in batch', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-789',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'page',
            name: 'page.viewed',
            occurredAt: '2026-01-08T07:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440003',
            type: 'identify',
            occurredAt: '2026-01-08T07:00:02Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
            traits: { email: 'user@example.com' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(operationalStorage.size()).toBe(3);
      expect(rawStorage.size()).toBe(1);
    });
  });

  describe('idempotency safeguards', () => {
    it('should skip duplicate events on reprocessing', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440099',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      // First processing
      const result1 = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result1.processed).toBe(1);
      expect(operationalStorage.size()).toBe(1);
      expect(rawStorage.size()).toBe(1);

      // Second processing (duplicate)
      const result2 = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result2.processed).toBe(0);
      expect(result2.failed).toBe(0);
      expect(operationalStorage.size()).toBe(1); // Still 1, not 2
      expect(rawStorage.size()).toBe(1); // Raw storage idempotent by batchId
    });

    it('should process new events in batch with duplicates', async () => {
      // Pre-populate with one event
      await handleProcessor(
        {
          requestId: 'req-000',
          batchId: 'batch-000',
          events: [
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440100',
              type: 'track',
              name: 'existing.event',
              occurredAt: '2026-01-08T07:00:00Z',
              source: { appId: 'app', platform: 'web', env: 'test' },
              actor: { userId: 'user-1' },
            },
          ],
        },
        { logger, operationalStorage, rawStorage, limits }
      );

      // Process batch with mix of new and duplicate events
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-456',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440100', // Duplicate
            type: 'track',
            name: 'existing.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440101',
            type: 'track',
            name: 'new.event',
            occurredAt: '2026-01-08T07:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result.processed).toBe(1); // Only new event
      expect(result.failed).toBe(0);
      expect(operationalStorage.size()).toBe(2); // existing + new
    });
  });

  describe('defensive validation', () => {
    it('should reject batch with invalid events', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-invalid',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'not-a-uuid', // Invalid
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
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
      expect(result.errors![0].eventId).toBe('not-a-uuid');
      expect(operationalStorage.size()).toBe(0);
      expect(rawStorage.size()).toBe(0);
    });

    it('should reject batch with missing required fields', async () => {
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-invalid',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            // Missing actor - required field
          } as any,
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(operationalStorage.size()).toBe(0);
      expect(rawStorage.size()).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should return error details when operational storage fails', async () => {
      // Create a storage that always fails
      class FailingOperationalStorage extends InMemoryOperationalStorage {
        async storeEvents(): Promise<void> {
          throw new Error('Storage unavailable');
        }
      }
      
      const failingStorage = new FailingOperationalStorage(logger);

      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-fail',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage: failingStorage,
        rawStorage,
        limits,
      });

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].error).toContain('Storage unavailable');
      
      // Raw storage should still have the batch
      expect(rawStorage.size()).toBe(1);
    });

    it('should fail entire batch when raw storage fails', async () => {
      // Create a raw storage that always fails
      class FailingRawStorage extends InMemoryRawStorage {
        async storeRawBatch(): Promise<void> {
          throw new Error('Raw storage unavailable');
        }
      }
      
      const failingRawStorage = new FailingRawStorage(logger);

      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-fail',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const result = await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage: failingRawStorage,
        limits,
      });

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors![0].error).toContain('Raw storage');
      
      // Neither storage should have data
      expect(operationalStorage.size()).toBe(0);
    });

    it('should not corrupt existing data on failure', async () => {
      // Pre-populate with valid data
      await handleProcessor(
        {
          requestId: 'req-000',
          batchId: 'batch-000',
          events: [
            {
              schemaVersion: SCHEMA_VERSION,
              eventId: '550e8400-e29b-41d4-a716-446655440100',
              type: 'track',
              name: 'existing.event',
              occurredAt: '2026-01-08T07:00:00Z',
              source: { appId: 'app', platform: 'web', env: 'test' },
              actor: { userId: 'user-1' },
            },
          ],
        },
        { logger, operationalStorage, rawStorage, limits }
      );

      const initialSize = operationalStorage.size();
      const initialRawSize = rawStorage.size();

      // Try to process invalid batch
      const request: CoreProcessorRequest = {
        requestId: 'req-123',
        batchId: 'batch-invalid',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'not-a-uuid',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      await handleProcessor(request, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      // Existing data should be unchanged
      expect(operationalStorage.size()).toBe(initialSize);
      expect(rawStorage.size()).toBe(initialRawSize);
      
      const existingEvent = operationalStorage.getAll()[0];
      expect(existingEvent.eventId).toBe('550e8400-e29b-41d4-a716-446655440100');
    });
  });

  describe('raw storage unique filenames', () => {
    it('should use unique filenames for different batches', async () => {
      const request1: CoreProcessorRequest = {
        requestId: 'req-1',
        batchId: 'batch-1',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440201',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const request2: CoreProcessorRequest = {
        requestId: 'req-2',
        batchId: 'batch-2',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440202',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T07:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      await handleProcessor(request1, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      await handleProcessor(request2, {
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });

      expect(rawStorage.size()).toBe(2);
      
      const batch1 = rawStorage.getBatch('batch-1');
      const batch2 = rawStorage.getBatch('batch-2');
      
      expect(batch1).toBeDefined();
      expect(batch2).toBeDefined();
      expect(batch1!.batchId).not.toBe(batch2!.batchId);
    });
  });
});
