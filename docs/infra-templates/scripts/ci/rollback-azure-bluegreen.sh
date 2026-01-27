#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_FUNCTION_APP_NAME:?AZURE_FUNCTION_APP_NAME is required}"

# Rollback is another swap (staging <-> production)
GREEN_ID="${GREEN_ID:-staging}"

echo "::warning::Rollback: swapping slots back (production -> ${GREEN_ID})"
az functionapp deployment slot swap \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_FUNCTION_APP_NAME" \
  --slot "$GREEN_ID" \
  --target-slot production 1>/dev/null

echo "✅ Rollback swap complete."
