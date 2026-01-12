/**
 * Canonical Cursor Utilities
 *
 * Provides a standardized opaque cursor format for pagination across all storage adapters.
 *
 * Design:
 * - Cursor is fully opaque to clients (base64url encoded JSON)
 * - Internal structure: { pk: string, sk: string }
 * - pk = partition key (appId, userId, or sessionId depending on query)
 * - sk = sort key (occurredAt#eventId for time-based ordering)
 *
 * This format works across:
 * - DynamoDB (native LastEvaluatedKey structure)
 * - Cosmos DB (continuation token wrapper)
 * - In-memory (synthetic cursor for consistency)
 */

export interface CursorData {
  pk: string;
  sk: string;
}

/**
 * Encode cursor data into an opaque token
 *
 * @param pk - Partition key value
 * @param sk - Sort key value
 * @returns Base64url-encoded opaque cursor token
 */
export function encodeCursor(pk: string, sk: string): string {
  const cursorData: CursorData = { pk, sk };
  const json = JSON.stringify(cursorData);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode an opaque cursor token into cursor data
 *
 * @param cursor - Opaque cursor token
 * @returns Decoded cursor data with pk and sk
 * @throws Error if cursor is invalid or malformed
 */
export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Cursor must be an object');
    }

    if (typeof parsed.pk !== 'string' || typeof parsed.sk !== 'string') {
      throw new Error('Cursor must contain pk and sk strings');
    }

    if (!parsed.pk || !parsed.sk) {
      throw new Error('Cursor pk and sk must not be empty');
    }

    return { pk: parsed.pk, sk: parsed.sk };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Cursor')) {
      throw error;
    }
    throw new Error(
      'Invalid cursor format: ' + (error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

/**
 * Validate that a cursor string is well-formed
 *
 * @param cursor - Cursor token to validate
 * @returns true if valid, false otherwise
 */
export function isValidCursor(cursor: string): boolean {
  try {
    decodeCursor(cursor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a cursor from a stored event's key components
 *
 * @param appId - Application ID (partition key)
 * @param occurredAt - Event timestamp (ISO 8601)
 * @param eventId - Event unique identifier
 * @returns Encoded cursor token
 */
export function createCursorFromEvent(appId: string, occurredAt: string, eventId: string): string {
  const pk = appId;
  const sk = `${occurredAt}#${eventId}`;
  return encodeCursor(pk, sk);
}

/**
 * Extract sort key components from cursor data
 *
 * @param cursorData - Decoded cursor data
 * @returns Object with occurredAt and eventId, or null if sk format is invalid
 */
export function parseSortKey(
  cursorData: CursorData
): { occurredAt: string; eventId: string } | null {
  const parts = cursorData.sk.split('#');
  if (parts.length !== 2) {
    return null;
  }
  return {
    occurredAt: parts[0],
    eventId: parts[1],
  };
}
