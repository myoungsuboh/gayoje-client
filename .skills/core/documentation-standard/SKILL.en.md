---
name: Documentation Standard — README · ADR · Comments · Sync (Documentation Standard)
description: A stack-neutral guide that defines where, what, and how to write project documentation. It covers the README and ADR formats, comment-writing criteria, and keeping docs in sync when code changes. Read it when starting a new repository, adding or organizing docs, recording an important technical decision, or reviewing onboarding material. Keywords: README, ADR, documentation, comments, docstring, onboarding, doc-sync.
rules:
  - "Docs change together with the code — a PR that changes behavior fixes the related docs in the same PR. 'Later' never comes."
  - "Wrong docs > the harm of no docs — delete or fix stale or false docs. Don't write down things you're unsure of as guesses."
  - "Write for newcomers and AI agents — one should be able to reach build/run from the README alone, with no prior knowledge."
  - "Comments are 'why', not 'what' — don't repeat what the code says; write the intent, background, and trade-offs the code can't express."
  - "Keep documentation locations consistent — always put the same kind of document in the same place. Scattered docs are no docs."
  - "Record important technical decisions as ADRs — choices whose 'why' can't be known from the code alone are recorded together with their rationale."
tags:
  - "README"
  - "ADR"
  - "documentation"
  - "comments"
  - "docstring"
  - "onboarding"
  - "doc-sync"
foundational: true
---

# 📚 Documentation Standard — README · ADR · Comments · Sync

> By nailing down where, what, and how to write docs, newcomers and AI agents gain context with a single search. Read it when opening a new repository, adding or organizing docs, or leaving an important decision.

Docs are an artifact as important as code. In particular, AI agents can't run the code directly, so they **depend on the context written in the README, decision records, and comments** to work. When docs are missing or stale, both humans and AI make wrong assumptions and repeat the same questions and the same mistakes. The most dangerous thing is **wrong docs** — stale or false docs are worse than no docs (because the reader believes them).

## 1. Core Principles

- Docs change together with the code — a PR that changes behavior fixes the related docs in the same PR. "Later" never comes.
- Wrong docs > the harm of no docs — delete or fix stale or false docs. Don't write down things you're unsure of as guesses.
- Write for newcomers and AI agents — one should be able to reach build/run from the README alone, with no prior knowledge.
- Comments are 'why', not 'what' — don't repeat what the code says; write the intent, background, and trade-offs the code can't express.
- Keep documentation locations consistent — always put the same kind of document in the same place. Scattered docs are no docs.
- Record important technical decisions as ADRs — choices whose "why" can't be known from the code alone are recorded together with their rationale.

## 2. Rules

### 2-1. Required README sections

The repository root `README.md` has the sections below. The order is free, but **omission is forbidden**.

| Section | Question it must answer |
|---|---|
| Overview | What is this project and why does it exist |
| Requirements | What runtime, tools, and versions are needed |
| Installation | How do you get the dependencies |
| Running | How do you bring it up and test it locally |
| Project structure | Where are the main directories and entry points |
| Contributing | What are the branch, commit, and PR rules |

```md
✅ Recommended — with copy-pasteable commands
## Running
\`\`\`
<package-manager> install
<run command>        # http://localhost:<port>
<test command>
\`\`\`

❌ Forbidden — abstract narration (a newcomer can't follow it)
## Running
After installing the dependencies, bring up the server as usual.
```

### 2-2. ADR — Architecture Decision Record

Hard-to-reverse decisions or those with large team impact (framework choice, data storage method, auth strategy, etc.) are left as a single ADR. Gather them in one place like `docs/adr/NNNN-title.md`, and number them.

```md
✅ Recommended — the decision's 'why' plus alternatives and consequences
# ADR-0007: Adopt Redis as the session store

- Status: Accepted (2026-06-16)
- Context: As instances grew to several, in-memory sessions broke.
- Decision: Introduce Redis as an external session store.
- Alternatives: DB sessions (latency↑), sticky sessions (scalability↓) — state the rejection reason.
- Consequence: 1 operational component added, horizontal scaling possible.

❌ Forbidden — conclusion only, no rationale or alternatives
We use Redis.
```

> A recorded ADR is **not edited**; only its status is changed (e.g. `Superseded → ADR-0012`). The history of the decision must remain.

### 2-3. Comments are 'why' over 'what'

```js
// ❌ Forbidden — a comment that just transcribes the code (zero information, becomes false when the code changes)
i = i + 1; // add 1 to i

// ✅ Recommended — the 'why' the code can't tell
// The external API uses 0-based pages, so correct it (ticket #482)
page = page + 1;
```

- Don't add comments to self-evident code. Reduce comments by naming things well.
- Mark stopgaps and workarounds with `// TODO:`/`// HACK:` and leave the reason and ticket.
- For public functions and modules, write the contract — inputs, outputs, exceptions, etc. — as a docstring (follow the stack's convention for format).

### 2-4. Sync docs when code changes

```
PR that changes behavior/config/structure  ⟶  update README, ADR, comments, examples in the same PR
```

- If you changed environment variables, commands, APIs, or directory structure, fix the README and examples together.
- Delete sentences that are no longer true at once — don't leave them "just in case".
- To prevent missed syncs, put "whether docs were updated" in the PR template/review checklist.

## 3. Common Mistakes

What often comes from AI agents and rushed work — filter it in review.

- ❌ Changing only the code while the README/examples keep old commands and old variable names (false docs)
- ❌ An ADR without a "why" or a missing decision → six months later no one knows the reason
- ❌ Comments that just transcribe the code, or leaving commented-out dead code
- ❌ Docs scattered across README, wiki, code comments, and chat with no single source
- ❌ Defining domain terms redundantly in the README (the glossary is unified via the `docs-glossary` skill)
- ❌ Mixing AI rules into general docs (for agent rules, see the `agent-rules-file` skill)

> **Application tip**: Nailing one line — "if you change behavior, fix the docs in the same PR" — into the contributing guide and the agent rules file makes both humans and AI uphold this sync every time.

## 4. Checklist

- [ ] Does the README have all 6 sections (Overview, Requirements, Installation, Running, Project structure, Contributing)
- [ ] Can a newcomer reach build/run/test from the README alone
- [ ] Are important architecture decisions recorded in one place as ADRs containing 'why, alternatives, consequences'
- [ ] Do comments say 'why' rather than 'what' (no self-evident comments, no dead code)
- [ ] With this change, were stale docs updated/deleted in the same PR
- [ ] Are the same kind of docs gathered in a consistent location, and do their roles not overlap with the glossary/agent rules
