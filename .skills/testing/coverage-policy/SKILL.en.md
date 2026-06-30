---
name: Test Coverage Policy (Coverage Policy)
description: A universal standard for test coverage — targets based on business logic paths rather than lines, differentiated targets per code type, branch coverage, and CI gating. Read when setting coverage targets/thresholds, attaching CI gating, or inspecting test gaps with a report. Independent of any specific tool/language.
rules:
  - "Coverage is a signal, not a goal: the % is merely an indicator that reveals 'code the tests do not reach,' not proof of quality. Use it to point at 'where to look more,' not as a number."
  - "Paths, not lines: look at whether the branch/boundary paths of business logic are verified, not the number of executed lines."
  - "Context-specific targets, not a single line: divide targets by code type (bug cost, compensating layers), and exclude code with no measurement value from the denominator."
  - "Enforcement by CI, not people: put the threshold and the new-code-regression block in the pipeline so regressions are prevented without people checking every time."
tags:
  - "coverage"
  - "lcov"
  - "istanbul"
  - "pytest-cov"
  - "codecov"
  - "nyc"
  - "--coverage"
  - "coverageThreshold"
---

# 📊 Test Coverage Policy (Coverage Policy)

> Measure meaningful coverage based on business logic paths rather than the number of lines, apply differentiated targets per code type, and gate it in CI. Read when setting coverage targets/thresholds, attaching CI gating, or inspecting test gaps. This is a universal standard not tied to any specific measurement tool/language.

## 1. Core Principles
- **Coverage is a signal, not a goal**: the % is merely an indicator that reveals "code the tests do not reach," not proof of quality. Use it to point at "where to look more," not as a number.
- **Paths, not lines**: look at whether the branch/boundary paths of business logic are verified, not the number of executed lines.
- **Context-specific targets, not a single line**: divide targets by code type (bug cost, compensating layers), and exclude code with no measurement value from the denominator.
- **Enforcement by CI, not people**: put the threshold and the new-code-regression block in the pipeline so regressions are prevented without people checking every time.

## 2. Rules

### 2-1. Set targets based on business logic paths, not lines
- Do not write tests without assertions or meaningless calls just to fill the coverage %.
- The point is not "was this code executed" but "was this code's behavior verified."

```text
// ❌ Forbidden — only steps on lines with no verification (coverage rises but defects are missed)
test: callDiscount(order)            // call only, no result assertion

// ✅ Recommended — verify behavior (path) with assertions
test: callDiscount(vipOrder) == 20%  // verify the VIP branch result
test: callDiscount(normalOrder) == 0 // verify the normal branch result
```

### 2-2. Differentiated targets per code type
- Do not apply a single % target uniformly to all code. Divide targets by bug cost and compensating means (integration/E2E).
- The figures below are merely a **starting-point example (teams adjust)**, not a fixed standard. Carry over only the relative priority (core > compensating layers).

| Code type | Minimum target (starting point) | Reason |
|-----------|-----------|------|
| Business service (core logic) | 80% | High bug cost |
| Utility/helper | 90% | High reusability, risk of error propagation |
| API/entry-point router | 60% | Integration tests compensate |
| UI component | 60% | E2E compensates |
| Generated code/migration/config | Excluded | Not subject to maintenance/verification |

```text
// ❌ Forbidden — uniform 80% across all code, treating core logic and boilerplate the same
all: 80%

// ✅ Recommended — differentiated per type
business: 80%, util: 90%, ui/router: 60%, generated: excluded
```

### 2-3. Look at branch coverage, not lines
- Even at 100% line coverage, if some paths of `if/else`, `switch`, `try/catch`, ternary, or short-circuit evaluation are not stepped through, bugs hide.
- Include the **branch** item in the threshold, not just lines, and add boundary-condition tests for the missed branches.

```text
Branch coverage = whether each path of conditional branches (if/else/switch/try-catch, etc.) was executed

// ❌ Line coverage is 100% but the else branch is untested
if (isValid) {
  doSomething();   // tested
} else {
  handleError();   // ← untested — a bug may hide
}

// ✅ Verify both branches (the isValid=true / false cases each)
```

### 2-4. Exclude files with no measurement value
- Exclude test files, stories, entry points, plugins, generated code, migrations, and config files from measurement.
- Including these files inflates or shrinks the denominator, distorting whether the target is met, and buries the report in noise.

```text
// ✅ Recommended — specify the exclusion list (tool-independent concept)
exclude:
  - Test/spec files (*.test.*, *.spec.*)
  - Stories/fixtures
  - Entry points/bootstrap (app start point)
  - Migrations / generated code
  - Config files
```

### 2-5. Gate the threshold in CI
- If the coverage threshold is not met, fail the build (non-zero exit code) — do not output only a report and let it pass.
- Put gating in the pipeline so it is enforced without people checking every time.

```text
// ❌ Forbidden — only output coverage and pass (no gate)
run tests with coverage → always succeeds

// ✅ Recommended — fail the build if the threshold is not met
run tests with coverage AND fail-under(threshold)
  → exit code 1 if below → build failure
```

### 2-6. Block new code's coverage regression at the PR stage
- A whole-% gate alone can let newly added unverified code pass, diluted into the existing coverage.
- Set a limit on the regression amount based on the diff/new code to block PRs where coverage drops before merge.

```text
// ✅ Recommended — absolute threshold + diff regression limit together
gate: whole ≥ target  AND  PR diff coverage drop ≤ allowed margin
  → block PRs mixed with unverified new code
```

## 3. Common Mistakes

Symptoms that appear when a rule (§2) is violated — when you see one, return to the relevant rule.

- **The number becomes the goal** → calls without assertions raise only the % and miss defects (2-1). Line is 100% but `else`/exception branches are empty (2-3).
- **The denominator is distorted** → a single % applied uniformly mixes core logic and boilerplate (2-2), or generated/config files creep in and the target gets buried in noise (2-4).
- **The gate misses new code** → with only a whole-% gate, new unverified code is diluted and passes (2-6), and outputting only means the threshold is not enforced and it gradually collapses (2-5).

## 4. Checklist
- [ ] Did you set the coverage target based on **business logic paths** rather than line count?
- [ ] Did you set **differentiated targets** per code type (core logic higher, integration/E2E compensating layers lower)?
- [ ] Did you **exclude** generated code, migrations, config, entry points, and test files from measurement?
- [ ] Did you include and check **branch coverage**, not just lines, in the threshold?
- [ ] Does the **build fail** in CI when the threshold is not met (not output only)?
- [ ] Do you block **new code/diff coverage regression** at the PR stage?
- [ ] Did you add tests for missed branches/boundary conditions (not number-filling tests)?

## Appendix: Examples by Stack

> The below are reference implementation examples. Add examples matching the stack your team uses (e.g., Jest/nyc, Go cover, JaCoCo, Coveralls) following the same pattern. The principles and rules in 1–4 above are the standard; the appendix is merely an application example.

### Examples by Tool (Vitest / pytest-cov / Codecov, etc.)

#### Vitest (Vue/JS)

Specify thresholds, and exclude files with no measurement value such as tests, stories, entry points, and plugins.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      exclude: [
        "node_modules/",
        "src/**/*.test.*",
        "src/**/*.stories.*",
        "src/main.ts",
        "src/plugins/",
      ],
    },
  },
});
```

#### pytest-cov (Python)

With `--cov-fail-under`, fail the build when the threshold is not met, and exclude migrations, tests, and config from measurement.

```ini
# pyproject.toml
[tool.pytest.ini_options]
addopts = "--cov=app --cov-report=html --cov-report=term-missing --cov-fail-under=80"

[tool.coverage.run]
omit = [
    "*/migrations/*",
    "*/tests/*",
    "*/__init__.py",
    "*/config.py",
]
```

#### CI gating + Codecov (GitHub Actions)

If the threshold is not met, fail the build, and block new code's coverage regression at the PR stage.

```yaml
# GitHub Actions
- name: 테스트 & 커버리지
  run: |
    npm test -- --coverage
    # 커버리지 미달 시 종료 코드 1 → 빌드 실패

- name: Codecov 업로드
  uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    fail_ci_if_error: true
    threshold: 5  # 5% 이상 커버리지 하락 시 PR 차단
```
