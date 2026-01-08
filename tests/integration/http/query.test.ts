import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '../../../src/app/http/server.js';
import { createLogger } from '../../../src/utils/logger.js';
import { InMemoryQueueAdapter } from '../../../src/infra/queue/in-memory-queue-adapter.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';
import type { StoredEvent } from '../../../src/domain/stored-event-types.js';
import type { Config } from '../../../src/config/types.js';

describe('Query API Integration Tests', () => {
  let server: Express;
  let logger: ReturnType<typeof createLogger>;
  let queueAdapter: InMemoryQueueAdapter;
  let storageAdapter: InMemoryOperationalStorage;
  let config: Config;

  beforeEach(() => {
    logger = createLogger({
      serviceName: 'test-analytics-service',
      level: 'error',
      env: 'test',
    });

    queueAdapter = new InMemoryQueueAdapter(logger);
    storageAdapter = new InMemoryOperationalStorage(logger);
    
    config = {
      service: {
        serviceName: 'test-analytics-service',
        env: 'test',
        logLevel: 'error',
      },
      limits: {
        maxPayloadSizeBytes: 1048576,
        maxEventsPerBatch: 100,
        minEventsPerBatch: 1,
        maxPropertyDepth: 10,
        maxKeysPerLevel: 50,
        maxStringLength: 2048,
        maxArrayLength: 100,
        maxQueryWindowDays: 31,
        defaultQueryLimit: 50,
        maxQueryLimit: 200,
      },
      security: {
        analyticsWriteKey: 'test-key',
        corsAllowedOrigins: ['*'],
      },
    };

    server = createServer({
      logger,
      queueAdapter,
      storageAdapter,
      config,
    });
  });

  describe('GET /api/v1/events', () => {
    it('should return 400 when appId is missing', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          from: '2026-01-01T00:00:00Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when from is missing', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'test-app',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when date range exceeds 31 days', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'test-app',
          from: '2026-01-01T00:00:00Z',
          to: '2026-03-01T00:00:00Z', // 59 days
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when to is before from', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'test-app',
          from: '2026-01-10T00:00:00Z',
          to: '2026-01-05T00:00:00Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when limit exceeds maximum', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'test-app',
          from: '2026-01-01T00:00:00Z',
          limit: 300,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return empty results when no events exist', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'test-app',
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T00:00:00Z',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body.items).toEqual([]);
      expect(response.body).not.toHaveProperty('nextCursor');
    });

    it('should return events matching query criteria', async () => {
      // Seed storage with test events
      const testEvents: StoredEvent[] = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440001',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-08T10:00:00Z',
          receivedAt: '2026-01-08T10:00:01Z',
          processedAt: '2026-01-08T10:00:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-123' },
          properties: { button: 'submit' },
        },
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440002',
          type: 'page',
          name: 'home',
          occurredAt: '2026-01-08T10:05:00Z',
          receivedAt: '2026-01-08T10:05:01Z',
          processedAt: '2026-01-08T10:05:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-123' },
          properties: { path: '/' },
        },
      ];

      await storageAdapter.storeEvents(testEvents);

      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0]).toHaveProperty('eventId');
      expect(response.body.items[0]).toHaveProperty('type');
      expect(response.body.items[0]).toHaveProperty('occurredAt');
      expect(response.body.items[0]).toHaveProperty('receivedAt');
      expect(response.body.items[0]).toHaveProperty('source');
      expect(response.body.items[0]).toHaveProperty('actor');
    });

    it('should filter events by type', async () => {
      const testEvents: StoredEvent[] = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440003',
          type: 'track',
          name: 'button.clicked',
          occurredAt: '2026-01-08T10:00:00Z',
          receivedAt: '2026-01-08T10:00:01Z',
          processedAt: '2026-01-08T10:00:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-123' },
          properties: {},
        },
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440004',
          type: 'page',
          name: 'home',
          occurredAt: '2026-01-08T10:05:00Z',
          receivedAt: '2026-01-08T10:05:01Z',
          processedAt: '2026-01-08T10:05:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-123' },
          properties: {},
        },
      ];

      await storageAdapter.storeEvents(testEvents);

      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          types: 'track',
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].type).toBe('track');
    });

    it('should filter events by userId', async () => {
      const testEvents: StoredEvent[] = [
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440005',
          type: 'track',
          name: 'event1',
          occurredAt: '2026-01-08T10:00:00Z',
          receivedAt: '2026-01-08T10:00:01Z',
          processedAt: '2026-01-08T10:00:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-123' },
          properties: {},
        },
        {
          schemaVersion: SCHEMA_VERSION,
          eventId: '550e8400-e29b-41d4-a716-446655440006',
          type: 'track',
          name: 'event2',
          occurredAt: '2026-01-08T10:05:00Z',
          receivedAt: '2026-01-08T10:05:01Z',
          processedAt: '2026-01-08T10:05:02Z',
          source: { appId: 'web-app', platform: 'web', env: 'test' },
          actor: { userId: 'user-456' },
          properties: {},
        },
      ];

      await storageAdapter.storeEvents(testEvents);

      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          userId: 'user-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].actor.userId).toBe('user-123');
    });

    it('should respect limit parameter', async () => {
      const testEvents: StoredEvent[] = Array.from({ length: 10 }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544000${i}`,
        type: 'track' as const,
        name: `event-${i}`,
        occurredAt: `2026-01-08T10:${String(i).padStart(2, '0')}:00Z`,
        receivedAt: `2026-01-08T10:${String(i).padStart(2, '0')}:01Z`,
        processedAt: `2026-01-08T10:${String(i).padStart(2, '0')}:02Z`,
        source: { appId: 'web-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-123' },
        properties: {},
      }));

      await storageAdapter.storeEvents(testEvents);

      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          limit: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(5);
      expect(response.body).toHaveProperty('nextCursor');
    });

    it('should support pagination with cursor', async () => {
      const testEvents: StoredEvent[] = Array.from({ length: 10 }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `650e8400-e29b-41d4-a716-44665544000${i}`,
        type: 'track' as const,
        name: `event-${i}`,
        occurredAt: `2026-01-08T10:${String(i).padStart(2, '0')}:00Z`,
        receivedAt: `2026-01-08T10:${String(i).padStart(2, '0')}:01Z`,
        processedAt: `2026-01-08T10:${String(i).padStart(2, '0')}:02Z`,
        source: { appId: 'web-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-123' },
        properties: {},
      }));

      await storageAdapter.storeEvents(testEvents);

      // First page
      const firstResponse = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          limit: 5,
        });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.items).toHaveLength(5);
      expect(firstResponse.body).toHaveProperty('nextCursor');

      const firstPageEventIds = firstResponse.body.items.map((e: StoredEvent) => e.eventId);

      // Second page
      const secondResponse = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          limit: 5,
          cursor: firstResponse.body.nextCursor,
        });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.items).toHaveLength(5);
      
      const secondPageEventIds = secondResponse.body.items.map((e: StoredEvent) => e.eventId);

      // Verify no overlap between pages
      const overlap = firstPageEventIds.filter((id: string) => secondPageEventIds.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should return 400 for invalid cursor', async () => {
      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
          cursor: 'invalid-cursor',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should not expose internal metadata in response', async () => {
      const testEvent: StoredEvent = {
        schemaVersion: SCHEMA_VERSION,
        eventId: '750e8400-e29b-41d4-a716-446655440001',
        type: 'track',
        name: 'test.event',
        occurredAt: '2026-01-08T10:00:00Z',
        receivedAt: '2026-01-08T10:00:01Z',
        processedAt: '2026-01-08T10:00:02Z',
        source: { appId: 'web-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-123' },
        properties: { test: 'data' },
      };

      await storageAdapter.storeEvents([testEvent]);

      const response = await request(server)
        .get('/api/v1/events')
        .query({
          appId: 'web-app',
          from: '2026-01-08T00:00:00Z',
          to: '2026-01-09T00:00:00Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      
      const returnedEvent = response.body.items[0];
      
      // Verify canonical fields are present
      expect(returnedEvent).toHaveProperty('schemaVersion');
      expect(returnedEvent).toHaveProperty('eventId');
      expect(returnedEvent).toHaveProperty('type');
      expect(returnedEvent).toHaveProperty('name');
      expect(returnedEvent).toHaveProperty('occurredAt');
      expect(returnedEvent).toHaveProperty('receivedAt');
      expect(returnedEvent).toHaveProperty('source');
      expect(returnedEvent).toHaveProperty('actor');
      expect(returnedEvent).toHaveProperty('properties');
      
      // Verify internal fields are not exposed (if any were added)
      expect(returnedEvent).not.toHaveProperty('pk');
      expect(returnedEvent).not.toHaveProperty('sk');
      expect(returnedEvent).not.toHaveProperty('_id');
    });
  });
});
