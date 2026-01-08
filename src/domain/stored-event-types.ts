import type { Actor, Context, EventType, Source } from './base-types.js';

export interface BaseStoredEvent {
  schemaVersion: string;
  eventId: string;
  type: EventType;
  occurredAt: string;
  receivedAt: string;
  processedAt: string;
  source: Source;
  actor: Actor;
  context?: Context;
}

export interface StoredTrackEvent extends BaseStoredEvent {
  type: 'track';
  name: string;
  properties?: Record<string, unknown>;
}

export interface StoredPageEvent extends BaseStoredEvent {
  type: 'page';
  name: string;
  properties?: Record<string, unknown>;
}

export interface StoredIdentifyEvent extends BaseStoredEvent {
  type: 'identify';
  traits: Record<string, unknown>;
}

export type StoredEvent = StoredTrackEvent | StoredPageEvent | StoredIdentifyEvent;

export interface InternalMetadata {
  pk: string;
  sk: string;
  occurredAtEpochMs: number;
  expiresAt?: number;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
}

export type StoredEventWithMetadata = StoredEvent & InternalMetadata;
