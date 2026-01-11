# Post-Deploy Integration Test Harness

This directory contains the integration test harness used in **Stage 4** of the CI/CD pipeline to validate GREEN deployments before switching traffic.

## Purpose

The test harness validates the complete end-to-end flow:
1. **Ingest**: Send event via POST /api/v1/events
2. **Process**: Wait for event to be processed and stored
3. **Query**: Retrieve event via GET /api/v1/events
4. **Validate**: Assert event data matches contract

## Test Scenarios

### 1. End-to-End Flow Test
- Sends a test event with unique ID
- Polls query endpoint with bounded retries
- Validates returned event matches contract
- Ensures no data loss or corruption

### 2. Pagination Test
- Validates query pagination works correctly
- Checks `hasMore` flag
- Verifies `nextCursor` when applicable

### 3. Authentication Test
- Ensures requests without write key are rejected (401)
- Validates authentication is enforced

### 4. Validation Test
- Ensures invalid payloads are rejected (400)
- Validates input validation is working

## Configuration

The harness is configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Base URL of the API to test | `http://localhost:3000` |
| `ANALYTICS_WRITE_KEY` | Authentication key | `local-dev-key-12345` |
| `TEST_MAX_RETRIES` | Max query retry attempts | `30` |
| `TEST_RETRY_DELAY_MS` | Delay between retries (ms) | `2000` |
| `TEST_REQUEST_TIMEOUT_MS` | HTTP request timeout (ms) | `10000` |

## Usage

### Local Testing

```bash
# Test against local server
npm run dev

# In another terminal
npm run test:post-deploy
```

### CI/CD (Stage 4)

**AWS:**
```bash
export API_BASE_URL="https://your-api-gateway-url.amazonaws.com/dev"
export ANALYTICS_WRITE_KEY="${{ secrets.ANALYTICS_WRITE_KEY }}"
npm run test:post-deploy
```

**Azure:**
```bash
export API_BASE_URL="https://analytics-func-dev-staging.azurewebsites.net"
export ANALYTICS_WRITE_KEY="${{ secrets.ANALYTICS_WRITE_KEY }}"
npm run test:post-deploy
```

### Custom Configuration

```bash
# Test with custom retry settings
export API_BASE_URL="https://api.example.com"
export ANALYTICS_WRITE_KEY="your-key"
export TEST_MAX_RETRIES=60
export TEST_RETRY_DELAY_MS=1000
npm run test:post-deploy
```

## Test Data

The harness uses **non-sensitive test data** with no PII:

```typescript
{
  appId: "test-app-post-deploy",
  userId: "test-user-12345",
  context: {
    sessionId: "session-{timestamp}"  // Canonical location
  },
  eventId: "event-{timestamp}-{random}",
  type: "track",
  name: "post_deploy_test",
  properties: {
    testType: "post-deploy",
    timestamp: "2026-01-08T10:00:00Z"
  }
}
```

## Retry Logic

The harness implements **bounded retries** with exponential backoff:

1. Send ingest request
2. Poll query endpoint every 2 seconds (configurable)
3. Max 30 retries (60 seconds total, configurable)
4. If event not found after max retries, fail test

This accounts for:
- Queue processing delays
- Database write latency
- Eventual consistency

## Contract Validation

The harness validates the following contract:

**Required Fields:**
- `eventId` matches sent event
- `type` is "track"
- `name` is "post_deploy_test"
- `occurredAt` is valid ISO timestamp
- `receivedAt` is valid ISO timestamp

**Source:**
- `appId` matches test app
- `platform` is "test"
- `env` is "test"

**Actor:**
- `userId` matches test user

**Context:**
- `sessionId` matches test session (stored in `context.sessionId`)
- `testRun` is true

**Properties:**
- `testType` is "post-deploy"
- `timestamp` is defined

**Timestamps:**
- `occurredAt` is valid date
- `receivedAt` is valid date
- `receivedAt` >= `occurredAt`

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

## Troubleshooting

### Test Timeout

**Symptom**: Test fails with "Event not queryable after N retries"

**Possible Causes:**
- Queue processing is slow
- Database write is delayed
- Event processing failed

**Solutions:**
- Increase `TEST_MAX_RETRIES`
- Increase `TEST_RETRY_DELAY_MS`
- Check queue and processor logs
- Verify database connectivity

### Authentication Failure

**Symptom**: 401 Unauthorized

**Possible Causes:**
- Wrong `ANALYTICS_WRITE_KEY`
- Key not configured in deployment

**Solutions:**
- Verify `ANALYTICS_WRITE_KEY` secret
- Check Function App / Lambda environment variables
- Ensure key matches deployment

### Connection Timeout

**Symptom**: Request timeout errors

**Possible Causes:**
- API not accessible
- Network issues
- Cold start delays

**Solutions:**
- Verify `API_BASE_URL` is correct
- Check API is running
- Increase `TEST_REQUEST_TIMEOUT_MS`
- Wait for cold start to complete

### Validation Errors

**Symptom**: Event data doesn't match contract

**Possible Causes:**
- Data transformation bug
- Schema mismatch
- Serialization issue

**Solutions:**
- Check processor logs
- Verify event transformation logic
- Review database schema

## Integration with CI/CD

### GitHub Actions

The harness is integrated into Stage 4 of the deployment pipeline:

```yaml
- name: Run integration tests against GREEN
  run: npm run test:post-deploy
  env:
    API_BASE_URL: ${{ steps.get-url.outputs.api_url }}
    ANALYTICS_WRITE_KEY: ${{ secrets.ANALYTICS_WRITE_KEY }}
```

### Success Criteria

For the pipeline to proceed with traffic switch:
- ✅ All tests must pass
- ✅ End-to-end flow validated
- ✅ Event data matches contract
- ✅ No authentication bypasses
- ✅ Validation working correctly

### Failure Handling

If tests fail:
- ❌ Pipeline fails at Stage 4
- ❌ Traffic remains on BLUE (previous version)
- ❌ GREEN deployment exists but not used
- ❌ Manual investigation required

## Best Practices

1. **Always use unique event IDs**
   - Prevents conflicts with previous test runs
   - Ensures idempotency testing

2. **Use non-sensitive test data**
   - No real user data
   - No PII
   - Clearly marked as test data

3. **Set appropriate timeouts**
   - Account for cold starts
   - Consider queue processing time
   - Balance speed vs reliability

4. **Monitor test duration**
   - Track how long tests take
   - Optimize retry settings
   - Alert on slow tests

5. **Clean up test data**
   - Test data has TTL
   - Marked with `testRun: true`
   - Automatically expires

## Metrics

The harness tracks:
- Total test duration
- Number of retry attempts
- Time to event queryable
- Success/failure rate

These metrics help optimize:
- Retry settings
- Timeout values
- Infrastructure performance

## Future Enhancements

Potential improvements:
- [ ] Test multiple event types (page, identify)
- [ ] Test batch ingestion
- [ ] Test error scenarios
- [ ] Test rate limiting
- [ ] Performance benchmarking
- [ ] Load testing
- [ ] Chaos testing
