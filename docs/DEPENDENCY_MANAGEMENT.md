# Dependency Management

This document explains how dependencies are managed in the Analytics Service to ensure deterministic builds across all environments.

## Package Lock Files

### npm (Node.js)

**File:** `package-lock.json`

**Status:** ✅ Committed to repository

**Purpose:**
- Ensures exact same dependency versions across all environments
- Required for `npm ci` (clean install)
- Prevents "works on my machine" issues
- Locks transitive dependencies

**Usage:**

```bash
# Install dependencies (development)
npm install

# Clean install (CI/CD, production)
npm ci

# Update dependencies
npm update
npm install  # Regenerates package-lock.json

# Add new dependency
npm install <package>  # Automatically updates package-lock.json
```

**Important:**
- Always commit `package-lock.json` after adding/updating dependencies
- Never manually edit `package-lock.json`
- Use `npm ci` in CI/CD pipelines (faster, more reliable)
- Use `npm install` for local development

### Terraform (AWS Infrastructure)

**File:** `infra/aws/.terraform.lock.hcl`

**Status:** ✅ Committed to repository

**Purpose:**
- Locks Terraform provider versions
- Ensures consistent provider behavior across team
- Prevents unexpected provider updates
- Documents exact provider versions used

**Usage:**

```bash
cd infra/aws

# Initialize Terraform (generates .terraform.lock.hcl)
terraform init

# Update provider versions
terraform init -upgrade

# Always commit .terraform.lock.hcl after init or upgrade
git add .terraform.lock.hcl
git commit -m "Update Terraform provider versions"
```

**Important:**
- Commit `.terraform.lock.hcl` to ensure team uses same provider versions
- Review provider updates in pull requests
- Test infrastructure changes after provider updates

## CI/CD Integration

### GitHub Actions

The CI/CD pipeline uses `npm ci` for deterministic dependency installation:

```yaml
- name: Install dependencies
  run: npm ci
```

**Why `npm ci` instead of `npm install`?**
- Faster (skips dependency resolution)
- Fails if `package-lock.json` is out of sync with `package.json`
- Removes `node_modules` before installing (clean slate)
- Never modifies `package-lock.json`
- More reliable for CI/CD

### Local Development

For local development, use `npm install`:

```bash
# First time setup
npm install

# After pulling changes
npm install

# Adding dependencies
npm install <package>
git add package.json package-lock.json
git commit -m "Add <package> dependency"
```

## Dependency Updates

### Security Updates

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Fix vulnerabilities (may update major versions)
npm audit fix --force

# Review changes
git diff package-lock.json

# Commit if acceptable
git add package.json package-lock.json
git commit -m "Fix security vulnerabilities"
```

### Regular Updates

```bash
# Check for outdated packages
npm outdated

# Update specific package
npm update <package>

# Update all packages (respecting semver in package.json)
npm update

# Update to latest (ignoring semver)
npm install <package>@latest

# Always test after updates
npm test

# Commit updates
git add package.json package-lock.json
git commit -m "Update dependencies"
```

## Best Practices

### For Contributors

1. **Always use `npm install`** for local development
2. **Never delete `package-lock.json`** - it's required for CI/CD
3. **Commit lockfile changes** when adding/updating dependencies
4. **Run tests** after dependency updates
5. **Review lockfile diffs** in pull requests

### For CI/CD

1. **Always use `npm ci`** in pipelines
2. **Cache `node_modules`** based on `package-lock.json` hash
3. **Fail fast** if lockfile is out of sync
4. **Run security audits** in CI pipeline

### For Infrastructure

1. **Commit `.terraform.lock.hcl`** after provider updates
2. **Review provider changes** in pull requests
3. **Test infrastructure** after provider updates
4. **Document breaking changes** in commit messages

## Troubleshooting

### `npm ci` fails with "package-lock.json out of sync"

```bash
# Regenerate package-lock.json
rm package-lock.json
npm install

# Commit the updated lockfile
git add package-lock.json
git commit -m "Regenerate package-lock.json"
```

### Different dependency versions locally vs CI

```bash
# Ensure you're using the same Node version as CI
node --version  # Should match NODE_VERSION in .github/workflows/deploy.yml

# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Terraform provider version conflicts

```bash
cd infra/aws

# Update providers to match lockfile
terraform init

# Or upgrade to latest
terraform init -upgrade
git add .terraform.lock.hcl
git commit -m "Update Terraform providers"
```

## Version Requirements

### Node.js

- **Minimum:** 20.0.0
- **Recommended:** 20.x LTS
- **CI/CD:** 20.x (specified in `.github/workflows/deploy.yml`)

### npm

- **Minimum:** 9.0.0
- **Recommended:** Latest bundled with Node 20.x

### Terraform

- **Minimum:** 1.5.0
- **Recommended:** Latest 1.x

## References

- [npm ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- [package-lock.json documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json)
- [Terraform dependency lock file](https://developer.hashicorp.com/terraform/language/files/dependency-lock)
