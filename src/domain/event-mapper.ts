import type { StoredEvent } from './stored-event-types.js';
import type { ApiEvent } from './api-event-types.js';

/**
 * Map a stored event (with internal DB fields) to a public API event
 * 
 * This function strips all internal storage fields:
 * - DynamoDB keys: PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK
 * - Cosmos DB fields: id, pk, _rid, _self, _etag, _attachments, _ts
 * - TTL fields: expiresAt, ttl
 * - Internal metadata: processedAt (not part of public API spec)
 * 
 * @param storedEvent - Event from database (may contain internal fields)
 * @returns Clean API event with only documented fields
 */
export function mapStoredEventToApiEvent(storedEvent: StoredEvent | (StoredEvent & Record<string, unknown>)): ApiEvent {
  // Extract only the canonical fields defined in the API spec
  const baseFields = {
    schemaVersion: storedEvent.schemaVersion,
    eventId: storedEvent.eventId,
    type: storedEvent.type,
    occurredAt: storedEvent.occurredAt,
    receivedAt: storedEvent.receivedAt,
    source: storedEvent.source,
    actor: storedEvent.actor,
    ...(storedEvent.context && { context: storedEvent.context }),
  };

  // Add type-specific fields
  if (storedEvent.type === 'track') {
    return {
      ...baseFields,
      type: 'track',
      name: storedEvent.name,
      ...(storedEvent.properties && { properties: storedEvent.properties }),
    };
  } else if (storedEvent.type === 'page') {
    return {
      ...baseFields,
      type: 'page',
      name: storedEvent.name,
      ...(storedEvent.properties && { properties: storedEvent.properties }),
    };
  } else {
    // identify
    return {
      ...baseFields,
      type: 'identify',
      traits: storedEvent.traits,
    };
  }
}

/**
 * Map an array of stored events to API events
 * 
 * @param storedEvents - Array of events from database
 * @returns Array of clean API events
 */
export function mapStoredEventsToApiEvents(storedEvents: StoredEvent[]): ApiEvent[] {
  return storedEvents.map(mapStoredEventToApiEvent);
}
