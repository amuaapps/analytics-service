import type { EventRepository, QueryEventsResult } from '../interfaces.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { Logger } from '../../utils/logger.js';

export class InMemoryOperationalStorage implements EventRepository {
  private events: Map<string, StoredEvent> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async checkEventExists(eventId: string): Promise<boolean> {
    return this.events.has(eventId);
  }

  async storeEvents(events: StoredEvent[]): Promise<void> {
    for (const event of events) {
      if (this.events.has(event.eventId)) {
        this.logger.warn({ eventId: event.eventId }, 'Duplicate event detected in storage');
        // Idempotent - don't throw, just skip
        continue;
      }
      this.events.set(event.eventId, event);
    }

    this.logger.debug(
      {
        stored: events.length,
        totalEvents: this.events.size,
      },
      'Events stored in operational storage'
    );
  }

  async queryEvents(input: QueryEventsInput): Promise<QueryEventsResult> {
    let results = Array.from(this.events.values());

    // Parse cursor if provided
    let cursorData: { pk: string; sk: string } | undefined;
    if (input.cursor) {
      try {
        cursorData = JSON.parse(input.cursor);
      } catch (error) {
        this.logger.warn({ error }, 'Failed to parse cursor');
      }
    }

    // Filter by appId
    if (input.appId) {
      results = results.filter((e) => e.source.appId === input.appId);
    }

    // Filter by types
    if (input.types && input.types.length > 0) {
      results = results.filter((e) => input.types!.includes(e.type));
    }

    // Filter by names
    if (input.names && input.names.length > 0) {
      results = results.filter((e) => {
        if (e.type === 'identify') return false;
        return input.names!.includes(e.name);
      });
    }

    // Filter by userId
    if (input.userId) {
      results = results.filter((e) => e.actor.userId === input.userId);
    }

    // Filter by anonymousId
    if (input.anonymousId) {
      results = results.filter((e) => e.actor.anonymousId === input.anonymousId);
    }

    // Filter by sessionId
    if (input.sessionId) {
      results = results.filter((e) => {
        const context = e.context as { sessionId?: string } | undefined;
        return context?.sessionId === input.sessionId;
      });
    }

    // Filter by time range
    if (input.from) {
      results = results.filter((e) => e.occurredAt >= input.from);
    }

    if (input.to) {
      results = results.filter((e) => e.occurredAt <= input.to!);
    }

    // Sort
    const sortOrder = input.sort || 'desc';
    results.sort((a, b) => {
      const comparison = a.occurredAt.localeCompare(b.occurredAt);
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply cursor filtering (skip events up to and including cursor)
    if (cursorData) {
      const cursorSk = cursorData.sk;
      const cursorIndex = results.findIndex((e) => {
        const sk = `${e.occurredAt}#${e.eventId}`;
        return sk === cursorSk;
      });
      
      if (cursorIndex >= 0) {
        results = results.slice(cursorIndex + 1);
      }
    }

    // Apply limit + 1 to determine hasMore
    const limitPlusOne = input.limit ? input.limit + 1 : 51;
    const paginatedResults = results.slice(0, limitPlusOne);
    const hasMore = paginatedResults.length > (input.limit || 50);
    const finalResults = hasMore ? paginatedResults.slice(0, -1) : paginatedResults;

    // Generate cursor for next page if hasMore
    let cursor: string | undefined;
    if (hasMore && finalResults.length > 0) {
      const lastEvent = finalResults[finalResults.length - 1];
      cursor = JSON.stringify({
        pk: lastEvent.source.appId,
        sk: `${lastEvent.occurredAt}#${lastEvent.eventId}`,
      });
    }

    this.logger.debug(
      {
        totalMatched: results.length,
        returned: finalResults.length,
        hasMore,
        hasCursor: !!cursor,
      },
      'Query results prepared'
    );

    return {
      events: finalResults,
      hasMore,
      cursor,
    };
  }

  // Test helpers
  getAll(): StoredEvent[] {
    return Array.from(this.events.values());
  }

  clear(): void {
    this.events.clear();
  }

  size(): number {
    return this.events.size;
  }
}
