---
name: AI 智能体规则文件 (AGENTS.md / CLAUDE.md)
description: 为了让 Cursor·Claude Code·Windsurf 等 AI 编码智能体正确实现项目，在仓库根目录放置规则文件（AGENTS.md），明示技术栈·命令·代码风格·禁止事项的指南。在开始新项目或整理 vibe coding 上下文时、智能体因不了解命令·约定而迷茫时阅读。关键词: AGENTS.md, CLAUDE.md, .cursorrules, cursor, claude-code, windsurf, copilot, agent-rules, vibe-coding, context-file。
rules:
  - "在仓库根目录放置 AGENTS.md（或 CLAUDE.md/.cursorrules），设置项目概述·技术栈·设置命令·代码风格·测试方法·安全注意事项等章节。"
  - "只写智能体无法从代码中自行得知的内容 — 聚焦于构建/运行/测试命令、约定的「为什么」、不该做的事（反例）。"
  - "一个真实的代码片段胜过三段抽象说明 — 用示例代码展示期望的模式。"
  - "破坏性·不可逆操作（数据库迁移、部署、密钥变更、批量删除）明示为「未经人工确认禁止执行」。"
  - "规则文件由人工亲自策划 — 若因自动生成而臃肿，只会消耗 token 并降低准确度。保持简短而准确。"
  - "使用多个智能体时，将 AGENTS.md 作为单一真实来源，CLAUDE.md/.cursorrules 用符号链接或引用统一。"
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

# 🤖 AI 智能体规则文件 (AGENTS.md)

> 让 AI 编码智能体读取仓库根目录的规则文件，并按照项目规约进行工作。在开始新项目或整理 vibe coding 上下文时、智能体因不了解命令·约定而迷茫时阅读。

AI 编码智能体（Cursor, Claude Code, Windsurf, Codex, Copilot）会原生读取仓库根目录的 **AGENTS.md**，
并将其作为针对项目的工作指引。这是 2026 年被 6 万多个公开仓库采用的事实标准。

## 1. 核心原则

- 在仓库根目录放置 `AGENTS.md`（或 `CLAUDE.md`/`.cursorrules`），设置项目概述·技术栈·设置命令·代码风格·测试方法·安全注意事项等章节。
- 只写智能体无法从代码中自行得知的内容 — 聚焦于构建/运行/测试命令、约定的「为什么」、不该做的事（反例）。
- 一个真实的代码片段胜过三段抽象说明 — 用示例代码展示期望的模式。
- 破坏性·不可逆操作（数据库迁移、部署、密钥变更、批量删除）明示为「未经人工确认禁止执行」。
- 规则文件由人工亲自策划 — 若因自动生成而臃肿，只会消耗 token 并降低准确度。保持简短而准确。
- 使用多个智能体时，将 `AGENTS.md` 作为单一真实来源，`CLAUDE.md`/`.cursorrules` 用符号链接或引用统一。

## 2. 规则

### 2-1. 为什么需要

智能体读取代码能掌握*结构*，但无法推断**构建/运行/测试命令**、**约定的意图**、
**不该做的事**。为了不必每次会话反复说明，用文件将其固定下来。

### 2-2. 推荐结构（社区收敛型）

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

### 2-3. 编写原则

1. **只写智能体不知道的内容。** 去掉代码即可自明的部分，聚焦于命令·意图·禁止事项。
2. **反例（counterexample）最有价值。** 像「禁止 any」「此文件夹为自动生成，禁止修改」这类违反直觉的规则。
3. **片段 > 说明。** 把期望的模式用代码展示出来，比冗长说明更能被精确遵循。
4. **保持简短。** 庞大的自动生成文件只会消耗 token 反而降低准确度 — 由人工策划。

### 2-4. 多个智能体的统一化

```bash
# ✅ 권장 — AGENTS.md 를 단일 진실원으로 두고 나머지는 심볼릭 링크
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md .cursorrules
```

## 3. 常见错误

- 在单个文件里塞入数百行的泛泛之论（智能体已经知道的 React 语法等）→ 只消耗 token 并降低准确度。
- 写入频繁变动的细节实现 → 很快就 stale。以稳定的规约·命令为主来写。
- 漏掉破坏性操作的禁止规则 → 智能体会擅自执行数据库迁移·部署。
- 分别管理各智能体的规则文件 → 内容会出现偏差。用单一真实来源 + 链接统一。

## 4. 检查清单

- [ ] 仓库根目录是否有 `AGENTS.md`（或 `CLAUDE.md`/`.cursorrules`）
- [ ] 是否具备概述·技术栈·设置命令·代码风格·测试·安全等章节
- [ ] 是否聚焦于命令·意图·反例，而非代码即可自明的泛泛之论
- [ ] 是否将破坏性·不可逆操作明示为「未经人工确认禁止执行」
- [ ] 使用多个智能体时是否用单一真实来源 + 链接/引用统一
- [ ] 是否将文件保持简短而准确（人工策划）
