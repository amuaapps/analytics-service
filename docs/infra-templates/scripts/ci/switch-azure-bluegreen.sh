#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_FUNCTION_APP_NAME:?AZURE_FUNCTION_APP_NAME is required}"

# GREEN_ID expected to be "staging"
GREEN_ID="${GREEN_ID:-staging}"

echo "Swapping Azure Function slots: ${GREEN_ID} -> production"
az functionapp deployment slot swap \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_FUNCTION_APP_NAME" \
  --slot "$GREEN_ID" \
  --target-slot production 1>/dev/null

echo "✅ Slot swap complete."
