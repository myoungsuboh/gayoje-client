---
name: AI Agent Rules File (AGENTS.md / CLAUDE.md)
description: A guide to placing a rules file (AGENTS.md) at the repo root so AI coding agents like Cursor, Claude Code, and Windsurf implement a project correctly, specifying the stack, commands, code style, and prohibitions. Read when starting a new project, organizing vibe-coding context, or when an agent flounders because it doesn't know the commands and conventions. Keywords: AGENTS.md, CLAUDE.md, .cursorrules, cursor, claude-code, windsurf, copilot, agent-rules, vibe-coding, context-file.
rules:
  - "Place AGENTS.md (or CLAUDE.md/.cursorrules) at the repo root with sections for project overview, tech stack, setup commands, code style, testing method, and security cautions."
  - "Write only what the agent cannot figure out from the code itself — focus on build/run/test commands, the 'why' of conventions, and what not to do (counterexamples)."
  - "One real code snippet beats three paragraphs of abstract explanation — show the desired pattern with example code."
  - "Mark destructive/irreversible operations (DB migrations, deployment, secret changes, mass deletion) as 'do not run without human confirmation'."
  - "Curate the rules file by hand — if it grows bloated via auto-generation, it just eats tokens and lowers accuracy. Keep it short and accurate."
  - "When using multiple agents, treat AGENTS.md as the single source of truth and unify CLAUDE.md/.cursorrules as symbolic links or references."
tags:
  - "AGENTS.md"
  - "CLAUDE.md"
  - ".cursorrules"
  - "cursor"
  - "claude-code"
  - "windsurf"
  - "copilot"
  - "agent-rules"
  - "vibe-coding"
  - "context-file"
---

# 🤖 AI Agent Rules File (AGENTS.md)

> Make an AI coding agent read the rules file at the repo root and work according to the project's conventions. Read when starting a new project, organizing vibe-coding context, or when an agent flounders because it doesn't know the commands and conventions.

AI coding agents (Cursor, Claude Code, Windsurf, Codex, Copilot) read **AGENTS.md** at the repo root
natively and use it as project-specific work instructions. It is the de facto standard adopted by 60,000+ public repos in 2026.

## 1. Core Principles

- Place `AGENTS.md` (or `CLAUDE.md`/`.cursorrules`) at the repo root with sections for project overview, tech stack, setup commands, code style, testing method, and security cautions.
- Write only what the agent cannot figure out from the code itself — focus on build/run/test commands, the 'why' of conventions, and what not to do (counterexamples).
- One real code snippet beats three paragraphs of abstract explanation — show the desired pattern with example code.
- Mark destructive/irreversible operations (DB migrations, deployment, secret changes, mass deletion) as 'do not run without human confirmation'.
- Curate the rules file by hand — if it grows bloated via auto-generation, it just eats tokens and lowers accuracy. Keep it short and accurate.
- When using multiple agents, treat `AGENTS.md` as the single source of truth and unify `CLAUDE.md`/`.cursorrules` as symbolic links or references.

## 2. Rules

### 2-1. Why It Is Needed

An agent reads the code to grasp the *structure*, but cannot infer **build/run/test commands**, **the intent of conventions**,
and **what not to do**. To avoid re-explaining this every session, fix it in a file.

### 2-2. Recommended Structure (Community-Converged)

```markdown
# <프로젝트명>

## Project Overview
한 문단으로 무엇을 만드는 서비스인지.

## Tech Stack
- Frontend: Vue 3 + Vite + Vuetify
- Backend: Spring Boot 3 (Java 17)
- DB: PostgreSQL + MyBatis

## Setup / Commands
- 설치: `pnpm i`
- 개발: `pnpm dev`
- 테스트: `pnpm test` (반드시 통과 후 커밋)
- 빌드: `pnpm build`

## Code Style
- 컴포넌트 PascalCase, 변수/함수 camelCase
- 커밋: `type(scope): 요약` (Conventional Commits)
- (반례) any 타입 금지 — unknown + 좁히기 사용

## Testing
- 변경한 코드 경로의 테스트를 추가/갱신하고 전체 그린 확인 후 커밋

## Security
- 시크릿은 .env (커밋 금지). 결제/인증 로직은 사람 검토 필수
- DB 마이그레이션·배포·대량 삭제는 사람 확인 없이 실행 금지
```

### 2-3. Writing Principles

1. **Write only what the agent doesn't know.** Leave out what's self-evident from code; focus on commands, intent, and prohibitions.
2. **Counterexamples are the most valuable.** Counterintuitive rules like "no any", "this folder is auto-generated, do not edit".
3. **Snippet > explanation.** Showing the desired pattern as code is followed more precisely than verbose explanation.
4. **Keep it short.** A massive auto-generated file just eats tokens and actually lowers accuracy — curate by hand.

### 2-4. Unifying Multiple Agents

```bash
# ✅ 권장 — AGENTS.md 를 단일 진실원으로 두고 나머지는 심볼릭 링크
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md .cursorrules
```

## 3. Common Mistakes

- Filling a single file with hundreds of lines of generalities (React syntax the agent already knows, etc.) → just eats tokens and lowers accuracy.
- Writing down frequently-changing implementation details → goes stale quickly. Write mainly stable conventions and commands.
- Omitting prohibition rules for destructive operations → the agent runs DB migrations and deployments at will.
- Managing per-agent rules files separately → the contents diverge. Unify with a single source of truth + links.

## 4. Checklist

- [ ] Is there an `AGENTS.md` (or `CLAUDE.md`/`.cursorrules`) at the repo root?
- [ ] Does it have overview, stack, setup commands, code style, testing, and security sections?
- [ ] Did you focus on commands, intent, and counterexamples instead of code-evident generalities?
- [ ] Did you mark destructive/irreversible operations as 'do not run without human confirmation'?
- [ ] When using multiple agents, did you unify with a single source of truth + links/references?
- [ ] Did you keep the file short and accurate (human-curated)?
