---
name: Flaky Test Management (Flaky Test Management)
description: A stack-neutral guide to detecting, quarantining, and root-cause-fixing unstable (flaky) tests that flip between pass and fail. Covers condition-based waits instead of fixed waits, pinning time/randomness/network, test isolation, quarantine + ticket tracking, and prudent retries. Read it when CI goes red intermittently, when re-running makes it pass, or when you hear "that test just breaks now and then." Keywords: flaky-test, nondeterminism, quarantine, retry, race-condition, condition-based-wait, test-isolation.
rules:
  - "A flake is a bug — don't ignore it or blindly retry. Once you can't trust green, the whole test suite is rendered useless."
  - "The cause is usually nondeterminism — fixed waits, ordering dependencies between tests, concurrency races, real network/time, and uncleaned shared state are the main culprits."
  - "Quarantine, but always track — quarantine so it doesn't block the main pipeline, but never leave it untracked without a ticket. Quarantine is a stopgap, not a fix."
  - "Fix the root cause — secure determinism, not by bumping sleeps or raising retry counts."
  - "Retry prudently, with instrumentation — unlimited, global auto-retries hide flakes. Use them sparingly and record the retry rate."
  - "Block inflow and measure — track the flaky rate and screen out incoming flakes in review and CI."
tags:
  - "flaky-test"
  - "nondeterminism"
  - "quarantine"
  - "retry"
  - "race-condition"
  - "condition-based-wait"
  - "test-isolation"
---

# 🎲 Flaky Test Management (Flaky Test Management)

> Detect, quarantine, and root-cause-fix tests that flip between pass/fail without any code change (flaky). Read it when CI goes red intermittently, when re-running makes it pass, or when you hear "that one just breaks now and then."

The real damage of flaky tests is not a single failure but a **collapse of trust** — once you start ignoring red as "probably that thing again," real regressions get buried along with it. That is why a flake is treated not as "annoying noise" but as a **bug to fix**. The cause is usually the test's **nondeterminism** (time, ordering, concurrency, external dependency, shared state), and bumping `sleep` or slathering on retries only masks the symptom.

## 1. Core Principles

- **A flake is a bug** — don't ignore it or blindly retry. Once you can't trust green, the whole test suite is rendered useless.
- **The cause is usually nondeterminism** — fixed waits, ordering dependencies between tests, concurrency races, real network/time, and uncleaned shared state are the main culprits.
- **Quarantine, but always track** — quarantine so it doesn't block the main pipeline, but **never leave it untracked without a ticket**. Quarantine is a stopgap, not a fix.
- **Fix the root cause** — secure determinism, not by bumping `sleep` or raising retry counts.
- **Retry prudently, with instrumentation** — unlimited, global auto-retries hide flakes. Use them sparingly and record the retry rate.
- **Block inflow and measure** — track the flaky rate and screen out incoming flakes in review and CI.

## 2. Rules

### 2-1. Classify the cause first

Before retrying, look at **why it wobbles** first.

| Cause | Signal | Remedy |
|---|---|---|
| Fixed wait (time-based) | assertion after `sleep(n)`, fails only in slow environments | condition-based wait (2-2) |
| Ordering dependency | passes alone, fails in a specific order | test isolation/independence (2-3) |
| Concurrency race | fails only sometimes, increases under load | synchronization, deterministic scheduling, isolation |
| Real external dependency | swayed by network/external-API instability | mock/stub, sandbox (2-4) |
| Time/randomness | fails at midnight, month-end, a specific seed | pin the clock/RNG (2-4) |
| Shared state | swayed by leftovers from a previous test | reset via setup/teardown (2-3) |

### 2-2. No fixed waits → condition-based waits

```text
❌ Forbidden — wait an arbitrary time (fail if slow, waste if fast)
   click("Save"); sleep(3000); expect(toast).visible

✅ Recommended — wait until the desired state (polling/event)
   click("Save"); await waitFor(() => toast.isVisible())   // proceed immediately when the condition is met, with a timeout cap
```

### 2-3. Isolate tests and make them independent of order

```text
❌ Forbidden — depend on data/global state created by a previous test
✅ Recommended — each test creates and cleans up its own state (setup/teardown), resets shared singletons
         run in random order to aggressively flush out ordering dependencies
```

### 2-4. Pin time, randomness, and network

```text
❌ Forbidden — depend on now()/Math.random()/real HTTP → wobbles with environment/timing
✅ Recommended — make it deterministic with a fake clock (fake timer/clock), a fixed seed, network mock/stub
         (for unit/integration isolation see `unit-testing`/`integration-testing`)
```

### 2-5. Quarantine, but track with a ticket

```text
❌ Forbidden — slap on @Disabled / test.skip and stop → forgotten forever, coverage hole
✅ Recommended — separate from the main gate with a quarantine tag (e.g., @Tag("flaky")) + a tracking ticket required
         quarantine is "a stopgap that unblocks the build now"; set a deadline and an owner
```

### 2-6. Retry sparingly, don't hide

```text
❌ Forbidden — global unlimited auto-retries → flakes are masked forever
✅ Recommended — keep the retry cap narrow (e.g., 1–2), but record and aggregate cases that passed on retry
         alert when the retry rate rises → move to root-cause work (a retry is mitigation, not a fix)
```

## 3. Common Mistakes

- ❌ Brushing off red as "that thing again" with a re-run → real regressions get buried too
- ❌ "Fixing" it by bumping `sleep` time → only gets slower and recurs in even slower environments
- ❌ Permanently concealing flakes with global auto-retries
- ❌ Just quarantining and leaving it untracked without a ticket → a silent hole in coverage
- ❌ Verifying only a solo run and merging → misses ordering/shared-state flakes
- ❌ Leaving tests that depend on real network/clock as is

> **Application tip**: run tests in random order in CI and, before merge, repeatedly run changed tests several times to screen out flakes at the entrance. For determinism principles see `unit-testing`/`integration-testing`; for E2E flakes (the most common) see `e2e-testing` as well.

## 4. Checklist

- [ ] Did you classify the cause (time, ordering, concurrency, external dependency, shared state) before retrying/skipping?
- [ ] Are you using condition-based waits instead of fixed `sleep`?
- [ ] Are tests independent of each other (shared state reset) and do they pass in random order too?
- [ ] Did you pin time, randomness, and network (fake timer, seed, mock)?
- [ ] Do quarantined tests have a tracking ticket, owner, and deadline (no leaving them)?
- [ ] Is the retry cap narrow, and do you instrument and surface cases that passed on retry?

## Appendix: Examples by Tool

> The following are per-tool quarantine/retry configuration examples. Add to them to match the runner your team uses. The principles of 1–4 above are the standard; the appendix is merely an application.

### Playwright
```ts
// playwright.config.ts — limited retries in CI only + report for tracking
export default defineConfig({
  retries: process.env.CI ? 2 : 0,   // no unlimited
  reporter: [['html'], ['list']],
})
test.fixme(isFlaky, 'flaky tracking: ISSUE-123')   // quarantine + ticket noted
```

### Jest / Vitest
```ts
test.skip('payment concurrency — flaky, ISSUE-123', async () => { /* ... */ })
// don't abuse auto-retries (jest.retryTimes, file/describe scope) — if you use them, separately aggregate retry passes
```

### JUnit 5 (JVM)
```java
@Tag("flaky")   // tag excluded at the main CI gate + tracking ticket (ISSUE-123)
@Test void paymentConcurrency() { /* ... */ }
```
