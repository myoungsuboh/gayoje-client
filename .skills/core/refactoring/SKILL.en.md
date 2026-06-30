---
name: Refactoring — Behavior-Preserving Improvement (Refactoring)
description: A stack-neutral guide to safely improving only the internal structure of code without changing its observable behavior. Read it when cleaning up code smells (duplication, long functions, tight coupling) or tidying structure before or after adding a feature (pre-completion verification is `verification-before-completion`). Keywords: refactoring, code-smell, technical-debt, boy-scout-rule, behavior-preserving, big-bang-rewrite.
rules:
  - "Refactoring is behavior-preserving — inputs/outputs, side effects, and public API must stay the same. If behavior changes, that's not refactoring but a feature change."
  - "Tests are the safety net — before refactoring, check that tests cover the behavior in question, and if none exist, add them first before starting."
  - "Small steps, verify often — change one thing at a time and confirm green via test/build at every step."
  - "Don't mix feature changes and refactoring in the same commit — it makes review, reverting, and tracing the cause impossible. Separate the commits."
  - "Boy scout rule — leave touched code a little cleaner than you found it. But pull large cleanups unrelated to the current work out separately."
  - "Avoid big-bang rewrites — improve incrementally rather than rewriting wholesale. Don't hide technical debt you can't repay now in code; make it visible as a ticket."
tags:
  - "refactoring"
  - "리팩토링"
  - "code-smell"
  - "technical-debt"
  - "boy-scout-rule"
  - "behavior-preserving"
  - "big-bang-rewrite"
foundational: true
---

# ♻️ Refactoring — Behavior-Preserving Improvement

> Leave observable behavior as-is and safely change only the internal structure. Read it when cleaning up code smells or tidying structure before or after adding a feature.

The most common mistakes AI agents make in refactoring are **slipping in behavior changes while changing structure** and **bulldozing too much at once**. The heart of refactoring is "behavior preservation." Lay a safety net of tests, split into small steps, and verify often, and the AI will produce only safe changes too.

## 1. Core Principles

- Refactoring is **behavior-preserving** — inputs/outputs, side effects, and public API must stay the same. If behavior changes, that's not refactoring but a feature change.
- **Tests are the safety net** — before refactoring, check that tests cover the behavior in question, and if none exist, add them first before starting.
- **Small steps, verify often** — change one thing at a time and confirm green via test/build at every step.
- **Don't mix feature changes and refactoring in the same commit** — it makes review, reverting, and tracing the cause impossible. Separate the commits.
- **Boy scout rule** — leave touched code a little cleaner than you found it. But pull large cleanups unrelated to the current work out separately.
- **Avoid big-bang rewrites** — improve incrementally rather than rewriting wholesale. Don't hide technical debt you can't repay now in code; make it visible as a ticket.

## 2. Rules

### 2-1. Pin down behavior with tests first

Before refactoring, confirm the tests covering the behavior to change are green. If none exist, add them first (characterization tests). (For writing tests see `test-strategy`; for the pre-completion verification procedure see `verification-before-completion`)

```
// ❌ Forbidden — changing structure right away with no tests → no way to know if it broke
splitting functions, renaming… "it'll probably be fine"

// ✅ Recommended — safety net first
1) Confirm tests for existing behavior (add if missing) → green
2) Refactor
3) Re-run the same tests → still green
```

### 2-2. Split into small steps and verify each step

One change per commit. Break a big refactor into a sequence of safe small transformations.

```
// ❌ Forbidden — function extraction + rename + logic cleanup + dependency swap all in one commit
//          if it breaks, you can't find where it broke

// ✅ Recommended — confirm green at each step before the next
Step 1: just rename variables/functions meaningfully  → tests pass
Step 2: extract one chunk from a long function          → tests pass
Step 3: remove duplication                              → tests pass
```

### 2-3. Separate commits for feature changes and refactoring

Even in the same PR, split "refactoring-only" commits from "behavior change" commits. The reviewer can see exactly where behavior changes.

```
// ❌ Forbidden
commit: "Clean up the payment module and apply discount rate 5%→7%"   ← a behavior change hidden in a structure change

// ✅ Recommended
commit 1: "refactor: extract payment calculation logic into a function (behavior identical)"
commit 2: "feat: change discount rate 5%→7%"
```

### 2-4. Use code smells as signals

When you see the signals below, it's a refactoring candidate. But it's not "smells = always fix"; clean up mainly the code you're touching now.

| Smell | Signal | Common remedy |
|---|---|---|
| Duplicate code | the same logic copy-pasted in several places | extract into a shared function/module |
| Long function | one function overruns the screen / does several things | extract functions by meaningful unit |
| Tight coupling | fixing one place breaks a distant one | separate via boundaries/interfaces (see `architecture-layering`) |
| Large parameter list / duplicate conditionals | 5+ arguments, the same branch repeated | bundle into an object / polymorphism / early return |

### 2-5. Incremental instead of big-bang rewrite; make debt visible

```
// ❌ Forbidden — "it's faster to rewrite this whole module" then weeks of standstill and a regression surge

// ✅ Recommended — replace bit by bit (e.g., run old and new code in parallel for a while), keep deployable at every step
//          debt you can't repay now: don't hide it in code, ticket it:  // not a TODO → register as issue #1234
```

## 3. Common Mistakes

What AI often produces — filter these out in review.

- ❌ Refactoring with no tests and ending with "cleaned it up" (behavior preservation unverified)
- ❌ Slipping in changes to behavior, return values, or error handling alongside structural improvement
- ❌ Bulldozing dozens of files at once in one commit/one PR, making review impossible
- ❌ A large rewrite "while I'm at it" beyond what was requested
- ❌ Changing a public API/signature and breaking the call sites (that's not refactoring)
- ❌ Burying debt in code comments only, leaving it untrackable

## 4. Checklist

- [ ] Is the behavior of the changed code unchanged (inputs/outputs, side effects, public API identical)?
- [ ] Were the tests covering that behavior green before refactoring (and added first if missing)?
- [ ] Did you split into small steps and verify each step with build/test?
- [ ] Are feature changes and refactoring separated by commit?
- [ ] Did you avoid slipping in a large rewrite beyond the requested scope?
- [ ] Is the technical debt you left made visible as a ticket/issue?
