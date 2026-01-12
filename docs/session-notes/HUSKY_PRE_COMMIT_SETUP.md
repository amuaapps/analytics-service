# Husky Pre-Commit Hook Setup

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Add Husky pre-commit hooks to enforce code quality checks before commits

---

## Summary

Successfully added Husky pre-commit hooks:
- ✅ **Automatic setup** - Hooks install on `npm install` via `prepare` script
- ✅ **Pre-commit checks** - Runs `lint-staged` on staged `.ts` files
- ✅ **ESLint auto-fix** - Automatically fixes linting issues
- ✅ **Prettier formatting** - Automatically formats code
- ✅ **Prevents bad commits** - Blocks commits if checks fail
- ✅ **Documented** - Setup instructions in README

---

## Problem

### No Automated Code Quality Enforcement

**Issue:**
- Developers could commit unformatted or unlinted code
- Manual `npm run lint` and `npm run format` required
- Inconsistent code style in commits
- CI failures due to formatting/linting issues
- **Result:** Wasted CI time, inconsistent codebase

**Need:**
- Automatic enforcement of code quality standards
- Run checks before commit (not after push)
- Auto-fix issues when possible
- Block commits that fail checks

---

## Solution: Husky + lint-staged

### Why Husky?

**Husky** manages Git hooks in a project-friendly way:
- ✅ Hooks stored in `.husky/` directory (version controlled)
- ✅ Automatic installation via `prepare` script
- ✅ Works across all developer machines
- ✅ No manual Git hook setup required

### Why lint-staged?

**lint-staged** runs commands only on staged files:
- ✅ Fast - only checks files being committed
- ✅ Efficient - doesn't check entire codebase
- ✅ Auto-fix - can modify staged files
- ✅ Configurable - define commands per file pattern

---

## Implementation

### 1. Dependencies (Already in package.json)

**File:** `package.json`

```json
{
  "devDependencies": {
    "husky": "^8.0.3",
    "lint-staged": "^15.2.0"
  }
}
```

**Status:** ✅ Already present

---

### 2. Prepare Script (Already in package.json)

**File:** `package.json`

```json
{
  "scripts": {
    "prepare": "husky install || true"
  }
}
```

**What it does:**
- Runs automatically after `npm install`
- Installs Git hooks from `.husky/` directory
- `|| true` prevents failure in CI environments without Git

**Status:** ✅ Already present

---

### 3. lint-staged Configuration (Already in package.json)

**File:** `package.json`

```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

**What it does:**
- Runs on all staged `.ts` files
- First: ESLint with auto-fix
- Second: Prettier formatting
- If any command fails, commit is blocked

**Status:** ✅ Already present

---

### 4. Pre-Commit Hook (Created)

**File:** `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

**What it does:**
- Runs before every `git commit`
- Executes `lint-staged` on staged files
- Blocks commit if any check fails

**Status:** ✅ Created

---

### 5. Husky Directory Structure

```
.husky/
├── _/
│   ├── .gitignore
│   └── husky.sh
└── pre-commit
```

**Files:**
- `.husky/_/` - Husky internal files (auto-generated)
- `.husky/pre-commit` - Pre-commit hook script
- `.husky/_/.gitignore` - Ignores Husky internals

**Status:** ✅ Created by `husky install`

---

## How It Works

### Developer Workflow

**1. Developer makes changes:**
```bash
# Edit some TypeScript files
vim src/config/config.ts
vim src/utils/logger.ts
```

**2. Stage files for commit:**
```bash
git add src/config/config.ts src/utils/logger.ts
```

**3. Attempt commit:**
```bash
git commit -m "feat: update config and logger"
```

**4. Pre-commit hook runs automatically:**
```
✔ Preparing lint-staged...
⚠ Running tasks for staged files...
  ✔ package.json — 2 files
    ✔ *.ts — 2 files
      ✔ eslint --fix
      ✔ prettier --write
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
```

**5. If checks pass:**
```
[main abc1234] feat: update config and logger
 2 files changed, 10 insertions(+), 5 deletions(-)
```

**6. If checks fail:**
```
✖ eslint --fix:
  src/config/config.ts
    10:5  error  'unused' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)

husky - pre-commit hook exited with code 1 (error)
```

**Commit is blocked** - developer must fix issues and try again.

---

## What Gets Checked

### ESLint Rules

**Runs:** `eslint --fix`

**Checks:**
- TypeScript type safety
- Unused variables
- No `any` types (strict mode)
- Import order
- Code complexity
- Best practices

**Auto-fixes:**
- Import sorting
- Semicolons
- Spacing
- Simple violations

**Blocks commit if:**
- Type errors
- Unused variables (can't auto-fix)
- `any` types (can't auto-fix)
- Other violations that require manual fixes

---

### Prettier Formatting

**Runs:** `prettier --write`

**Checks:**
- Consistent indentation (2 spaces)
- Line length (80 chars)
- Quote style (single quotes)
- Trailing commas
- Semicolons

**Auto-fixes:**
- All formatting issues
- Modifies staged files in place

**Blocks commit if:**
- Prettier crashes (rare)
- File write errors

---

## Installation for New Developers

### Automatic (Recommended)

```bash
# Clone repo
git clone https://github.com/amuaapps/analytics-service.git
cd analytics-service

# Install dependencies (hooks install automatically)
npm install

# Hooks are now active!
```

**That's it!** The `prepare` script runs automatically and installs hooks.

---

### Manual (If Needed)

If hooks aren't working:

```bash
# Manually install hooks
npm run prepare

# Verify installation
ls -la .git/hooks/
# Should see: pre-commit -> ../.husky/pre-commit
```

---

## Testing the Hook

### Test 1: Verify Hook Exists

```bash
# Check hook is installed
cat .git/hooks/pre-commit

# Should output:
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged
```

---

### Test 2: Create Badly Formatted File

```bash
# Create test file with bad formatting
cat > test.ts << 'EOF'
const   badFormatting=   {
  foo:    "bar",
    baz: "qux"
};
export default badFormatting;
EOF

# Stage and commit
git add test.ts
git commit -m "test"

# Hook should run and auto-fix formatting
# File will be reformatted to:
const badFormatting = {
  foo: 'bar',
  baz: 'qux',
};
export default badFormatting;
```

---

### Test 3: Create File with Lint Error

```bash
# Create file with unused variable
cat > test.ts << 'EOF'
const unused = 'this will fail';
const used = 'this is fine';
export default used;
EOF

# Stage and commit
git add test.ts
git commit -m "test"

# Hook should BLOCK commit with error:
# ✖ eslint --fix:
#   test.ts
#     1:7  error  'unused' is defined but never used
```

---

## Bypassing Hooks (Emergency Only)

**Not recommended**, but if absolutely necessary:

```bash
# Skip pre-commit hook
git commit --no-verify -m "emergency fix"
```

**When to use:**
- Emergency hotfix
- CI is down and you need to push
- Hook is broken (report to team immediately)

**Never use for:**
- "I don't want to fix linting errors"
- "I'm in a hurry"
- Regular development

---

## Configuration

### Customizing lint-staged

**File:** `package.json`

**Current config:**
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

**Add more file types:**
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.json": [
      "prettier --write"
    ],
    "*.md": [
      "prettier --write"
    ]
  }
}
```

**Add tests:**
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write",
      "npm run test:unit -- --findRelatedTests --passWithNoTests"
    ]
  }
}
```

---

### Adding More Hooks

**Create commit-msg hook:**
```bash
# Create .husky/commit-msg
cat > .husky/commit-msg << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Enforce conventional commits
npx --no -- commitlint --edit $1
EOF

chmod +x .husky/commit-msg
```

**Create pre-push hook:**
```bash
# Create .husky/pre-push
cat > .husky/pre-push << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run tests before push
npm test
EOF

chmod +x .husky/pre-push
```

---

## Benefits

### 1. Consistent Code Quality

**Before Husky:**
```typescript
// Developer A commits
const foo={bar:"baz"}

// Developer B commits
const foo = { bar: 'baz' };
```

**After Husky:**
```typescript
// All developers commit
const foo = { bar: 'baz' };
```

**Result:** Consistent formatting across entire codebase

---

### 2. Catch Issues Early

**Before Husky:**
```
Developer commits → Push → CI runs → Linting fails → Fix → Push again
Time: 10-15 minutes
```

**After Husky:**
```
Developer commits → Hook catches issue → Fix → Commit succeeds
Time: 1-2 minutes
```

**Result:** Faster feedback loop, less CI waste

---

### 3. Automatic Fixes

**Before Husky:**
```bash
# Developer manually runs
npm run lint:fix
npm run format
git add .
git commit
```

**After Husky:**
```bash
# Hook automatically runs
git commit
# Files auto-fixed and committed
```

**Result:** Less manual work, fewer forgotten steps

---

### 4. Prevent Bad Commits

**Before Husky:**
- Unused variables committed
- Type errors committed
- Unformatted code committed
- CI catches issues (too late)

**After Husky:**
- Hooks block bad commits
- Developer fixes issues immediately
- Only clean code reaches CI

**Result:** Cleaner Git history, fewer CI failures

---

## Troubleshooting

### Hooks Not Running

**Symptom:** Commits succeed without running checks

**Solutions:**

1. **Verify hooks installed:**
```bash
ls -la .git/hooks/pre-commit
# Should be a symlink to .husky/pre-commit
```

2. **Reinstall hooks:**
```bash
npm run prepare
```

3. **Check Git version:**
```bash
git --version
# Should be >= 2.9.0
```

4. **Verify Husky directory:**
```bash
ls -la .husky/
# Should contain pre-commit file
```

---

### Hook Fails on CI

**Symptom:** `husky install` fails in CI

**Solution:** Already handled by `|| true` in prepare script

```json
{
  "scripts": {
    "prepare": "husky install || true"
  }
}
```

**Why it works:**
- CI doesn't need Git hooks
- `|| true` prevents failure
- Hooks only needed for local development

---

### Permission Denied

**Symptom:** `permission denied: .husky/pre-commit`

**Solution:**
```bash
chmod +x .husky/pre-commit
```

---

### Slow Hook Execution

**Symptom:** Commits take a long time

**Cause:** Checking too many files

**Solution:** lint-staged already optimized (only staged files)

**If still slow:**
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix --max-warnings=0",
      "prettier --write"
    ]
  }
}
```

Remove `--max-warnings=0` if too strict.

---

## Files Modified

1. **`.husky/pre-commit`** (created)
   - Pre-commit hook script
   - Runs `lint-staged` on staged files

2. **`README.md`** (updated)
   - Added Git Hooks section in Local Development
   - Documented automatic setup
   - Explained what runs on pre-commit

3. **`docs/session-notes/HUSKY_PRE_COMMIT_SETUP.md`** (created)
   - Full documentation of setup
   - Testing instructions
   - Troubleshooting guide

---

## Verification

### ✅ Hook Installed

```bash
$ npm run prepare
husky - Git hooks installed
```

### ✅ Hook Runs on Commit

```bash
$ git commit -m "test"
✔ Preparing lint-staged...
⚠ Running tasks for staged files...
  ✔ package.json — 1 file
    ✔ *.ts — 1 file
      ✔ eslint --fix
      ✔ prettier --write
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
```

### ✅ Hook Blocks Bad Commits

```bash
$ git commit -m "test"
✖ eslint --fix:
  test.ts
    1:7  error  'unused' is defined but never used

husky - pre-commit hook exited with code 1 (error)
```

---

## Key Learnings

### 1. Husky Prepare Script is Critical

**Pattern:**
```json
{
  "scripts": {
    "prepare": "husky install || true"
  }
}
```

**Why:**
- Runs automatically after `npm install`
- Installs hooks for all developers
- `|| true` prevents CI failures

**Benefit:** Zero-config setup for new developers

---

### 2. lint-staged Optimizes Performance

**Pattern:**
```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

**Why:**
- Only checks staged files (not entire codebase)
- Fast feedback (seconds, not minutes)
- Auto-fixes when possible

**Benefit:** Fast pre-commit checks

---

### 3. Hooks Should Auto-Fix When Possible

**Pattern:**
```bash
eslint --fix        # Auto-fix linting issues
prettier --write    # Auto-format code
```

**Why:**
- Reduces developer friction
- Fixes simple issues automatically
- Only blocks on issues that need manual fixes

**Benefit:** Developer-friendly enforcement

---

## Conclusion

**Root cause:** No automated code quality enforcement before commits

**Solution:**
1. Added `.husky/pre-commit` hook
2. Hook runs `lint-staged` on staged `.ts` files
3. ESLint auto-fixes linting issues
4. Prettier auto-formats code
5. Commit blocked if checks fail
6. Documented in README

**Impact:**
- ✅ Consistent code quality across all commits
- ✅ Catch issues before CI (faster feedback)
- ✅ Automatic fixes reduce manual work
- ✅ Prevent bad commits from reaching repository
- ✅ Zero-config setup for new developers

**Status:** Production-ready ✅
