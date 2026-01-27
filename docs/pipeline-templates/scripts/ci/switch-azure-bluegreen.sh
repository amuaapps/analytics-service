#!/usr/bin/env bash
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT is required}"
: "${GREEN_ID:?GREEN_ID is required}"
: "${BLUE_ID:?BLUE_ID is required}"

echo "::error::TODO: implement Azure traffic switch BLUE -> GREEN for this repo."
echo "Inputs:"
echo "  ENVIRONMENT=$ENVIRONMENT"
echo "  GREEN_ID=$GREEN_ID"
echo "  BLUE_ID=$BLUE_ID"

exit 1
