---
name: Spec Writing — Agreeing on What to Build (Spec Writing)
description: A stack-neutral guide for agreeing in writing on 'what' to build and the 'done criteria' before coding. Includes user stories, acceptance criteria (Given-When-Then), in-scope/out-of-scope, and edge/error cases. Read before starting a new feature or when you need to clearly write down requirements before handing work to an AI agent (for step-by-step build planning, see `implementation-plan`). Keywords: spec, requirements, user-story, acceptance-criteria, given-when-then, scope, PRD.
rules:
  - "Agree on 'what' to build before coding — a small spec prevents large rework."
  - "Write done criteria verifiably — both humans and AI must read 'it's done' to mean the same thing."
  - "Write scope (In) and out-of-scope (Out) together — pinning down what you won't do keeps scope from leaking."
  - "Include not just the happy path but edge/error cases in the spec — AI does not build what is not written."
  - "Replace vague words ('fast, appropriately, well') with measurable numbers/conditions."
  - "A spec covers only 'what / done criteria'. 'How to build it step by step' is separated into implementation-plan."
tags:
  - "spec"
  - "requirements"
  - "user-story"
  - "acceptance-criteria"
  - "given-when-then"
  - "scope"
  - "PRD"
foundational: true
---

# 📋 Spec Writing — Agreeing on What to Build

> Before writing code, pin down in writing **'what to build and where done is'**. Read before starting a new feature/change, especially before handing work to an AI agent.

The most expensive mistake is not poorly written code but **building the wrong thing precisely**. When an AI agent receives a vague request, it fills the blanks with 'plausible' guesses — if those guesses are wrong, the code is fine but the result is useless. The more concrete the spec, the fewer the guesses and the less AI rework. This skill covers **what / done criteria (what)**. **How / step planning (how)** is covered in the `implementation-plan` skill.

## 1. Core Principles

- Agree on 'what' to build before coding — a small spec prevents large rework.
- Write done criteria **verifiably** — both humans and AI must read "it's done" to mean the same thing.
- Write scope (In) and out-of-scope (Out) together — pinning down what you won't do keeps scope from leaking.
- Include not just the happy path but **edge/error cases** in the spec — AI does not build what is not written.
- Replace vague words ("fast, appropriately, well") with measurable numbers/conditions.
- A spec covers only 'what / done criteria'. 'How to build it step by step' is separated into `implementation-plan`.

## 2. Rules

### 2-1. Write 'what/why' as a user story

Don't just write a feature name; write **who, what, why** in one sentence.

```
❌ "Search feature"
   → AI guesses the target, scope, sorting, and permissions entirely.

✅ As a logged-in user,
   I want to search my order list by order number,
   so that I can quickly find past orders again.
```

When the 'why (so that)' is present, AI judges trade-offs in the right direction.

### 2-2. Acceptance criteria in Given-When-Then

Pin "done" down to **observable behavior**. If you can't judge pass/fail, it isn't an acceptance criterion.

```
❌ "Search should work well"  (well = what? unverifiable)

✅ Given a user who has 3 orders
   When they search by an existing order number
   Then only that 1 order is shown in the list.

   Given the same user
   When they search by a nonexistent order number
   Then a "No search results" notice is shown and no error occurs.
```

This format becomes a test case as-is. (For tests, see the `test-strategy` / `unit-testing` skills.)

### 2-3. Write scope (In) and out-of-scope (Out) together

```
✅ ## In Scope
   - Exact-match search by order number
   - View only one's own orders

   ## Out of Scope — not this time
   - Product-name / partial-match search  (→ separate ticket)
   - Viewing other users' orders (forbidden by permission)
```

If you leave out-of-scope blank, AI kindly builds things 'on its own', growing scope and risk. **Explicitly state what you won't do**.

### 2-4. Include edge/error cases in the spec

If you write only the happy path, AI builds only the happy path. Predefine empty values, overflow, duplicates, permissions, and failures.

```
✅ ## Edge/Error Cases
   - Empty query: do not run search, show input guidance
   - 0 results: "No results" notice (no blank screen)
   - External lookup failure: retry guidance, no change to user data
   - Access to an unauthorized order: 403, no exposure of others' data
```

### 2-5. Replace vague words with measurable ones

```
❌ fast / appropriately / user-friendly / even with lots of data

✅ Show results within 1 second (p95)
✅ 20 at a time, load more via "show more"
✅ On input error, show a red notice below the relevant field
```

If you can't write it as numbers/conditions, the agreement is not yet complete — ask on the spot to narrow it down.

### 2-6. The boundary between spec ↔ plan

| Distinction | This skill (spec) | `implementation-plan` (plan) |
|---|---|---|
| Question answered | What? Done criteria? | How? In what order? |
| Artifact | User story, acceptance criteria, scope | Phases, progress status, schedule |
| Timing | First (agreement) | After spec is agreed |

Don't mix implementation methods (files, libraries, steps) into the spec. Hand those to the plan.

## 3. Common Mistakes

- ❌ Throwing just a one-line feature name and immediately starting coding/prompting → AI fills the blanks with guesses
- ❌ Writing only the happy path and omitting empty-value, failure, permission cases → it blows up in production
- ❌ Leaving vague words like "fast, well, appropriately" as-is → arguments over "is this done?" at review
- ❌ Not writing out-of-scope so AI builds even unrequested features (scope creep)
- ❌ Mixing implementation steps/file structure into the spec → role overlap with `implementation-plan`
- ❌ Writing the spec once and leaving it — when the agreement changes, fix the spec first (before the code)

> **Vibe coding tip**: Instead of telling the agent "write the code first", **give it the spec (story, acceptance criteria, scope) first** and then have it generate code — this greatly reduces hallucination and rework. A concrete spec = the most powerful context you can give an AI. (Use together with the `vibe-coding-workflow` skill.)

## 4. Checklist

- [ ] Did you write 'who, what, why' as a user story?
- [ ] Did you write acceptance criteria in a verifiable form such as Given-When-Then?
- [ ] Did you specify both scope (In) and out-of-scope (Out)?
- [ ] Did you include edge/error cases (empty values, failure, permission, duplicates)?
- [ ] Did you change vague words like "fast, well, appropriately" into numbers/conditions?
- [ ] Did you avoid mixing implementation methods (steps, files) and separate them into `implementation-plan`?
