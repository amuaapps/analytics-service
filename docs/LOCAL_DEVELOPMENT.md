# Local Development Guide

This guide helps you set up and run the Analytics Service locally without any cloud dependencies.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Run tests (no external dependencies)
npm test

# 4. Start local development server
npm run dev
```

The service will start on `http://localhost:3000` with in-memory storage and queuing.

## Prerequisites

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **No cloud accounts required** for local development

## Environment Setup

### 1. Create `.env` file

```bash
cp .env.example .env
```

### 2. Configure for local development

For local development, the minimal `.env` configuration is:

```bash
# Service
SERVICE_NAME=analytics-service
NODE_ENV=development
LOG_LEVEL=debug

# Security
ANALYTICS_WRITE_KEY=local-dev-key-12345
CORS_ALLOWED_ORIGINS=*

# Leave CLOUD_PROVIDER empty for in-memory mode
# CLOUD_PROVIDER=
```

**Important**: Leave `CLOUD_PROVIDER` empty or commented out to use in-memory implementations.

## Running the Service

### Development Server

Start the local development server with in-memory storage:

```bash
npm run dev
```

The server will:
- Listen on `http://localhost:3000` (or `PORT` env var)
- Use in-memory storage (no database required)
- Use in-memory queue (no message queue required)
- Log all requests and events
- Auto-reload on code changes (with `npm run dev:watch`)

### Available Endpoints

Once running, you can access:

- **Ingest**: `POST http://localhost:3000/api/v1/events`
- **Query**: `GET http://localhost:3000/api/v1/events?appId=test&from=2026-01-01T00:00:00Z`
- **Health**: `GET http://localhost:3000/health`

### Example: Send an Event

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
      "name": "button.clicked",
      "occurredAt": "2026-01-08T10:00:00Z",
      "source": {
        "appId": "web-app",
        "platform": "web",
        "env": "dev"
      },
      "actor": {
        "userId": "user-123"
      },
      "properties": {
        "button": "submit"
      }
    }]
  }'
```

### Example: Query Events

```bash
curl "http://localhost:3000/api/v1/events?appId=web-app&from=2026-01-08T00:00:00Z&limit=10"
```

## Running Tests

### All Tests

Run the complete test suite (unit + integration):

```bash
npm test
```

**Key Points:**
- ✅ No external network calls
- ✅ All tests use in-memory implementations
- ✅ Fast execution (< 2 seconds)
- ✅ No cloud credentials needed

### Unit Tests Only

```bash
npm run test:unit
```

### Integration Tests Only

```bash
npm run test:integration
```

### Watch Mode

Auto-run tests on file changes:

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

## Development Workflow

### 1. Make Code Changes

Edit files in `src/` directory. The codebase follows this structure:

```
src/
├── app/           # Application layer (HTTP, middleware, handlers)
├── domain/        # Domain logic (validation, types)
├── infra/         # Infrastructure adapters (storage, queue, cloud)
├── config/        # Configuration loading
└── utils/         # Shared utilities
```

### 2. Run Type Checking

```bash
npm run typecheck
```

### 3. Run Linting

```bash
npm run lint

# Auto-fix issues
npm run lint:fix
```

### 4. Format Code

```bash
npm run format
```

### 5. Validate Everything

Run all checks before committing:

```bash
npm run validate
```

This runs: typecheck → lint → test

## Testing Locally

### Unit Tests

Unit tests are in `tests/unit/` and test individual functions/modules in isolation:

```bash
npm run test:unit
```

Example unit test locations:
- `tests/unit/domain/validation.test.ts` - Validation logic
- `tests/unit/app/middleware/auth.test.ts` - Authentication
- `tests/unit/app/core/processor-handler.test.ts` - Event processing

### Integration Tests

Integration tests are in `tests/integration/` and test complete workflows:

```bash
npm run test:integration
```

Example integration test locations:
- `tests/integration/http/ingest.test.ts` - Ingestion API
- `tests/integration/http/query.test.ts` - Query API
- `tests/integration/processor/processor.test.ts` - Event processing

### Test Isolation

All tests use in-memory implementations:
- **Storage**: `InMemoryOperationalStorage` and `InMemoryRawStorage`
- **Queue**: `InMemoryQueueAdapter`
- **No external calls**: Tests never hit AWS, Azure, or any external services

## Debugging

### Enable Debug Logging

Set `LOG_LEVEL=debug` in `.env`:

```bash
LOG_LEVEL=debug npm run dev
```

### Debug Tests

Use Node.js inspector:

```bash
node --inspect-brk node_modules/.bin/jest tests/unit/domain/validation.test.ts
```

Then attach your debugger (VS Code, Chrome DevTools, etc.)

### View Request/Response

All HTTP requests and responses are logged when `LOG_LEVEL=debug`:

```json
{
  "level": "info",
  "requestId": "abc-123",
  "method": "POST",
  "path": "/api/v1/events",
  "eventCount": 1,
  "msg": "Request received"
}
```

## Common Tasks

### Add a New Test

1. Create test file in `tests/unit/` or `tests/integration/`
2. Import test utilities:
   ```typescript
   import { describe, it, expect, beforeEach } from '@jest/globals';
   ```
3. Write tests using Jest matchers
4. Run: `npm test`

### Test Validation Rules

```typescript
import { ingestEventSchema } from '../../../src/domain/validation.js';

it('should validate track event', () => {
  const event = {
    schemaVersion: '1.0.0',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'track',
    name: 'button.clicked',
    occurredAt: '2026-01-08T10:00:00Z',
    source: { appId: 'app', platform: 'web', env: 'test' },
    actor: { userId: 'user-1' },
  };
  
  const result = ingestEventSchema.safeParse(event);
  expect(result.success).toBe(true);
});
```

### Test HTTP Endpoints

```typescript
import request from 'supertest';
import { createServer } from '../../../src/app/http/server.js';

it('should accept valid event', async () => {
  const response = await request(server)
    .post('/api/v1/events')
    .set('X-Analytics-Write-Key', 'test-key')
    .send({ schemaVersion: '1.0.0', events: [...] });
  
  expect(response.status).toBe(202);
});
```

## Troubleshooting

### Port Already in Use

If port 3000 is taken, set a different port:

```bash
PORT=3001 npm run dev
```

### Tests Failing

1. Check Node.js version: `node --version` (should be v18+)
2. Clean install: `rm -rf node_modules package-lock.json && npm install`
3. Clear Jest cache: `npx jest --clearCache`
4. Run specific test: `npm test -- tests/unit/domain/validation.test.ts`

### TypeScript Errors

Run type checking to see all errors:

```bash
npm run typecheck
```

### Import Errors

Ensure all imports use `.js` extension (ESM requirement):

```typescript
// ✅ Correct
import { foo } from './bar.js';

// ❌ Wrong
import { foo } from './bar';
```

## Next Steps

- **Cloud Deployment**: See `docs/DEPLOYMENT.md` for AWS/Azure setup
- **API Specification**: See `docs/analytics-service-spec-v1.0.0.md`
- **Architecture**: See `docs/ARCHITECTURE.md`
- **Contributing**: See `CONTRIBUTING.md`

## Getting Help

- Check existing tests for examples
- Review the spec: `docs/analytics-service-spec-v1.0.0.md`
- Open an issue on GitHub
- Ask in team chat

## Summary

✅ **No cloud setup required** for local development  
✅ **All tests run locally** without external calls  
✅ **Fast feedback loop** (< 2 seconds for full test suite)  
✅ **In-memory implementations** for storage and queuing  
✅ **Simple setup** (3 commands to get started)  

Happy coding! 🚀
