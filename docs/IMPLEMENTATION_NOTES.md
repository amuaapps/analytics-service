# Implementation Notes

## Documentation Hierarchy

This document clarifies which documentation is authoritative and how to navigate the codebase.

### 📚 Authoritative Documents (Single Source of Truth)

1. **API Contract:** `docs/analytics-service-spec-v1.0.0.md`
   - Defines the public API contract
   - Request/response formats
   - HTTP status codes
   - Authentication requirements
   - **This is the contract external clients depend on**

2. **Domain Types:** `src/domain/` TypeScript files
   - `base-types.ts` - Core domain types (Environment, EventType, Source, Actor, etc.)
   - `ingest-types.ts` - Ingest request envelope
   - `stored-event-types.ts` - Internal event storage format
   - `query-types.ts` - Query request/response types
   - **Code is the source of truth for type definitions**

3. **Infrastructure:** IaC files in `infra/`
   - `infra/aws/` - Terraform for AWS
   - `infra/azure/` - Bicep for Azure
   - **Deployed infrastructure matches these definitions**

4. **Coding Standards:** `docs/agents.md`
   - Architecture principles (MACH)
   - TypeScript standards
   - Security requirements
   - Testing standards
   - **All code must comply with these standards**

### 📖 Supporting Documentation

- `docs/domain-contracts.md` - Human-readable domain model explanation
- `docs/LIMITS_SPECIFICATION.md` - Limits reconciliation details
- `docs/SECRET_MANAGEMENT.md` - Secret store implementation
- `docs/AZURE_DEPLOYMENT_GUIDE.md` - Azure-specific deployment guide
- `README.md` - Project overview and quick start

**Note:** If supporting docs conflict with authoritative sources, the authoritative source wins.

## Limits: Hard vs Configurable

### Hard Maximums (Cannot Be Exceeded)

These are enforced in infrastructure validation and code:

| Limit | Value | Enforced By |
|-------|-------|-------------|
| Max Payload Size | 1 MB (1048576 bytes) | IaC validation + code |
| Max Events Per Batch | 100 | IaC validation + code |
| Max Property Depth | 3 levels | Code validation |
| Max Keys Per Level | 50 | Code validation |
| Max String Length | 2048 chars | Code validation |
| Max Array Length | 100 items | Code validation |
| Max Query Window | 90 days | Code validation |
| Max Query Limit | 1000 results | IaC validation + code |

**Location:** Defined in `src/config/limits.ts` and validated in `src/domain/validation.ts`

### Configurable Runtime Limits

These can be set via environment variables but cannot exceed hard maximums:

| Env Var | Default | Hard Max | Purpose |
|---------|---------|----------|---------|
| `MAX_PAYLOAD_SIZE_BYTES` | 1048576 | 1048576 | Request body size |
| `MAX_EVENTS_PER_BATCH` | 100 | 100 | Events per ingest |
| `MAX_QUERY_LIMIT` | 200 | 1000 | Query result limit |

**Configuration:** Set in IaC (Terraform/Bicep) as environment variables

**Validation:** `src/config/env-loader.ts` enforces min/max bounds

## Blue/Green Deployment

### AWS Lambda

**Mechanism:** Lambda Aliases + API Gateway Stage Variables

**Flow:**
1. Deploy new Lambda version
2. Update alias to point to new version (weighted traffic shifting available)
3. API Gateway routes traffic to alias
4. Rollback: Update alias back to previous version

**Files:**
- `infra/aws/lambda.tf` - Lambda functions with `publish = true`
- `infra/aws/api-gateway.tf` - API Gateway integration with aliases

**Commands:**
```bash
# Deploy new version
terraform apply

# Shift traffic (manual or via CI/CD)
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version $NEW_VERSION

# Rollback
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version $PREVIOUS_VERSION
```

### Azure Functions

**Mechanism:** Deployment Slots (Production + Staging)

**Flow:**
1. Deploy to staging slot
2. Test staging slot
3. Swap staging → production (instant cutover)
4. Rollback: Swap back production → staging

**Files:**
- `infra/azure/modules/functionapp.bicep` - Defines production and staging slots
- Both slots have identical configuration except slot-specific settings

**Commands:**
```bash
# Deploy to staging
az functionapp deployment source config-zip \
  --resource-group rg-analytics-prod \
  --name func-analytics-prod \
  --slot staging \
  --src deploy.zip

# Test staging
curl https://func-analytics-prod-staging.azurewebsites.net/health

# Swap to production
az functionapp deployment slot swap \
  --resource-group rg-analytics-prod \
  --name func-analytics-prod \
  --slot staging \
  --target-slot production

# Rollback (swap back)
az functionapp deployment slot swap \
  --resource-group rg-analytics-prod \
  --name func-analytics-prod \
  --slot production \
  --target-slot staging
```

## Environment Values

### Supported Environments

The `Environment` type supports these values:

```typescript
type Environment = 'development' | 'staging' | 'production' | 'test';
```

**Source:** `src/domain/base-types.ts`

**Usage:**
- `development` - Local development
- `test` - Automated testing (unit/integration tests)
- `staging` - Pre-production environment
- `production` - Live production environment

**Note:** The `test` environment is used internally for test fixtures and is not exposed in the public API.

## Cloud Provider Detection

The service automatically detects the cloud provider based on environment variables:

**AWS Detection:**
- `AWS_REGION`
- `DYNAMODB_TABLE_NAME`
- `S3_RAW_BUCKET_NAME`
- `SQS_QUEUE_URL`

**Azure Detection:**
- `AZURE_COSMOS_CONNECTION_STRING`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_QUEUE_NAME`

**Override:** Set `CLOUD_PROVIDER=aws` or `CLOUD_PROVIDER=azure` to force a specific provider.

**Source:** `src/config/cloud.ts`

## Secret Management

### AWS
- Secrets stored in **AWS Secrets Manager**
- Lambda reads secret ARN from env var
- Fetches secret at runtime with caching
- IAM policy grants `secretsmanager:GetSecretValue` only

### Azure
- Secrets stored in **Azure Key Vault**
- Function App uses Key Vault reference syntax
- Azure runtime automatically resolves reference
- Managed identity grants access

**Details:** See `docs/SECRET_MANAGEMENT.md`

## Database Partition Keys

### AWS DynamoDB
- Partition key: `/pk`
- Format: `{appId}#{eventType}` (e.g., `web-app#track`)
- Sort key: `occurredAt` (ISO 8601 timestamp)

### Azure Cosmos DB
- Partition key: `/pk`
- Value: `{appId}` (e.g., `web-app`)
- Queries scoped by partition key for efficiency

**Important:** Both use `/pk` as the partition key path for consistency.

## Testing Strategy

### Unit Tests
- Location: `tests/unit/`
- Run: `npm test`
- Coverage: 80%+ required
- Mock external dependencies

### Integration Tests
- Location: `tests/integration/`
- Run: `npm run test:integration`
- Use in-memory storage adapters
- Test end-to-end flows

### E2E Tests
- Location: `tests/e2e/` (future)
- Test against deployed infrastructure
- Verify cloud integrations

## Common Gotchas

### 1. Async Config Loading

`loadConfig()` is **async** because it fetches secrets from cloud stores:

```typescript
// ❌ Wrong
const config = loadConfig();

// ✅ Correct
const config = await loadConfig();
```

### 2. Validation Factory Functions

Validation schemas are factory functions that accept `LimitsConfig`:

```typescript
// ❌ Wrong
import { ingestRequestEnvelopeSchema } from './validation';
const result = ingestRequestEnvelopeSchema.safeParse(data);

// ✅ Correct
import { createValidateIngestRequestEnvelope } from './validation';
const validate = createValidateIngestRequestEnvelope(limits);
validate(data);
```

### 3. Cloud-Specific Code

Cloud-specific implementations belong in `src/infra/{aws,azure}/`:

```typescript
// ❌ Wrong - cloud logic in domain
if (process.env.AWS_REGION) {
  // AWS-specific code
}

// ✅ Correct - abstracted behind interface
const storage: EventRepository = cloudProvider === 'aws'
  ? new DynamoDBEventRepository(config)
  : new CosmosEventRepository(config);
```

### 4. Environment Variable Naming

Follow consistent naming conventions:

- AWS: `DYNAMODB_TABLE_NAME`, `S3_RAW_BUCKET_NAME`
- Azure: `AZURE_COSMOS_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`
- Shared: `MAX_PAYLOAD_SIZE_BYTES`, `LOG_LEVEL`, `NODE_ENV`

## Quick Reference

### Build & Run
```bash
npm install
npm run build
npm start
```

### Deploy AWS
```bash
cd infra/aws
terraform init
terraform apply
```

### Deploy Azure
```bash
cd infra/azure
az deployment group create \
  --resource-group rg-analytics-prod \
  --template-file main.bicep
```

### Run Tests
```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run typecheck          # TypeScript validation
npm run lint               # ESLint
```

## Getting Help

1. **API Questions:** See `docs/analytics-service-spec-v1.0.0.md`
2. **Type Definitions:** Check `src/domain/*.ts` files
3. **Infrastructure:** Review `infra/aws/` or `infra/azure/`
4. **Deployment:** See `docs/AZURE_DEPLOYMENT_GUIDE.md` or AWS README
5. **Security:** Review `docs/SECRET_MANAGEMENT.md`
6. **Standards:** Follow `docs/agents.md`

## Version History

- **v1.0.0** - Initial implementation with AWS and Azure support
- Limits reconciliation completed
- Secret management implemented
- Documentation consolidated
