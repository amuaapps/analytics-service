# Quick Start Guide

Get the Analytics Service running locally in under 2 minutes.

## 1. Install Dependencies

```bash
npm install
```

## 2. Run Tests

Verify everything works (no cloud setup needed):

```bash
npm test
```

Expected output:
```
Test Suites: 15 passed, 15 total
Tests:       192 passed, 192 total
Time:        ~2s
```

## 3. Start Local Server

```bash
npm run dev
```

You should see:
```
🚀 Analytics Service started (local development mode)
📍 Available endpoints:
  - ingest: http://localhost:3000/api/v1/events
  - query: http://localhost:3000/api/v1/events?appId=test&from=2026-01-01T00:00:00Z
  - health: http://localhost:3000/health
🔑 Use this write key: local-dev-key-12345
```

## 4. Send a Test Event

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-Analytics-Write-Key: local-dev-key-12345" \
  -d '{
    "schemaVersion": "1.0.0",
    "events": [{
      "schemaVersion": "1.0.0",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "track",
      "name": "test.event",
      "occurredAt": "2026-01-08T10:00:00Z",
      "source": {
        "appId": "test-app",
        "platform": "web",
        "env": "dev"
      },
      "actor": {
        "userId": "user-123"
      }
    }]
  }'
```

Expected response:
```json
{
  "accepted": 1,
  "eventCount": 1
}
```

## 5. Query Events

```bash
curl "http://localhost:3000/api/v1/events?appId=test-app&from=2026-01-08T00:00:00Z"
```

## Next Steps

- **Read the full guide**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
- **API specification**: [analytics-service-spec-v1.0.0.md](analytics-service-spec-v1.0.0.md)
- **Coding standards**: [agents.md](agents.md)

## Troubleshooting

### Port 3000 already in use?

```bash
PORT=3001 npm run dev
```

### Tests failing?

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Clear Jest cache
npx jest --clearCache

# Run tests again
npm test
```

### Need help?

Check the [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) guide for detailed troubleshooting.
