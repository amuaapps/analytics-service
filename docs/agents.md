# agents.md — Amua Apps Open Source Coding Standards & OSS Setup (v1.0.0)

**Document version:** v1.0.0  
**Status:** Active  
**Primary audience:** AI coding assistants / AI IDEs generating or editing code.  
**Secondary audience:** Human engineers working on:
- Node.js serverless microservices (TypeScript) on Azure **and/or** AWS
- React apps with SSG for unauthenticated traffic (TypeScript)

**Non-negotiable:** Anything below that conflicts with this document is **non-compliant**.

---

## 0. Purpose & Scope

This document defines coding standards and open-source setup rules for **Amua Apps** open source software.

We value:
- **MACH principles** (Microservices, API-first, Cloud-native, Headless)
- **Independent components (per-repo)**. Some duplication is acceptable to maintain loose coupling.
- **Fully automated CI/CD via GitHub Actions** (dev → staging → main environments).
- **Multi-cloud infrastructure support**: Azure **and** AWS, selected deterministically.

---

## 1. Architecture & Guiding Principles

### 1.1 MACH-Aligned

- **Microservices:** Small, independently deployable services. No “god” services.
- **API-first:** Every backend capability is exposed via a well-defined API contract.
- **Cloud-native & serverless:** Services assume ephemeral compute, horizontal scaling, no reliance on local disk, and no sticky sessions.
- **Headless:** UI apps consume APIs; backend never assumes a specific UI.

### 1.2 Component Independence Over DRY (between repos)

- Each logical component (service or app) has its own repo.
- Duplication between repos is acceptable if sharing would introduce tight coupling.

Within a repo:
- Follow DRY when it does not compromise clarity.
- Extract local shared modules for clearly repeated logic.

### 1.3 Loose Coupling, Strong Contracts

- Communicate across services only through stable APIs or events.
- Avoid reaching into another service’s database or internals.
- Backward-compatible API changes are preferred; when breaking, version the API.

### 1.4 Secure by Design

- Least privilege for all code paths and infrastructure.
- Fail closed (deny by default) on auth, authz, or validation issues.
- Secrets never live in code or repository history.

### 1.5 Automation & Testability

- All changes are validated by automated tests (Jest unit + integration).
- Pipelines must fail on:
  - Failed unit tests
  - Failed integration tests
  - Failed security checks (SCA, lint rules blocking, etc.)
- Write code with testability in mind (pure functions, dependency injection).

---

## 2. Repositories & Project Structure

Each service/app has its own repo with a consistent high-level structure.

### 2.1 Node.js Microservice Repo Layout (TypeScript)

Recommended minimal structure:
```
.
├─ src/
│  ├─ app/            # HTTP handlers / function handlers / entrypoints
│  ├─ domain/         # Domain models, business logic
│  ├─ infra/          # Adapters (DB, messaging, external APIs, storage)
│  ├─ config/         # Config loading and type-safe configuration
│  └─ utils/          # Small shared helpers (within repo only)
├─ tests/
│  ├─ unit/
│  └─ integration/
├─ scripts/           # Local scripts (e.g., dev setup, db seeds for tests)
├─ infra/             # Infrastructure-as-code (see 2.3)
├─ .github/workflows/ # CI/CD definitions
├─ package.json
├─ tsconfig.json
└─ README.md
```

### 2.2 React App Repo Layout (SSG, TypeScript)

```
.
├─ src/
│  ├─ components/      # Reusable UI components
│  ├─ pages/           # Route-level components (framework specific)
│  ├─ layouts/         # Page-level layout components
│  ├─ hooks/           # Reusable hooks
│  ├─ lib/             # API clients, utilities
│  ├─ state/           # Global state setup (if used)
│  └─ styles/          # Global styles / design tokens
├─ tests/
│  ├─ unit/
│  └─ integration/
├─ public/             # Static assets
├─ infra/              # Infrastructure-as-code (see 2.3)
├─ .github/workflows/
├─ package.json
├─ tsconfig.json
└─ README.md
```

### 2.3 Multi-Cloud Infrastructure Layout (Azure + AWS)

**Goal:** Keep all infra logic in-repo and automate deployments via GitHub Actions while allowing users to choose **Azure or AWS**.

**Directory conventions (required):**
```
infra/
  aws/      # Terraform (required for AWS)
  azure/    # Bicep (preferred) or Terraform (allowed if repo chooses)
```

**Rules:**
- AWS infrastructure **MUST** be defined via **Terraform** in `infra/aws`.
- Azure infrastructure **SHOULD** be defined via **Bicep** in `infra/azure` (preferred).
- Code in `src/` **MUST NOT** assume a specific cloud provider.
  - Cloud-specific integrations belong in `src/infra/` adapters and must be abstracted behind interfaces where feasible.
- Infrastructure **MUST NOT** require users to edit pipeline YAML to deploy (only secrets/vars).

---

## 3. TypeScript Standards

### 3.1 TypeScript Is Mandatory
- All new code is written in TypeScript (`.ts`, `.tsx`).
- No new `.js` files in production code.

### 3.2 Strict Type Safety
- Enable strict mode: `strict: true` in `tsconfig.json`.
- Disallow:
  - `any` (use `unknown` or proper types instead).
  - `//@ts-ignore` except with a commented justification and narrow scope.
- Prefer:
  - Interfaces and types for public contracts.
  - `enum` or union types over magic strings.

### 3.3 Type Declarations
- Shared domain types inside a repo live in `src/domain/types.ts` or similar.
- API request/response types live close to the HTTP handlers.
- Never reuse DB models as API response types without explicit mapping.

### 3.4 Async Code
- Prefer `async/await` over raw promises and callbacks.
- Every async function must handle or propagate errors explicitly.

---

## 4. Coding Style & Formatting

### 4.1 Linting
- Use ESLint with:
  - TypeScript support
  - Rules for unused variables, no implicit any, **no console** in production code
- Linting must run in CI and fail the pipeline on violation.

### 4.2 Formatting
- Use Prettier.
- Formatting runs automatically on commit (e.g., via lint-staged/husky).

### 4.3 Naming Conventions
- Files: `kebab-case` for files; `PascalCase` for React components.
- Variables & functions: `camelCase`.
- Classes & React components: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE` only for truly constant values.

### 4.4 Imports
- Use ES module syntax (`import`, `export`) everywhere.
- Group imports by:
  1) Node/standard libs  
  2) Third-party packages  
  3) Internal modules (absolute or aliased paths)
- No circular dependencies. **AI tools: do not create cycles.**

---

## 5. Backend Standards (Node.js Serverless Microservices)

### 5.1 General Patterns
Each function/microservice should:
- Have a single clear responsibility.
- Be stateless between invocations.
- Avoid global mutable state.

### 5.2 API Design
- Default to RESTful JSON APIs for backend services. 
- Default to GraphQL JSON APIs for content and FE connectors. 
- Version in URL or path (e.g., `/api/v1/resource`).
- Use HTTP verbs semantically:
  - GET = read
  - POST = create/command
  - PUT/PATCH = update
  - DELETE = delete

Request/response schemas:
- Must be defined in TypeScript types.
- Should be validated via runtime validation (e.g., zod/Joi) at the boundary.

### 5.3 Error Handling
- Never throw raw errors to the client.
- Map errors to consistent responses:
  - 400: validation / client errors
  - 401/403: auth/authz errors
  - 404: not found
  - 409: conflict
  - 5xx: server issues
- Log detailed error (stack) on server, return sanitized messages to clients.

### 5.4 Logging & Observability
Log with a structured logger following **pino** format.

Minimum fields:
- `timestamp`, `serviceName`, `correlationId/requestId`, `level`, `message`, `context`

Rules:
- No PII or secrets in logs.
- At minimum:
  - Log request start/end with correlation id.
  - Log errors with stack traces.

### 5.5 Configuration & Secrets
- All configuration via environment variables or cloud config services.
- Use a typed config module, e.g.:
  ```ts
  export const config = {
    env: getEnvVar("NODE_ENV", ["development", "staging", "production"]),
  } as const;
  ```

Never:
- Hardcode secrets, tokens, or passwords.
- Check in `.env` files with secrets.

### 5.6 External Dependencies
- Favor small, focused libraries.
- Avoid heavy frameworks that undermine MACH/serverless unless justified.

**AI tools: do not introduce new dependencies unless**
- they are lightweight, and
- clearly improve clarity/security/maintainability, and
- a human reviewer can approve them.

---

## 6. Frontend Standards (React + SSG)

### 6.1 Component Design
- Prefer function components with hooks.
- Separate presentational vs container components where reasonable.
- Avoid “mega components”.

### 6.2 State Management
- Prefer local state (`useState`, `useReducer`) where feasible.
- Use global state only when truly cross-cutting.
- Avoid unnecessary re-renders; memoize where needed (don’t prematurely optimize).

### 6.3 Data Fetching & APIs
For SSG:
- Use the framework’s SSG APIs where possible.
- Avoid calling backend APIs at runtime if static or incremental generation is feasible.

API calls must:
- Use a central client abstraction (e.g., `src/lib/apiClient.ts`).
- Handle errors gracefully (error states/fallbacks).

### 6.4 Accessibility (a11y)
All UI must meet WCAG AA at minimum:
- Semantic HTML
- Proper labels
- Keyboard navigability + focus management
- Color contrast

**AI tools:** Prefer semantic components over generic `<div>` containers.

### 6.5 Styling
- Use the chosen design system and component primitives.
- Avoid inline styles for reusable patterns; keep styling declarative and centralized.

---

## 7. Testing Standards (Jest)

We use Jest for unit and integration tests. Pipelines MUST FAIL if these fail.

### 7.1 General Rules
Every new feature should include:
- Unit tests for core logic.
- Integration tests for critical paths.

Tests must be deterministic and not depend on external network calls:
- Mock external services or use local test doubles.

### 7.2 Structure
- Mirror `src/` structure in `tests/`.
- Test files: `*.test.ts` or `*.spec.ts`.
- Descriptions should be behavior-focused:
  - `it('returns 400 when payload is invalid', ...)`

### 7.3 Coverage
Guidance (adjust if repo specifies exact thresholds):
- 80%+ line and branch coverage for core services.
- Enforce thresholds in Jest config where applicable.
- Do not write meaningless tests to inflate coverage.

### 7.4 Integration Tests
Backend:
- Use in-memory or disposable test environments (test DB, local mocks).
- Exercise endpoints via HTTP calls (or handler invocations) with realistic payloads.

Frontend:
- Use React Testing Library patterns.
- Test behavior/outcomes, not implementation details.

---

## 8. Security Standards

### 8.1 Least Privilege
- Every identity (functions/apps/SPs/roles) must have minimal permissions.
- AI tools: choose the smallest possible scope for Azure/AWS access.

### 8.2 Input Validation & Sanitization
Validate all external inputs:
- HTTP bodies, query params, headers
- Environment variables (fail fast on invalid config)

Prefer positive validation over only blocking forbidden inputs.

### 8.3 Authentication & Authorization
- Authorization checks must be centralized or clearly patterned.
- Apply consistently on all protected endpoints.
- Never trust client-side checks alone.

### 8.4 Secrets & Sensitive Data
- Store secrets in cloud secret stores (e.g., Azure Key Vault or equivalent).
- Never log secrets, never return them in errors.

PII:
- Avoid logging; mask/hash when necessary.

### 8.5 Dependencies & Vulnerabilities
- Use automated security scanning (SCA, `npm audit`, etc).
- Pipelines must fail if high-severity vulnerabilities are detected (per tooling config).
- Prefer standard, actively maintained libraries.

---

## 9. CI/CD & Multi-Infra Deployment Requirements

We use GitHub Actions for fully automated CI/CD (per repo). Environments: **dev**, **staging**, **main (prod)**.

**Required pipeline stages:** GitHub Actions workflows MUST implement the following four gated stages (jobs or reusable workflows), in this order:

1) **Test**  
2) **Build**  
3) **Deploy** (deploy to **GREEN** only; do not route production traffic yet)  
4) **Test Infra + Integration + Switch Blue/Green** (only on success may traffic be switched)

**Blue/Green definition:**
- **BLUE** = currently active, known-good version serving traffic
- **GREEN** = newly deployed candidate version
- The pipeline MUST NOT switch traffic to GREEN until Stage 4 succeeds.

If Stage 4 fails, the pipeline MUST fail and MUST ensure traffic remains on (or is switched back to) **BLUE**.

---

### 9.1 Branch & Environment Mapping

Conventional mapping (unless documented otherwise):
- `develop` → dev environment
- `release` → staging
- `main` → main/production

Code must not rely on branch names at runtime; use environment variables instead.

---

### 9.2 Feature Flags

New features go behind feature flags.

Requirements for feature flags:
- Default must be safe (generally “off” for risky features).
- Flags must be configurable per environment.
- Flag logic should be:
  - Centralized (e.g., `featureFlags.ts`)
  - Type-safe (avoid raw string keys scattered around)

**AI tools:** When adding a new feature that changes behavior, wrap it in a feature flag unless explicitly told otherwise.

---

### 9.3 Workflow Process & Pipeline Expectations

#### 9.3.1 Stage 1 — Test (required checks)

Stage 1 MUST run on every PR and on protected branches (at minimum `develop`, `release`, `main`) and MUST fail the pipeline if any check fails.

Stage 1 MUST include:
- **Linting** (ESLint) — fail on violations
- **Type checks** (`tsc --noEmit` or equivalent) — fail on type errors
- **Formatting checks** (e.g., Prettier `--check`) — fail on formatting drift
- **Unit tests** (Jest) **with coverage threshold checks enforced** — fail on threshold breach
- **Static code analysis** via **CodeQL** — fail on blocking findings (per repo policy)
- **External vulnerability checks** via **npm audit** (or equivalent SCA tool configured for the repo) — fail on high/critical (per repo policy)
- **Component-specific tests** required by the repo (without changing this standard)

Rules:
- If Stage 1 fails, **Stages 2–4 MUST NOT run**.
- Stage 1 SHOULD upload machine-readable reports (test results, coverage, audit/scan output) as workflow artifacts.

#### 9.3.2 Stage 2 — Build (required)

Stage 2 MUST:
- Produce deployable, immutable build artifacts (e.g., bundled JS, packaged function zip, container image, static site output).
- Be reproducible in CI (no reliance on local-only tooling).
- Use lockfile-based installs (e.g., `npm ci`) to ensure deterministic builds.
- Fail the pipeline if the build cannot be produced.

Rules:
- Stage 2 MUST only run if Stage 1 succeeds.
- Deployments SHOULD use the artifacts built in Stage 2 (not rebuild from source in the deploy job).

#### 9.3.3 Stage 3 — Deploy (Blue/Green deploy to GREEN only)

Stage 3 MUST:
- Deploy infrastructure changes (if any) and application/runtime artifacts to the **GREEN** deployment target.
- **NOT** switch user traffic to GREEN.
- Output the **GREEN base URL / endpoint** (or equivalent) for Stage 4 tests.
- Be idempotent (safe to re-run without manual cleanup).

Rules:
- Stage 3 MUST only run if Stages 1–2 succeed.
- Stage 3 MUST be implemented with least privilege and MUST NOT print secrets to logs.
- Stage 3 SHOULD use GitHub Environments (`dev`, `staging`, `prod`) for environment scoping and approvals (especially `prod`).

#### 9.3.4 Stage 4 — Test Infra + Integration + Switch Blue/Green (required)

Stage 4 is a gate before traffic switch. It MUST run against the **GREEN** deployment.

Stage 4 MUST include:
- **Integration tests** against GREEN (end-to-end or service-level integration appropriate to the component)
- **Infra-related security tests** appropriate to the chosen IaC and cloud (e.g., IaC policy checks, configuration validation, post-deploy security assertions)

Switch rule:
- Only if **all** Stage 4 checks pass, the workflow MAY switch traffic from **BLUE → GREEN**.

Failure rule (mandatory):
- If **any** Stage 4 check fails:
  - The workflow MUST **fail**.
  - The workflow MUST ensure traffic remains on **BLUE** (or is switched back to BLUE if a switch partially occurred).
  - The workflow MUST perform rollback/cleanup actions as defined by the repo’s blue/green mechanism (e.g., revert alias/route weights, swap back slots, revert gateway routing, tear down or disable GREEN where safe).

Observability:
- Stage 4 SHOULD publish test results and infra/security check outputs as artifacts.
- Stage 4 SHOULD emit a clear, human-readable summary describing why the gate failed and what rollback action was taken.

#### 9.3.5 General pipeline rules (non-negotiable)

- Deployments MUST NOT proceed if tests, linting, formatting checks, type checks, or security scans fail.
- Code MUST include necessary scripts (`lint`, `typecheck`, `format:check`, `test`, `build`, etc.) in `package.json`.
- Code MUST NOT rely on local development-only hacks that don’t work in CI.
- Pipelines MUST be able to run unattended end-to-end in a fresh runner environment.

---

### 9.4 Multi-Cloud Infra Selection (Azure + AWS)

**Goal:** Users can deploy to **either** Azure or AWS with minimal setup.

#### 9.4.1 Supported IaC tooling
- **AWS:** Terraform (required)
- **Azure:** Bicep (preferred) or Terraform (repo-specific decision)

#### 9.4.2 Cloud authentication (required preference: OIDC)
To make the setup “out of the box” and secure:
- **MUST prefer OIDC** (OpenID Connect) for GitHub Actions auth to cloud
- Avoid long-lived access keys / client secrets whenever possible

#### 9.4.3 Detection + choice logic (required behavior)
Workflows MUST follow deterministic selection rules:

1) If workflow input `cloud` is provided:
   - MUST deploy to that cloud **only**
   - MUST fail with a clear error if required vars/secrets are missing

2) If no input is provided (auto-detect):
   - If **only AWS** is configured → deploy AWS
   - If **only Azure** is configured → deploy Azure
   - If **both** are configured → **FAIL** and require explicit `cloud` input
   - If **neither** is configured → **FAIL** with instructions

**Never guess** when both are configured.

#### 9.4.4 Required secrets/vars (recommended naming)
Repositories MUST document required configuration in `README.md` and provide `.env.example`.

Recommended keys (use GitHub **Secrets** for sensitive values, **Variables** for non-sensitive):

**AWS (OIDC)**
- `AWS_ROLE_ARN` (secret or variable, treat as sensitive-ish)
- `AWS_ACCOUNT_ID` (variable)
- `AWS_REGION` (variable)

**Azure (OIDC)**
- `AZURE_CLIENT_ID` (variable or secret)
- `AZURE_TENANT_ID` (variable)
- `AZURE_SUBSCRIPTION_ID` (variable)
- Optional: `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION` (variables)

#### 9.4.5 Workflow structure (required pattern)
- A `decide` job determines `target=aws|azure` and exports as workflow output.
- The pipeline MUST implement the four stages defined in **9.3**.
- Cloud-specific deploy/switch logic MUST be isolated behind:
  - `deploy-aws` / `switch-aws` jobs (Terraform + AWS mechanisms), and/or
  - `deploy-azure` / `switch-azure` jobs (Bicep + Azure mechanisms)
- Deploy and switch jobs MUST depend on successful completion of the Test/Build stages and the chosen cloud target.

#### 9.4.6 Terraform state & secrets (required)
- Terraform state MUST be remote (S3+DynamoDB, Azure Storage, etc.) and MUST NOT be stored in the repo.
- Backend configuration MUST NOT embed credentials.
- If backend config needs values, they must come from environment variables / workflow inputs.

#### 9.4.7 Environment protections (recommended)
Use GitHub Environments:
- `dev`, `staging`, `prod`
- Configure required reviewers for `prod` if the repo is intended for real deployments.

---

## 10. Performance & Reliability

### 10.1 Serverless Constraints
- Avoid cold start penalties (minimal heavy initialization).
- No large in-memory caches that assume long-lived processes.

### 10.2 Efficiency
- Use streaming or pagination for large payloads.
- Avoid N+1 queries; prefer batch calls.

### 10.3 Idempotency
- Important write operations and event handlers should be idempotent when feasible.

### 10.4 Timeouts & Retries
External calls must have:
- Explicit timeouts
- Limited retries with backoff (no infinite loops)

---

## 11. Documentation & Comments

### 11.1 Inline Comments
- Explain “why”, not “what”.
- Avoid redundant comments.

### 11.2 README (required)
Each repo must include:
- Purpose of the service/app
- How to run locally
- How to run tests
- How to deploy (Azure and AWS instructions, including required vars/secrets)

### 11.3 API Docs
APIs must be documented via:
- OpenAPI/Swagger, **or**
- clearly defined TypeScript types plus markdown docs

---

## 12. AI Coding Assistant Guidelines

When an AI IDE / code assistant generates or edits code in this platform, it must:

### 12.1 Obey Architecture Constraints
- Use TypeScript everywhere.
- Maintain serverless assumptions (no local disk reliance, stateless).
- Respect per-repo independence:
  - Don’t propose cross-repo imports/shared libs unless a human explicitly asks.

### 12.2 Respect Standards by Default
- Add Jest tests for new logic.
- Use existing repo patterns for:
  - Logging
  - Error handling
  - Config
  - Feature flags
- Follow existing file/folder structure.

### 12.3 Avoid Risky Changes Automatically
Don’t:
- Introduce new dependencies/frameworks without justification.
- Change public API contracts without clearly marking as breaking.

Do:
- Prefer clarity improvements without behavior changes unless requested.

### 12.4 Security-First
Never generate code that:
- Logs secrets or PII
- Interpolates user input into SQL/shell commands
- Skips input/config validation

### 12.5 Explain When Significant
For substantial changes (new feature, refactor), generate:
- A short summary of the change
- A note on any new patterns or dependencies introduced

---

## 13. Open Source Licensing (MIT)

### 13.1 License Choice
All Amua Apps open source repositories use the **MIT License**.

### 13.2 Required repo files
Each repo MUST include:
- `LICENSE` (MIT text)
- `README.md` (including license mention)
- (Recommended) `NOTICE` if required by dependencies (repo-specific)

### 13.3 Dependency licensing
- Maintain compliance with third-party dependency licenses.
- CI SHOULD include dependency/license scanning where available.

---

## 14. Document Versioning & Changelog

This document uses **Semantic Versioning**:
- **MAJOR**: incompatible policy changes
- **MINOR**: new rules that are backward compatible
- **PATCH**: clarifications/typos with no behavioral impact

### Changelog
- **v1.0.0** — Initial release: coding standards + multi-cloud (AWS Terraform / Azure Bicep) setup rules + MIT licensing.