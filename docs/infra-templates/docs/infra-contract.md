# Infra Template Contract (Amua v1)

These infra templates are designed to be used with the Amua 4-stage pipeline:
1) Test
2) Build
3) Deploy to GREEN only
4) Verify GREEN + Switch traffic (rollback on failure)

They follow the directory conventions from `agents.md`:
- `infra/aws` = Terraform (required)
- `infra/azure` = Bicep (preferred)

## Outputs expected by CI deploy scripts

Deploy scripts (Stage 3) MUST produce at least:

- `green_url` — URL to test the GREEN deployment (no prod traffic)
- `green_id` — identifier for GREEN (slot name, revision name, target group ARN, candidate version, etc.)
- `blue_id` — identifier for BLUE (current live slot/revision/tg/version)
- `active_url` — current live URL (optional but recommended)

Switch scripts (Stage 4) MUST accept `GREEN_ID` and `BLUE_ID` and switch live traffic BLUE → GREEN.

Rollback scripts MUST ensure traffic remains on (or is restored to) BLUE.

## Authentication

Templates assume OIDC authentication from GitHub Actions:
- Azure: `azure/login@v2`
- AWS: `aws-actions/configure-aws-credentials@v4`

No long-lived secrets are required for cloud auth.
