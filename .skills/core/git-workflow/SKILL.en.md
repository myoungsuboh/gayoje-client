---
name: Git Workflow — Branching Strategy & Collaboration (Git Workflow)
description: A stack-neutral collaboration guide defining a trunk-based branching strategy, small PRs, merge gates (after review and CI pass), rebase/merge and conflict resolution, and rules for excluding force-push and secrets. Read it when cutting a new working branch, opening a PR, or handling merges/conflicts. It is the single owner doc for small PRs, branches, and merge gates (self-review is `code-review`, proof of completion is `verification-before-completion`). Keywords: git, branch, trunk-based, pull-request, CI, rebase, merge, force-push, gitignore, conflict, main.
rules:
  - "Go trunk-based — keep main always deployable, do work on short-lived (ideally 1–2 day) branches, and merge quickly. Long-lived branches grow conflicts."
  - "Don't push directly to main — every change goes through a branch → PR. Protect main with branch protection to block direct push and force-push."
  - "Keep PRs small — one PR does one thing. Small PRs review faster and hide fewer bugs."
  - "Both pre-merge gates must pass — at least 1 reviewer approval + green CI (build, test, lint). Don't merge with either one red."
  - "Don't overwrite history on shared branches — no force-push to branches others see (main, shared working branches). Rebase only on your local branches."
  - "Don't commit secrets or build artifacts — exclude them from the start with .gitignore. A secret pushed once is considered leaked."
tags:
  - "git"
  - "branch"
  - "trunk-based"
  - "pull-request"
  - "CI"
  - "rebase"
  - "merge"
  - "force-push"
  - "gitignore"
  - "conflict"
  - "main"
foundational: true
---

# 🌿 Git Workflow — Branching Strategy & Collaboration

> Nail down that branches stay short and small and that nothing reaches main without passing review and CI, so that no matter who works, history stays clean and conflicts are few. Read it when cutting a new branch, opening a PR, or handling merges/conflicts.

The most common collaboration mistakes AI agents and people make are **pushing directly to main, dumping a giant change all at once, and bulldozing shared branches with force-push**. It looks fast at first, but review, reverting, and tracing the cause get drastically harder. Nail the flow down as rules, and the agent will commit safely within that frame too.

## 1. Core Principles

- Go trunk-based — keep main always deployable, do work on short-lived (ideally 1–2 day) branches, and merge quickly. Long-lived branches grow conflicts.
- Don't push directly to main — every change goes through a branch → PR. Protect main with branch protection to block direct push and force-push.
- Keep PRs small — one PR does one thing. Small PRs review faster and hide fewer bugs.
- Both pre-merge gates must pass — at least 1 reviewer approval + green CI (build, test, lint). Don't merge with either one red.
- Don't overwrite history on shared branches — no force-push to branches others see (main, shared working branches). Rebase only on your local branches.
- Don't commit secrets or build artifacts — exclude them from the start with `.gitignore`. A secret pushed once is considered leaked.

## 2. Rules

### 2-1. Branch naming & keeping it short-lived

```
# ❌ Forbidden — meaningless / long-lived branches
git checkout -b temp
git checkout -b my-work        # left for weeks → merge hell

# ✅ Recommended — type/issue/summary, merge and delete as soon as the work is done
git checkout -b feat/142-login-rate-limit
git checkout -b fix/payment-null-amount
git checkout -b chore/bump-deps
```

- Format example: `<type>/<issue-number>-<short-summary>` (type: feat, fix, chore, docs, refactor, etc.). lowercase, kebab-case.
- One branch = one task. When done, merge then delete to keep the list clean.

### 2-2. Protect main & go through PRs

```
# ❌ Forbidden — committing/pushing directly to main
git switch main && git commit -m "..." && git push

# ✅ Recommended — work on a branch → push → create a PR
git switch -c feat/142-login-rate-limit
git push -u origin feat/142-login-rate-limit
# → open the PR and get review and CI
```

- In repo settings, apply **branch protection** to main (and release branches): block direct push, require a PR, require review and CI to pass.

### 2-3. Small PRs & pre-merge gates

```
# ❌ Forbidden — feature + refactor + formatting in one PR across 90 files
# ✅ Recommended — one purpose, as small as possible. A volume a reviewer can read in one pass
```

- Must satisfy **both** 1+ review approval & green CI to merge. Don't merge a failed CI with "we'll fix it later" (no self-approval).
- Self-review before pushing (removing debug traces, etc.) follows `code-review`; proof of completion (DoD, confirming green CI) follows `verification-before-completion`.

### 2-4. rebase vs merge & conflict resolution

```
# ✅ Tidy your local branch on top of the latest main (clean linear history)
git switch feat/142-login-rate-limit
git fetch origin
git rebase origin/main
# On conflict: edit files → git add <file> → git rebase --continue
#              to back out, git rebase --abort

# ✅ When preserving shared history matters, merge (leaves a merge commit)
git merge origin/main
```

- **rebase**: for tidying your branch before it's shared. History becomes linear.
- **merge**: when preserving already-shared history. Follow the team rule (linear vs merge commit).
- Never blindly overwrite one side on a conflict; resolve it by confirming both sides' intent.

### 2-5. No force-push (shared branches)

```
# ❌ Absolutely forbidden — destroying shared-branch history (losing others' work)
git push --force origin main

# ✅ Allowed — on your personal branch, and even then with the safe option
git push --force-with-lease origin feat/142-login-rate-limit
```

- `--force-with-lease` rejects if someone pushed in the meantime → prevents overwrite accidents. Still don't use it on shared branches.

### 2-6. .gitignore — exclude secrets & artifacts

```gitignore
# ❌ Things that must not be committed (examples)
.env
.env.*
*.key
*.pem
secrets/

# Build artifacts, dependencies, local cache
dist/
build/
node_modules/
*.log
.DS_Store
```

- Don't track secrets (.env, keys, tokens) and build artifact/dependency folders from the start.
- If you accidentally committed a secret: immediately revoke and rotate the key (even after wiping it from history, consider it already exposed).

### 2-7. Commit often, in meaningful units

```
# ❌ Forbidden — hoarding all day then one giant commit
# ✅ Recommended — commit often in small working units → push
```

- Small, frequent commits make review, reverting, and tracing the cause (`git bisect`) easy.
- Commit message format (type, subject, body rules) follows `coding-styles`.

## 3. Common Mistakes

Filter these out in review.

- ❌ Pushing directly to main or leaving it unprotected
- ❌ Giant PRs mixing hundreds of files and multiple purposes
- ❌ Merging with red CI / no review
- ❌ Bulldozing a shared branch with `--force` and losing others' commits
- ❌ Overwriting a conflict to one side without confirming both sides' intent
- ❌ Committing `.env`, keys, `node_modules`, `dist`
- ❌ Not deleting merged branches so the list piles up to hundreds

> **Application tip**: Turning on branch protection, required review, and required CI in the repo host (GitHub/GitLab, etc.) means the system blocks it even when a person or agent forgets the rules. Read message conventions alongside `coding-styles`, and change-review criteria alongside `architecture-layering`.

## 4. Checklist

- [ ] Did you do the work on a short-lived branch, not main, and does the branch name follow the `type/summary` rule?
- [ ] Is the PR split small around a single purpose?
- [ ] Did it pass both 1+ review approval and green CI (build, test, lint)?
- [ ] Did you avoid force-pushing to a shared branch (`--force-with-lease` on personal branches)?
- [ ] Are `.env`, keys, tokens, and build artifacts kept out of the commit (check `.gitignore`)?
- [ ] Did you delete the working branch after merging?
