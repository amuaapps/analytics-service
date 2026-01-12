import { z } from 'zod';
import type { QueryEventsInput } from './query-types.js';

const MAX_QUERY_LIMIT = 200;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_DATE_RANGE_DAYS = 31;

const eventTypeSchema = z.enum(['track', 'page', 'identify']);

/**
 * Preprocess HTTP query parameters to normalize them for validation
 * Handles Express query strings, AWS Lambda parsed params, and Azure Function params
 */
function preprocessQueryInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const data = input as Record<string, unknown>;
  const processed: Record<string, unknown> = { ...data };

  // Coerce limit from string to number if needed
  if (data.limit !== undefined && data.limit !== null) {
    if (typeof data.limit === 'string') {
      const parsed = parseInt(data.limit, 10);
      processed.limit = isNaN(parsed) ? data.limit : parsed;
    } else if (typeof data.limit === 'number') {
      processed.limit = data.limit;
    }
  }

  // Normalize types: handle comma-separated string or array
  if (data.types !== undefined && data.types !== null) {
    if (typeof data.types === 'string') {
      processed.types = data.types
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else if (Array.isArray(data.types)) {
      processed.types = data.types;
    }
  }

  // Normalize names: handle comma-separated string or array
  if (data.names !== undefined && data.names !== null) {
    if (typeof data.names === 'string') {
      processed.names = data.names
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
    } else if (Array.isArray(data.names)) {
      processed.names = data.names;
    }
  }

  // Normalize sort: ensure it's a valid enum value
  if (data.sort !== undefined && data.sort !== null) {
    const sortStr = String(data.sort).toLowerCase();
    if (sortStr === 'asc' || sortStr === 'desc') {
      processed.sort = sortStr;
    }
  }

  // Default 'to' to now if omitted (matches spec and Azure behavior)
  if (!data.to && data.from) {
    processed.to = new Date().toISOString();
  }

  return processed;
}

export const queryEventsInputSchema = z
  .object({
    appId: z.string().min(1, 'appId is required'),
    from: z.string().datetime({ message: 'from must be a valid ISO 8601 datetime' }),
    to: z.string().datetime({ message: 'to must be a valid ISO 8601 datetime' }).optional(),
    types: z
      .array(eventTypeSchema)
      .optional()
      .refine((types) => !types || types.length > 0, 'types array must not be empty if provided'),
    names: z
      .array(z.string().min(1))
      .optional()
      .refine((names) => !names || names.length > 0, 'names array must not be empty if provided'),
    userId: z.string().min(1).optional(),
    anonymousId: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    limit: z
      .number()
      .int()
      .min(1, 'limit must be at least 1')
      .max(MAX_QUERY_LIMIT, `limit must not exceed ${MAX_QUERY_LIMIT}`)
      .optional(),
    cursor: z.string().optional(),
    sort: z.enum(['asc', 'desc']).optional(),
  })
  .refine(
    (data) => {
      if (!data.to) return true;
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return toDate > fromDate;
    },
    {
      message: 'to must be after from',
      path: ['to'],
    }
  )
  .refine(
    (data) => {
      const toDate = data.to ? new Date(data.to) : new Date();
      const fromDate = new Date(data.from);
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= MAX_DATE_RANGE_DAYS;
    },
    {
      message: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days`,
      path: ['from'],
    }
  );

export function validateQueryEventsInput(input: unknown): QueryEventsInput {
  // Preprocess to normalize HTTP query params (strings, comma-separated values, etc.)
  const preprocessed = preprocessQueryInput(input);

  // Validate with Zod schema
  const validated = queryEventsInputSchema.parse(preprocessed);

  return {
    ...validated,
    limit: validated.limit ?? DEFAULT_QUERY_LIMIT,
    sort: validated.sort ?? 'desc',
    // Ensure 'to' is set (should be set by preprocessing if omitted)
    to: validated.to ?? new Date().toISOString(),
  };
}

/**
 * @deprecated Use cursor utilities from src/utils/cursor.ts instead
 * These functions are kept for backward compatibility but will be removed in a future version
 */
export { decodeCursor as parseCursor, encodeCursor } from '../utils/cursor.js';
