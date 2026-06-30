---
name: LLM API Integration
description: A guide to reliably integrating LLM APIs such as OpenAI, Anthropic, and Google, and securing production reliability with streaming, timeouts, and retries. Read this when newly attaching an LLM API or defining streaming, retries, key management, or multi-provider abstraction. Keywords: openai, anthropic, google-generativeai, llm, streaming, sse, retry, timeout, chat_completion, messages.
rules:
  - "LLM API calls must always set a timeout (≤30s) and exponential backoff retries (up to 3 times), and handle transient errors and permanent errors distinctly."
  - "Use streaming responses (SSE) as a key means of reducing time to first token (TTFT), and deliver them to the client in chunks."
  - "Inject API keys only via environment variables and never expose them in code, logs, or responses."
  - "Manage models and parameters (temperature, max_tokens) in a config file and do not hardcode them."
  - "Use LLM responses only after structured validation (Pydantic, Zod), and return a fallback or a user-facing error on parse failure."
tags:
  - "openai"
  - "anthropic"
  - "google-generativeai"
  - "llm"
  - "streaming"
  - "sse"
  - "retry"
  - "timeout"
  - "chat_completion"
  - "messages"
---

# 🤖 LLM API Integration

> Reliably integrate LLM APIs such as OpenAI, Anthropic, and Google. Read this when newly attaching an LLM API or defining streaming, timeouts, retries, key management, or multi-provider abstraction.

## 1. Core Principles
- LLM API calls must always set a timeout (≤30s) and exponential backoff retries (up to 3 times), and handle transient errors and permanent errors distinctly.
- Use streaming responses (SSE) as a key means of reducing time to first token (TTFT), and deliver them to the client in chunks.
- Inject API keys only via environment variables and never expose them in code, logs, or responses.
- Manage models and parameters (temperature, max_tokens) in a config file and do not hardcode them.
- Use LLM responses only after structured validation (Pydantic, Zod), and return a fallback or a user-facing error on parse failure.

## 2. Rules

### 2-1. Basic Client Setup (Python)
```python
# ✅ 권장 — 타임아웃 + 지수 백오프 재시도, 일시/영구 오류 구분
# llm_client.py
import os
import time
from openai import OpenAI, APIError, APITimeoutError, RateLimitError

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    timeout=30.0,       # 전체 요청 타임아웃
    max_retries=0,      # 수동 재시도 로직 사용
)

def call_llm(messages: list[dict], model: str = "gpt-4o", **kwargs) -> str:
    """지수 백오프 재시도 포함 LLM 호출"""
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=2048,
                **kwargs,
            )
            return response.choices[0].message.content
        except RateLimitError:
            wait = 2 ** attempt
            time.sleep(wait)
        except APITimeoutError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
        except APIError as e:
            if e.status_code and e.status_code >= 500:
                time.sleep(2 ** attempt)
            else:
                raise  # 4xx는 재시도 불필요
    raise RuntimeError("LLM API 최대 재시도 초과")
```

### 2-2. Streaming Responses (FastAPI SSE)
```python
# ✅ 권장 — SSE로 청크 단위 전달, TTFT 단축
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        stream = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=request.messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield f"data: {delta}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 2-3. Multi-Provider Abstraction
```python
# ✅ 권장 — 프로바이더별 호출을 함수로 추상화, 키는 환경변수에서 주입
from anthropic import Anthropic
from openai import OpenAI

def call_anthropic(messages: list[dict], system: str = "") -> str:
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2048,
        system=system,
        messages=messages,
    )
    return response.content[0].text

def call_google(prompt: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")
    return model.generate_content(prompt).text
```

### 2-4. Frontend SSE Reception (Vue/TypeScript)
```typescript
// ✅ 권장 — 타임아웃을 건 fetch + 청크 스트림 파싱
async function streamChat(messages: Message[]) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(60_000),  // 60초 타임아웃
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    chunk.split("\n\n").forEach(line => {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        output.value += line.slice(6);
      }
    });
  }
}
```

## 3. Common Mistakes
- Model names (gpt-*, claude-*, gemini-*) change every quarter — verify the current model names against each provider's official docs before deploying to production.

## 4. Checklist
- [ ] Did you set a timeout (≤30s) and exponential backoff retries (up to 3 times)?
- [ ] Did you handle transient errors (429, 5xx) and permanent errors (4xx) distinctly?
- [ ] Did you reduce TTFT by delivering in chunks via streaming (SSE)?
- [ ] Did you inject API keys only via environment variables and not expose them in code, logs, or responses?
- [ ] Did you manage models and parameters in a config file rather than hardcoding them?
- [ ] Did you use LLM responses after structured validation and set up a fallback on parse failure?
