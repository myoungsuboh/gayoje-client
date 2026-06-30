---
name: CI/CD Pipeline Standard
description: A universal standard for continuous integration/deployment (CI/CD) pipelines — stage separation (lint→test→build→scan→deploy) with blocking on earlier-stage failure, branch-protection merge gates, environment separation with manual approval for production, immutable artifact tagging and rollback, secret management, and caching. Tool-agnostic. Read this when building a pipeline or deciding stages, approvals, and rollback. Keywords: CI, CD, pipeline, build, deploy, branch protection, manual approval, artifact, rollback, GitHub Actions, GitLab CI.
rules:
  - "Merge gates via automated checks: enforce branch-protection rules so every change (PR/MR) can be merged into the integration branch only after CI passes. Running CI without protection rules is meaningless, since a failing change still gets merged."
  - "Separate stages and fail fast: split the pipeline into lint→test→build→security scan→deploy, and skip later stages when an earlier one fails. Put cheap, fast checks (lint) up front and expensive checks (build·deploy) at the back."
  - "Separate environments and require manual approval for production: separate dev·staging·production deployments. Require explicit human approval (manual approval) for production deployment so failures don't propagate without verification."
  - "Build once, promote artifacts: identify build outputs with a content/commit-based unique tag, and instead of rebuilding per environment, promote the same artifact. This lets you track which version was deployed and roll back to a previous version."
  - "Secrets from a secret store, never exposed in logs: keep credentials in the CI platform's secret-management feature (or an external secret store) and confirm they are masked in pipeline logs. Never expose secrets in plaintext environment variables, code, or logs."
  - "Reproducible and fast: install dependencies deterministically from a lock file, and reduce repeat cost with caching. Version-control the pipeline definition as code (pipeline as code)."
tags:
  - "CI"
  - "CD"
  - "pipeline"
  - "build"
  - "deploy"
  - "branch protection"
  - "manual approval"
  - "artifact"
  - "rollback"
  - "GitHub Actions"
  - "GitLab CI"
  - "github-actions"
  - "workflow"
  - ".github/workflows"
  - "on: push"
---

# 🚀 CI/CD Pipeline Standard

> Automate the pipeline by splitting it into stages from lint to deploy, and release only changes that pass verification, at consistent quality. Block merges with branch protection, block production deployment with manual approval, and tag artifacts so they are traceable to guarantee rollback. Read this when building a new pipeline or deciding stages, environment separation, approvals, secrets, and rollback. It is a universal standard not tied to any specific CI tool (GitHub Actions, GitLab CI, Jenkins, etc.).

## 1. Core Principles
- **Merge gates via automated checks**: enforce branch-protection rules so every change (PR/MR) can be merged into the integration branch only after CI passes. Running CI without protection rules is meaningless, since a failing change still gets merged.
- **Separate stages and fail fast**: split the pipeline into lint→test→build→security scan→deploy, and skip later stages when an earlier one fails. Put cheap, fast checks (lint) up front and expensive checks (build·deploy) at the back.
- **Separate environments and require manual approval for production**: separate dev·staging·production deployments. Require explicit human approval (manual approval) for production deployment so failures don't propagate without verification.
- **Build once, promote artifacts**: identify build outputs with a content/commit-based unique tag, and instead of rebuilding per environment, promote the same artifact. This lets you track which version was deployed and roll back to a previous version.
- **Secrets from a secret store, never exposed in logs**: keep credentials in the CI platform's secret-management feature (or an external secret store) and confirm they are masked in pipeline logs. Never expose secrets in plaintext environment variables, code, or logs.
- **Reproducible and fast**: install dependencies deterministically from a lock file, and reduce repeat cost with caching. Version-control the pipeline definition as code (pipeline as code).

## 2. Rules

### 2-1. Enforce passing CI as a merge condition (branch protection)
- Apply protection rules to the integration branch (main/develop, etc.) so a merge happens only after required CI checks pass.
- Don't allow a state where "CI runs but you can merge even on failure" — the check result must act as a gate.

```text
// ❌ Forbidden — CI runs but merge is possible even on failure (no gate)
PR → CI fails → merge button still pressable

// ✅ Recommended — require passing required checks as a merge precondition
PR → merge allowed only after required CI checks pass
```

### 2-2. Serialize stages and block later stages on earlier failure
- Split the pipeline into lint→test→build→security scan→deploy stages, declare inter-stage dependencies, and don't run later stages when an earlier one fails.
- Don't cram everything into one job, which blurs "where it broke." Put fast checks up front to get feedback quickly.

```text
// ❌ Forbidden — everything crammed into one job; runs to the end even if lint fails, wasting time
job all: lint; test; build; scan; deploy   // unclear what broke

// ✅ Recommended — stage separation + dependencies, skip later stages on earlier failure
lint → test → build → scan → deploy        // each stage depends on the previous one's success
```

### 2-3. Environment separation + manual approval for production
- Even for the same artifact, separate the dev·staging·production deployment paths and isolate per-environment config/secrets at the environment level.
- Don't let production deployment flow through automatically; require explicit human approval. Make clear which branch/condition goes to which environment.

```text
// ❌ Forbidden — an integration-branch merge immediately auto-deploys to production
merge → production auto-deploy            // failures propagate without verification

// ✅ Recommended — environment separation + manual approval gate for production
develop → staging auto-deploy
main    → (manual approval) → production deploy
```

### 2-4. Artifact tagging + rollback (build once, promote)
- Attach a content/commit-based unique tag to build outputs to track which version was deployed where.
- Instead of rebuilding per environment, promote the same artifact and keep it so you can instantly roll back to the last known-good version.

```text
// ❌ Forbidden — no tag, rebuild per environment → unclear rollback target
staging:    build → deploy
production: build(again) → deploy        // can't track deployed version or rollback target

// ✅ Recommended — build once with a unique tag then promote, rollback possible
build → artifact:<commit-hash>
both staging/production promote the same artifact:<commit-hash>
rollback = redeploy the last known-good tag
```

### 2-5. Secrets from a secret store, log masking
- Inject credentials·tokens·keys from the CI platform's secret-management feature (or an external secret store), separated per environment.
- Confirm secrets are masked in pipeline logs, and never expose them in plaintext environment variables, source code, or logs.

```text
// ❌ Forbidden — secrets exposed in plaintext in code/logs
DEPLOY_TOKEN = "ghp_xxxxxxxx"          // plaintext in code/logs → leak
echo $DEPLOY_TOKEN                      // printed as-is in logs

// ✅ Recommended — inject from a secret store, confirm log masking
DEPLOY_TOKEN = <injected from secret store>  // masked as *** in logs
```

### 2-6. Deterministic install + caching for speed
- Install dependencies deterministically from a lock file to guarantee build reproducibility.
- Cache dependencies·build outputs to reduce repeat cost, but tie the cache key to content (e.g., the lock file hash) so a stale cache isn't used incorrectly.

```text
// ✅ Recommended — lock-based deterministic install + content-based cache key
install(lockfile)                       // same input → same result
cache key = hash(lockfile)              // cache invalidated when lock changes
```

## 3. Common Mistakes
- **Running CI without branch protection** → a failing check still merges, so it doesn't act as a gate.
- **Not separating stages** → even on a lint failure it runs all the way through test·build·deploy, wasting time and blurring where it broke.
- **Auto-deploying to production** → it deploys straight through without human verification, propagating failures as-is. Put a manual-approval gate.
- **Exposing secrets in plaintext environment variables·logs** → credentials leak. Inject from a secret store and confirm log masking.
- **No unique artifact tag / rebuilding per environment** → unclear which version was deployed or what the rollback target is. Build once, tag, then promote.
- **Cache key not tied to content** → even when dependencies change, a stale cache is used and the build drifts.
- **Configuring the pipeline only by hand in the UI** → no change history·review. Version-control the pipeline definition as code.

## 4. Checklist
- [ ] Is there a **branch-protection rule** gating merges on passing CI?
- [ ] Are the **lint→test→build→security scan→deploy** stages separated, skipping later stages on earlier failure?
- [ ] Are dev·staging·production **environments separated**, with production going through **manual approval**?
- [ ] Are artifacts identified by a **unique tag**, built once and promoted, with **rollback** possible?
- [ ] Are secrets managed in a **secret store** and confirmed to be **masked** in logs?
- [ ] Are dependencies installed deterministically **from a lock file** and optimized with **caching**?
- [ ] Is the pipeline definition **version-controlled as code**?

> The scanner choice, severity thresholds, and gating policy for the security-scan stage follow the `Dependency Security Scanning (SCA)` standard (here we only decide stage placement and blocking on failure). For per-stage details such as input validation·exception responses, refer to the relevant skill (`validation-bean`, etc.).

## Appendix: Per-Stack Examples

> The following are reference implementation examples. The principles·rules in 1–4 above are the standard; the appendix is merely an application case. Add examples matching the CI tool your team uses (e.g., GitLab CI, Jenkins, CircleCI) following the same pattern.

### GitHub Actions (GitLab CI, etc.)

Serialize stages with `needs` so later stages are skipped on earlier failure.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: "dist-${{ github.sha }}", path: "dist/" }

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # The scanner choice, severity thresholds, and gating policy follow the `Dependency Security Scanning (SCA)` standard.
      # Here we only decide the "placement" of running scan after build and failing the build when the threshold is exceeded.
      - run: # run SCA scan (exit≠0 when threshold exceeded)
```

#### Deployment pipeline (environment separation + manual approval)
```yaml
  deploy-staging:
    needs: security
    if: github.ref == 'refs/heads/develop'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: "dist-${{ github.sha }}" }
      # deploy command...

  deploy-production:
    needs: security
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://app.example.com
    runs-on: ubuntu-latest
    # environment setting → requires manual approval in GitHub
    steps:
      # deploy command...
```

#### Branch strategy
```
feature/* → develop → PR Review → staging auto-deploy
                    → main → production deploy after manual approval
hotfix/*  → main → production deploy after manual approval
```

#### Optimize speed with caching
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-
```
