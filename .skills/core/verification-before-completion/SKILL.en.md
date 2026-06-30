---
name: Verification Before Completion — Evidence-Based Reporting (Verification Before Completion)
description: A stack-neutral guide that secures evidence through actual execution and testing before claiming "done/fixed/passing," and confirms the Definition of Done (DoD) is met. Read it just before reporting that work is finished or creating a commit/PR. It is the single source of truth for DoD, the CI-green gate, and proof of completion (it prevents the AI from asserting "it works" based on guesswork). Keywords: verification, definition-of-done, DoD, evidence, build, test, lint, acceptance-criteria, honest-reporting, no-assumptions.
rules:
  - "Evidence first, claims second. Before any success assertion there must be actual command output that backs it up."
  - "'Done' is not a feeling but a criterion (DoD) — it counts as done only when build passes, tests pass, lint passes, and acceptance criteria are all met."
  - "Verify the entire scope of changes — confirm that every file, path, and case you touched actually works, and do not wave off the parts you didn't look at as 'probably fine.'"
  - "Report failures honestly as failures — do not hide or sugarcoat partial successes, unverified items, or blockers."
  - "No guessing — do not substitute verification with phrases like 'it'll probably work' or 'this usually works.'"
  - "If you couldn't run it, say 'I couldn't run it' — if execution is impossible due to environment constraints, state that fact and the limitation explicitly (no pretending to have verified)."
tags:
  - "verification"
  - "definition-of-done"
  - "DoD"
  - "evidence"
  - "build"
  - "test"
  - "lint"
  - "acceptance-criteria"
  - "honest-reporting"
  - "no-assumptions"
foundational: true
---

# ✅ Verification Before Completion — Evidence-Based Reporting

> This skill is this in-house harness's own standard (unrelated to the same-named skill in the external 'superpowers' bundle).
>
> Before claiming "done/fixed," you must always secure evidence through actual execution and testing. Read it just before reporting that work is finished or creating a commit/PR.

The most common trust failure an AI agent makes is **asserting "it's all done / fixed / passing" without ever running it**. When you dress up the guess "it'll probably work" as a success report right after changing code, the user is left holding a broken result and trust collapses. The rule is simple — **without evidence (command output), do not say it succeeded.**

## 1. Core Principles

- Evidence first, claims second. Before any success assertion there must be actual command output that backs it up.
- "Done" is not a feeling but a criterion (DoD) — it counts as done only when build passes, tests pass, lint passes, and acceptance criteria are all met.
- Verify the entire scope of changes — confirm that every file, path, and case you touched actually works, and do not wave off the parts you didn't look at as "probably fine."
- Report failures honestly as failures — do not hide or sugarcoat partial successes, unverified items, or blockers.
- No guessing — do not substitute verification with phrases like "it'll probably work" or "this usually works."
- If you couldn't run it, say "I couldn't run it" — if execution is impossible due to environment constraints, state that fact and the limitation explicitly (no pretending to have verified).

## 2. Rules

### 2-1. No success assertion without evidence

To claim success, there must be an actually-executed command and its output immediately beforehand.

```
❌ Forbidden — reporting a guess as a result
"Fix complete. It should work fine now."   (not executed)

✅ Recommended — execute → check output → report based on that
$ <build/test command>
 ... 42 passed, 0 failed
"Reporting completion after confirming all 42 tests pass."
```

### 2-2. Explicitly meet the Definition of Done (DoD)

You must satisfy all of the below to be "done." If even one is unverified, it is not done.

| Item | How to confirm |
|---|---|
| Build passes | Build/compile command finishes with no errors |
| Tests pass | Relevant tests run, 0 fail (for test authoring/scope see `test-strategy`) |
| Static checks pass | lint, type check, and format check pass |
| Acceptance criteria met | The requested feature/bug fix actually behaves as required |

### 2-3. Verify the entire scope of changes

```
❌ Forbidden — judging the whole from a part
"I fixed 3 files and tried running one and it worked, so the rest should too."

✅ Recommended — check everywhere you changed and everywhere affected
- Inspect the call sites and cases of every file/function you changed
- Confirm by execution down to regression-prone spots (shared modules, edge cases)
```

### 2-4. Be honest about failures and unverified items

```
❌ Forbidden — packaging partial success as done / concealing failure
"I resolved everything."   (1 actually unresolved)

✅ Recommended — state the status as it is
"2 of 3 fixed and verified. 1 unresolved due to cause X — proposed next step: …"
"Integration tests not run due to environment constraints. Only confirmed unit tests pass."
```

## 3. Common Mistakes

The ones AI makes often — filter them out yourself before reporting.

- ❌ Asserting "done/fixed" without running right after changing code
- ❌ Substituting actual verification with "it'll probably work," "this usually works"
- ❌ Looking at only one of build/test and skipping the rest as "probably fine"
- ❌ Glossing over a failed test as a "minor issue" as if it passed
- ❌ Reporting success without checking command output (or without running at all)
- ❌ Confirming only some cases and declaring the entire change scope works

> **Application tip**: Just before reporting, ask yourself in one sentence — "Did I actually run the command that proves this just now, and did I see its output?" If not, it's not done yet. (Use together with `code-review` for code-quality checks, and `test-strategy` for test scope/strategy.)

## 4. Checklist

- [ ] Did I confirm the actual command output that backs the success claim?
- [ ] Did I meet build, test, lint, and acceptance criteria (DoD) all?
- [ ] Did I confirm every changed file and affected scope by execution (not judging the whole from a part)?
- [ ] Did I report failures, partial successes, and unverified items honestly without hiding them?
- [ ] Did I avoid substituting verification with guess phrases like "it'll probably work"?
- [ ] If execution was impossible, did I state that limitation explicitly (without pretending to have verified)?
