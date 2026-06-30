---
name: Dependency Management — Adoption Judgment & Version Hygiene (Dependency Management)
description: A stack-neutral guide for judging whether to add a new third-party dependency (value vs. cost), preserving reproducibility with lock files and version pins, and keeping the tree healthy through regular small updates and removal of unused ones. Read it when adding, replacing, or updating a library, or when reviewing a dependency manifest. Vulnerability scanning and automated patching are handled by `dependency-scanning`. Keywords: dependency, lockfile, version pinning, transitive, license, supply-chain, hallucinated-package, dead-dependency.
rules:
  - "A dependency is a cost — before adding, weigh bundle size, maintenance, security surface, and license, and first see whether the standard library or an already-used dependency solves it."
  - "Keep dependencies minimal — don't pull in a large package for one or two functions, and remove a dependency the moment it goes unused."
  - "Guarantee reproducibility — always commit the lock file and pin versions (or a narrow range) to eliminate 'it worked on my machine'."
  - "Update regularly in small steps — do small updates often, and don't batch years' worth all at once."
  - "Check the license — review the license before adopting, and don't pull in anything risky under company policy (e.g. strong copyleft)."
  - "Beware hallucinated package names — verify that the package name in an AI-generated install command actually exists and is correct in the official registry before installing."
tags:
  - "dependency"
  - "lockfile"
  - "version pinning"
  - "transitive"
  - "license"
  - "supply-chain"
  - "hallucinated-package"
  - "dead-dependency"
foundational: true
---

# 📦 Dependency Management — Adoption Judgment & Version Hygiene

> Treat dependencies not as "free" but as a cost, so additions are made cautiously, versions are pinned reproducibly, and the tree is kept small and current. Read it when adding or updating a library or reviewing a dependency file.

The most common dependency mistake AI agents make is **installing a new package on the spot even for trivial things, and inventing package names that don't exist**. Every dependency brings along bundle size, maintenance burden, supply-chain attack surface, and license obligations. Nailing the add decision down as a rule makes even the agent ask "do I really need this?" first.
> This document covers only **the add/no-add judgment and version hygiene**. Vulnerability (CVE) scanning, automated patching, and CI audit gates are handled by `dependency-scanning`.

## 1. Core Principles

- A dependency is a cost — before adding, weigh bundle size, maintenance, security surface, and license, and first see whether the standard library or an already-used dependency solves it.
- Keep dependencies minimal — don't pull in a large package for one or two functions, and remove a dependency the moment it goes unused.
- Guarantee reproducibility — always commit the lock file and pin versions (or a narrow range) to eliminate "it worked on my machine".
- Update regularly in small steps — do small updates often, and don't batch years' worth all at once.
- Check the license — review the license before adopting, and don't pull in anything risky under company policy (e.g. strong copyleft).
- Beware hallucinated package names — verify that the package name in an AI-generated install command actually exists and is correct in the official registry before installing.

## 2. Rules

### 2-1. Weigh the cost before adding (do you really need it?)

A new dependency must pass the following to be added.

| Check | Question |
|---|---|
| Alternative | Can't the standard library/language feature or an existing dependency do it? |
| Scale | Is the package and its transitive tree excessive relative to the feature you use? |
| Health | Are recent updates, downloads, and issue responses alive? (avoid abandoned packages) |
| License | Does it fit company policy? |

```text
// ❌ Forbidden — adding a package for a one-line utility
npm install is-even        // n % 2 === 0 directly is enough

// ✅ Recommended — standard/existing means first, a trustworthy package only when truly needed
const isEven = (n) => n % 2 === 0
```

### 2-2. Commit the lock file + pin versions (reproducibility)

```text
// ❌ Forbidden — uncommitted lock file + unbounded range → version differs on every install
adding lockfile to .gitignore
"some-lib": "*"   // or "latest"

// ✅ Recommended — commit the lock file + fix the version (or a narrow range)
git add <lockfile>          // package-lock.json, poetry.lock, gradle.lockfile, etc.
"some-lib": "4.2.1"         // pin, or "~4.2.1" per policy
```

- The lock file fixes the real installed versions (including transitive) — **commit it without fail**.
- Keep the ranges in the manifest (package.json etc.) narrow. `*`/`latest` break build reproducibility, so they're forbidden.
- CI/deploy installs based on the lock file (`npm ci` etc.) to prevent re-interpreting the manifest.

### 2-3. Regular small updates

```text
// ❌ Forbidden — a single major jump after 2 years of neglect → exploding changes, debugging hell
dozens of major upgrades all at once

// ✅ Recommended — small and frequent, one batch at a time + verified by tests
periodically do patch/minor first; handle majors individually after reading the changelog
```

- Small updates often → each change is small, making regressions easy to find.
- Always verify with tests after updating. (Related: `ai-generated-code-review`)
- Security patch automation (Dependabot/Renovate etc.) follows `dependency-scanning` per the boundary above.

### 2-4. Remove unused dependencies & separate them

```text
// ❌ Forbidden — a dependency left in the manifest though unused, prod/dev mixed up
the import is gone but the dependency remains
a build tool placed in runtime dependencies

// ✅ Recommended — clean up unused + separate runtime/dev dependencies
remove dependencies with no use site (e.g. a depcheck-style check)
runtime in dependencies, build/test in devDependencies (or an equivalent group)
```

### 2-5. Watch for hallucinated package names (supply-chain safety)

```text
// ❌ Forbidden — installing a plausible name AI suggested without verification (typo/ghost package = slopsquatting risk)
npm install react-http-client   // existence unverified

// ✅ Recommended — install after confirming the exact name/owner in the official registry/official docs
confirm the package name, downloads, repository on the official page → install
```

## 3. Common Mistakes

What AI often produces — filter it during review.

- ❌ Adding a package for one line of logic (unnecessary transitive tree/attack surface)
- ❌ Uncommitted lock file or `*`/`latest` range → unreproducible builds
- ❌ Putting off updates until a single major explosion → giant PR, untraceable regressions
- ❌ Leaving unused dependencies, not separating runtime/dev dependencies
- ❌ Adopting without checking the license → policy violation discovered at deploy time
- ❌ Installing a nonexistent or typo'd package name as is (supply-chain risk)

> **Application tip**: Nailing one line into AGENTS.md / the rules file — "new dependency additions require justification, standard library first, verify the package name before installing" — makes the agent uphold this standard every time. (Effective when used with the `agent-rules-file` skill.)

## 4. Checklist

- [ ] Is the new dependency really needed — is it irreplaceable by the standard library/an existing dependency
- [ ] Did you commit the lock file and pin the version (or a narrow range) (no `*`/`latest`)
- [ ] Did you update in small frequent steps and verify with tests after updating
- [ ] Did you remove unused dependencies and separate runtime/dev dependencies
- [ ] Does the adopted library's license fit company policy
- [ ] Is the installed package name an exact name that actually exists in the official registry (not a hallucination/typo)
