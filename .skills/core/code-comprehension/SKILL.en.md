---
name: Comprehension First — Understand Before Changing (Code Comprehension)
description: A stack-neutral guide to first finding and reading the relevant existing code before changing it — understanding its behavior, conventions, dependencies, and call sites, then reusing and matching the surrounding style. Read when modifying or extending unfamiliar code, before adding a new function/utility, or when gauging the blast radius of a change. Keywords: code-comprehension, read-before-write, reuse, existing-patterns, call-site, blast-radius, conventions.
rules:
  - "Read before you change — first find and read the code you will change and its surroundings, understand the current behavior, then touch it. Do not edit on the assumption that 'it's probably like this.'"
  - "Reuse over reinvention — first look for an existing function, utility, or pattern that does the same thing. AI has a strong tendency to rebuild what already exists."
  - "Follow the surrounding conventions — grasp the naming, structure, error handling, and style of that file/module and match them. Do not inject your own foreign patterns."
  - "Gauge the blast radius first — find who uses (the call sites of) the function, type, or API you will change, understand how far the change spreads, then touch it."
  - "Verify by reality, not by name — confirm whether a function lives up to its name through its implementation and data flow. Names and comments can be stale or false."
  - "If you don't understand, stop and narrow — if you haven't grasped the core, do not paper over it with guesses; read more or ask to narrow it down before proceeding."
tags:
  - "code-comprehension"
  - "read-before-write"
  - "reuse"
  - "existing-patterns"
  - "call-site"
  - "blast-radius"
  - "conventions"
  - "기존 코드 파악"
foundational: true
---

# 🧭 Comprehension First — Understand Before Changing

> Before changing code, first find and read the relevant existing code, and understand how it works, what conventions it uses, and who depends on it before touching it. Read this when fixing or extending unfamiliar code, and before adding a new function or utility.

The most common mistake AI agents make is **editing right away without reading the existing code**. As a result they rebuild a utility that already exists (duplication), inject code that conflicts with the module's conventions, and break call sites by changing public functions. Code is "read" longer than it is "written" — understanding it first reduces guesswork and makes changes safer.

> **Scope:** What to build (requirements) is covered by `spec-writing`, in what order (steps) by `implementation-plan`, the procedure for changing structure while preserving behavior by `refactoring`, and tracing the cause of a bug by `systematic-debugging`. This skill covers only the step **before all of that: understanding the existing code you are about to touch**.

## 1. Core Principles

- **Read before you change** — first find and read the code you will change and its surroundings, understand the current behavior, then touch it. Do not edit on the assumption that "it's probably like this."
- **Reuse over reinvention** — first look for an existing function, utility, or pattern that does the same thing. AI has a strong tendency to rebuild what already exists.
- **Follow the surrounding conventions** — grasp the naming, structure, error handling, and style of that file/module and match them. Do not inject your own foreign patterns.
- **Gauge the blast radius first** — find who uses (the call sites of) the function, type, or API you will change, understand how far the change spreads, then touch it.
- **Verify by reality, not by name** — confirm whether a function lives up to its name through its implementation and data flow. Names and comments can be stale or false.
- **If you don't understand, stop and narrow** — if you haven't grasped the core, do not paper over it with guesses; read more or ask to narrow it down before proceeding.

## 2. Rules

### 2-1. Find and read the related code first (search first)

Find and read the definition, call sites, similar implementations, and related tests of the edit target by searching before you start.

```text
❌ Forbidden — open a single file and modify it right away with no context
   "Fix this function" → edit after seeing only the definition

✅ Recommended — read the surroundings before touching
   1) Search the target definition + call sites (who calls it)
   2) Search similar implementations/utilities that do the same thing
   3) Grasp the expected behavior from related tests
   → then edit
```

### 2-2. Reuse — first check whether it already exists

Before writing a new utility/helper, search whether the same functionality already exists.

```text
❌ Forbidden — write a new formatDate / deepEqual / debounce without checking
   → duplicates what already exists in the project, and behaves subtly differently

✅ Recommended — search whether the same thing exists in common utilities/helpers/libraries, then reuse/extend
```

### 2-3. Match the conventions of the surrounding code

First grasp and follow the naming, structure, error handling, and return shape that the module uses.

```text
❌ Forbidden — that layer returns a result object, but only you throw an exception
              that folder uses kebab-case files, but only you use PascalCase
✅ Recommended — follow the existing patterns (return/error/naming/placement) as-is to keep consistency
```

- For universal style rules such as naming, formatting, and commits, follow `coding-styles`.

### 2-4. Check the call sites and blast radius

Before changing a signature, behavior, or return value, find every place that uses the target.

```text
❌ Forbidden — change a public function's signature/return and not look at the call sites → distant places break silently
✅ Recommended — exhaustively search the call sites to grasp the blast radius, and if you change it, update them together
```

- For the behavior-preserving and verification procedures of a change, follow `refactoring` and `verification-before-completion`.

### 2-5. Verify the implementation and data flow, not the name

```text
❌ Forbidden — it's named isValidUser so it must validate, it's named getUser so it must have no side effects (assumptions)
✅ Recommended — read and confirm the actual implementation, inputs/outputs, and side effects (names can be stale or false)
```

### 2-6. Do not delete code you don't understand on a guess (Chesterton's Fence)

Do not casually remove code whose reason for existing you don't know (odd branches, workarounds, guards).

```text
❌ Forbidden — delete it because "it seems unused" → hidden intent/edge-case handling disappears and causes an incident
✅ Recommended — first confirm the reason it exists (history, blame, ticket, comment), then decide whether to remove it
```

## 3. Common Mistakes

What AI often does — filter these out at review time.

- ❌ Edit right away without reading existing code → pattern mismatch, duplication, broken call sites
- ❌ Rebuild a utility/function that already exists, multiplying duplication
- ❌ Inject a style, error handling, or structure foreign to the surroundings, destroying consistency
- ❌ Change a public signature/behavior without confirming the impact on call sites
- ❌ Conclude how it behaves from the name/comment alone (without checking the actual implementation)
- ❌ Delete code you don't understand the reason for (guards, workarounds) on a guess
- ❌ Dump entire code into the context just to understand it — only adds noise (only the relevant part, `vibe-coding-workflow`)

## 4. Checklist

- [ ] Did you first read the code you will change and its surroundings (definition, call sites, similar implementations, tests)?
- [ ] Did you look for an existing function/utility/pattern that does the same thing and consider reuse?
- [ ] Did you match the naming, structure, and error-handling conventions of the surrounding code?
- [ ] If you changed a signature/behavior, did you exhaustively check the call sites and blast radius?
- [ ] Did you confirm the behavior by the actual implementation and data flow, not by the name?
- [ ] Did you avoid deleting code you don't understand on a guess?
