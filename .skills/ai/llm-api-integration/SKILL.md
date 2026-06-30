---
name: LLM API 연동
description: OpenAI·Anthropic·Google 등 LLM API를 안정적으로 연동하고 스트리밍·타임아웃·재시도로 프로덕션 신뢰성을 확보하는 가이드. LLM API를 새로 붙이거나 스트리밍·재시도·키 관리·멀티 프로바이더 추상화를 정할 때 읽는다. 키워드: openai, anthropic, google-generativeai, llm, streaming, sse, retry, timeout, chat_completion, messages.
rules:
  - "LLM API 호출은 반드시 타임아웃(≤30s)과 지수 백오프 재시도(최대 3회)를 설정하고, 일시적 오류와 영구 오류를 구분해 처리한다."
  - "스트리밍 응답(SSE)은 첫 토큰 지연(TTFT)을 줄이는 핵심 수단으로 활용하고, 클라이언트에 청크 단위로 전달한다."
  - "API 키는 환경변수로만 주입하고 코드·로그·응답에 절대 노출하지 않는다."
  - "모델·파라미터(temperature, max_tokens)는 설정 파일에서 관리하고 하드코딩하지 않는다."
  - "LLM 응답은 구조화 검증(Pydantic·Zod) 후 사용하고, 파싱 실패 시 폴백 또는 사용자 오류를 반환한다."
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

# 🤖 LLM API 연동

> OpenAI·Anthropic·Google 등 LLM API를 안정적으로 연동한다. LLM API를 새로 붙이거나 스트리밍·타임아웃·재시도·키 관리·멀티 프로바이더 추상화를 정할 때 읽는다.

## 1. 핵심 원칙
- LLM API 호출은 반드시 타임아웃(≤30s)과 지수 백오프 재시도(최대 3회)를 설정하고, 일시적 오류와 영구 오류를 구분해 처리한다.
- 스트리밍 응답(SSE)은 첫 토큰 지연(TTFT)을 줄이는 핵심 수단으로 활용하고, 클라이언트에 청크 단위로 전달한다.
- API 키는 환경변수로만 주입하고 코드·로그·응답에 절대 노출하지 않는다.
- 모델·파라미터(temperature, max_tokens)는 설정 파일에서 관리하고 하드코딩하지 않는다.
- LLM 응답은 구조화 검증(Pydantic·Zod) 후 사용하고, 파싱 실패 시 폴백 또는 사용자 오류를 반환한다.

## 2. 규칙

### 2-1. 기본 클라이언트 설정 (Python)
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

### 2-2. 스트리밍 응답 (FastAPI SSE)
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

### 2-3. 멀티 프로바이더 추상화
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

### 2-4. 프론트엔드 SSE 수신 (Vue/TypeScript)
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

## 3. 흔한 실수
- 모델명(gpt-*, claude-*, gemini-*)은 분기마다 바뀝니다 — 프로덕션 배포 전 각 공급자 공식 문서로 현행 모델명을 확인하세요.

## 4. 체크리스트
- [ ] 타임아웃(≤30s)과 지수 백오프 재시도(최대 3회)를 설정했는가
- [ ] 일시적 오류(429·5xx)와 영구 오류(4xx)를 구분해 처리했는가
- [ ] 스트리밍(SSE)으로 청크 단위 전달해 TTFT를 줄였는가
- [ ] API 키를 환경변수로만 주입하고 코드·로그·응답에 노출하지 않았는가
- [ ] 모델·파라미터를 설정 파일에서 관리하고 하드코딩하지 않았는가
- [ ] LLM 응답을 구조화 검증 후 사용하고, 파싱 실패 시 폴백을 두었는가
