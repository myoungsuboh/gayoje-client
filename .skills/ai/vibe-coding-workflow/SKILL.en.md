---
name: Vibe Coding Workflow (Context Engineering)
description: A practical workflow for building projects with AI coding agents by breaking work into small pieces, injecting only the necessary context, and proceeding while reviewing results. Read this when you want stable results from a spec-based approach instead of vague requests, or when the agent fixes the wrong place or loses context. Keywords: vibe-coding, context-engineering, cursor, claude-code, spec-driven, prompt, ai-pair-programming, workflow, scope-control.
rules:
  - "Request work as a single small, verifiable unit at a time — split it into one-PR-sized chunks, like 'signup form + validation + error display'."
  - "Describe the desired behavior/symptom (what), not how to fix it — 'pagination returns duplicates during inserts' yields more accurate results than 'add a WHERE clause'."
  - "Put only the necessary files/docs into context (@file, @docs) — dumping everything actually lowers accuracy."
  - "When the task changes, start a new session/new context — long sessions cause the agent to lose earlier context."
  - "Skim the combined diff once before Accept All — catching a wrong-file edit in 5 seconds is cheaper than 30 minutes of debugging."
  - "Provide the PRD/spec first, then generate code — the more concrete the spec, the less hallucination and rework."
  - "When the agent gets stuck, don't enlarge the prompt; break it into smaller steps and paste the failure logs/error messages verbatim."
tags:
  - "vibe-coding"
  - "context-engineering"
  - "cursor"
  - "claude-code"
  - "spec-driven"
  - "prompt"
  - "ai-pair-programming"
  - "workflow"
  - "scope-control"
---

# 🤖 Vibe Coding Workflow

> "Vibe coding" is the practice of describing what you want in natural language and having an AI agent implement it. Read this when working with AI coding agents, or when the agent fixes the wrong place or loses context.

90% of success is **context engineering** — what you provide, how much, and in what order.

## 1. Core Principles

- Request work as a single small, verifiable unit at a time — split it into one-PR-sized chunks, like 'signup form + validation + error display'.
- Describe the desired behavior/symptom (what), not how to fix it — 'pagination returns duplicates during inserts' yields more accurate results than 'add a WHERE clause'.
- Put only the necessary files/docs into context (@file, @docs) — dumping everything actually lowers accuracy.
- When the task changes, start a new session/new context — long sessions cause the agent to lose earlier context.
- Skim the combined diff once before Accept All — catching a wrong-file edit in 5 seconds is cheaper than 30 minutes of debugging.
- Provide the PRD/spec first, then generate code — the more concrete the spec, the less hallucination and rework.
- When the agent gets stuck, don't enlarge the prompt; break it into smaller steps and paste the failure logs/error messages verbatim.

## 2. Rules

### 2-1. Break It Small (Scope Control)

Not "build me a shopping mall" all at once, but in one-PR-sized chunks:

```
❌ 전체 결제 시스템을 구현해줘
✅ 1) 장바구니 담기 API + 단위 테스트
   2) 결제 요청 화면 (금액 표시 + 약관 동의)
   3) 결제 웹훅 수신 + 멱등 처리
```

Small units are reviewable, and even if they fail the rollback scope is small.

### 2-2. Describe the Behavior (What, not How)

```
❌ pagination 쿼리에 WHERE id > :cursor 추가해
✅ 목록을 스크롤하는 중에 항목이 새로 삽입되면 같은 항목이
   두 번 나온다. 커서 기반으로 안정적으로 페이징되게 해줘.
```

Specifying the solution blocks the agent's better alternatives. State the **symptom and expected behavior**.

### 2-3. Context, Precisely

- `@파일명` for relevant files only, `@docs` for conventions, `@web` for the latest info.
- ❌ Don't put in everything — as noise grows, it fixes the wrong place.
- ✅ Providing the PRD/API spec first greatly reduces hallucination. (← an artifact Harness produces for you)

### 2-4. Session Hygiene

When the task topic changes, **a new session**. A long conversation loses earlier context and makes wrong assumptions.

### 2-5. Review, Then Accept

Before `Accept All`, **skim the combined diff once.** Catching a wrong file, deletion, or secret exposure in 5 seconds is cheaper than 30 minutes of debugging. (For security and review, see the 'AI-Generated Code Review' skill.)

## 3. Common Mistakes

- Don't grow the prompt; **break the steps down further.** When the agent is stuck, a bigger prompt is not the answer.
- Paste error messages and failure logs **verbatim** — don't summarize, give the original.
- If you get stuck at the same spot two or three times, change the approach (different library/structure).

## 4. Checklist

- [ ] Did you split the work into small, verifiable, one-PR-sized units?
- [ ] Did you describe what (symptom/expected behavior) rather than how (the solution)?
- [ ] Did you put only the necessary files/docs into context (no dumping everything)?
- [ ] Did you start a new session when the task topic changed?
- [ ] Did you skim the combined diff before Accept All?
- [ ] When stuck, did you break the steps down further instead of enlarging the prompt?
