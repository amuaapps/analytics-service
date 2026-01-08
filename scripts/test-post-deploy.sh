#!/bin/bash
set -e

# Post-Deploy Integration Test Runner
# Usage: ./scripts/test-post-deploy.sh [api-url] [write-key]

API_URL=${1:-${API_BASE_URL:-http://localhost:3000}}
WRITE_KEY=${2:-${ANALYTICS_WRITE_KEY:-local-dev-key-12345}}

echo "=========================================="
echo "Post-Deploy Integration Test Runner"
echo "=========================================="
echo "API URL: $API_URL"
echo "Write Key: ${WRITE_KEY:0:10}..."
echo "=========================================="

# Export environment variables
export API_BASE_URL="$API_URL"
export ANALYTICS_WRITE_KEY="$WRITE_KEY"
export TEST_MAX_RETRIES="${TEST_MAX_RETRIES:-30}"
export TEST_RETRY_DELAY_MS="${TEST_RETRY_DELAY_MS:-2000}"
export TEST_REQUEST_TIMEOUT_MS="${TEST_REQUEST_TIMEOUT_MS:-10000}"

# Run tests
echo "Running post-deploy integration tests..."
npm run test:post-deploy

echo "=========================================="
echo "✅ All post-deploy tests passed!"
echo "=========================================="
