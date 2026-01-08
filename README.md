# Analytics Service

A cloud-native, serverless analytics event ingestion and query service built with TypeScript. Designed for high-throughput event collection with multi-cloud support (AWS and Azure) and blue/green deployment capabilities.

## Table of Contents

- [Purpose & Architecture](#purpose--architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Blue/Green Deployment](#bluegreen-deployment)
- [Data Retention & TTL](#data-retention--ttl)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Purpose & Architecture

The Analytics Service provides a scalable, cloud-native solution for collecting, processing, storing, and querying analytics events. It follows a **queue-based architecture** to ensure reliable event processing and supports both AWS and Azure deployments.

### Architecture Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /api/v1/events
       ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. INGEST (HTTP API)                                        │
│ - Validates payload (Zod schemas)                           │
│ - Authenticates via X-Analytics-Write-Key                   │
│ - Returns 202 Accepted immediately                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ Enqueue
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. QUEUE (SQS / Azure Queue)                                │
│ - Decouples ingestion from processing                       │
│ - Provides retry mechanism with DLQ                         │
│ - Enables horizontal scaling                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ Trigger
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. PROCESS (Lambda / Azure Function)                        │
│ - Defensive validation (don't trust ingest)                 │
│ - Idempotency check (prevent duplicates)                    │
│ - Transform to storage format                               │
│ - Add timestamps (receivedAt, processedAt)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Write
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. STORE (Dual Storage)                                     │
│                                                              │
│ ┌─────────────────────────┐  ┌──────────────────────────┐  │
│ │ Operational Storage     │  │ Raw Storage              │  │
│ │ - DynamoDB / Cosmos DB  │  │ - S3 / Blob Storage      │  │
│ │ - Queryable with TTL    │  │ - Immutable audit trail  │  │
│ │ - GSIs for filtering    │  │ - Long-term retention    │  │
│ └─────────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↑
                           │ GET /api/v1/events
                           │
                    ┌──────┴──────┐
                    │   Client    │
                    └─────────────┘
```

### Key Components

1. **Ingest API** - HTTP endpoint for batch event ingestion
2. **Queue** - Decouples ingestion from processing (SQS/Azure Queue)
3. **Processor** - Validates, transforms, and stores events
4. **Operational Storage** - Fast queries with TTL (DynamoDB/Cosmos DB)
5. **Raw Storage** - Immutable audit trail (S3/Blob Storage)
6. **Query API** - Retrieve events with filtering and pagination

## Features

### Core Capabilities

- ✅ **Event Ingestion**: REST API for batch event ingestion with validation
- ✅ **Event Querying**: Flexible query API with cursor-based pagination
- ✅ **Multi-Cloud**: Supports AWS (DynamoDB, S3, SQS) and Azure (Cosmos DB, Blob Storage, Queue)
- ✅ **Dual Storage**: Operational store for queries + immutable raw storage for audit
- ✅ **Type-Safe**: Full TypeScript with strict type checking
- ✅ **Tested**: Comprehensive unit and integration test coverage (97%+ pass rate)
- ✅ **Local Development**: Run and test without any cloud dependencies

### Event Types

- **`track`** - Custom events (e.g., button clicks, purchases, feature usage)
- **`page`** - Page/screen views with URL and referrer tracking
- **`identify`** - User trait updates (profile information, preferences)

### Storage Architecture

**Operational Store** (Queryable)
- **AWS**: DynamoDB with GSIs for filtering
- **Azure**: Cosmos DB with partition key `/pk`
- **TTL**: 90 days (configurable)
- **Purpose**: Fast queries, real-time analytics

**Raw Store** (Audit Trail)
- **AWS**: S3 with lifecycle policies
- **Azure**: Blob Storage with lifecycle management
- **Retention**: 365 days (configurable)
- **Purpose**: Compliance, replay, long-term storage

## Quick Start

Get the Analytics Service running locally in under 2 minutes:

```bash
# 1. Clone and install
git clone https://github.com/amuaapps/analytics-service.git
cd analytics-service
npm install

# 2. Run tests (no cloud setup needed)
npm test

# 3. Start local server
npm run dev

# 4. Send a test event
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

# 5. Query events
curl "http://localhost:3000/api/v1/events?appId=test-app&from=2026-01-08T00:00:00Z"
```

See [docs/QUICK_START.md](docs/QUICK_START.md) for more details.

## Prerequisites

**For Local Development:**
- Node.js >= 20.0.0
- npm >= 9.0.0

**For Cloud Deployment:**
- AWS account (for AWS deployment) **OR** Azure account (for Azure deployment)
- GitHub account (for CI/CD)
- Terraform >= 1.5.0 (for AWS infrastructure)
- Azure CLI + Bicep (for Azure infrastructure)

## API Documentation

### Authentication

All ingest requests require authentication via the `X-Analytics-Write-Key` header.

```bash
X-Analytics-Write-Key: your-secret-write-key
```

### POST /api/v1/events

Ingest a batch of analytics events.

**Endpoint:** `POST /api/v1/events`

**Headers:**
- `X-Analytics-Write-Key` (required) - Authentication key
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "schemaVersion": "1.0.0",
  "sentAt": "2026-01-08T10:30:00Z",
  "events": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "track",
      "name": "button.clicked",
      "occurredAt": "2026-01-08T10:29:58Z",
      "source": {
        "appId": "web-storefront",
        "platform": "web",
        "env": "prod",
        "appVersion": "1.2.3"
      },
      "actor": {
        "userId": "user_123",
        "anonymousId": "anon_456",
        "sessionId": "session_789"
      },
      "context": {
        "locale": "en-US",
        "timezone": "America/New_York",
        "page": {
          "url": "https://example.com/products",
          "path": "/products",
          "referrer": "https://google.com",
          "title": "Products"
        },
        "userAgent": "Mozilla/5.0..."
      },
      "properties": {
        "button_id": "checkout_btn",
        "button_text": "Checkout",
        "product_id": "prod_123"
      }
    }
  ]
}
```

**Response Codes:**
- `202 Accepted` - Events enqueued successfully
- `400 Bad Request` - Validation error (invalid schema, missing fields)
- `401 Unauthorized` - Invalid or missing write key
- `413 Payload Too Large` - Batch exceeds size limit (1MB)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

**Success Response (202):**
```json
{
  "accepted": 1,
  "eventCount": 1,
  "requestId": "req_abc123"
}
```

**Error Response (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid event schema",
    "details": {
      "field": "events[0].occurredAt",
      "issue": "Invalid date format"
    }
  },
  "requestId": "req_abc123"
}
```

### GET /api/v1/events

Query stored analytics events with filtering and pagination.

**Endpoint:** `GET /api/v1/events`

**Query Parameters:**
- `appId` (required) - Application identifier
- `from` (required) - Start time (ISO 8601 format)
- `to` (optional) - End time (ISO 8601 format)
- `types` (optional) - Event types (comma-separated: `track,page,identify`)
- `names` (optional) - Event names (comma-separated)
- `userId` (optional) - Filter by user ID
- `anonymousId` (optional) - Filter by anonymous ID
- `sessionId` (optional) - Filter by session ID
- `limit` (optional) - Results per page (default: 50, max: 200)
- `cursor` (optional) - Pagination cursor from previous response
- `sort` (optional) - Sort order (`asc` or `desc`, default: `desc`)

**Example Request:**
```bash
GET /api/v1/events?appId=web-storefront&from=2026-01-08T00:00:00Z&to=2026-01-08T23:59:59Z&types=track&userId=user_123&limit=10
```

**Response (200):**
```json
{
  "events": [
    {
      "schemaVersion": "1.0.0",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "track",
      "name": "button.clicked",
      "occurredAt": "2026-01-08T10:29:58Z",
      "receivedAt": "2026-01-08T10:30:01Z",
      "source": {
        "appId": "web-storefront",
        "platform": "web",
        "env": "prod"
      },
      "actor": {
        "userId": "user_123",
        "sessionId": "session_789"
      },
      "properties": {
        "button_id": "checkout_btn"
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "hasMore": true,
    "nextCursor": "eyJwayI6IkFQUCN3ZWItc3RvcmVmcm9udCIsInNrIjoiVFMjMTczNjMzMzM5ODAwMCJ9"
  }
}
```

**Response Codes:**
- `200 OK` - Query successful
- `400 Bad Request` - Invalid query parameters
- `500 Internal Server Error` - Server error

### GET /health

Health check endpoint.

**Response (200):**
```json
{
  "status": "healthy",
  "service": "analytics-service",
  "environment": "dev"
}
```

## Local Development

The service includes a complete local development environment with in-memory implementations of all cloud services.

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your local settings (optional)
```

### Development Server

```bash
# Start server (port 3000)
npm run dev

# Start with auto-reload
npm run dev:watch
```

The local server uses:
- In-memory queue (no SQS/Azure Queue needed)
- In-memory storage (no DynamoDB/Cosmos DB needed)
- In-memory raw storage (no S3/Blob Storage needed)

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Coverage Thresholds:**
- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

### Code Quality

```bash
# Lint
npm run lint
npm run lint:fix

# Type check
npm run typecheck

# Format check
npm run format:check
npm run format

# Run all checks
npm run validate
```

### Build

```bash
# Compile TypeScript
npm run build

# Output: dist/
```

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for detailed local development guide.

## Deployment

The Analytics Service supports deployment to **AWS** or **Azure** with automated CI/CD via GitHub Actions. The deployment process uses a **four-stage pipeline** with **blue/green deployment** for zero-downtime releases.

### Deployment Options

1. **Automated (Recommended)**: Push to GitHub → Automatic deployment via GitHub Actions
2. **Manual**: Deploy infrastructure and code manually using Terraform/Bicep

### GitHub Actions CI/CD

The repository includes a complete CI/CD pipeline that automatically deploys on push to specific branches:

| Branch | Environment | Auto-Deploy |
|--------|-------------|-------------|
| `develop` | dev | ✅ Yes |
| `release` | staging | ✅ Yes |
| `main` | prod | ✅ Yes (with approval) |

#### Four-Stage Pipeline

**Stage 1: Test** (2-5 minutes)
- ESLint linting
- TypeScript type checking
- Prettier format checking
- Unit tests with coverage (80% threshold)
- CodeQL security analysis
- npm audit for vulnerabilities

**Stage 2: Build** (1-2 minutes)
- Compile TypeScript to JavaScript
- Install production dependencies
- Create deployment packages (AWS Lambda zip / Azure Functions zip)
- Upload immutable artifacts

**Stage 3: Deploy GREEN** (3-10 minutes)
- Apply infrastructure changes (Terraform/Bicep)
- Deploy new version to GREEN environment
- **AWS**: Publish new Lambda versions (not live yet)
- **Azure**: Deploy to staging slot (not swapped yet)
- Production traffic remains on BLUE (previous version)

**Stage 4: Test & Switch** (2-5 minutes)
- Run integration tests against GREEN endpoint
- Run IaC security scans
- **If all pass**: Switch traffic to GREEN
- **If any fail**: Keep traffic on BLUE, fail deployment

### Required GitHub Configuration

#### 1. Create GitHub Environments

Go to Settings → Environments and create:
- `dev` (no protection)
- `staging` (optional protection)
- `prod` (required reviewers + branch restrictions)

#### 2. Configure Secrets

Navigate to Settings → Secrets and variables → Actions

**For AWS Deployment:**

| Type | Name | Description | Example |
|------|------|-------------|---------|
| Secret | `AWS_ACCESS_KEY_ID` | AWS access key | `AKIA...` |
| Secret | `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalr...` |
| Secret | `ANALYTICS_WRITE_KEY` | API authentication key | `your-secret-key` |
| Variable | `AWS_REGION` | AWS region | `us-east-1` |

**For Azure Deployment:**

| Type | Name | Description | How to Get |
|------|------|-------------|------------|
| Secret | `AZURE_CREDENTIALS` | Service principal JSON | See below |
| Secret | `ANALYTICS_WRITE_KEY` | API authentication key | Generate securely |

**Creating Azure Service Principal:**
```bash
az login

az ad sp create-for-rbac \
  --name "analytics-service-github" \
  --role contributor \
  --scopes /subscriptions/{subscription-id} \
  --sdk-auth

# Copy the JSON output to AZURE_CREDENTIALS secret
```

#### 3. Configure Backend State (One-time Setup)

**AWS - Terraform State:**
```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket your-terraform-state-bucket \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket your-terraform-state-bucket \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket your-terraform-state-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create backend.hcl (don't commit to git)
cat > infra/aws/backend.hcl <<EOF
bucket         = "your-terraform-state-bucket"
key            = "analytics-service/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
EOF
```

**Azure - Resource Groups:**
```bash
# Create resource groups for each environment
az group create --name analytics-service-dev-rg --location eastus
az group create --name analytics-service-staging-rg --location eastus
az group create --name analytics-service-prod-rg --location eastus
```

### Deploying Your Fork

**Step 1: Fork the Repository**
```bash
# Fork on GitHub, then clone
git clone https://github.com/YOUR_USERNAME/analytics-service.git
cd analytics-service
```

**Step 2: Configure Secrets**
- Add required secrets in GitHub Settings (see table above)
- Choose AWS or Azure (or both)

**Step 3: Setup Infrastructure Backend**
- For AWS: Create S3 bucket and `backend.hcl`
- For Azure: Create resource groups

**Step 4: Create Parameter Files**

**AWS** (`infra/aws/terraform.tfvars`):
```hcl
environment         = "dev"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "your-dev-write-key"
```

**Azure** (`infra/azure/parameters.dev.json`):
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment": { "value": "dev" },
    "location": { "value": "eastus" },
    "projectName": { "value": "analytics-service" },
    "analyticsWriteKey": { "value": "your-dev-write-key" }
  }
}
```

**Step 5: Push to Deploy**
```bash
git push origin develop  # Deploys to dev
```

**Step 6: Monitor Deployment**
- Go to Actions tab in GitHub
- Watch the four-stage pipeline
- Check for any failures

**Step 7: Verify Deployment**
```bash
# Get API URL from deployment outputs
# Test the endpoint
curl https://your-api-url/health
```

### Manual Deployment

If you prefer to deploy manually without GitHub Actions:

**AWS:**
```bash
cd infra/aws

# Initialize Terraform
terraform init -backend-config=backend.hcl

# Plan changes
terraform plan -var-file=terraform.tfvars

# Apply infrastructure
terraform apply -var-file=terraform.tfvars

# Deploy Lambda code
aws lambda update-function-code \
  --function-name analytics-ingest-dev \
  --zip-file fileb://../../dist/lambda-deployment.zip
```

**Azure:**
```bash
cd infra/azure

# Deploy infrastructure
az deployment group create \
  --resource-group analytics-service-dev-rg \
  --template-file main.bicep \
  --parameters @parameters.dev.json

# Deploy function code
az functionapp deployment source config-zip \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --src ../../dist/function-deployment.zip
```

See [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md) for detailed deployment guide.

## Blue/Green Deployment

The service uses **blue/green deployment** to achieve zero-downtime releases with instant rollback capability.

### How It Works

**Blue/Green Concept:**
- **BLUE** = Current production version (receiving live traffic)
- **GREEN** = New version being deployed (not receiving traffic yet)

**Deployment Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│ Initial State                                                │
│ BLUE (v1) → Production Traffic ✅                           │
│ GREEN (empty)                                                │
└─────────────────────────────────────────────────────────────┘
                            ↓ Stage 3: Deploy GREEN
┌─────────────────────────────────────────────────────────────┐
│ After Stage 3                                                │
│ BLUE (v1) → Production Traffic ✅                           │
│ GREEN (v2) → No Traffic (testing only)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓ Stage 4: Test & Switch
┌─────────────────────────────────────────────────────────────┐
│ After Stage 4 (Success)                                      │
│ BLUE (v1) → No Traffic (kept for rollback)                  │
│ GREEN (v2) → Production Traffic ✅                          │
└─────────────────────────────────────────────────────────────┘
```

### AWS Implementation (Lambda Aliases)

**Mechanism:** Lambda function versions with aliases

**Before Stage 4:**
```
Lambda v1 → Alias "live" → API Gateway (BLUE - production)
Lambda v2 (deployed, not receiving traffic)
```

**After Stage 4 Success:**
```
Lambda v1 (kept for rollback)
Lambda v2 → Alias "live" → API Gateway (GREEN - production)
```

**Key Points:**
- New Lambda version published in Stage 3
- `live` alias still points to v1 (BLUE)
- Integration tests run against v2 directly
- If tests pass, `live` alias updated to v2 (GREEN)
- API Gateway always routes to `live` alias

### Azure Implementation (Deployment Slots)

**Mechanism:** Function App deployment slots

**Before Stage 4:**
```
Production Slot (BLUE - production traffic)
Staging Slot (GREEN - new version, no traffic)
```

**After Stage 4 Success:**
```
Production Slot (GREEN - production traffic, was staging)
Staging Slot (BLUE - old version, was production)
```

**Key Points:**
- Code deployed to staging slot in Stage 3
- Production slot unchanged (BLUE)
- Integration tests run against staging slot URL
- If tests pass, slots are swapped
- Swap is atomic and instant

### Rollback Procedures

**AWS Rollback:**
```bash
# Revert live alias to previous version
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version 1  # Previous version number
```

**Azure Rollback:**
```bash
# Swap slots back
az functionapp deployment slot swap \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod \
  --slot staging \
  --target-slot production
```

### Benefits

✅ **Zero Downtime** - Traffic switch is instant  
✅ **Safe Testing** - Test GREEN before switching traffic  
✅ **Instant Rollback** - Revert to BLUE in seconds  
✅ **Production-Like Testing** - GREEN uses same infrastructure  
✅ **Automatic Rollback** - Stage 4 failure keeps traffic on BLUE  

### Stage 4 Failure Handling

**If Stage 4 fails:**
1. Integration tests fail OR IaC security scan fails
2. Pipeline fails and stops
3. Traffic **remains on BLUE** (previous version)
4. GREEN deployment exists but is not used
5. Manual investigation required
6. Fix issues and re-deploy

**No traffic disruption occurs** - production continues running on BLUE.

## Data Retention & TTL

The service implements a **dual-storage model** with different retention policies for operational and raw storage.

### Operational Storage (Queryable Data)

**Purpose:** Fast queries, real-time analytics, operational dashboards

**AWS - DynamoDB:**
- **TTL**: 90 days (configurable via `event_retention_days`)
- **Mechanism**: DynamoDB TTL on `expiresAt` attribute
- **Behavior**: Events automatically deleted after TTL expires
- **Configuration**: Set in `infra/aws/variables.tf`

**Azure - Cosmos DB:**
- **TTL**: 90 days (configurable via `eventRetentionDays`)
- **Mechanism**: Cosmos DB TTL on container
- **Behavior**: Events automatically deleted after TTL expires
- **Configuration**: Set in `infra/azure/main.bicep`

**TTL Calculation:**
```
expiresAt = receivedAt + retention_days
```

**Example:**
- Event received: `2026-01-08T10:00:00Z`
- Retention: 90 days
- Expires at: `2026-04-08T10:00:00Z`
- Automatically deleted after expiration

### Raw Storage (Audit Trail)

**Purpose:** Compliance, replay, long-term storage, audit logs

**AWS - S3:**
- **Retention**: 365 days (configurable via `raw_event_retention_days`)
- **Lifecycle Policy**:
  - Day 0-30: Standard storage
  - Day 30-90: Standard-IA (Infrequent Access)
  - Day 90-365: Glacier Instant Retrieval
  - Day 365+: Deleted
- **Configuration**: Set in `infra/aws/s3.tf`

**Azure - Blob Storage:**
- **Retention**: 365 days (configurable via `rawEventRetentionDays`)
- **Lifecycle Policy**:
  - Day 0-30: Hot tier
  - Day 30-90: Cool tier
  - Day 90-365: Archive tier
  - Day 365+: Deleted
- **Configuration**: Set in `infra/azure/modules/storage.bicep`

### Storage Comparison

| Feature | Operational Storage | Raw Storage |
|---------|-------------------|-------------|
| **Purpose** | Queries, analytics | Audit, compliance |
| **Format** | Structured (DynamoDB/Cosmos DB) | JSON (S3/Blob) |
| **Retention** | 90 days | 365 days |
| **Cost** | Higher (fast access) | Lower (cold storage) |
| **Mutability** | Immutable | Immutable |
| **TTL** | Automatic deletion | Lifecycle policies |
| **Queryable** | Yes (fast) | No (must restore) |

### Configuring Retention

**AWS (Terraform):**
```hcl
# infra/aws/terraform.tfvars
event_retention_days     = 90   # Operational storage TTL
raw_event_retention_days = 365  # Raw storage lifecycle
```

**Azure (Bicep):**
```json
// infra/azure/parameters.dev.json
{
  "parameters": {
    "eventRetentionDays": { "value": 90 },
    "rawEventRetentionDays": { "value": 365 }
  }
}
```

### Data Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ Event Ingested                                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Stored in Both:                                              │
│ 1. Operational Storage (DynamoDB/Cosmos DB)                  │
│ 2. Raw Storage (S3/Blob)                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Day 0-90: Queryable via API                                  │
│ - Fast queries from operational storage                      │
│ - Raw copy in S3/Blob (hot/standard tier)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Day 90: Operational Storage TTL Expires                      │
│ - Event deleted from DynamoDB/Cosmos DB                      │
│ - No longer queryable via API                                │
│ - Raw copy still in S3/Blob (cool/IA tier)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Day 90-365: Audit Trail Only                                 │
│ - Not queryable via API                                      │
│ - Raw copy in S3/Blob (archive/glacier tier)                 │
│ - Can be restored for compliance/replay                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Day 365+: Permanently Deleted                                │
│ - Raw copy deleted from S3/Blob                              │
│ - Data no longer exists                                      │
└─────────────────────────────────────────────────────────────┘
```

### Compliance Considerations

**GDPR / Data Privacy:**
- Events are immutable (no updates)
- Deletion happens automatically via TTL
- For right-to-be-forgotten requests, implement custom deletion logic
- Raw storage provides audit trail for compliance

**Data Retention Policies:**
- Configure retention based on legal requirements
- Operational: 30-180 days typical
- Raw: 1-7 years typical
- Balance cost vs compliance needs

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

The service has comprehensive test coverage with multiple test types.

### Test Organization

```
tests/
├── unit/                    # Unit tests (business logic)
│   ├── app/                # Application layer tests
│   ├── domain/             # Domain logic tests
│   └── infra/              # Infrastructure adapter tests
├── integration/             # Integration tests (API endpoints)
│   ├── http/               # HTTP endpoint tests
│   └── post-deploy/        # Post-deployment validation
```

### Test Types

**Unit Tests** (`tests/unit/`)
- Test individual functions and classes
- Mock external dependencies
- Fast execution (< 1 second)
- 80%+ coverage required

**Integration Tests** (`tests/integration/`)
- Test API endpoints end-to-end
- Use in-memory implementations
- No external network calls
- Validate request/response contracts

**Post-Deploy Tests** (`tests/integration/post-deploy/`)
- Run in Stage 4 of CI/CD
- Test against live GREEN deployment
- Validate end-to-end flow (ingest → process → query)
- Ensure deployment is healthy before traffic switch

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Post-deploy tests (for Stage 4)
npm run test:post-deploy

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |
| Statements | 80% |

**Current Coverage:** 97%+ test pass rate

### Test Configuration

Tests use Jest with TypeScript support:
- ESM modules
- Zod validation
- In-memory adapters
- No external dependencies

## Contributing

This is an open-source project following **Amua Apps coding standards**.

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm run validate`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Coding Standards

- **TypeScript**: Strict mode, no `any` types
- **ESLint**: No warnings allowed
- **Prettier**: Auto-format on commit
- **Tests**: 80%+ coverage required
- **Commits**: Conventional commits format

See [docs/agents.md](docs/agents.md) for detailed coding standards.

### Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Update documentation if needed
3. Add tests for new features
4. Follow existing code style
5. Request review from maintainers

## Documentation

### Core Documentation

- **[Quick Start Guide](docs/QUICK_START.md)** - Get running in 2 minutes
- **[Local Development Guide](docs/LOCAL_DEVELOPMENT.md)** - Complete local dev setup
- **[Deployment Guide](.github/DEPLOYMENT.md)** - Deploy to AWS or Azure
- **[Dependency Management](docs/DEPENDENCY_MANAGEMENT.md)** - Lockfiles and deterministic builds
- **[API Specification](docs/analytics-service-spec-v1.0.0.md)** - API contracts and storage model
- **[Coding Standards](docs/agents.md)** - Amua Apps coding standards

### Infrastructure Documentation

- **[AWS Infrastructure](infra/aws/README.md)** - Terraform setup and configuration
- **[Azure Infrastructure](infra/azure/README.md)** - Bicep setup and configuration
- **[GitHub Actions](.github/workflows/README.md)** - CI/CD pipeline documentation

### Additional Resources

- **[Post-Deploy Tests](tests/integration/post-deploy/README.md)** - Stage 4 test harness
- **[Workflow Documentation](.github/workflows/README.md)** - CI/CD workflows

## Architecture Decisions

### Why Queue-Based Architecture?

- **Decoupling**: Ingest and processing are independent
- **Reliability**: Messages persist in queue if processor fails
- **Scalability**: Process events at different rates
- **Retry Logic**: Automatic retries with DLQ for failures

### Why Dual Storage?

- **Operational**: Fast queries, TTL for cost optimization
- **Raw**: Immutable audit trail, compliance, replay capability
- **Separation**: Different retention and access patterns

### Why Multi-Cloud?

- **Flexibility**: Deploy to AWS or Azure based on requirements
- **Vendor Independence**: Not locked into single cloud provider
- **Learning**: Demonstrate cloud-agnostic architecture patterns

### Why Blue/Green Deployment?

- **Zero Downtime**: Instant traffic switch
- **Safe Testing**: Validate before switching
- **Instant Rollback**: Revert in seconds if issues occur
- **Confidence**: Test in production-like environment

## Troubleshooting

### Common Issues

**Tests Failing Locally**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npx jest --clearCache
npm test
```

**Port 3000 Already in Use**
```bash
# Use different port
PORT=3001 npm run dev
```

**Deployment Fails at Stage 4**
- Check integration test logs
- Verify GREEN endpoint is accessible
- Check queue processor logs
- Ensure database connectivity

**Events Not Queryable**
- Check TTL hasn't expired (90 days default)
- Verify event was successfully ingested
- Check processor logs for errors
- Ensure correct appId in query

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for more troubleshooting tips.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/amuaapps/analytics-service/issues)
- **Discussions**: [GitHub Discussions](https://github.com/amuaapps/analytics-service/discussions)
- **Documentation**: [docs/](docs/)

## Acknowledgments

Built with:
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Zod](https://zod.dev/) - Schema validation
- [Jest](https://jestjs.io/) - Testing framework
- [Express](https://expressjs.com/) - HTTP server (local dev)
- [Terraform](https://www.terraform.io/) - AWS infrastructure
- [Bicep](https://learn.microsoft.com/azure/azure-resource-manager/bicep/) - Azure infrastructure

---

**Made with ❤️ by Amua Apps**
