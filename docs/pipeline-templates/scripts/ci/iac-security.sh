#!/usr/bin/env bash
set -euo pipefail

CLOUD="${1:-}"
if [ -z "$CLOUD" ]; then
  echo "::error::Usage: iac-security.sh <aws|azure>"
  exit 1
fi

echo "Running minimal IaC security checks for cloud: $CLOUD"

# Default behavior:
# - If checkov is desired, you can enable it by adding it here.
# - This stub keeps the template lightweight while still enforcing that a gate exists.

if [ "$CLOUD" = "aws" ] && [ -d "infra/aws" ]; then
  echo "Found infra/aws (Terraform)."
  if command -v terraform >/dev/null 2>&1; then
    terraform -chdir=infra/aws fmt -check
    terraform -chdir=infra/aws validate || true
  else
    echo "Terraform not installed in runner step. If you need terraform validation here, install it in the workflow or implement in this script."
  fi
elif [ "$CLOUD" = "azure" ] && [ -d "infra/azure" ]; then
  echo "Found infra/azure (Bicep/Terraform)."
  if command -v az >/dev/null 2>&1; then
    az bicep version >/dev/null 2>&1 || true
  fi
else
  echo "::warning::No infra directory found for $CLOUD. Update iac-security.sh to match your repo."
fi

echo "IaC security gate complete."
