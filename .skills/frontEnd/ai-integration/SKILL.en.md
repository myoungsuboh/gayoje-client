---
name: AI Solution Integration (AI Integration)
description: Design guidelines for integrating LLM and AI features into the frontend. Read when you need a data pipeline, streaming response handling, or prompt management. Keywords LLM, SSE, streaming, prompt, composable.
rules:
  - "Refine the data passed to AI into structured JSON, and include page state and prior activity as context."
  - "Handle long responses with streaming (SSE / Fetch HTTP Streaming) to eliminate wait time."
  - "Do not write prompts directly in business logic; separate them into a dedicated management file."
tags:
  - "openai"
  - "anthropic"
  - "claude"
  - "gpt-4"
  - "completion"
  - "stream"
  - "embedding"
---

# 🤖 AI Solution Integration (AI Integration)

> The design standard to follow when integrating LLM and AI features into the frontend. Read when designing AI API integration, streaming response UI, or prompt management structure.

## 1. Core Principles

- **Refine the data passed to AI into structured JSON**, and include page state and prior activity as context.
- **Handle long responses with streaming (SSE / Fetch HTTP Streaming)** to eliminate wait time.
- **Do not write prompts directly in business logic; separate them into a dedicated management file**.

## 2. Rules

### 2-1. Data Pipeline

- **Data refinement**: Convert data generated in the UI into a structured JSON form that the AI can easily understand, and pass it to the API.
- **Context extraction**: Include the current page state or the user's prior activity history as context to improve the accuracy of answers.

### 2-2. Streaming Response

- To eliminate the long wait time for LLM responses, SSE (Server-Sent Events) or the Fetch HTTP Streaming API is recommended.
- Implement and use a dedicated Composable to handle text that updates in real time.

### 2-3. Prompt Management

- Do not write prompt strings directly within business logic; manage them systematically through a dedicated management file (`prompt-only module`) or similar.

## 3. Common Mistakes
- ❌ **Exposing API keys in the frontend** → Route through a backend proxy and keep keys only on the server.
- ❌ Not implementing cancellation (abort) during streaming → Requests and tokens keep being consumed even after the user leaves the screen. Abort with `AbortController`.
- ❌ Not handling errors, timeouts, or rate limits (429) → Blank screen. Handle with retries and fallback messages.
- ❌ Rendering LLM responses directly as markdown/HTML → XSS. Sanitize the output.
- ❌ Hardcoding prompts into components → Separate into a dedicated module (versioning, i18n, reuse).
- ❌ Unbounded context accumulation → Exceeds the token limit and costs spike. Limit the window or summarize.
- ❌ Long waits with no loading indicator → Show streaming tokens or a skeleton to reduce perceived wait.

## 4. Checklist

- [ ] Did you refine the data passed to AI into structured JSON?
- [ ] Did you include page state / user activity history as context?
- [ ] Did you handle long responses with SSE or Fetch HTTP Streaming?
- [ ] Did you implement a dedicated Composable for real-time text updates?
- [ ] Did you separate prompt strings into a dedicated management file (`prompt-only module`, etc.)?
