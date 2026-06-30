---
name: Dependency Security Scanning (SCA)
description: A foundational, general-purpose automation standard that uses Software Composition Analysis (SCA) to detect, track, and patch known vulnerabilities in third-party dependencies. Covers CI gating, automated patch PRs, severity-based prioritization, and separation of lock files and dependencies. Read it when integrating vulnerability scanning into CI, setting up automated dependency updates, or adopting a new library.
rules:
  - "Detect automatically and continuously: vulnerability databases are updated daily, so a one-time check is not enough. Run repeatedly via CI and a regular schedule to catch newly disclosed vulnerabilities."
  - "Block on severity, pull in patches: gate the build at and above a chosen severity (a warning alone gets ignored), and let automation tools open patches as PRs so people can focus on review and merge."
  - "Keep the attack surface small and reproducible: commit the lock file so the same dependency tree appears everywhere, ship only runtime dependencies to production, and vet new libraries before bringing them in."
tags:
  - "npm audit"
  - "pip-audit"
  - "dependabot"
  - "renovate"
  - "CVE"
  - "package-lock"
  - "requirements.txt"
  - "SBOM"
foundational: true
---

# 🛡️ Dependency Security Scanning (SCA)

> Automatically detect, track, and patch known vulnerabilities hidden in third-party dependencies, and block the severe ones at the build stage. Read this when attaching scanning to a CI pipeline, setting up automated dependency updates, or adopting a new library. It is a general-purpose standard that is not tied to a specific package manager (npm/pip/Maven, etc.) or CI tool (GitHub Actions/Dependabot, etc.). For rules on managing the dependencies themselves, such as version pinning and range policies, also see `dependency-management`.

## 1. Core Principles

There is a single starting point — **every third-party package you pull in (and the transitive dependencies it in turn pulls in) is an attack surface.** Do not assume "someone else made it, so it's safe." From this, the following follow.

- **Detect automatically and continuously**: vulnerability databases are updated daily, so a one-time check is not enough. Run repeatedly via CI and a regular schedule to catch newly disclosed vulnerabilities.
- **Block on severity, pull in patches**: gate the build at and above a chosen severity (a warning alone gets ignored), and let automation tools open security patches as PRs so people can focus on review and merge.
- **Keep the attack surface small and reproducible**: commit the lock file so the same dependency tree appears everywhere, ship only runtime dependencies to production, and vet new libraries before bringing them in.

Concrete practices are covered with ✅/❌ in the §2 rules.

## 2. Rules

### 2-1. Do not trust external dependencies unconditionally
- Do not assume "it's a widely used package, so it's safe"; treat both direct and transitive dependencies as scanning targets.
- Vulnerabilities arise not only in the packages you call directly but also in the deep dependencies those packages pull in. Detect them all the way down to transitive dependencies.

```text
// ❌ Forbidden — just add it "because it's famous," with no check, and call it done
add some-popular-pkg            // used without knowing what vulnerabilities come along

// ✅ Recommended — make both direct and transitive dependencies scanning targets
scan(all dependencies incl. transitive) → use only what passes
```

### 2-2. Integrate vulnerability scanning into CI and block the build on severity
- Run dependency vulnerability scanning automatically on every PR/build, and re-run it on a regular schedule rather than once, so new vulnerabilities are caught even when the code does not change.
- When something at or above the chosen severity threshold (e.g., CRITICAL) is found, **fail** the pipeline. Do not just leave a warning and let it pass.
- Where to place the scan stage in the pipeline and how to block downstream steps on failure (stage serialization, fail-fast) follows the `CI/CD Pipeline Standard`. This standard defines "what to block at which severity" (scanner, threshold, gating policy).

```text
// ❌ Forbidden — print scan results to logs only and always pass
scan(deps); build_status = SUCCESS    // deploys even if there is a CRITICAL

// ✅ Recommended — fail the pipeline at or above the threshold (gating)
result = scan(deps)
if result.maxSeverity >= CRITICAL: fail build   // blocks entry into production
```

### 2-3. Receive security patches as automated proposals
- Enable an automated dependency update tool to receive security patches for vulnerable dependencies as automated change requests (PR/MR).
- Group security updates separately and review/merge them first. Keep people from manually chasing vulnerability advisories.

```text
// ❌ Forbidden — people manually track advisories, ultimately missing/delaying patches
"someone will bump the dependency versions sometime"      // security patches left for months

// ✅ Recommended — the automation tool opens patch PRs, and people review/merge
auto-update tool → opens PR(security patch) → merge after review
```

### 2-4. Vulnerability prioritization and response deadline (SLA)
- Set response deadlines according to a standard severity score (e.g., CVSS) and handle the most critical ones first.
- **"The more severe, the faster" is the principle, and the specific deadlines are set by the team.** The table below is just a starting-point example, so adjust the thresholds and deadlines to your risk tolerance.

| Severity (e.g., CVSS) | Grade | Response deadline — example (team adjusts) |
|-----------------|--------|----------------|
| 9.0–10.0 | CRITICAL | As fast as possible (e.g., within a few days) |
| 7.0–8.9 | HIGH | Quickly (e.g., within 1–2 weeks) |
| 4.0–6.9 | MEDIUM | Plan it in (e.g., within a month) |
| 0.1–3.9 | LOW | Next release |

### 2-5. Criteria for adopting a new library
- Before adopting a new library, check its maintenance activity, popularity, license, and existing vulnerabilities.
- Do not adopt neglected packages (long un-updated, no issue responses), because they will not get patches for future vulnerabilities.

```text
// ❌ Forbidden — just add a package with an old last update, neglected issues, and unchecked vulnerabilities
add some-abandoned-pkg

// ✅ Recommended — add after checking before adoption
// - Last update: recent (e.g., within 6 months)
// - Issue/PR response speed: reasonable
// - Usage/popularity: appropriate for the project's nature
// - License: complies with company policy (beware of restrictive licenses)
// - No known vulnerabilities (confirmed in advance by scanning before adoption)
scan(candidate) → if clean, add trusted-pkg
```

### 2-6. Commit the lock file and separate production/development dependencies
- Always commit to version control a lock file that pins the exact resolved versions, to guarantee reproducible builds.
- Include only the dependencies needed at runtime in production artifacts, and exclude development dependencies used for build, test, and lint.

```text
// ❌ Forbidden — lock file not committed + development dependencies included in production
ignore(lockfile)                 // different versions per environment → not reproducible
build(prod, include dev deps)    // unnecessarily expands the attack surface

// ✅ Recommended — commit the lock file + only runtime dependencies in production
commit(lockfile)                 // same dependency tree wherever you build
build(prod, runtime deps only)   // exclude development dependencies
```

## 3. Common Mistakes

Only the traps people fall into despite knowing the rules are listed (repetition of the rules is omitted).

- **Only looking at direct dependencies** → vulnerabilities arise more often in the transitive dependencies that your called packages pull in turn. Always include transitive dependencies in the scan scope.
- **Treating scan results as warnings only** → if you let the build pass even with a CRITICAL, nobody looks at it. Blocking at and above the threshold with gating is what makes it meaningful.
- **Thinking that passing once is the end** → new vulnerabilities are disclosed daily even if you do not change the code. Without a regular scheduled scan, they are left as-is.
- **Bulk response that ignores severity** → handling without prioritization delays response to critical vulnerabilities. Line them up by per-severity deadlines (§2-4).

## 4. Checklist
- [ ] Are both direct and transitive dependencies treated as vulnerability scanning targets?
- [ ] Is dependency scanning integrated into CI, and does the build **fail** at or above the critical severity?
- [ ] Is the scan re-run on a regular schedule even without code changes?
- [ ] Are security patch change requests (PR/MR) received via an automated update tool?
- [ ] Are response deadlines (SLA) matching severity (e.g., CVSS) set and met?
- [ ] Is the lock file committed to version control to guarantee reproducible builds?
- [ ] Are development dependencies excluded from production artifacts?
- [ ] Before adopting a new library, are its maintenance activity, popularity, license, and existing vulnerabilities checked?

## Appendix: Examples by Stack

> The following are reference implementation examples. The principles and rules in 1–4 above are the standard; the appendix is just an application of them. Add examples matching the stack your team uses (package manager, CI tool) in the same pattern.

### Examples by tool (npm/pip/Dependabot, etc.)

#### CI pipeline integration

**npm (Node.js)**
```yaml
# GitHub Actions
- name: Security Audit
  run: npm audit --audit-level=critical
  # exit code 1 if there is a CRITICAL vulnerability → build fails
```

**Python**
```yaml
- name: Pip Audit
  run: |
    pip install pip-audit
    pip-audit --requirement requirements.txt --fail-on CRITICAL
```

**Java (Maven)**
```yaml
- name: OWASP Dependency Check
  run: mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=9
```

#### Dependabot automated updates
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      security-updates:
        applies-to: security-updates
        patterns: ["*"]

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
```

#### Pre-adoption check for a library (npm example)

For adoption criteria, see §2-5. The pre-scan command in npm:

```bash
# ❌ adding a neglected package without checking
npm install some-abandoned-pkg

# ✅ add after confirming vulnerabilities in advance before adoption (can substitute snyk test, etc.)
npm audit && npm install trusted-pkg
```

#### Committing the lock file and separating dependencies (npm example)

For the principle, see §2-6. The commands in npm:

```bash
# ✅ commit the lock file (poetry.lock, requirements.txt are the same)
git add package-lock.json

# ✅ exclude devDependencies in the production build
npm ci --omit=dev
```
