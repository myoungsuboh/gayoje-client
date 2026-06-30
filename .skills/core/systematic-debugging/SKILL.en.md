---
name: Systematic Debugging (Systematic Debugging)
description: A stack-neutral debugging procedure that catches the root cause by narrowing down through reproduce → evidence → hypothesis verification rather than guessing for bugs, test failures, and unexpected behavior. Read before fixing when you hit a bug of unclear cause, when it breaks again after a fix, or when you're stuck on what to fix. Keywords: debugging, root-cause, minimal-reproduction, git-bisect, regression-test, hypothesis, troubleshooting.
rules:
  - "Don't fix by guessing — reproduce first. Without a minimal case that reproduces 100%, it's not yet time to fix."
  - "Trace the root cause, not the symptom. Don't erase the error message; find why it got into that state."
  - "One at a time — set one hypothesis, verify only that, and make changes one at a time too."
  - "Don't conclude in your head; narrow with evidence — confirm facts via logs, observation, and binary search."
  - "Fixing isn't the end — leave a regression test that will catch the same bug again."
  - "When stuck, split smaller — halve the problem scope to corner the cause range."
tags:
  - "debugging"
  - "root-cause"
  - "minimal-reproduction"
  - "git-bisect"
  - "regression-test"
  - "hypothesis"
  - "troubleshooting"
foundational: true
---

# 🔬 Systematic Debugging (Systematic Debugging)

> This skill is this in-house harness's own standard (unrelated to the same-named skill in the external 'superpowers' bundle).
>
> Rather than groping at a bug by guessing, narrow down to the root cause through reproduction, evidence, and verification. Read before fixing when you hit a bug of unclear cause, a test failure, or anomalous behavior.

The most common mistake AI agents make in debugging is **swapping in a plausible fix by guessing the moment they see a symptom**. Even if the symptom luckily disappears, the root cause remains and breaks again in another form, while meaningless changes pile up in the code in the meantime. Pinning down the procedure of reproduce → gather evidence → verify hypotheses one at a time as a rule keeps even AI narrowing the cause within that frame.

## 1. Core Principles

- Don't fix by guessing — **reproduce** first. Without a minimal case that reproduces 100%, it's not yet time to fix.
- Trace the **root cause**, not the symptom. Don't erase the error message; find why it got into that state.
- One at a time — set one hypothesis, verify only that, and make changes one at a time too.
- Don't conclude in your head; **narrow with evidence** — confirm facts via logs, observation, and binary search.
- Fixing isn't the end — leave a **regression test** that will catch the same bug again.
- When stuck, split smaller — halve the problem scope to corner the cause range.

## 2. Rules

### 2-1. No guessing — minimal reproduction case first

When you don't know the cause, don't change code first. First build **the smallest case that reproduces identically every time**.

```text
❌ Forbidden — "it's probably because of null" and adding optional/null checks all over
   → the symptom is hidden, the cause remains, only changes pile up

✅ Recommended — incrementally strip away the failing input/environment to secure a minimal reproduction case
   Reproduction steps: input X → step Y → expected A, actual B (identical every time)
   → this case becomes a regression test as-is (2-5)
```

### 2-2. Root cause, not symptom

Often the visible symptom point is not the cause. Keep asking "why?" until you reach the cause.

```text
❌ Forbidden — NaN shows on screen, so mask it with `|| 0` right before display
✅ Recommended — trace back to where NaN first arose
         → the real cause is the point where input parsing turned an empty string into a number
```

- If a surface fix makes only the symptom disappear, the same cause breaks again elsewhere.

### 2-3. Hypothesis → verify, one at a time

If you apply several guesses at once, you can't tell which one was effective.

```text
❌ Forbidden — turn off the cache, upgrade the library, change the config too, then "now it works"
   → you never know what was the cause and what was irrelevant

✅ Recommended — 1 hypothesis → change only that and verify → record the result → next hypothesis
   "X is the cause" → change only X to check → if not, revert and move to the next
```

- After verification, **revert** changes that had no effect. Don't leave debugging traces in the code.

### 2-4. Gathering evidence — binary search · logs/observation

Don't pin it in your head; narrow by facts.

```text
✅ Binary search — if you don't know which change broke it, halve commits with git bisect
✅ Logs/observation — print input, state, and branch values before and after the suspect section to confirm the actual flow
✅ Narrowing scope — cut code/input/environment in half to corner the cause range
```

- If an external dependency (network, time, concurrency) is suspected, fix/isolate that variable and see whether it still reproduces.

### 2-5. Regression test after the fix

Once you've fixed the cause, leave a test that **fails before the fix and passes after**.

```text
✅ Recommended — enshrine the minimal reproduction case from 2-1 as a test
   1) First confirm that the test actually fails (evidence you pinned the cause correctly)
   2) Confirm it passes after the fix
   → automatically prevents recurrence of the same bug
```

> For the procedure to judge whether a fix is "really done" (build, test, real behavior), follow the `verification-before-completion` skill.

## 3. Common Mistakes

What AI often does — filter it out at review.

- ❌ Throwing a guessed patch first with "it's probably this" without even reproducing
- ❌ Swallowing the error with try/catch or masking it right before display to remove only the symptom (leaving the root cause)
- ❌ Changing several places at once so you don't know what was effective
- ❌ Ending with "looks fixed" — not re-confirming with the reproduction case
- ❌ Leaving ineffective debug code (logs, temporary branches) in the commit as-is
- ❌ Not adding a regression test after the fix, so the same bug recurs

> **Application tip**: Make halving the scope your default action when stuck. Confirming "how far is normal" via binary search narrows the cause range without guessing.

## 4. Checklist

- [ ] Did you secure a minimal case that reproduces 100% before fixing by guessing?
- [ ] Did you trace back to the root cause, not the symptom?
- [ ] Did you set hypotheses one at a time and make changes one at a time too (reverting ineffective changes)?
- [ ] Did you secure evidence via logs, observation, and binary search (git bisect) instead of guessing?
- [ ] Did you leave a regression test that fails before the fix and passes after?
- [ ] Did you clean up temporary debug code?
