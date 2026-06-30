---
name: LLM API連携
description: OpenAI・Anthropic・GoogleなどのLLM APIを安定的に連携し、ストリーミング・タイムアウト・リトライで本番の信頼性を確保するガイド。LLM APIを新規に組み込む場合や、ストリーミング・リトライ・キー管理・マルチプロバイダー抽象化を定める際に読む。キーワード: openai, anthropic, google-generativeai, llm, streaming, sse, retry, timeout, chat_completion, messages.
rules:
  - "LLM API呼び出しは必ずタイムアウト(≤30s)と指数バックオフのリトライ(最大3回)を設定し、一時的エラーと恒久的エラーを区別して処理する。"
  - "ストリーミング応答(SSE)は初回トークン遅延(TTFT)を減らす中核的手段として活用し、クライアントへチャンク単位で渡す。"
  - "APIキーは環境変数からのみ注入し、コード・ログ・応答に絶対に露出しない。"
  - "モデル・パラメータ(temperature, max_tokens)は設定ファイルで管理し、ハードコーディングしない。"
  - "LLM応答は構造化検証(Pydantic・Zod)の後に使用し、パース失敗時はフォールバックまたはユーザーエラーを返す。"
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

# 🤖 LLM API連携

> OpenAI・Anthropic・GoogleなどのLLM APIを安定的に連携する。LLM APIを新規に組み込む場合や、ストリーミング・タイムアウト・リトライ・キー管理・マルチプロバイダー抽象化を定める際に読む。

## 1. 基本原則
- LLM API呼び出しは必ずタイムアウト(≤30s)と指数バックオフのリトライ(最大3回)を設定し、一時的エラーと恒久的エラーを区別して処理する。
- ストリーミング応答(SSE)は初回トークン遅延(TTFT)を減らす中核的手段として活用し、クライアントへチャンク単位で渡す。
- APIキーは環境変数からのみ注入し、コード・ログ・応答に絶対に露出しない。
- モデル・パラメータ(temperature, max_tokens)は設定ファイルで管理し、ハードコーディングしない。
- LLM応答は構造化検証(Pydantic・Zod)の後に使用し、パース失敗時はフォールバックまたはユーザーエラーを返す。

## 2. ルール

### 2-1. 基本クライアント設定 (Python)
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

### 2-2. ストリーミング応答 (FastAPI SSE)
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

### 2-3. マルチプロバイダー抽象化
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

### 2-4. フロントエンドのSSE受信 (Vue/TypeScript)
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

## 3. よくある間違い
- モデル名(gpt-*, claude-*, gemini-*)は四半期ごとに変わります — 本番デプロイ前に各プロバイダーの公式ドキュメントで現行のモデル名を確認してください。

## 4. チェックリスト
- [ ] タイムアウト(≤30s)と指数バックオフのリトライ(最大3回)を設定したか
- [ ] 一時的エラー(429・5xx)と恒久的エラー(4xx)を区別して処理したか
- [ ] ストリーミング(SSE)でチャンク単位に渡してTTFTを減らしたか
- [ ] APIキーを環境変数からのみ注入し、コード・ログ・応答に露出しなかったか
- [ ] モデル・パラメータを設定ファイルで管理し、ハードコーディングしなかったか
- [ ] LLM応答を構造化検証の後に使用し、パース失敗時にフォールバックを置いたか
