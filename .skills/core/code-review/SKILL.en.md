---
name: Code Review (Code Review)
description: A stack-neutral standard for how to request, perform, and respond to code reviews. It is the single owner of self-review checks (removing debug traces, dead code, etc.) and defines review perspectives (correctness, readability, design, testing, security, consistency), the blocker/nit distinction, and constructive feedback. Read it before opening a PR, when reviewing someone else's PR, and when replying to review comments (PR size and merge criteria belong to `git-workflow`). Keywords: code-review, pull-request, self-review, blocker, nit, feedback, reviewer.
rules:
  - "A review looks at the code, not the person — feedback is aimed at the code and its behavior, paired with observation, rationale, and a suggestion."
  - "Keep PRs small enough to review — one PR = one change. The smaller they are, the faster the review and the more defects get caught."
  - "Self-review first before opening — the author reads the diff themselves and filters out cruft, debug traces, and missing tests before submitting."
  - "Tag every comment with a severity (blocker/nit) — clearly separate blocking issues from matters of taste."
  - "The author responds with rationale, not defensiveness — either apply the change, or state why it is left as is."
  - "Merge only when both approval + CI passing are satisfied."
tags:
  - "code-review"
  - "pull-request"
  - "self-review"
  - "blocker"
  - "nit"
  - "feedback"
  - "reviewer"
foundational: true
---

# 👀 Code Review (Code Review)

> By unifying self-review, review perspectives, severity tagging, and tone, reviews finish fast and constructively. Read it before opening a PR, when reviewing someone else's PR, and when replying to review comments. (PR size and merge criteria are owned by `git-workflow`.)

Reviews slow down for the same reasons, usually — the PR is too big, it arrives without a self-review, blockers and matters of taste (nits) are mixed together, and feedback is aimed at the person rather than the code. A review is a place to catch defects and share knowledge at the same time. The rules below reduce this friction.

## 1. Core Principles

- A review looks at the **code**, not the person — feedback is aimed at the code and its behavior, paired with observation, rationale, and a suggestion.
- Keep PRs **small enough to review** — one PR = one change. The smaller they are, the faster the review and the more defects get caught.
- **Self-review** first before opening — the author reads the diff themselves and filters out cruft, debug traces, and missing tests before submitting.
- Tag every comment with a **severity (blocker/nit)** — clearly separate blocking issues from matters of taste.
- The author responds with **rationale**, not defensiveness — either apply the change, or state why it is left as is.
- Merge only when both **approval + CI passing** are satisfied.

## 2. Rules

### 2-1. Self-review before opening

Before opening a PR, the author reads their own diff once — so the reviewer doesn't spend time on trivia.

- ✅ Skim the diff yourself, remove debug logs, commented-out code, and temporary variables, check for missing tests and edge cases, then submit.
- ❌ Only confirming it works locally and requesting review without looking at the diff → `console.log`, dead code, and typos go up as is.
- Write **what, why, and how you verified** in the PR description to help the reviewer grasp the context.

### 2-2. Small PRs (review-sized)

One PR = one change. The smaller they are, the faster the review and the more defects get caught — if a change is large, split it into multiple PRs. The rules for PR size, branching, and merge criteria follow `git-workflow`.

### 2-3. Review perspectives (what to look at)

Look at the following perspectives in order. Leave style to automation (linter/formatter) and let people focus on the higher level.

| Perspective | Question to check |
|---|---|
| Correctness | Does it work as intended? Edge cases and error handling? |
| Readability | Is it readable even six months later? Are names clear? |
| Design | Is it in the right place? Is there a simpler way? |
| Testing | Are there tests for the core path and the failure path? |
| Security | Is input validation, authorization, and exposure of sensitive data OK? |
| Consistency | Does it fit the existing conventions and architecture? |

- Weight correctness/design > readability > style. Don't get bogged down in style nitpicks.
- Leave a brief note about what was done well, too — a review isn't only about hunting for defects.

### 2-4. blocker vs nit (severity tagging)

Prefix every comment with a severity so the author instantly knows what must be fixed.

- ✅ `[blocker]` a defect that blocks the merge (bug, security, design flaw) / `[nit]` a minor suggestion that's nice to fix but optional.
- ❌ "This seems off" without a severity → the author flounders, unsure whether it's required or a matter of taste.
- If only nits remain, approve and move on — nits don't block a merge. If it must block, mark it as a blocker.

### 2-5. Specific, constructive feedback

Feedback is aimed at the code and is paired with rationale and an alternative. As suggestions and questions, not commands.

- ✅ "This loop is O(n²) when the input is large. Switching to a Map makes it O(n). (rationale + alternative)"
- ✅ "What happens here if null comes in?" (a question that draws out the context)
- ❌ "Why did you write the code like this?" / "This is wrong." (blaming the person, no rationale)
- Don't repeat the same point; group it once as a pattern.

### 2-6. The author's response — rationale instead of defensiveness

A review is not an attack. The author either applies the change or answers with the rationale for leaving it as is.

- ✅ "Applied" / "I'll leave this as is for reason X — how do you see it?"
- ❌ Consistently justifying/defending, or silently ignoring a comment and closing it.
- If opinions diverge and it drags on, move from comment ping-pong to a **short conversation (call/meeting)**.

### 2-7. Merge conditions on the review side

- There must be no unresolved `[blocker]` comments. Nits may remain.
- The approval + CI green gate and the ban on self-merge follow `git-workflow` (merge criteria) and `verification-before-completion` (proof of completion).

## 3. Common Mistakes

- ❌ A giant PR of hundreds to thousands of lines — the reviewer skims and just stamps "LGTM".
- ❌ Opening without a self-review, leaving debug logs and dead code as is.
- ❌ Mixing blockers and nits, so a merge is blocked over a trivial matter of taste.
- ❌ Personal blame in the vein of "why did you do it like this" — comments without rationale or alternatives.
- ❌ The author defends every comment, or closes them without a reply.
- ❌ Getting bogged down in style nitpicks and missing correctness/design issues (delegate style to automation).

> **When reviewing AI-generated code**, the focus differs from a normal review — you must additionally suspect plausible-but-wrong code, hallucinated APIs, excessive abstraction, and unverified dependencies. That difference and the checklist are delegated to the `ai-generated-code-review` skill.

## 4. Checklist

- [ ] Does the PR contain only one change and is it review-sized
- [ ] Did the self-review before opening filter out debug traces and dead code, and does the description state what, why, and how verified
- [ ] Did you look at the correctness, readability, design, testing, security, and consistency perspectives
- [ ] Did you tag every comment with a `[blocker]`/`[nit]` severity
- [ ] Is the feedback aimed at the code, not the person, and does it carry rationale and alternatives
- [ ] Did the author apply changes or respond with rationale instead of defending
- [ ] Are there no unresolved `[blocker]` comments (the approval/CI green gate is `git-workflow`)
