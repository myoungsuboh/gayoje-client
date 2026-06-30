---
name: LLM API 对接
description: 稳定对接 OpenAI·Anthropic·Google 等 LLM API,并通过流式·超时·重试确保生产可靠性的指南。在新接入 LLM API,或定义流式·重试·密钥管理·多提供商抽象时阅读。关键词: openai, anthropic, google-generativeai, llm, streaming, sse, retry, timeout, chat_completion, messages.
rules:
  - "LLM API 调用必须设置超时(≤30s)和指数退避重试(最多 3 次),并区分处理临时性错误与永久性错误。"
  - "把流式响应(SSE)作为减少首个 token 延迟(TTFT)的核心手段加以利用,按块传递给客户端。"
  - "API 密钥只通过环境变量注入,绝不在代码·日志·响应中暴露。"
  - "模型·参数(temperature, max_tokens)在配置文件中管理,不进行硬编码。"
  - "LLM 响应经过结构化校验(Pydantic·Zod)后再使用,解析失败时返回回退或用户错误。"
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

# 🤖 LLM API 对接

> 稳定对接 OpenAI·Anthropic·Google 等 LLM API。在新接入 LLM API,或定义流式·超时·重试·密钥管理·多提供商抽象时阅读。

## 1. 核心原则
- LLM API 调用必须设置超时(≤30s)和指数退避重试(最多 3 次),并区分处理临时性错误与永久性错误。
- 把流式响应(SSE)作为减少首个 token 延迟(TTFT)的核心手段加以利用,按块传递给客户端。
- API 密钥只通过环境变量注入,绝不在代码·日志·响应中暴露。
- 模型·参数(temperature, max_tokens)在配置文件中管理,不进行硬编码。
- LLM 响应经过结构化校验(Pydantic·Zod)后再使用,解析失败时返回回退或用户错误。

## 2. 规则

### 2-1. 基本客户端配置 (Python)
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

### 2-2. 流式响应 (FastAPI SSE)
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

### 2-3. 多提供商抽象
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

### 2-4. 前端 SSE 接收 (Vue/TypeScript)
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

## 3. 常见错误
- 模型名(gpt-*, claude-*, gemini-*)每个季度都会变化 —— 在生产部署前请到各提供商官方文档确认现行的模型名。

## 4. 检查清单
- [ ] 是否设置了超时(≤30s)和指数退避重试(最多 3 次)?
- [ ] 是否区分处理了临时性错误(429·5xx)与永久性错误(4xx)?
- [ ] 是否通过流式(SSE)按块传递以减少 TTFT?
- [ ] 是否只通过环境变量注入 API 密钥,而未在代码·日志·响应中暴露?
- [ ] 是否在配置文件中管理模型·参数,而未进行硬编码?
- [ ] 是否在结构化校验后使用 LLM 响应,并在解析失败时设置了回退?
