import type { Actor, Context, EventType, Source } from './base-types.js';

/**
 * Public API Event Types
 * 
 * These types represent the canonical event structure returned by the API.
 * They exclude all internal storage fields (PK, SK, GSI keys, TTL, processedAt, etc.)
 * and only include fields documented in the public API specification.
 */

export interface BaseApiEvent {
  schemaVersion: string;
  eventId: string;
  type: EventType;
  occurredAt: string;
  receivedAt: string;
  source: Source;
  actor: Actor;
  context?: Context;
}

export interface ApiTrackEvent extends BaseApiEvent {
  type: 'track';
  name: string;
  properties?: Record<string, unknown>;
}

export interface ApiPageEvent extends BaseApiEvent {
  type: 'page';
  name: string;
  properties?: Record<string, unknown>;
}

export interface ApiIdentifyEvent extends BaseApiEvent {
  type: 'identify';
  traits: Record<string, unknown>;
}

export type ApiEvent = ApiTrackEvent | ApiPageEvent | ApiIdentifyEvent;
