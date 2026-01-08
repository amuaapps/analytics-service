# Analytics Service

A serverless microservice for collecting, processing, and querying analytics events. Built with TypeScript following MACH principles, supporting both AWS and Azure deployments.

## Overview

The Analytics Service provides:
- **Ingestion API** (`POST /api/v1/events`) - Accept batches of analytics events
- **Query API** (`GET /api/v1/events`) - Query stored events with filtering and pagination
- **Multi-cloud support** - Deploy to AWS (DynamoDB + S3) or Azure (Cosmos DB + Blob Storage)
- **Asynchronous processing** - Queue-based event processing with dead-letter handling
- **Raw event storage** - Immutable audit trail for replay and compliance

## Architecture

This service follows the Analytics Microservice Contract & Storage Specification v1.0.0 (see `docs/analytics-service-spec-v1.0.0.md`).

**Event types supported:**
- `track` - Custom events (e.g., button clicks, purchases)
- `page` - Page/screen views
- `identify` - User trait updates

**Storage model:**
- **Operational store** - DynamoDB (AWS) or Cosmos DB (Azure) with TTL-based retention
- **Raw store** - S3 (AWS) or Blob Storage (Azure) for immutable audit logs

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- AWS account (for AWS deployment) or Azure account (for Azure deployment)
- Terraform (for AWS infrastructure)
- Bicep CLI (for Azure infrastructure)

## Local Development

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test                 # Run all tests
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage    # Run tests with coverage report
```

### Linting and formatting

```bash
npm run lint            # Check for lint errors
npm run typecheck       # TypeScript type checking
npm run format:check    # Check code formatting
npm run format          # Auto-format code
```

### Build

```bash
npm run build           # Compile TypeScript to dist/
```

## Configuration

Configuration is managed via environment variables. See `.env.example` for required variables.

### Required environment variables

- `NODE_ENV` - Environment (`development`, `staging`, `production`)
- `ANALYTICS_WRITE_KEY` - Secret key for ingestion API authentication
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `LOG_LEVEL` - Logging level (`debug`, `info`, `warn`, `error`)

### Cloud-specific variables

**AWS:**
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `DYNAMODB_TABLE_NAME` - DynamoDB table name
- `S3_RAW_BUCKET_NAME` - S3 bucket for raw events
- `SQS_QUEUE_URL` - SQS queue URL for event processing

**Azure:**
- `AZURE_COSMOS_ENDPOINT` - Cosmos DB endpoint
- `AZURE_COSMOS_KEY` - Cosmos DB key
- `AZURE_STORAGE_CONNECTION_STRING` - Blob Storage connection string
- `AZURE_QUEUE_NAME` - Storage Queue name

## Deployment

This service supports deployment to both AWS and Azure. Infrastructure is defined in `infra/aws` (Terraform) and `infra/azure` (Bicep).

### GitHub Actions CI/CD

The repository includes automated CI/CD workflows with 4-stage pipeline:
1. **Test** - Lint, typecheck, format check, unit tests, security scans
2. **Build** - Compile and package artifacts
3. **Deploy** - Deploy to GREEN environment (no traffic switch)
4. **Test Infra + Integration + Switch** - Validate and switch traffic to GREEN

### Required GitHub Secrets/Variables

**AWS (OIDC):**
- `AWS_ROLE_ARN` (secret)
- `AWS_ACCOUNT_ID` (variable)
- `AWS_REGION` (variable)

**Azure (OIDC):**
- `AZURE_CLIENT_ID` (variable)
- `AZURE_TENANT_ID` (variable)
- `AZURE_SUBSCRIPTION_ID` (variable)

See `docs/agents.md` section 9.4 for detailed deployment instructions.

### Manual deployment

**AWS:**
```bash
cd infra/aws
terraform init
terraform plan
terraform apply
```

**Azure:**
```bash
cd infra/azure
az deployment group create \
  --resource-group <resource-group> \
  --template-file main.bicep
```

## API Documentation

### POST /api/v1/events

Ingest a batch of analytics events.

**Headers:**
- `X-Analytics-Write-Key` (required) - Authentication key
- `Content-Type: application/json`

**Request body:**
```json
{
  "schemaVersion": "1.0.0",
  "sentAt": "2026-01-07T20:30:00Z",
  "events": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "track",
      "name": "button.clicked",
      "occurredAt": "2026-01-07T20:29:58Z",
      "source": {
        "appId": "web-storefront",
        "platform": "web",
        "env": "prod"
      },
      "actor": {
        "userId": "user_123",
        "sessionId": "session_456"
      },
      "properties": {
        "button_id": "checkout_btn"
      }
    }
  ]
}
```

**Responses:**
- `202 Accepted` - Events enqueued successfully
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid or missing write key
- `413 Payload Too Large` - Batch exceeds size limit

### GET /api/v1/events

Query stored analytics events.

**Query parameters:**
- `appId` (required) - Application identifier
- `from` (required) - Start time (ISO 8601)
- `to` (optional) - End time (ISO 8601)
- `types` (optional) - Event types (comma-separated)
- `userId` (optional) - Filter by user ID
- `limit` (optional) - Results per page (default: 50, max: 200)
- `cursor` (optional) - Pagination cursor

**Response:**
```json
{
  "items": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "track",
      "name": "button.clicked",
      "occurredAt": "2026-01-07T20:29:58Z",
      "receivedAt": "2026-01-07T20:30:01Z",
      "source": { ... },
      "actor": { ... },
      "properties": { ... }
    }
  ],
  "nextCursor": "eyJwayI6IkFQUCN3ZWItc3RvcmVmcm9udCNEQVkjMjAyNi0wMS0wNyIsInNrIjoiVFMjMTczNjI4MzU5ODAwMCNFVlQjNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0="
}
```

## Testing

Tests are organized into:
- `tests/unit/` - Unit tests for business logic
- `tests/integration/` - Integration tests for API endpoints

Coverage thresholds are enforced at 80% for branches, functions, lines, and statements.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

This is an open-source project following Amua Apps coding standards. See `docs/agents.md` for detailed coding guidelines.

## Documentation

- [Analytics Service Specification v1.0.0](docs/analytics-service-spec-v1.0.0.md) - API contracts and storage model
- [Coding Standards](docs/agents.md) - Amua Apps coding standards and CI/CD requirements
