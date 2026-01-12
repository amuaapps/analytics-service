import type { Actor, Consent, Context, EventType, Source } from './base-types.js';

export interface IngestRequestEnvelope {
  schemaVersion: string;
  sentAt?: string;
  events: IngestEvent[];
}

export interface BaseIngestEvent {
  schemaVersion: string;
  eventId: string;
  type: EventType;
  occurredAt: string;
  source: Source;
  actor: Actor;
  context?: Context;
  consent?: Consent;
}

export interface TrackEvent extends BaseIngestEvent {
  type: 'track';
  name: string;
  properties?: Record<string, unknown>;
}

export interface PageEvent extends BaseIngestEvent {
  type: 'page';
  name: string;
  properties?: Record<string, unknown>;
}

export interface IdentifyEvent extends BaseIngestEvent {
  type: 'identify';
  traits?: Record<string, unknown>;
}

export type IngestEvent = TrackEvent | PageEvent | IdentifyEvent;

export interface IngestResponse {
  accepted: boolean;
  eventCount: number;
}

export interface IngestErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}
