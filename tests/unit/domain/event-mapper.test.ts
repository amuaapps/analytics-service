import { describe, it, expect } from '@jest/globals';
import {
  mapStoredEventToApiEvent,
  mapStoredEventsToApiEvents,
} from '../../../src/domain/event-mapper.js';
import type { StoredEvent } from '../../../src/domain/stored-event-types.js';

describe('Event Mapper', () => {
  describe('mapStoredEventToApiEvent', () => {
    it('should strip DynamoDB keys from track event', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-123',
        type: 'track' as const,
        name: 'Button Clicked',
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'prod' },
        actor: { userId: 'user-123', anonymousId: 'anon-456' },
        properties: { buttonId: 'submit' },
        // DynamoDB internal fields
        PK: 'test-app',
        SK: '2026-01-11T00:00:00.000Z#event-123',
        GSI1PK: 'test-app#user-123',
        GSI1SK: '2026-01-11T00:00:00.000Z#event-123',
        GSI2PK: 'test-app#session-789',
        GSI2SK: '2026-01-11T00:00:00.000Z#event-123',
        expiresAt: 1704067200,
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should include canonical fields
      expect(apiEvent.schemaVersion).toBe('1.0.0');
      expect(apiEvent.eventId).toBe('event-123');
      expect(apiEvent.type).toBe('track');
      expect((apiEvent as any).name).toBe('Button Clicked');
      expect(apiEvent.occurredAt).toBe('2026-01-11T00:00:00.000Z');
      expect(apiEvent.receivedAt).toBe('2026-01-11T00:00:01.000Z');
      expect(apiEvent.source).toEqual({ appId: 'test-app', platform: 'web', env: 'prod' });
      expect(apiEvent.actor).toEqual({ userId: 'user-123', anonymousId: 'anon-456' });
      expect((apiEvent as any).properties).toEqual({ buttonId: 'submit' });

      // Should NOT include internal fields
      expect(apiEvent).not.toHaveProperty('processedAt');
      expect(apiEvent).not.toHaveProperty('PK');
      expect(apiEvent).not.toHaveProperty('SK');
      expect(apiEvent).not.toHaveProperty('GSI1PK');
      expect(apiEvent).not.toHaveProperty('GSI1SK');
      expect(apiEvent).not.toHaveProperty('GSI2PK');
      expect(apiEvent).not.toHaveProperty('GSI2SK');
      expect(apiEvent).not.toHaveProperty('expiresAt');
    });

    it('should strip Cosmos DB fields from page event', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-456',
        type: 'page' as const,
        name: '/products',
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'prod' },
        actor: { anonymousId: 'anon-789' },
        properties: { path: '/products', title: 'Products Page' },
        // Cosmos DB internal fields
        id: 'cosmos-id-123',
        pk: 'test-app',
        _rid: 'rid-123',
        _self: 'self-123',
        _etag: 'etag-123',
        _attachments: 'attachments-123',
        _ts: 1704067200,
        ttl: 31536000,
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should include canonical fields
      expect(apiEvent.schemaVersion).toBe('1.0.0');
      expect(apiEvent.eventId).toBe('event-456');
      expect(apiEvent.type).toBe('page');
      expect((apiEvent as any).name).toBe('/products');
      expect((apiEvent as any).properties).toEqual({ path: '/products', title: 'Products Page' });

      // Should NOT include Cosmos DB fields
      expect(apiEvent).not.toHaveProperty('processedAt');
      expect(apiEvent).not.toHaveProperty('id');
      expect(apiEvent).not.toHaveProperty('pk');
      expect(apiEvent).not.toHaveProperty('_rid');
      expect(apiEvent).not.toHaveProperty('_self');
      expect(apiEvent).not.toHaveProperty('_etag');
      expect(apiEvent).not.toHaveProperty('_attachments');
      expect(apiEvent).not.toHaveProperty('_ts');
      expect(apiEvent).not.toHaveProperty('ttl');
    });

    it('should strip internal fields from identify event', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-789',
        type: 'identify' as const,
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'ios', env: 'prod' },
        actor: { userId: 'user-456' },
        traits: { email: 'user@example.com', plan: 'premium' },
        // Mixed internal fields
        PK: 'test-app',
        SK: '2026-01-11T00:00:00.000Z#event-789',
        id: 'cosmos-id-456',
        expiresAt: 1704067200,
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should include canonical fields
      expect(apiEvent.type).toBe('identify');
      expect((apiEvent as any).traits).toEqual({ email: 'user@example.com', plan: 'premium' });

      // Should NOT include any internal fields
      expect(apiEvent).not.toHaveProperty('processedAt');
      expect(apiEvent).not.toHaveProperty('PK');
      expect(apiEvent).not.toHaveProperty('SK');
      expect(apiEvent).not.toHaveProperty('id');
      expect(apiEvent).not.toHaveProperty('expiresAt');
    });

    it('should preserve context when present', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-999',
        type: 'track' as const,
        name: 'Test Event',
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'prod' },
        actor: { userId: 'user-123' },
        context: {
          sessionId: 'session-123',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        PK: 'test-app',
        SK: '2026-01-11T00:00:00.000Z#event-999',
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should include context
      expect(apiEvent.context).toEqual({
        sessionId: 'session-123',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      // Should NOT include internal fields
      expect(apiEvent).not.toHaveProperty('processedAt');
      expect(apiEvent).not.toHaveProperty('PK');
      expect(apiEvent).not.toHaveProperty('SK');
    });

    it('should omit context when not present', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-111',
        type: 'track' as const,
        name: 'Test Event',
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'prod' },
        actor: { userId: 'user-123' },
        PK: 'test-app',
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should not have context property
      expect(apiEvent).not.toHaveProperty('context');
    });

    it('should omit properties when not present in track event', () => {
      const storedEvent = {
        schemaVersion: '1.0.0',
        eventId: 'event-222',
        type: 'track' as const,
        name: 'Simple Event',
        occurredAt: '2026-01-11T00:00:00.000Z',
        receivedAt: '2026-01-11T00:00:01.000Z',
        processedAt: '2026-01-11T00:00:02.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'prod' },
        actor: { userId: 'user-123' },
        PK: 'test-app',
      } as StoredEvent & Record<string, unknown>;

      const apiEvent = mapStoredEventToApiEvent(storedEvent);

      // Should not have properties
      expect(apiEvent).not.toHaveProperty('properties');
    });
  });

  describe('mapStoredEventsToApiEvents', () => {
    it('should map array of stored events to API events', () => {
      const storedEvents = [
        {
          schemaVersion: '1.0.0',
          eventId: 'event-1',
          type: 'track' as const,
          name: 'Event 1',
          occurredAt: '2026-01-11T00:00:00.000Z',
          receivedAt: '2026-01-11T00:00:01.000Z',
          processedAt: '2026-01-11T00:00:02.000Z',
          source: { appId: 'test-app', platform: 'web', env: 'prod' },
          actor: { userId: 'user-1' },
          PK: 'test-app',
          SK: '2026-01-11T00:00:00.000Z#event-1',
        },
        {
          schemaVersion: '1.0.0',
          eventId: 'event-2',
          type: 'page' as const,
          name: '/home',
          occurredAt: '2026-01-11T00:00:10.000Z',
          receivedAt: '2026-01-11T00:00:11.000Z',
          processedAt: '2026-01-11T00:00:12.000Z',
          source: { appId: 'test-app', platform: 'web', env: 'prod' },
          actor: { userId: 'user-2' },
          id: 'cosmos-id-2',
          pk: 'test-app',
        },
      ] as Array<StoredEvent & Record<string, unknown>>;

      const apiEvents = mapStoredEventsToApiEvents(storedEvents);

      expect(apiEvents).toHaveLength(2);

      // First event
      expect(apiEvents[0].eventId).toBe('event-1');
      expect(apiEvents[0].type).toBe('track');
      expect(apiEvents[0]).not.toHaveProperty('processedAt');
      expect(apiEvents[0]).not.toHaveProperty('PK');
      expect(apiEvents[0]).not.toHaveProperty('SK');

      // Second event
      expect(apiEvents[1].eventId).toBe('event-2');
      expect(apiEvents[1].type).toBe('page');
      expect(apiEvents[1]).not.toHaveProperty('processedAt');
      expect(apiEvents[1]).not.toHaveProperty('id');
      expect(apiEvents[1]).not.toHaveProperty('pk');
    });

    it('should handle empty array', () => {
      const apiEvents = mapStoredEventsToApiEvents([]);
      expect(apiEvents).toEqual([]);
    });
  });
});
