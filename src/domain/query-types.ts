import type { EventType, SortOrder } from './base-types.js';
import type { StoredEvent } from './stored-event-types.js';

export interface QueryEventsInput {
  appId: string;
  from: string;
  to?: string;
  types?: EventType[];
  names?: string[];
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  limit?: number;
  cursor?: string;
  sort?: SortOrder;
}

export interface QueryEventsResponse {
  items: StoredEvent[];
  nextCursor?: string;
}

export interface PaginationCursor {
  pk: string;
  sk: string;
}
