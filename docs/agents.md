# agents.md — Amua Apps Open Source Coding Standards & OSS Setup (v1.2.0)

**Document version:** v1.2.0  
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

### 2.3 — Repos That Include Publishable Packages (recommended layout)

#### 2.3.1 Goal

Some repos ship two independent deliverables:
1) **One or more packages** published to **GitHub Packages** (e.g., UI component library, analytics SDK)  
2) **Infrastructure / hosted artifacts** deployed to Azure (handled under section 9)

These deliverables MUST have **separate workflows** and MUST be isolatable via directory-based change detection (path filters).

#### 2.3.2 Required top-level layout

Recommended layout for repos that publish a package (single-package repo):

```
.
├─ package/                 # publishable package boundary (ONLY package-related files)
│  ├─ src/
│  ├─ tests/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ README.md
│  └─ CHANGELOG.md          # optional but recommended
├─ infra/                   # IaC boundary (Azure-only; see section 2.5 after renumber)
│  └─ azure/
├─ docs/                    # contracts and documentation (see section 2.4 after renumber)
├─ .github/workflows/
│  ├─ publish-package.yml   # NEW: package publishing workflow (see section 9.4)
│  └─ deploy-infra.yml      # existing infra flow (section 9)
└─ README.md
```

If the repo publishes **multiple packages**, use:

```
packages/
  ui/
  analytics-sdk/
  ...
infra/
docs/
.github/workflows/
```

Rule:
- `package/` (or `packages/**`) MUST contain everything required to build and publish the package(s).
- `infra/` MUST contain everything required to deploy infra.
- Cross-dependencies SHOULD be minimized. If unavoidable, dependencies MUST be explicitly documented in the workflow triggers.

#### 2.3.3 Trigger rules (path filters)

Workflows SHOULD trigger only when relevant folders change:

- **Package publishing workflow** triggers on changes to:
  - `package/**` (or `packages/**`)
  - optionally `.github/workflows/publish-package.yml` and shared tooling config used by package builds (e.g., `.npmrc`, `tsconfig.base.json`)

- **Infra deployment workflow** triggers on changes to:
  - `infra/**`
  - optionally `.github/workflows/deploy-infra.yml`

Agents MUST NOT publish a package due to infra-only changes.

### 2.4 Required UI & Brand Contracts (per repo)

Every repo that renders UI MUST include the following files under `docs/`:

- `docs/brand-contract.md`
- `docs/ui-contract.md`
- `docs/design-tokens.md`

**Agent rule (non-negotiable):**
- Before generating or changing UI, the agent MUST read and follow these contracts.
- If any contract file is missing or ambiguous, the agent MUST **escalate to a human** rather than guessing.


### 2.5 Multi-Cloud Infrastructure Layout (Azure + AWS)

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
    env: getEnvVar("NODE_ENV", ["dev", "staging", "prod"]),
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

We use Jest as the default test runner for Node.js and Next.js/React.
Pipelines MUST FAIL if required test suites fail.

Testing is structured in layers to keep complexity low while still covering infrastructure-facing behavior:

- **Unit tests (fast, deterministic):** domain logic + orchestration using fakes.
- **Component tests (medium):** real DB or dependencies via disposable environments (where practical).
- **Release/Green-gate tests (slowest, highest confidence):** run post-deploy against **real infrastructure** in the green environment. No mocking of real dependencies.

---

### 7.1 Principles

**1) Keep unit tests deterministic**
- Unit tests MUST NOT depend on external network calls.
- Unit tests MUST run offline and deterministically.

**2) Test behavior, not implementation**
- Prefer assertions on outcomes (responses, persisted state, emitted events) over internal function calls.
- Avoid deep mocks of SDK internals. Mock/fake at our boundaries instead.

**3) Separate “infra definition” from “runtime behavior”**
- Infrastructure-as-Code (IaC) is validated using IaC tools (validate/lint/security scan/plan/what-if).
- Runtime behavior is validated through component and release tests.

**4) Prefer fakes over mocks**
- Use small in-memory fakes for boundaries (queue, blob store, repository, clock, id generator).
- Use mocks sparingly, primarily to assert a boundary interaction that cannot reasonably be faked.

**5) Keep release tests small**
- Release/green-gate tests must be minimal, stable, and time-bounded. They gate traffic flip.

---

### 7.2 Test Suites and When They Run

We maintain separate suites with explicit intent. Each suite is a different signal.

#### 7.2.1 Unit Tests (`test:unit`)
**Purpose:** Fast feedback; validate domain logic and orchestration.
**Runs:** Every PR and every build.

Rules:
- No external network calls.
- Use fakes/test doubles for ports (DB, queue, blob, secrets, HTTP clients).
- High coverage expected for core logic.

#### 7.2.2 Component Tests (`test:component`)
**Purpose:** Validate adapter behavior with real dependencies in disposable environments.
**Runs:** Every PR (if fast enough) or at least on main.

Examples:
- Real DB via disposable environment (preferred) or dedicated ephemeral schema/database.
- HTTP server started locally and exercised via fetch/supertest.
- Outbound HTTP dependencies stubbed via MSW (Mock Service Worker) or equivalent.

Rules:
- Must remain deterministic.
- Should not require deployed infrastructure.
- Must clean up resources they create (or use a safety-net cleanup mechanism).

#### 7.2.3 Release / Green-Gate Tests (`test:release`)
**Purpose:** Gate blue/green flip. Validate real end-to-end behavior in green.
**Runs:** After deployment to green, before switching traffic.

Rules:
- NO mocking of real infra dependencies. Tests run against real endpoints and real infra configured for green.
- Tests MUST be time-bounded (explicit timeouts) and resilient to eventual consistency via polling.
- Tests MUST tag all written data with a `testRunId` to support cleanup and debugging.
- If these fail, we do NOT flip traffic from blue to green.

---

### 7.3 Architecture Rules to Keep Tests Simple

To avoid overcomplicated mocking, code MUST be structured so infrastructure is behind explicit boundaries.

**Ports & Adapters**
- Domain logic MUST NOT import cloud SDKs, DB clients, or fetch directly.
- External integrations MUST live behind adapter interfaces ("ports"), e.g.:
  - `QueuePort`, `BlobStorePort`, `RepositoryPort`, `SecretsPort`, `HttpClientPort`

**Wiring**
- The “composition root” (app bootstrap) wires adapters to ports.
- Unit tests import domain/services and inject fakes instead of mocking SDKs.

**Allowed mocking targets**
- Mock or fake **our own port interfaces**.
- Avoid mocking the internals of third-party SDK modules except as a last resort.

---

### 7.4 Structure and Naming

- Mirror `src/` structure in `tests/` where reasonable.
- Test file extensions: `*.test.ts` or `*.spec.ts`.
- Prefer behavior-focused descriptions:
  - `it('returns 400 when payload is invalid', ...)`
  - `it('persists the donation and emits a confirmation event', ...)`

**Recommended folder layout**
- `tests/unit/**`
- `tests/component/**`
- `tests/release/**` (or `tests/e2e/**` if your org uses that naming)

**Recommended Jest scripts**
- `test:unit` runs only unit tests
- `test:component` runs only component tests
- `test:release` runs only release tests

Tests MUST NOT rely on execution order. Each test must set up its own state.

---

### 7.5 Coverage Standards

Guidance (unless the repo specifies exact thresholds):
- **80%+ line and branch coverage** for core services and domain modules.
- Enforce thresholds in Jest config where applicable.
- Do not write meaningless tests to inflate coverage.

Coverage expectations by suite:
- Unit tests: primary driver of coverage.
- Component & release tests: focus on critical paths; not used to inflate coverage.

---

### 7.6 Integration / Release Testing Strategy (Green Environment)

Release tests run after deployment to green and validate the system with real infrastructure.

#### 7.6.1 Minimal Green-Gate Test Set (recommended)
Keep the suite small (typically 10–30 tests max):

1. **Readiness**
   - `/health/ready` indicates service is ready and can reach required dependencies.
2. **Happy-path API**
   - Representative request that reads/writes expected data.
3. **Async flow (if applicable)**
   - Publish → consume → persist → (optional) emit.
4. **Storage flow (if applicable)**
   - Write → read back → metadata correct.
5. **Auth/secrets access**
   - Service can access required secrets/config and can authenticate to dependencies.
6. **One failure mode**
   - e.g., invalid payload returns correct error OR poison message handled correctly.

#### 7.6.2 Eventual Consistency and Async Assertions
For queues/background processing, tests MUST:
- Use polling assertions (wait until condition true or timeout).
- Use explicit timeouts (e.g., 30–90s max per async check).
- Surface `testRunId` and correlation IDs in failures.

---

### 7.7 Database Strategy for Blue/Green and Tests

Blue/green deployments typically share the same database. Deployment must not “overwrite” DBs; the risk is schema change.

#### 7.7.1 Schema Change Rules (Expand/Contract)
Migrations MUST be backward-compatible with the currently live version:
- **Expand:** add new tables/columns/indexes first; keep old paths working.
- Deploy green.
- Flip traffic.
- **Contract:** remove old columns/paths only after blue is gone and usage is removed.

Breaking migrations MUST NOT be coupled to a single deploy step that could strand the live version.

#### 7.7.2 Writing Data in Release Tests (Safe Data Marking)
Release tests may write data. They MUST do so safely:

- Every release test run MUST generate a `testRunId` (UUID) and attach it to:
  - request headers (e.g., `X-Test-Run-Id`)
  - message metadata (if publishing events)
  - persisted records (either via marker columns or natural key prefixes)

**Preferred approaches (choose one per service):**
1. **Marker columns + TTL cleanup**
   - Add `createdByTestRunId`, `createdAt`, optionally `expiresAt`.
   - A cleanup job deletes expired test data.
2. **Natural key prefixing**
   - Use deterministic keys like `test_<testRunId>_<n>`.
   - Cleanup deletes `test_*` older than a retention window.
3. **Transactional rollback (component tests only)**
   - Roll back DB writes per test when tests run in-process and synchronous.

#### 7.7.3 Cleanup Requirements
- Tests SHOULD attempt cleanup in `afterEach/afterAll`.
- Tests MUST NOT rely on cleanup always running (CI may cancel jobs).
- A safety-net cleanup MUST exist for release tests:
  - TTL-based cleanup, scheduled cleanup, or a disposable test schema/table.

---

### 7.8 Frontend Testing (Next.js + React)

We follow React Testing Library patterns:
- Test behavior/outcomes, not implementation details.
- Avoid testing internal component state directly.

#### 7.8.1 Unit/Component (React)
- Use React Testing Library for rendering and user interactions.
- Prefer `userEvent` over direct DOM event dispatching.
- Assert on what the user sees/does:
  - text, roles, labels, navigation, disabled/enabled states.

#### 7.8.2 Network and Data Fetching
- Frontend tests MUST NOT call real APIs.
- Stub network using MSW or equivalent.
- For Next.js:
  - Test server components and data loaders by mocking fetch at the boundary where data is requested.
  - Prefer testing page behavior (rendered output) rather than Next internals.

#### 7.8.3 Release Tests for Frontend (Green)
If the frontend is deployed separately, release tests MAY include:
- critical navigation paths
- authentication flow smoke test
- one critical API-backed interaction

These tests run against green URLs and MUST use `testRunId` markers in requests.

---

### 7.9 Configuration and Environment

- Tests MUST fail fast on missing required env vars.
- Configuration parsing MUST be typed and validated (e.g., using a schema).
- Release test environments MUST be isolated by configuration (green-only resources / namespaces).

---

### 7.10 Non-Goals / Anti-Patterns

Avoid:
- One giant “integration test” suite that runs everywhere.
- Deep mocking of third-party SDKs across many tests.
- Tests that depend on global state or execution order.
- Writing large volumes of test data into shared environments.
- Coupling schema-breaking migrations to a single deployment step.

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

### 9.5 — Package Publishing Workflows

This subsection defines the standard for publishing **versioned packages** (UI libraries, SDKs, shared tooling) to **GitHub Packages**, independent of Azure infrastructure deployment.

This flow is intentionally different from the infra deployment flow in section 9, which is designed around Azure **blue/green** deployments. 

#### 9.5.1 Principles (non-negotiable)

1) **Separate workflows**
- Package publishing MUST be in its own workflow file (e.g., `.github/workflows/publish-package.yml`).
- Azure infra deployments MUST continue to follow section 9 in a separate workflow. 

2) **Single workflow, three environments**
- The package publishing workflow MUST support **dev**, **staging**, **prod** in a single YAML:
  - Common jobs: `test`, `build`
  - Publish jobs: `publish_dev`, `publish_staging`, `publish_prod`

3) **Versioning model**
- Base version MUST be stored in the package itself (e.g., `package/package.json`).
- Publishing rules:
  - **dev** publishes pre-releases: `X.Y.Z-pr.N`
  - **staging** publishes release candidates: `X.Y.Z-rc.N`
  - **prod** publishes stable: `X.Y.Z`

4) **Branch ↔ environment mapping**
This workflow MUST use the repo’s standard mapping:  
- `develop` → dev  
- `release` → staging  
- `main` → prod 

#### 9.5.2 When to publish (what changes qualify)

A package publish job MUST run only when package-relevant files change (e.g., `package/**` or `packages/**`).

Examples of changes that SHOULD trigger a publish:
- exported API changes (code, types)
- dependency changes
- build output changes

Examples that MUST NOT trigger a publish:
- `infra/**` changes only
- documentation changes outside the package boundary (unless the doc is bundled into the package)

#### 9.5.3 Required GitHub Actions permissions

The workflow MUST include:

- `permissions: contents: read`
- `permissions: packages: write`

If the workflow uses CodeQL as part of its test stage (allowed), it also needs the standard CodeQL permissions as required by the org baseline in section 9.3.1.

#### 9.5.4 Workflow triggers (recommended)

The workflow SHOULD trigger on pushes to the env branches, restricted to package paths. Example pattern:

```yaml
on:
  push:
    branches: [develop, release, main]
    paths:
      - "package/**"
      - ".github/workflows/publish-package.yml"
      - ".npmrc"
      - "tsconfig.base.json"
```

Optional (recommended): allow manual re-publish for recovery/debugging:

```yaml
on:
  workflow_dispatch: {}
```

#### 9.5.5 Common Job 1 — Test (required)

The `test` job MUST follow the same minimum expectations as section 9.3.1:
- lint
- typecheck
- formatting check
- unit tests with coverage thresholds
- dependency security checks
- CodeQL (per org policy) fileciteturn1file11L56-L63

It MUST run before any publish job.

#### 9.5.6 Common Job 2 — Build (required)

The `build` job MUST:
- run after `test`
- produce an **immutable package artifact** (e.g., `npm pack`) and upload it as a workflow artifact
- avoid rebuilding in publish jobs (publish jobs SHOULD consume the artifact)

This follows the same principle as section 9.3.2 (“build once, deploy/publish from artifacts”). fileciteturn1file11L68-L78

#### 9.5.7 Publish jobs (dev / staging / prod)

Each publish job MUST:
- download the build artifact from `build`
- authenticate to GitHub Packages using the GitHub Actions token
- compute the correct version string
- publish the package
- attach metadata to logs (package name, computed version, commit SHA)

##### 9.5.7.1 Dev publish (`publish_dev`)

Trigger condition:
- branch == `develop`

Version format:
- `X.Y.Z-pr.N`

Tagging (recommended):
- publish with npm dist-tag `pr` (or `next`), NOT `latest`

Required steps:
- compute `N` as the next available `pr` number for `X.Y.Z` (query registry), or fall back to `github.run_number` if registry access is unavailable
- set version without creating git tags:
  - `npm version --no-git-tag-version X.Y.Z-pr.N`

##### 9.5.7.2 Staging publish (`publish_staging`)

Trigger condition:
- branch == `release`

Version format:
- `X.Y.Z-rc.N`

Tagging (recommended):
- publish with npm dist-tag `rc` (or `beta`), NOT `latest`

Required steps:
- compute `N` as the next available `rc` number for `X.Y.Z`
- `npm version --no-git-tag-version X.Y.Z-rc.N`

##### 9.5.7.3 Prod publish (`publish_prod`)

Trigger condition:
- branch == `main`

Version format:
- `X.Y.Z`

Tagging (required):
- publish with npm dist-tag `latest`

Required gates (recommended and prescriptive):
- `package.json` version MUST already be `X.Y.Z` (stable)
- the workflow SHOULD require a git tag `vX.Y.Z` on the commit (or an equivalent release marker)

This ensures prod is intentional and reproducible.

#### 9.5.8 Minimal publish implementation requirements (GitHub Packages)

The workflow MUST configure npm to publish to GitHub Packages. Minimal patterns:

- `.npmrc` configured for GitHub Packages registry (scoped):
  - `@<scope>:registry=https://npm.pkg.github.com`
- `NODE_AUTH_TOKEN` set to `${{ secrets.GITHUB_TOKEN }}` (or `${{ github.token }}`) for publish
- `npm publish` MUST run from inside the package boundary (`package/`)

#### 9.5.9 Relationship to infra deployments

If the repo also deploys Storybook or documentation sites to Azure:
- Infra deployments MUST remain in the infra workflow (section 9).
- The infra workflow MAY consume the package version as an input (e.g., “deploy Storybook for X.Y.Z-rc.N”), but MUST NOT publish the package.

This preserves clean ownership boundaries between “artifact publishing” and “runtime deployment” consistent with section 9’s gated workflow model. 

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