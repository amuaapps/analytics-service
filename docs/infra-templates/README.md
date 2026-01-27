# Azure Functions (Bicep) — Function Archetype

## What this template gives you
- `infra/azure/main.bicep` that provisions:
  - Storage account
  - Consumption plan (Y1 by default)
  - Function App
  - **Staging slot** for blue/green (`staging`)
- Blue/green is performed with **slot swap**:
  - Stage 3 deploys the zip to the `staging` slot (GREEN)
  - Stage 4 runs integration tests against staging URL, then swaps slots

## Key parameters
- `environment` — dev|staging|prod
- `projectName` — used for naming
- `functionAppName` — optional override
- `functionAppSku` — defaults to `Y1` (Consumption)
- `corsAllowedOrigins` — default `*` (tighten for prod)

## Scripts
`scripts/ci/*.sh` provide a reference implementation for:
- Deploy infra (Bicep) + deploy zip to staging slot
- Switch/rollback via slot swap
