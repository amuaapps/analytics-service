#!/usr/bin/env bash
set -euo pipefail

# Switch Azure Function App traffic from BLUE to GREEN via slot swap
# This script follows the Amua pipeline contract for Stage 4 (Switch)

# Required env vars
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_FUNCTION_APP_NAME:?AZURE_FUNCTION_APP_NAME is required}"
: "${GREEN_ID:?GREEN_ID is required}"
: "${BLUE_ID:?BLUE_ID is required}"

echo "🔄 Swapping Azure Function slots: ${GREEN_ID} -> ${BLUE_ID}"
echo "   Resource Group: $AZURE_RESOURCE_GROUP"
echo "   Function App: $AZURE_FUNCTION_APP_NAME"
echo ""

az functionapp deployment slot swap \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_FUNCTION_APP_NAME" \
  --slot "$GREEN_ID" \
  --target-slot "$BLUE_ID" \
  --output none

echo ""
echo "✅ Slot swap complete"
echo "🟢 GREEN ($GREEN_ID) is now live in production"
echo "🔵 Previous production ($BLUE_ID) is now in staging slot"
