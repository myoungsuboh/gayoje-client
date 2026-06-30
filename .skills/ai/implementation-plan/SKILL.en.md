---
name: Implementation Plan & Progress Tracking Guide (Implementation Plan)
description: A standard guide for establishing an implementation plan and tracking progress before feature development/bug fixing. Includes a step-by-step planning methodology for junior developers. Read this when you need a way to plan, mark status, and share progress before starting a new task. Keywords: implementation plan, TODO/IN PROGRESS/DONE/BLOCKED.
rules:
  - "Establish an implementation plan before coding to prevent losing your way."
  - "Break large tasks into small units such as UI, state management, and API integration."
  - "Visualize and share progress status with the standard notation ([ ]/[-]/[x]/[!])."
  - "Discover blockers and issues early during the planning phase."
tags:
  - "implementation plan"
  - "진행 상태"
  - "TODO/IN PROGRESS/DONE/BLOCKED"
  - "단계별 계획"
  - "checklist"
  - "milestone"
---

# 📋 Implementation Plan & Progress Tracking Guide

> A standard for establishing an implementation plan and tracking progress before starting new feature development or bug fixing. Read this when you need to grasp the big picture of a task and share progress with the team.

## 1. Core Principles
- Establish an implementation plan before coding to prevent losing your way.
- Break large tasks into small units such as UI, state management, and API integration.
- Visualize and share progress status with the standard notation (`[ ]`/`[-]`/`[x]`/`[!]`).
- Discover blockers and issues early during the planning phase.

## 2. Rules

### 2-1. Why should you write an implementation plan? (Tips for junior developers)
1. **Preventing getting lost:** If you start with coding, it's easy to get absorbed in implementation details and forget the goal. Establishing a plan first acts as navigation.
2. **Divide & Conquer:** Even a large task that looks daunting becomes a manageable size when broken into small units such as UI, state management, and API integration.
3. **Visualizing progress:** You can easily share with teammates (especially your mentor) what you did all day and where you are currently stuck.
4. **Blocking issues in advance:** During the planning phase you can discover blockers in advance, such as "Huh? Where do I get this data from?"

### 2-2. Progress Status Notation Standard
* `[ ]` ⚪ **TODO**: Not started yet
* `[-]` 🟡 **IN PROGRESS**: Currently working on
* `[x]` 🟢 **DONE**: Work complete and self-test passed
* `[!]` 🔴 **BLOCKED**: Work blocked by an external factor

### 2-3. Implementation Plan Standard Template

#### 1. 📝 Task Overview
* **Task goal:** (e.g., Implement the shared date picker `<AppDateTimePicker>` component)
* **Related issue/ticket:** `#123`
* **Estimated schedule:** `2026.03.27 ~ 2026.03.29`

#### 2. 🔍 Prerequisites
- [ ] Check the Figma design mockup
- [ ] Check whether the backend API specification (Swagger) has been updated
- [ ] Identify whether a similar existing component exists (avoid duplicate development)

#### 3. 🏃‍♂️ Step-by-step Plan

- **Phase 1: Establishing the UI and component skeleton**
  - [x] 🟢 Create files
  - [-] 🟡 Basic UI markup

- **Phase 2: State management and logic integration**
  - [ ] ⚪ Handle `v-model` binding
  - [ ] ⚪ Add validation logic

- **Phase 3: API integration**
  - [ ] ⚪ Mock data testing
  - [ ] ⚪ Actual API integration and error handling

#### 4. ✅ Final Verification (QA & Testing)
- [ ] ⚪ Check UI on desktop and mobile environments
- [ ] ⚪ Check for no console errors/warnings
- [ ] ⚪ Check for no `npm run build` errors

## 3. Common Mistakes
- ❌ Coding right away without a plan → you lose the goal and wander. Establish a step plan first.
- ❌ Treating a huge phase as one chunk → progress/issues become invisible. Break it into UI/state/API units.
- ❌ Missing per-phase completion (verification) criteria → judging "it's done" is ambiguous. Put verification items in each phase.
- ❌ Leaving BLOCKED unattended/unshared → the mentor doesn't know about the blocker. Specify and share the external factor.
- ❌ Only making a plan and not updating status → the document diverges from reality. Update the notation as you progress.
- ❌ Not considering rollback/risk → there's no response on failure.

## 4. Checklist
- [ ] I wrote the task overview (goal, issue, schedule) before coding
- [ ] I checked the prerequisites (design mockup, API spec, similar components)
- [ ] I broke the task into Phase units (UI/state/API)
- [ ] I apply the standard status notation (`[ ]`/`[-]`/`[x]`/`[!]`) to each item
- [ ] For BLOCKED items I specify and share the external factor
- [ ] I passed the final verification (desktop/mobile UI, console errors, `npm run build`)
