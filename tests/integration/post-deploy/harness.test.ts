import { describe, it, expect, beforeAll } from '@jest/globals';
import type { IngestRequestEnvelope } from '../../../src/domain/ingest-types.js';

/**
 * Post-deployment integration test harness
 *
 * This test validates the end-to-end flow:
 * 1. Ingest event via POST /api/v1/events
 * 2. Wait for event to be processed and stored
 * 3. Query event via GET /api/v1/events
 * 4. Assert returned data matches contract
 *
 * Used in Stage 4 of CI/CD to validate GREEN deployment before traffic switch.
 */

// Configuration from environment
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ANALYTICS_WRITE_KEY = process.env.ANALYTICS_WRITE_KEY || 'local-dev-key-12345';
const MAX_RETRIES = parseInt(process.env.TEST_MAX_RETRIES || '30', 10);
const RETRY_DELAY_MS = parseInt(process.env.TEST_RETRY_DELAY_MS || '2000', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.TEST_REQUEST_TIMEOUT_MS || '10000', 10);

// Test data (non-sensitive, no PII)
const TEST_APP_ID = 'test-app-post-deploy';
const TEST_USER_ID = 'test-user-12345';
const TEST_SESSION_ID = `session-${Date.now()}`;
const TEST_EVENT_ID = `event-${Date.now()}-${Math.random().toString(36).substring(7)}`;

interface IngestResponse {
  accepted: boolean;
  eventCount: number;
  batchId: string;
}

interface QueryResponse {
  items: Array<{
    schemaVersion: string;
    eventId: string;
    type: string;
    name?: string;
    occurredAt: string;
    receivedAt: string;
    source: {
      appId: string;
      platform: string;
      env: string;
    };
    actor: {
      userId?: string;
      anonymousId?: string;
    };
    context?: {
      sessionId?: string;
      [key: string]: unknown;
    };
    properties?: Record<string, unknown>;
  }>;
  nextCursor?: string;
}

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send ingest request
 */
async function ingestEvent(eventId: string): Promise<IngestResponse> {
  const now = new Date().toISOString();

  const payload: IngestRequestEnvelope = {
    schemaVersion: '1.0.0',
    events: [
      {
        schemaVersion: '1.0.0',
        eventId,
        type: 'track',
        name: 'post_deploy_test',
        occurredAt: now,
        source: {
          appId: TEST_APP_ID,
          platform: 'web',
          env: 'test',
        },
        actor: {
          userId: TEST_USER_ID,
        },
        context: {
          sessionId: TEST_SESSION_ID,
          testRun: true,
        } as Record<string, unknown>,
        properties: {
          testType: 'post-deploy',
          timestamp: now,
        },
      },
    ],
  };

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Analytics-Write-Key': ANALYTICS_WRITE_KEY,
      },
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ingest failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return response.json() as Promise<IngestResponse>;
}

/**
 * Query events with retry logic
 */
async function queryEventWithRetry(
  eventId: string,
  maxRetries: number,
  delayMs: number
): Promise<QueryResponse | null> {
  const fromTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const queryParams = new URLSearchParams({
        appId: TEST_APP_ID,
        from: fromTime,
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        limit: '10',
      });

      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/events?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        console.warn(`Query attempt ${attempt}/${maxRetries} failed: ${response.status}`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        const errorText = await response.text();
        throw new Error(
          `Query failed after ${maxRetries} attempts: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = (await response.json()) as QueryResponse;

      // Check if our event is in the results
      const foundEvent = data.items.find((e) => e.eventId === eventId);

      if (foundEvent) {
        return data;
      }

      console.log(
        `Attempt ${attempt}/${maxRetries}: Event not yet queryable (found ${data.items.length} events)`
      );

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.warn(`Query attempt ${attempt}/${maxRetries} error:`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

/**
 * Validate event matches contract
 */
function validateEvent(event: QueryResponse['items'][0], expectedEventId: string): void {
  // Required fields
  expect(event.eventId).toBe(expectedEventId);
  expect(event.type).toBe('track');
  expect(event.name).toBe('post_deploy_test');
  expect(event.occurredAt).toBeDefined();
  expect(event.receivedAt).toBeDefined();

  // Source validation
  expect(event.source).toBeDefined();
  expect(event.source.appId).toBe(TEST_APP_ID);
  expect(event.source.platform).toBe('web');
  expect(event.source.env).toBe('test');

  // Actor validation
  expect(event.actor).toBeDefined();
  expect(event.actor.userId).toBe(TEST_USER_ID);

  // Context validation (sessionId is stored in context)
  expect(event.context).toBeDefined();
  if (event.context) {
    expect(event.context.sessionId).toBe(TEST_SESSION_ID);
    expect(event.context.testRun).toBe(true);
  }

  // Properties validation
  expect(event.properties).toBeDefined();
  expect(event.properties?.testType).toBe('post-deploy');
  expect(event.properties?.timestamp).toBeDefined();

  // Timestamp validation
  const occurredAt = new Date(event.occurredAt);
  const receivedAt = new Date(event.receivedAt);
  expect(occurredAt.getTime()).toBeGreaterThan(0);
  expect(receivedAt.getTime()).toBeGreaterThan(0);
  expect(receivedAt.getTime()).toBeGreaterThanOrEqual(occurredAt.getTime());
}

describe('Post-Deploy Integration Test Harness', () => {
  beforeAll(() => {
    console.log('='.repeat(60));
    console.log('POST-DEPLOY INTEGRATION TEST HARNESS');
    console.log('='.repeat(60));
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log(`Test App ID: ${TEST_APP_ID}`);
    console.log(`Test Event ID: ${TEST_EVENT_ID}`);
    console.log(`Max Retries: ${MAX_RETRIES}`);
    console.log(`Retry Delay: ${RETRY_DELAY_MS}ms`);
    console.log(`Request Timeout: ${REQUEST_TIMEOUT_MS}ms`);
    console.log('='.repeat(60));
  });

  it('should complete end-to-end flow: ingest → persist → query', async () => {
    console.log('\n[1/3] Ingesting test event...');

    // Step 1: Ingest event
    const ingestResponse = await ingestEvent(TEST_EVENT_ID);

    expect(ingestResponse).toBeDefined();
    expect(ingestResponse.accepted).toBe(true);
    expect(ingestResponse.eventCount).toBe(1);
    expect(ingestResponse.batchId).toBeDefined();

    console.log(`✓ Event ingested successfully (batchId: ${ingestResponse.batchId})`);

    console.log('\n[2/3] Waiting for event to be processed and queryable...');

    // Step 2: Wait for event to be queryable
    const queryResponse = await queryEventWithRetry(TEST_EVENT_ID, MAX_RETRIES, RETRY_DELAY_MS);

    expect(queryResponse).not.toBeNull();
    expect(queryResponse!.items).toBeDefined();
    expect(queryResponse!.items.length).toBeGreaterThan(0);

    console.log(`✓ Event is queryable (found ${queryResponse!.items.length} events)`);

    console.log('\n[3/3] Validating event data matches contract...');

    // Step 3: Validate event
    const foundEvent = queryResponse!.items.find((e) => e.eventId === TEST_EVENT_ID);

    expect(foundEvent).toBeDefined();
    validateEvent(foundEvent!, TEST_EVENT_ID);

    console.log('✓ Event data validated successfully');
    console.log('\n' + '='.repeat(60));
    console.log('✅ POST-DEPLOY INTEGRATION TEST PASSED');
    console.log('='.repeat(60));
  }, 120000); // 2 minute timeout for entire test

  it('should handle query pagination correctly', async () => {
    console.log('\n[Pagination Test] Querying with limit...');

    const fromTime = new Date(Date.now() - 60000).toISOString();
    const queryParams = new URLSearchParams({
      appId: TEST_APP_ID,
      from: fromTime,
      limit: '5',
    });

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/events?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      REQUEST_TIMEOUT_MS
    );

    expect(response.ok).toBe(true);

    const data = (await response.json()) as QueryResponse;

    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);

    if (data.nextCursor) {
      expect(typeof data.nextCursor).toBe('string');
      expect(data.nextCursor.length).toBeGreaterThan(0);
    }

    console.log(`✓ Pagination validated (nextCursor: ${data.nextCursor ? 'present' : 'none'})`);
  }, 30000);

  it('should reject requests without authentication', async () => {
    console.log('\n[Auth Test] Testing authentication requirement...');

    const payload: IngestRequestEnvelope = {
      schemaVersion: '1.0.0',
      events: [
        {
          schemaVersion: '1.0.0',
          eventId: `auth-test-${Date.now()}`,
          type: 'track',
          name: 'auth_test',
          occurredAt: new Date().toISOString(),
          source: {
            appId: TEST_APP_ID,
            platform: 'web',
            env: 'test',
          },
          actor: {
            userId: TEST_USER_ID,
          },
        },
      ],
    };

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No X-Analytics-Write-Key header
        },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS
    );

    expect(response.status).toBe(401);
    console.log('✓ Authentication correctly enforced');
  }, 30000);

  it('should reject invalid payloads', async () => {
    console.log('\n[Validation Test] Testing payload validation...');

    const invalidPayload = {
      schemaVersion: '1.0.0',
      events: [
        {
          // Missing required fields
          eventId: `invalid-${Date.now()}`,
          type: 'track',
          // Missing occurredAt, source, actor
        },
      ],
    };

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Analytics-Write-Key': ANALYTICS_WRITE_KEY,
        },
        body: JSON.stringify(invalidPayload),
      },
      REQUEST_TIMEOUT_MS
    );

    expect(response.status).toBe(400);
    console.log('✓ Validation correctly enforced');
  }, 30000);
});
