#!/usr/bin/env bash
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT is required}"
: "${GREEN_ID:?GREEN_ID is required}"
: "${BLUE_ID:?BLUE_ID is required}"

echo "::warning::Rollback stub. Implement Azure rollback here."
echo "Inputs:"
echo "  ENVIRONMENT=$ENVIRONMENT"
echo "  GREEN_ID=$GREEN_ID"
echo "  BLUE_ID=$BLUE_ID"

# TODO: implement real rollback logic.
exit 0
