#!/usr/bin/env bash
set -euo pipefail

# Rollback Azure Function App by swapping slots back
# This script follows the Amua pipeline contract for rollback

# Required env vars
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_FUNCTION_APP_NAME:?AZURE_FUNCTION_APP_NAME is required}"
: "${GREEN_ID:?GREEN_ID is required}"
: "${BLUE_ID:?BLUE_ID is required}"

echo "::warning::⚠️  ROLLBACK: Swapping slots back to restore previous version"
echo "   Resource Group: $AZURE_RESOURCE_GROUP"
echo "   Function App: $AZURE_FUNCTION_APP_NAME"
echo "   Swapping: ${GREEN_ID} <-> ${BLUE_ID}"
echo ""

az functionapp deployment slot swap \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_FUNCTION_APP_NAME" \
  --slot "$GREEN_ID" \
  --target-slot "$BLUE_ID" \
  --output none

echo ""
echo "✅ Rollback swap complete"
echo "🔵 Previous version restored to production"
echo "🟢 Failed deployment moved to staging slot"
