import { InMemoryOperationalStorage } from '../../../../src/infra/storage/in-memory-operational-storage.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';

describe('AnonymousId Filtering - In-Memory Storage', () => {
  let storage: InMemoryOperationalStorage;

  beforeEach(() => {
    const logger = createLogger({ serviceName: 'test', level: 'error', env: 'test' });
    storage = new InMemoryOperationalStorage(logger);
  });

  it('should filter events by anonymousId', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'page.viewed',
        occurredAt: '2026-01-10T12:00:00.000Z',
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-2',
        type: 'track',
        name: 'button.clicked',
        occurredAt: '2026-01-10T12:01:00.000Z',
        receivedAt: '2026-01-10T12:01:00.000Z',
        processedAt: '2026-01-10T12:01:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-456' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-3',
        type: 'track',
        name: 'form.submitted',
        occurredAt: '2026-01-10T12:02:00.000Z',
        receivedAt: '2026-01-10T12:02:00.000Z',
        processedAt: '2026-01-10T12:02:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' }, // Same as event-1
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-4',
        type: 'track',
        name: 'link.clicked',
        occurredAt: '2026-01-10T12:03:00.000Z',
        receivedAt: '2026-01-10T12:03:00.000Z',
        processedAt: '2026-01-10T12:03:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-789' }, // No anonymousId
      },
    ];

    await storage.storeEvents(events);

    // Query by anonymousId 'anon-123'
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-10T23:59:59.999Z',
      anonymousId: 'anon-123',
    });

    // Should return event-1 and event-3 (both have anonymousId 'anon-123')
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.eventId)).toContain('event-1');
    expect(result.events.map((e) => e.eventId)).toContain('event-3');
    expect(result.events.map((e) => e.eventId)).not.toContain('event-2');
    expect(result.events.map((e) => e.eventId)).not.toContain('event-4');
  });

  it('should return empty results when anonymousId does not match', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'page.viewed',
        occurredAt: '2026-01-10T12:00:00.000Z',
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
    ];

    await storage.storeEvents(events);

    // Query by non-existent anonymousId
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-10T23:59:59.999Z',
      anonymousId: 'anon-999',
    });

    expect(result.events).toHaveLength(0);
  });

  it('should combine anonymousId filter with other filters', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'page.viewed',
        occurredAt: '2026-01-10T12:00:00.000Z',
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-2',
        type: 'page',
        name: 'home',
        occurredAt: '2026-01-10T12:01:00.000Z',
        receivedAt: '2026-01-10T12:01:00.000Z',
        processedAt: '2026-01-10T12:01:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-3',
        type: 'track',
        name: 'button.clicked',
        occurredAt: '2026-01-10T12:02:00.000Z',
        receivedAt: '2026-01-10T12:02:00.000Z',
        processedAt: '2026-01-10T12:02:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
    ];

    await storage.storeEvents(events);

    // Query by anonymousId AND type
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-10T23:59:59.999Z',
      anonymousId: 'anon-123',
      types: ['track'],
    });

    // Should return event-1 and event-3 (both are 'track' type with anonymousId 'anon-123')
    // Should NOT return event-2 (it's 'page' type)
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.eventId)).toContain('event-1');
    expect(result.events.map((e) => e.eventId)).toContain('event-3');
    expect(result.events.map((e) => e.eventId)).not.toContain('event-2');
  });

  it('should work with anonymousId and event names filter', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'page.viewed',
        occurredAt: '2026-01-10T12:00:00.000Z',
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-2',
        type: 'track',
        name: 'button.clicked',
        occurredAt: '2026-01-10T12:01:00.000Z',
        receivedAt: '2026-01-10T12:01:00.000Z',
        processedAt: '2026-01-10T12:01:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { anonymousId: 'anon-123' },
      },
    ];

    await storage.storeEvents(events);

    // Query by anonymousId AND event name
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-10T23:59:59.999Z',
      anonymousId: 'anon-123',
      names: ['button.clicked'],
    });

    // Should return only event-2
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventId).toBe('event-2');
  });
});
