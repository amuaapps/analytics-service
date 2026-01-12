import { InMemoryOperationalStorage } from '../../../../src/infra/storage/in-memory-operational-storage.js';
import type { StoredEvent } from '../../../../src/domain/stored-event-types.js';
import { createLogger } from '../../../../src/utils/logger.js';

describe('InMemoryOperationalStorage - Exclusive "to" parameter', () => {
  let storage: InMemoryOperationalStorage;

  beforeEach(() => {
    const logger = createLogger({ serviceName: 'test', level: 'error', env: 'test' });
    storage = new InMemoryOperationalStorage(logger);
  });

  it('should exclude events where occurredAt === to (exclusive upper bound)', async () => {
    // Create events with different timestamps
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'before',
        occurredAt: '2026-01-10T11:59:59.999Z', // Before 'to'
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-2',
        type: 'track',
        name: 'exactly-at-to',
        occurredAt: '2026-01-10T12:00:00.000Z', // Exactly at 'to' - should be EXCLUDED
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-3',
        type: 'track',
        name: 'after',
        occurredAt: '2026-01-10T12:00:00.001Z', // After 'to'
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
    ];

    await storage.storeEvents(events);

    // Query with 'to' exactly matching event-2's occurredAt
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T00:00:00.000Z',
      to: '2026-01-10T12:00:00.000Z', // Exclusive upper bound
    });

    // Should only return event-1 (before 'to')
    // event-2 (exactly at 'to') should be EXCLUDED
    // event-3 (after 'to') should be EXCLUDED
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventId).toBe('event-1');
    expect((result.events[0] as any).name).toBe('before');
  });

  it('should include events where occurredAt === from (inclusive lower bound)', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-1',
        type: 'track',
        name: 'before',
        occurredAt: '2026-01-10T11:59:59.999Z', // Before 'from'
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-2',
        type: 'track',
        name: 'exactly-at-from',
        occurredAt: '2026-01-10T12:00:00.000Z', // Exactly at 'from' - should be INCLUDED
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-3',
        type: 'track',
        name: 'after',
        occurredAt: '2026-01-10T12:00:00.001Z', // After 'from'
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
    ];

    await storage.storeEvents(events);

    // Query with 'from' exactly matching event-2's occurredAt
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T12:00:00.000Z', // Inclusive lower bound
      to: '2026-01-10T13:00:00.000Z',
    });

    // Should return event-2 (exactly at 'from') and event-3 (after 'from')
    // event-1 (before 'from') should be EXCLUDED
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.eventId)).toContain('event-2');
    expect(result.events.map((e) => e.eventId)).toContain('event-3');
    expect(result.events.map((e) => e.eventId)).not.toContain('event-1');
  });

  it('should handle range [from, to) correctly with boundary events', async () => {
    const events: StoredEvent[] = [
      {
        schemaVersion: '1.0.0',
        eventId: 'event-at-from',
        type: 'track',
        name: 'at-from',
        occurredAt: '2026-01-10T12:00:00.000Z', // At 'from' - INCLUDED
        receivedAt: '2026-01-10T12:00:00.000Z',
        processedAt: '2026-01-10T12:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-in-range',
        type: 'track',
        name: 'in-range',
        occurredAt: '2026-01-10T12:30:00.000Z', // In range
        receivedAt: '2026-01-10T12:30:00.000Z',
        processedAt: '2026-01-10T12:30:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
      {
        schemaVersion: '1.0.0',
        eventId: 'event-at-to',
        type: 'track',
        name: 'at-to',
        occurredAt: '2026-01-10T13:00:00.000Z', // At 'to' - EXCLUDED
        receivedAt: '2026-01-10T13:00:00.000Z',
        processedAt: '2026-01-10T13:00:01.000Z',
        source: { appId: 'test-app', platform: 'web', env: 'test' },
        actor: { userId: 'user-1' },
      },
    ];

    await storage.storeEvents(events);

    // Query with range [12:00:00, 13:00:00) - from inclusive, to exclusive
    const result = await storage.queryEvents({
      appId: 'test-app',
      from: '2026-01-10T12:00:00.000Z',
      to: '2026-01-10T13:00:00.000Z',
    });

    // Should return event-at-from and event-in-range
    // Should NOT return event-at-to (exclusive upper bound)
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.eventId)).toContain('event-at-from');
    expect(result.events.map((e) => e.eventId)).toContain('event-in-range');
    expect(result.events.map((e) => e.eventId)).not.toContain('event-at-to');
  });
});
