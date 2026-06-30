---
name: LLM 비용 & 지연 최적화
description: 토큰 계산·캐싱·모델 선택·배칭 전략으로 LLM API 비용을 줄이고 응답 지연을 최소화하는 가이드. LLM 호출 비용이 높거나 응답이 느릴 때, 모델을 선택하거나 프롬프트 캐싱·배치 처리를 도입할 때 읽는다. 키워드: cost, token, caching, prompt-cache, batch-api, model-routing, tiktoken, gpt-4o-mini, haiku, latency, ttft.
rules:
  - "입력 토큰을 최소화하기 위해 시스템 프롬프트를 간결하게 유지하고, 불필요한 few-shot 예제를 제거한다."
  - "반복되는 시스템 프롬프트는 프롬프트 캐싱(Anthropic Prompt Cache·OpenAI Cached Input)을 활용해 비용을 90%까지 절감한다."
  - "단순 분류·요약은 소형 모델(GPT-4o-mini·Haiku)로, 복잡한 추론만 대형 모델로 라우팅한다."
  - "배치 처리가 가능한 작업(문서 임베딩·오프라인 분석)은 Batch API를 사용해 50% 비용을 절감한다."
  - "월별 토큰 사용량과 비용을 대시보드로 추적하고, 예산 임계치 초과 시 알림을 설정한다."
tags:
  - "cost"
  - "token"
  - "caching"
  - "prompt-cache"
  - "batch-api"
  - "model-routing"
  - "tiktoken"
  - "gpt-4o-mini"
  - "haiku"
  - "latency"
  - "ttft"
---

# 💰 LLM 비용 & 지연 최적화

> 토큰·캐싱·모델 선택·배칭으로 LLM API 비용과 응답 지연을 줄인다. LLM 호출 비용이 높거나 응답이 느릴 때, 모델을 고르거나 캐싱·배치 처리를 도입할 때 읽는다.

## 1. 핵심 원칙
- 입력 토큰을 최소화하기 위해 시스템 프롬프트를 간결하게 유지하고, 불필요한 few-shot 예제를 제거한다.
- 반복되는 시스템 프롬프트는 프롬프트 캐싱(Anthropic Prompt Cache·OpenAI Cached Input)을 활용해 비용을 90%까지 절감한다.
- 단순 분류·요약은 소형 모델(GPT-4o-mini·Haiku)로, 복잡한 추론만 대형 모델로 라우팅한다.
- 배치 처리가 가능한 작업(문서 임베딩·오프라인 분석)은 Batch API를 사용해 50% 비용을 절감한다.
- 월별 토큰 사용량과 비용을 대시보드로 추적하고, 예산 임계치 초과 시 알림을 설정한다.

## 2. 규칙

### 2-1. 토큰 계산 및 추정
```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """USD 기준 비용 추정"""
    pricing = {
        "gpt-4o":          {"input": 2.50, "output": 10.00},  # per 1M tokens
        "gpt-4o-mini":     {"input": 0.15, "output": 0.60},
        "claude-opus-4-8": {"input": 15.0, "output": 75.0},
        "claude-haiku-4-5-20251001":  {"input": 0.80, "output": 4.00},
    }
    p = pricing.get(model, {"input": 5.0, "output": 15.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
```

### 2-2. 모델 라우팅 (태스크 복잡도 기반)
```python
from enum import Enum

class Complexity(Enum):
    SIMPLE = "simple"    # 분류, 키워드 추출, 요약
    MEDIUM = "medium"    # 번역, 감성분석, 구조화 추출
    COMPLEX = "complex"  # 다단계 추론, 코드 생성, 창작

MODEL_ROUTING = {
    Complexity.SIMPLE:  "gpt-4o-mini",       # ~10x 저렴
    Complexity.MEDIUM:  "gpt-4o",
    Complexity.COMPLEX: "claude-opus-4-8",
}

def classify_complexity(task_type: str) -> Complexity:
    simple_tasks = {"classify", "summarize", "extract_keywords", "translate_short"}
    complex_tasks = {"code_generation", "multi_step_reasoning", "creative_writing"}
    if task_type in simple_tasks:
        return Complexity.SIMPLE
    if task_type in complex_tasks:
        return Complexity.COMPLEX
    return Complexity.MEDIUM

def route_model(task_type: str) -> str:
    return MODEL_ROUTING[classify_complexity(task_type)]
```

### 2-3. 프롬프트 캐싱 (Anthropic)
```python
import anthropic

client = anthropic.Anthropic()

# 시스템 프롬프트 캐싱 — 반복 호출 시 입력 비용 90% 절감
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_SYSTEM_PROMPT,  # 1024+ 토큰 필요
            "cache_control": {"type": "ephemeral"},  # 5분 캐시
        }
    ],
    messages=[{"role": "user", "content": user_query}],
)
# 첫 호출: cache_creation_input_tokens 과금
# 이후 호출: cache_read_input_tokens (90% 할인)
print(response.usage)
```

### 2-4. OpenAI Batch API (비동기 배치)
```python
import json
from pathlib import Path

def create_batch_job(tasks: list[dict]) -> str:
    """대량 처리 작업 — 24시간 내 완료, 50% 비용 절감"""
    # JSONL 파일 생성
    lines = []
    for i, task in enumerate(tasks):
        lines.append(json.dumps({
            "custom_id": f"task-{i}",
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": "gpt-4o-mini",
                "messages": task["messages"],
                "max_tokens": 500,
            },
        }))

    batch_file = Path("/tmp/batch_input.jsonl")
    batch_file.write_text("\n".join(lines))

    # 파일 업로드 및 배치 생성
    with open(batch_file, "rb") as f:
        uploaded = client.files.create(file=f, purpose="batch")

    batch = client.batches.create(
        input_file_id=uploaded.id,
        endpoint="/v1/chat/completions",
        completion_window="24h",
    )
    return batch.id

def get_batch_results(batch_id: str) -> list[dict]:
    batch = client.batches.retrieve(batch_id)
    if batch.status != "completed":
        raise RuntimeError(f"배치 미완료: {batch.status}")

    content = client.files.content(batch.output_file_id).text
    results = []
    for line in content.strip().split("\n"):
        item = json.loads(line)
        results.append({
            "id": item["custom_id"],
            "content": item["response"]["body"]["choices"][0]["message"]["content"],
        })
    return results
```

### 2-5. 비용 모니터링
```python
# 월별 비용 추적 및 알림
def track_usage(model: str, input_tokens: int, output_tokens: int):
    cost = estimate_cost(input_tokens, output_tokens, model)
    budget_tracker.add(cost)

    monthly_total = budget_tracker.monthly_total()
    budget_limit = float(os.environ.get("LLM_MONTHLY_BUDGET_USD", "100"))

    if monthly_total > budget_limit * 0.8:
        alert_slack(f"LLM 비용 경고: 월 예산의 {monthly_total/budget_limit:.0%} 사용 (${monthly_total:.2f}/${budget_limit:.2f})")
```

## 3. 흔한 실수
- ❌ 모든 태스크를 대형 모델로 처리 → 단순 분류·요약도 비싸게 호출된다. ✅ 복잡도 기반 라우팅으로 소형 모델 우선.
- ❌ 반복되는 긴 시스템 프롬프트를 매번 그대로 전송 → 입력 비용 낭비. ✅ 프롬프트 캐싱 적용.
- ❌ 실시간이 필요 없는 대량 작업을 동기 호출 → 비용 2배. ✅ Batch API로 50% 절감.
- ❌ 코드의 모델 가격을 고정값으로 신뢰 → 모델 업데이트로 가격이 바뀌어 추정이 틀어진다. ✅ 공식 가격표 기준으로 분기별 갱신.
- ❌ 비용 추적·알림 미설정 → 예산 초과를 사후에 인지.

## 4. 체크리스트
- [ ] 시스템 프롬프트를 간결하게 유지하고 불필요한 few-shot 예제를 제거했는가
- [ ] 반복 시스템 프롬프트에 프롬프트 캐싱을 적용했는가
- [ ] 태스크 복잡도에 따라 소형/대형 모델로 라우팅했는가
- [ ] 배치 가능한 작업에 Batch API를 사용했는가
- [ ] 월별 토큰 사용량·비용을 추적하고 예산 임계치 알림을 설정했는가
- [ ] 코드의 모델 가격을 공식 가격표 기준으로 갱신했는가 (예시값 주의)
