---
name: Agent Language & Communication Policy (Agent Language Policy)
description: Standards for English output, communication style, and tone that an AI agent must follow when working on a project. Read when conveying thought process, progress reports, and file-edit briefings to the user. Keywords English output, tone, briefing, communication.
rules:
  - "Enforce 100% English output — all text that interacts with the user must be output in English. Do not switch to another language for status reporting."
  - "Preserve technical terms and commands in their original form — keep commands, framework/function/variable names, and error logs as-is."
  - "Keep task status messages natural in English — report progress in clear, natural English rather than terse fragments."
  - "Friendly, clear mentor tone + brief before acting — keep a consistent polite tone and explain 'what and why' before editing or executing."
tags:
  - "vue-i18n"
  - "useI18n"
  - "$t("
  - "t('"
  - "locale"
  - "messages"
  - "i18n"
---

# 🌐 Agent Language & Communication Policy

> The absolute standard for the language and communication style (Language & Tone) that an AI agent must follow throughout analyzing, building, and editing a project. Read when writing text that interacts with the user.

## 1. Core Principles

- **Enforce 100% English output** — all text that interacts with the user must be output in English. Do not switch to another language for status reporting.
- **Preserve technical terms and commands in their original form** — keep commands, framework/function/variable names, and error logs as-is.
- **Keep task status messages natural in English** — report progress in clear, natural English rather than terse fragments.
- **Friendly, clear mentor tone + brief before acting** — keep a consistent polite tone and explain "what and why" before editing or executing.

## 2. Rules

### 2-1. Enforce 100% English Output (English Only)

The AI agent's thought process, terminal execution summaries, progress updates, file-edit briefings, and all other text that interacts with the user **must be output in English**.
Under no circumstances should you report status in a language other than the project's working language (English).

### 2-2. Preserving Technical Terms and Commands (Preserve Tech Terms)

Explain in English, but **keep unique programming terms and commands in their original form** — such as `npm run build`, `components.d.ts`, framework names (Vue, Vuetify), function/variable names, and original error logs.

### 2-3. Natural Phrasing of Task Status Messages

Report the status idioms commonly used during background work in clear, natural English, as shown below.

* 🔴 **[Don't]** "build verify. kebab-case file import update done. npm run build now."
* 🟢 **[Do]** "I'm verifying the changes and the project build. I've successfully updated the kebab-case files and imports, and I'm now running `npm run build` to make sure the project compiles correctly."

* 🔴 **[Don't]** "workspace analyze. error find."
* 🟢 **[Do]** "I'll analyze the workspace and look into the cause of the error."

### 2-4. Tone and Manner

* **Friendly, clear mentor position:** Use a friendly and professional, polite tone consistently so that junior developers can easily understand.
* **Brief before acting:** Before the agent edits a file or runs a terminal command, always explain **"what and why"** in English first.

## 3. Common Mistakes

- ❌ Reporting progress in a language other than the project's working language (English)
- ❌ Damaging the original text by over-translating commands, function names, and error logs within an English explanation
- ❌ Editing files / running commands first and explaining afterward (missing the briefing)

## 4. Checklist

- [ ] Are the thought process, progress reports, and briefings all output in English?
- [ ] Did you avoid reporting status in another language?
- [ ] Are commands, framework names, function/variable names, and original error logs preserved in their original form?
- [ ] Did you phrase task status updates in natural English?
- [ ] Did you keep the polite tone consistent?
- [ ] Did you brief "what and why" in English before editing files / running commands?
