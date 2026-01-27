# Amua CI/CD Pipeline Contract (Templates v1)

This kit contains **prescriptive GitHub Actions templates** designed to keep CI/CD pipelines consistent even when authored by AI agents.

These templates are written to be compliant with `agents.md` (Stages 1–4, branch ↔ environment mapping, deterministic multi-cloud selection, blue/green safety).

## Non-negotiable invariants (do not change)

### Branch ↔ environment mapping
- `develop` → `dev`
- `release` → `staging`
- `main` → `prod`

### Cloud selection
A `decide` job must determine `cloud=aws|azure` using:
1. If workflow input `cloud` is set and not `auto`: use it (and validate config exists).
2. Otherwise auto-detect:
   - Only AWS configured → `aws`
   - Only Azure configured → `azure`
   - Both configured → **fail**
   - Neither configured → **fail**

### Four gated stages (in order)
1. **Test**
2. **Build**
3. **Deploy (GREEN only)**
4. **Verify GREEN + Switch traffic (rollback on failure)**

### Standard job names
- `context`
- `decide`
- `test`
- `build`
- `deploy_aws` / `deploy_azure`
- `verify_switch_aws` / `verify_switch_azure`

### Standard build artifact name
- `build-output`

### Standard deploy outputs (Stage 3)
Stage 3 must output (job outputs):
- `green_url` (required)
- `green_id` (required; revision/slot/alias/target-group identifier for switching)
- `blue_id` (required; current active identifier for rollback)
- `active_url` (optional; current active URL)

Stage 4 consumes these outputs.

## Extension points (allowed changes)

You may change values in the CONFIG blocks at the top of workflows:
- `NODE_VERSION`
- `BUILD_OUTPUT_DIR` (React)
- `SERVICE_DIST_DIR` (Microservice)
- `ENABLE_DOCKER_BUILD` logic (file presence checks)
- Release test command (must remain a **green-gate** test)

You should implement repo-specific deploy mechanics in scripts:

- `scripts/ci/deploy-aws-green.sh`
- `scripts/ci/deploy-azure-green.sh`
- `scripts/ci/switch-aws-bluegreen.sh`
- `scripts/ci/switch-azure-bluegreen.sh`
- `scripts/ci/rollback-aws-bluegreen.sh`
- `scripts/ci/rollback-azure-bluegreen.sh`

These scripts MUST write required outputs to `$GITHUB_OUTPUT` (see stubs).

## Recommended location for templates

For org-wide starter templates:
- Put files into an organization `.github` repository under `workflow-templates/`
- Include a matching `.properties.json` file for each workflow template.

(See GitHub documentation for workflow templates and metadata.)
