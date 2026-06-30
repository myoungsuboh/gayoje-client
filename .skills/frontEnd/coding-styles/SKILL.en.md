---
name: Coding Style Standards (Coding Styles)
description: A foundational, general-purpose coding style standard covering naming case, formatting, comments, and commit message conventions, independent of any specific language/framework. Read this when writing new code or establishing/maintaining style, naming, formatting, and commit message rules. For the Git collaboration flow itself (branches/PRs/merges), see the git-workflow skill.
rules:
  - "Consistency is readability: follow the one approach the team agreed on rather than personal taste. 'Same style' matters more than 'correct style'."
  - "Names reveal intent: make it possible to tell what something is and what kind it is from the name alone. Apply the case fixed for each kind of target (variable, function, type, constant, file) consistently."
  - "Enforce formatting with tools: do not eyeball formatting like indentation, semicolons, and quotes — auto-align it with a formatter/linter. Do not debate formatting in reviews."
  - "Comments explain 'why': do not repeat the 'what' the code already says; write the intent, background, and trade-offs that the code does not reveal."
  - "Commit messages follow a convention: start the first line of the message with a fixed type convention (e.g., feat/fix/...) so the nature of a change is visible from skimming history alone."
  - "Separate stack-specific rules: do not mix language/framework-specific conventions (file block order, component authoring style, etc.) with these universal rules — separate them into the relevant stack skill or the appendix below."
tags:
  - "eslint"
  - "prettier"
  - "camelCase"
  - "PascalCase"
  - "kebab-case"
  - ".eslintrc"
foundational: true
---

# 🎨 Coding Style Standards (Coding Styles)

> Establish universal rules for naming, formatting, comments, and commit messages so that code reads the same shape no matter who wrote it. Read this when writing new code or establishing style. It is a general-purpose standard not tied to any specific language/framework; for the Git collaboration flow itself such as branch strategy, PRs, and merges, see the `git-workflow` skill.

## 1. Core Principles
- **Consistency is readability**: follow the one approach the team agreed on rather than personal taste. "Same style" matters more than "correct style".
- **Names reveal intent**: make it possible to tell what something is and what kind it is from the name alone. Apply the case fixed for each kind of target (variable, function, type, constant, file) consistently.
- **Enforce formatting with tools**: do not eyeball formatting like indentation, semicolons, and quotes — auto-align it with a formatter/linter. Do not debate formatting in reviews.
- **Comments explain 'why'**: do not repeat the 'what' the code already says; write the intent, background, and trade-offs that the code does not reveal.
- **Commit messages follow a convention**: start the first line of the message with a fixed type convention (e.g., `feat`/`fix`/...) so the nature of a change is visible from skimming history alone.
- **Separate stack-specific rules**: do not mix language/framework-specific conventions (file block order, component authoring style, etc.) with these universal rules — separate them into the relevant stack skill or the appendix below.

## 2. Rules

### 2-1. Naming Case (Naming)
- Use the standard case consistently per kind of target. The same kind always uses the same case within one project.
  - **Variables·functions**: `camelCase` (e.g., `userEmail`, `getUserInfo`)
  - **Types·classes·components**: `PascalCase` (e.g., `UserLogin`, `OrderService`)
  - **Constants (immutable global values)**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRIES`)
  - **Files·directories**: default `kebab-case` (e.g., `user-profile`). When the stack convention differs (e.g., type/component files as `PascalCase`), follow the stack rules in the appendix.
- Avoid meaningless abbreviations, single-letter names (except loop variables), and Hungarian notation that bakes the type into the name.

```text
// ❌ Forbidden — kind and case are mixed up
const UserEmail = ...      // a variable but PascalCase
function GetUser() {}      // a function but PascalCase
const maxRetries = 3       // an immutable constant but camelCase

// ✅ Recommended — standard case per kind
const userEmail = ...
function getUser() {}
const MAX_RETRIES = 3
class OrderService {}
```

### 2-2. Formatting (Automate with Tools)
- For format rules like indentation, semicolons, quotes, and max line length, the team decides once and commits a formatter/linter config file to the repository to apply it automatically.
- Do not let real changes get buried by format-only changes (whitespace·line breaks) — leave formatting to tools and do not argue about it in reviews.

```text
// ❌ Forbidden — formatting is inconsistent within one repository
let a = "x"
let b = 'y' ;

// ✅ Recommended — enforce the agreed rules (e.g., use semicolons·single quotes·consistent indentation) with tools
const a = 'x';
const b = 'y';
```

### 2-3. Comments (Write 'why', and keep debt traceable)
- Do not repeat the 'what' the code already says; write why you did it that way (background·constraints·intent).
- Leave temporary handling·incomplete work in a searchable form: `// TODO(owner, date): content`. Make who·when·what knowable to track neglected debt.

```text
// ❌ Forbidden — repeats exactly what the code says / untraceable TODO
i = i + 1   // add 1 to i
// TODO: fix later

// ✅ Recommended — 'why' + traceable debt
// The external API uses 0-based pages, so add a +1 correction
page = page + 1
// TODO(Kim Dev, 2026-06-17): remove the page correction when API v2 switches to 1-based
```

### 2-4. Commit Message Convention
- Follow a convention that starts the first line of the commit message with a fixed type (e.g., Conventional Commits / Angular rules). The nature of a change gets classified just from skimming history.
  - Representative types: `feat` (feature), `fix` (bug), `docs` (documentation), `style` (formatting), `refactor` (refactoring), `test` (tests), `chore` (build/config).
- One commit contains only one logical change, and the subject is written concisely in the imperative.
- For collaboration flows outside the commit message such as branch strategy·PR size·merge/rebase·conflict resolution, follow the `git-workflow` skill.

```text
// ❌ Forbidden — vague message with no type
update
fix bug

// ✅ Recommended — type(scope) + imperative summary
feat(order): add order cancellation reason input field
fix(auth): fix infinite redirect on token expiration
```

## 3. Common Mistakes
- **Mixing kind and case** → mixing them up by writing a variable in `PascalCase` and a constant in `camelCase` blurs intent. Unify with the standard case per kind.
- **Eyeballing formatting** → reviews drift into whitespace·line-break arguments. Commit a formatter/linter config to automate it.
- **Comments that explain 'what'** → a comment that just transcribes the code is noise. Leave only the 'why'.
- **Untraceable TODOs** → `// TODO later` is never fixed. Use `// TODO(owner, date): content`.
- **Commit messages with no type** → if it is `update`, `fix bug`, you cannot tell the nature of a change from history. Follow the type convention.
- **Mixing stack-specific rules into universal rules** → baking a specific FW's file block order·component authoring style into common rules makes them unusable in other stacks. Separate into the appendix/dedicated skill.

## 4. Checklist
- [ ] Did you write variables·functions in `camelCase`, types·classes·components in `PascalCase`, and constants in `SCREAMING_SNAKE_CASE`?
- [ ] Does file·directory naming follow the team rule (default `kebab-case`, stack-specific exceptions in the appendix)?
- [ ] Are formatting like indentation·semicolons·quotes auto-enforced with a formatter/linter config?
- [ ] Do comments explain 'why' rather than 'what'?
- [ ] Did you leave temporary·incomplete work in `// TODO(owner, date): content` form so it is traceable?
- [ ] Do commit messages follow the fixed type convention (feat/fix/docs, etc.)?
- [ ] Are stack-specific conventions (block order·component authoring style, etc.) separated into the appendix/dedicated skill instead of mixed into universal rules?

## Appendix: Examples by Stack

> Below are examples of applying the universal rules above in a specific stack. Add more in the same pattern to match the stack your team uses. The principles·rules of 1–4 above are the standard, and the appendix is merely application cases of them.

### Vue 3 (SFC)

> Write **only the stack-specific conventions** for when the universal rules of the body 1–4 (naming case·formatting·comments·TODO) are applied to Vue 3 SFC. For naming·formatting·comment rules that overlap with the body, follow the body. For detailed standards on `.vue` block order·script internal ordering, also see the `vue-sfc-structure` skill.

#### File names (stack exception)
- Vue component files recommend `PascalCase` (e.g., `UserLogin.vue`) instead of the body default (`kebab-case`). For other naming cases, follow body 2-1.

#### Component Authoring Principles
- **Composition API first**: recommend hook-centric authoring based on `<script setup>` over the Options API.
- **File structure order**: keep the block order within a `.vue` file consistent — `<script setup>` → `<template>` → `<style>`.

#### Formatting (stack concrete values)
- Follow the "enforce with a formatter/linter" principle of body 2-2; the concrete values for a Vue project are 2 spaces indentation·use semicolons·single quotes (`'`).

> For rules on no magic numbers·constantizing values such as design tokens, see `design-system`.
