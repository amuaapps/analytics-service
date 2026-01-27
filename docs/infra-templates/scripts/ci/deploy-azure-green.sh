#!/usr/bin/env bash
set -euo pipefail

# Required env vars
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_LOCATION:?AZURE_LOCATION is required}"
: "${PROJECT_NAME:?PROJECT_NAME is required}"

# ARTIFACT_DIR should contain a zip file for deployment (Azure Functions zip deploy)
: "${ARTIFACT_DIR:?ARTIFACT_DIR is required}"

ENVIRONMENT="${ENVIRONMENT:-dev}"
FUNCTION_APP_NAME="${AZURE_FUNCTION_APP_NAME:-${PROJECT_NAME}-func-${ENVIRONMENT}}"

ZIP_FILE="$(ls -1 "${ARTIFACT_DIR}"/*.zip 2>/dev/null | head -n 1 || true)"
if [ -z "${ZIP_FILE:-}" ]; then
  echo "::error::No .zip found in ARTIFACT_DIR=${ARTIFACT_DIR}"
  exit 1
fi

DEPLOYMENT_NAME="deploy-${FUNCTION_APP_NAME}-$(date +%Y%m%d-%H%M%S)"

echo "Deploying Azure Functions infra via Bicep (idempotent)…"
az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --template-file infra/azure/main.bicep \
  --parameters \
      location="$AZURE_LOCATION" \
      environment="$ENVIRONMENT" \
      projectName="$PROJECT_NAME" \
      functionAppName="$FUNCTION_APP_NAME" \
  1>/dev/null

echo "Deploying code ZIP to staging slot (GREEN)…"
az functionapp deployment source config-zip \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --slot staging \
  --src "$ZIP_FILE" 1>/dev/null

STAGING_HOST="$(az functionapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$FUNCTION_APP_NAME" --slot staging --query defaultHostName -o tsv)"
PROD_HOST="$(az functionapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$FUNCTION_APP_NAME" --query defaultHostName -o tsv)"

GREEN_URL="https://${STAGING_HOST}"
ACTIVE_URL="https://${PROD_HOST}"

echo "Deployed GREEN (staging) URL: $GREEN_URL"
echo "Active (production) URL: $ACTIVE_URL"

{
  echo "green_url=$GREEN_URL"
  echo "green_id=staging"
  echo "blue_id=production"
  echo "active_url=$ACTIVE_URL"
} >> "$GITHUB_OUTPUT"
