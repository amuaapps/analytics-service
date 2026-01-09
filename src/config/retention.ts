/**
 * Data Retention Configuration
 * 
 * Defines retention policies for operational event storage across AWS and Azure.
 * This is the single source of truth for TTL/retention settings.
 */

/**
 * Retention period in days
 * Default: 365 days (12 months)
 */
export const RETENTION_DAYS = 365;

/**
 * Retention period in seconds (for Cosmos DB TTL)
 * 365 days * 24 hours * 60 minutes * 60 seconds = 31,536,000 seconds
 */
export const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

/**
 * Calculate expiration timestamp for an event
 * 
 * @param occurredAt - ISO 8601 timestamp when the event occurred
 * @returns Unix epoch timestamp (seconds) when the event should expire
 */
export function calculateExpiresAt(occurredAt: string): number {
  const occurredDate = new Date(occurredAt);
  const expiresDate = new Date(occurredDate.getTime() + (RETENTION_DAYS * 24 * 60 * 60 * 1000));
  return Math.floor(expiresDate.getTime() / 1000); // Unix epoch in seconds
}

/**
 * Calculate TTL for Cosmos DB (seconds from now)
 * 
 * @param occurredAt - ISO 8601 timestamp when the event occurred
 * @returns TTL in seconds (time remaining until expiration)
 */
export function calculateCosmosDbTtl(occurredAt: string): number {
  const occurredDate = new Date(occurredAt);
  const expiresDate = new Date(occurredDate.getTime() + (RETENTION_DAYS * 24 * 60 * 60 * 1000));
  const now = new Date();
  const ttlSeconds = Math.floor((expiresDate.getTime() - now.getTime()) / 1000);
  return Math.max(ttlSeconds, 0); // Ensure non-negative
}
