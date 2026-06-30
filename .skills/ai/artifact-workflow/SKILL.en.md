---
name: Artifact-Based Workflow (Artifact Workflow)
description: A general-purpose workflow standard that manages plans and progress in artifact files rather than in chat — split long plans into files (clean chat), write a plan file before work, track progress in files (checkboxes), and summarize on completion. It is independent of any specific agent tool. Read it when starting a new task or reporting progress, or when reorganizing how you track plans and progress in files. Keywords: artifact, workflow, implementation plan, task tracking, progress, checkbox, clean chat, file-based.
rules:
  - "Keep chat clean, keep the record in files — do not expose long plans of 5+ lines or complex step-by-step procedures directly in chat. Write them in an artifact file and leave only the file location + a one-line summary in chat."
  - "Document the plan before work — before starting a new task, first write the plan as an artifact file (see implementation-plan). Do not keep it only in your head or in chat."
  - "Track progress in files — show progress with checkboxes ([ ] → [x]) in an artifact file so the user can check the current status from a single file at any time."
  - "Single Source of Truth — the file is the reference for plans, progress, and results. Do not write the same content at length in both chat and the file."
  - "Tool-neutral — an artifact is just an ordinary file placed in an arbitrary artifacts/ directory. Do not depend on a specific agent tool's dedicated paths or metadata formats (see the appendix for tool-specific concrete formats)."
tags:
  - "artifact"
  - "workflow"
  - "implementation plan"
  - "task tracking"
  - "progress"
  - "checkbox"
  - "clean chat"
  - "file-based"
  - "vite build"
  - "dist/"
---

# 📁 Artifact-Based Workflow (Artifact Workflow)

> Manage plans and progress in artifact files (working-output files) rather than scattering them across the chat window. Split long plans into files to keep chat clean, leave a plan in a file before work, track progress in files, and leave a summary on completion. Read it when starting a new task or reporting progress. It is a general-purpose standard not tied to any specific agent tool (file paths or metadata formats).

## 1. Core Principles

- **Keep chat clean, keep the record in files** — do not expose long plans of 5+ lines or complex step-by-step procedures directly in chat. Write them in an artifact file and leave only the file location + a one-line summary in chat.
- **Document the plan before work** — before starting a new task, first write the plan as an artifact file (see `implementation-plan`). Do not keep it only in your head or in chat.
- **Track progress in files** — show progress with checkboxes (`[ ]` → `[x]`) in an artifact file so the user can check the current status from a single file at any time.
- **Single Source of Truth** — the file is the reference for plans, progress, and results. Do not write the same content at length in both chat and the file.
- **Tool-neutral** — an artifact is just an ordinary file placed in an arbitrary `artifacts/` directory. Do not depend on a specific agent tool's dedicated paths or metadata formats (see the appendix for tool-specific concrete formats).

## 2. Rules

### 2-1. Long Plans Go to Files, Chat Gets a One-Line Summary (Clean Chat)

- Do not paste long plans of 5+ lines or complex step-by-step procedures wholesale into chat.
- Create/update an artifact file and leave only the **file location + a one-line summary** in chat.

```text
// ❌ Forbidden — pasting a 20-line plan wholesale into chat
"Here is the plan:
 1. ...
 2. ...
 ... (20 lines)"

// ✅ Recommended — split into a file, chat gets location + one-line summary
"I analyzed the requested feature and wrote the plan in artifacts/router_migration_plan.md. Please review and approve."
```

### 2-2. Write a Plan Artifact Before Work (Documented Planning)

- Before starting a new task, first create a plan artifact (follow the `implementation-plan` skill for the format).
- Place it under an arbitrary `artifacts/` directory with a meaningful filename (e.g., `artifacts/router_migration_plan.md`).
- Contents: task goal, prerequisites to confirm, phase-by-phase implementation plan.

```text
// ❌ Forbidden — starting implementation right away without a plan
start coding...

// ✅ Recommended — plan file first, then implementation
write artifacts/<task>_plan.md  →  start implementation
```

### 2-3. Track Progress with Checkboxes (Task-Centric Tracking)

- Manage real-time progress in a progress-tracking artifact file.
- Update per-phase progress with checkboxes so the current status is clear just by looking at the file.
- When to update: on each phase completion or on important status changes.

```text
// ✅ Recommended — show progress with checkboxes inside the file
## Progress
- [x] Phase 1: Define schema
- [x] Phase 2: Implement handler
- [ ] Phase 3: Tests
```

### 2-4. Wrap Up with a Summary Artifact on Completion (Summary)

- When the task is done, leave a summary artifact and wrap up the chat.
- Include: final deliverable location, summary of changes, test results.

> The whole flow boils down to one line: **plan (2-2) → track (2-3) → summarize (2-4)**. See the appendix for tool-specific examples of the chat output phrasing at each step.

### 2-5. Short Text Only When an Immediate Answer Is Needed

- Write text directly in chat only for short responses where the user wants immediate feedback.
- Move all other long, structured content to artifact files.

## 3. Common Mistakes

- **Pasting a long plan wholesale into chat** → the conversation gets messy and hard to find later. Split into a file and leave only a one-line summary.
- **Implementing right away without a plan** → scope drifts and the user-approval point disappears. Create a plan artifact before work.
- **Reporting progress only in chat** → there is no single source to see the current status at a glance. Track it in a file with checkboxes.
- **Writing plans/progress in both chat and file** → the two diverge. Make the file the single source and keep chat to summaries only.
- **Missing a completion summary** → the deliverable location, change summary, and test results get scattered. Wrap up with a summary artifact on completion.
- **Depending on a specific tool's dedicated paths/metadata** → it breaks when moving to another agent tool. Base it on an arbitrary `artifacts/` directory + ordinary files, and separate tool-specific formats like an appendix.

## 4. Checklist

- [ ] Did not expose a 5+ line plan wholesale in chat, and left only the file location + a one-line summary
- [ ] Created a plan artifact before starting work (format per `implementation-plan`)
- [ ] Saved the plan in an arbitrary `artifacts/` directory with a meaningful filename
- [ ] Updating progress with checkboxes (`[x]`) in the artifact file
- [ ] Updated progress at each phase completion/status change
- [ ] On completion, wrote a summary artifact with deliverable location, change summary, and test results
- [ ] The single source for plans/progress/results is the file (not double-written in chat)

## Appendix: Tool-Specific Examples

> The below are concrete application examples for a specific agent tool. The principles/rules of sections 1–4 above are the standard; the appendix is merely a tool-specific application case. **Other agent tools are added by the team following the same pattern.**

### Gemini Antigravity

In the Gemini Antigravity environment, artifacts are handled by the following convention.

- **Type distinction**: create plans as `implementation_plan` type artifacts and progress tracking as `task` type artifacts.
- **Storage path**: place artifact files under `./.gemini/antigravity/artifacts/` with a clear filename (e.g., `./.gemini/antigravity/artifacts/router_migration_plan.md`).
- **Metadata**: always create/modify artifact files including `IsArtifact: true` and appropriate `ArtifactMetadata`.
- **Chat output examples**:
  - Plan: "✅ I analyzed the requested feature and wrote an implementation plan (`.gemini/antigravity/artifacts/task_name_plan.md`). Please review and approve."
  - Progress: "🟡 Phase 1 complete. I updated the progress (`.gemini/antigravity/artifacts/task_tracking.md`). Proceeding to the next step."
