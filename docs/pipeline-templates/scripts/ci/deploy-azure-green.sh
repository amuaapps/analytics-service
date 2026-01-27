#!/usr/bin/env bash
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT is required}"
: "${ARTIFACT_DIR:?ARTIFACT_DIR is required}"

echo "::error::TODO: implement Azure GREEN deploy for this repo."
echo "Expected inputs:"
echo "  ENVIRONMENT=$ENVIRONMENT"
echo "  ARTIFACT_DIR=$ARTIFACT_DIR"
echo "  IMAGE_REF=${IMAGE_REF:-}"

echo ""
echo "This script MUST output at least these keys to \$GITHUB_OUTPUT:"
echo "  green_url=<https://green.example.com>"
echo "  green_id=<green-identifier>"
echo "  blue_id=<blue-identifier>"
echo "  active_url=<https://active.example.com> (optional)"

exit 1
