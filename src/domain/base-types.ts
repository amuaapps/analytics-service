export const SCHEMA_VERSION = '1.0.0' as const;

export type EventType = 'track' | 'page' | 'identify';

export type Platform = 'web' | 'ios' | 'android' | 'server';

export type Environment = 'dev' | 'staging' | 'prod' | 'test';

export type SortOrder = 'asc' | 'desc';

export interface Source {
  appId: string;
  platform: Platform;
  env: Environment;
  appVersion?: string;
}

export interface Actor {
  userId?: string;
  anonymousId?: string;
  sessionId?: string; // Deprecated: use context.sessionId instead. Kept for backward compatibility.
}

export interface Context {
  sessionId?: string; // Canonical location for session identifier
  locale?: string;
  timezone?: string;
  page?: {
    url?: string;
    path?: string;
    referrer?: string;
    title?: string;
  };
  userAgent?: string;
  device?: Record<string, unknown>;
  // Allow additional properties for extensibility (e.g., testRun, ip, custom metadata)
  // while maintaining type safety for known fields
  [key: string]: unknown;
}

export interface Consent {
  analytics: boolean;
  timestamp: string;
}
