import { z } from 'zod';
import type { QueryEventsInput } from './query-types.js';

const MAX_QUERY_LIMIT = 200;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_DATE_RANGE_DAYS = 31;

const eventTypeSchema = z.enum(['track', 'page', 'identify']);

export const queryEventsInputSchema = z
  .object({
    appId: z.string().min(1, 'appId is required'),
    from: z.string().datetime({ message: 'from must be a valid ISO 8601 datetime' }),
    to: z.string().datetime({ message: 'to must be a valid ISO 8601 datetime' }).optional(),
    types: z
      .array(eventTypeSchema)
      .optional()
      .refine(
        (types) => !types || types.length > 0,
        'types array must not be empty if provided'
      ),
    names: z
      .array(z.string().min(1))
      .optional()
      .refine(
        (names) => !names || names.length > 0,
        'names array must not be empty if provided'
      ),
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
  const validated = queryEventsInputSchema.parse(input);
  
  return {
    ...validated,
    limit: validated.limit ?? DEFAULT_QUERY_LIMIT,
    sort: validated.sort ?? 'desc',
  };
}

/**
 * @deprecated Use cursor utilities from src/utils/cursor.ts instead
 * These functions are kept for backward compatibility but will be removed in a future version
 */
export { decodeCursor as parseCursor, encodeCursor } from '../utils/cursor.js';
