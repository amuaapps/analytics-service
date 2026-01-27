#!/usr/bin/env bash
set -euo pipefail

# Deploy Azure Functions infrastructure and code to GREEN (staging slot)
# This script follows the Amua pipeline contract for Stage 3 (Deploy GREEN)

# Required env vars
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_LOCATION:?AZURE_LOCATION is required}"
: "${PROJECT_NAME:?PROJECT_NAME is required}"
: "${ENVIRONMENT:?ENVIRONMENT is required}"
: "${ARTIFACT_DIR:?ARTIFACT_DIR is required}"

# Optional env vars with defaults
FUNCTION_APP_NAME="${AZURE_FUNCTION_APP_NAME:-${PROJECT_NAME}-func-${ENVIRONMENT}}"
FUNCTION_APP_SKU="${AZURE_FUNCTION_SKU:-Y1}"
LOG_LEVEL="${LOG_LEVEL:-info}"
CORS_ORIGINS="${CORS_ORIGINS:-*}"

# Auto-generate ANALYTICS_WRITE_KEY if not provided (for initial deployments)
if [ -z "${ANALYTICS_WRITE_KEY:-}" ]; then
  echo "⚠️  ANALYTICS_WRITE_KEY not provided - generating secure random key"
  ANALYTICS_WRITE_KEY="$(openssl rand -base64 32)"
  echo "✅ Generated new analytics write key (will be stored in Key Vault)"
fi

# Find the deployment zip file
ZIP_FILE="$(ls -1 "${ARTIFACT_DIR}"/*.zip 2>/dev/null | head -n 1 || true)"
if [ -z "${ZIP_FILE:-}" ]; then
  echo "::error::No .zip found in ARTIFACT_DIR=${ARTIFACT_DIR}"
  exit 1
fi

echo "📦 Found deployment package: $(basename "$ZIP_FILE")"

# Generate deployment name
DEPLOYMENT_NAME="deploy-${FUNCTION_APP_NAME}-$(date +%Y%m%d-%H%M%S)"

echo "🚀 Deploying Azure infrastructure via Bicep (idempotent)..."
az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --template-file infra/azure/main.bicep \
  --parameters \
      location="$AZURE_LOCATION" \
      environment="$ENVIRONMENT" \
      projectName="$PROJECT_NAME" \
      functionAppName="$FUNCTION_APP_NAME" \
      functionAppSku="$FUNCTION_APP_SKU" \
      analyticsWriteKey="$ANALYTICS_WRITE_KEY" \
      logLevel="$LOG_LEVEL" \
      corsAllowedOrigins="['$CORS_ORIGINS']" \
  --output none

echo "✅ Infrastructure deployed"

echo "📤 Deploying code ZIP to staging slot (GREEN)..."
az functionapp deployment source config-zip \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --slot staging \
  --src "$ZIP_FILE" \
  --output none

echo "✅ Code deployed to GREEN slot"

# Get URLs for verification
STAGING_HOST="$(az functionapp show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --slot staging \
  --query defaultHostName \
  --output tsv)"

PROD_HOST="$(az functionapp show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --query defaultHostName \
  --output tsv)"

GREEN_URL="https://${STAGING_HOST}"
ACTIVE_URL="https://${PROD_HOST}"

echo ""
echo "🟢 GREEN (staging) URL: $GREEN_URL"
echo "🔵 ACTIVE (production) URL: $ACTIVE_URL"
echo ""

# Output required values for pipeline orchestration
{
  echo "green_url=$GREEN_URL"
  echo "green_id=staging"
  echo "blue_id=production"
  echo "active_url=$ACTIVE_URL"
} >> "$GITHUB_OUTPUT"

echo "✅ Deploy GREEN complete"
