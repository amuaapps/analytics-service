# Amua Pipeline Templates v1

This folder contains **copy-pasteable repo templates** for three archetypes:

1. `react-app/` — React + SSG deployments
2. `microservice/` — Node.js TypeScript serverless microservices
3. `package-publisher/` — GitHub Packages publishing (`package/` boundary)

Each archetype folder contains `.github/workflows/*.yml` plus stub scripts under `scripts/ci/`.

## How to use

1. Pick the archetype folder.
2. Copy its contents into your repo root.
3. Implement the `scripts/ci/*` stubs for your specific infra/runtime.
4. Ensure `package.json` includes required scripts:
   - `lint`, `typecheck`, `format:check`, `test:unit`, `build`
   - recommended: `test:component`, `test:release`

## Notes

- The deploy workflows are designed for **full automation** on pushes to env branches.
- GitHub Environment protections (reviewers) are optional; if enabled, they will pause deployments.
