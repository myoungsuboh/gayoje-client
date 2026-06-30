---
name: LLM 구조화 출력 & 검증
description: LLM 응답을 JSON Schema·Pydantic·Zod로 강제·파싱·검증해 다운스트림 코드에서 안전하게 사용하는 가이드. LLM에 JSON 출력을 요청하거나, 응답을 타입 안전하게 파싱·검증하고 파싱 실패를 처리할 때 읽는다. 키워드: structured-output, response_format, json-schema, pydantic, zod, parse, json_object, json_schema, BaseModel, model_validate_json.
rules:
  - "LLM에 JSON 출력을 요청할 때 response_format 또는 response_schema 파라미터를 사용해 파싱 실패 위험을 없앤다."
  - "응답을 Pydantic(Python)·Zod(TypeScript) 모델로 파싱해 타입 안전성을 확보하고, 파싱 실패는 즉시 예외로 처리한다."
  - "LLM 응답의 enum·범위 제약을 스키마에 선언해 값 범위를 강제하고, 애플리케이션 코드에서 별도 검증을 줄인다."
  - "중첩 객체·배열이 필요한 경우 스키마를 분리 정의하고, LLM 프롬프트에도 동일한 구조의 예시를 제공한다."
  - "파싱 실패 시 raw 응답을 로깅하고 사용자에게 재시도 또는 폴백 응답을 제공한다."
tags:
  - "structured-output"
  - "response_format"
  - "json-schema"
  - "pydantic"
  - "zod"
  - "parse"
  - "json_object"
  - "json_schema"
  - "BaseModel"
  - "model_validate_json"
---

# 🧱 LLM 구조화 출력 & 검증

> LLM 응답을 스키마로 강제·파싱·검증해 다운스트림 코드에서 안전하게 사용한다. LLM에 JSON 출력을 요청하거나 응답을 타입 안전하게 다룰 때 읽는다.

## 1. 핵심 원칙
- LLM에 JSON 출력을 요청할 때 `response_format` 또는 `response_schema` 파라미터를 사용해 파싱 실패 위험을 없앤다.
- 응답을 Pydantic(Python)·Zod(TypeScript) 모델로 파싱해 타입 안전성을 확보하고, 파싱 실패는 즉시 예외로 처리한다.
- LLM 응답의 enum·범위 제약을 스키마에 선언해 값 범위를 강제하고, 애플리케이션 코드에서 별도 검증을 줄인다.
- 중첩 객체·배열이 필요한 경우 스키마를 분리 정의하고, LLM 프롬프트에도 동일한 구조의 예시를 제공한다.
- 파싱 실패 시 raw 응답을 로깅하고 사용자에게 재시도 또는 폴백 응답을 제공한다.

## 2. 규칙

### 2-1. OpenAI Structured Output (Python + Pydantic)
```python
# ✅ 권장 — response_format(json_schema, strict)로 스키마를 강제하고, model_validate_json으로 파싱·검증
from pydantic import BaseModel, Field
from openai import OpenAI
import json

client = OpenAI()

class ProductReview(BaseModel):
    sentiment: str = Field(description="positive|negative|neutral")
    score: int = Field(ge=1, le=5, description="1-5점 평점")
    summary: str = Field(max_length=200, description="한 문장 요약")
    pros: list[str] = Field(default_factory=list, description="장점 목록")
    cons: list[str] = Field(default_factory=list, description="단점 목록")

def analyze_review(review_text: str) -> ProductReview:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "상품 리뷰를 분석해 JSON으로 반환하세요."},
            {"role": "user", "content": review_text},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "product_review",
                "schema": ProductReview.model_json_schema(),
                "strict": True,
            },
        },
    )
    raw = response.choices[0].message.content
    try:
        return ProductReview.model_validate_json(raw)
    except Exception as e:
        logger.error(f"파싱 실패: {e}\nraw={raw}")
        raise ValueError("LLM 응답 파싱 실패 — 재시도 요망")
```

### 2-2. Anthropic 구조화 출력
```python
# ✅ 권장 — system으로 JSON 형식을 고정하고, 마크다운 코드 펜스를 안전하게 벗겨 파싱
from anthropic import Anthropic

client = Anthropic()

def extract_entities(text: str) -> dict:
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        system="""엔티티를 추출해 다음 JSON 형식으로만 응답하세요:
{
  "people": ["이름1", "이름2"],
  "organizations": ["조직1"],
  "locations": ["장소1"],
  "dates": ["날짜1"]
}
JSON 외 다른 텍스트 없이 반드시 유효한 JSON만 출력하세요.""",
        messages=[{"role": "user", "content": text}],
    )
    raw = response.content[0].text.strip()
    # JSON 블록 추출 (마크다운 코드 펜스 처리)
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return json.loads(raw)
```

### 2-3. TypeScript + Zod 검증
```typescript
// ✅ 권장 — enum·범위·길이 제약을 Zod 스키마에 선언하고, .parse()로 검증(실패 시 ZodError)
import { z } from "zod";
import OpenAI from "openai";

const AnalysisSchema = z.object({
  category: z.enum(["bug", "feature", "question", "other"]),
  priority: z.number().int().min(1).max(5),
  tags: z.array(z.string()).max(5),
  summary: z.string().max(300),
});

type Analysis = z.infer<typeof AnalysisSchema>;

async function classifyTicket(ticketText: string): Promise<Analysis> {
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "지원 티켓을 분류해 JSON으로 반환하세요." },
      { role: "user", content: ticketText },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content!;
  const parsed = JSON.parse(raw);
  return AnalysisSchema.parse(parsed);  // 검증 실패 시 ZodError 발생
}
```

### 2-4. 복잡한 중첩 스키마
```python
# ✅ 권장 — 중첩 구조는 스키마를 분리 정의하고, 프롬프트에 동일 구조의 예시를 함께 제공
from pydantic import BaseModel

class Ingredient(BaseModel):
    name: str
    amount: str
    unit: str

class Recipe(BaseModel):
    title: str
    servings: int = Field(ge=1)
    prep_time_minutes: int
    ingredients: list[Ingredient]
    steps: list[str] = Field(min_length=1)
    difficulty: str = Field(pattern="^(easy|medium|hard)$")

# 프롬프트에 예시 포함 (구조 이해 보조)
RECIPE_EXAMPLE = Recipe(
    title="된장찌개",
    servings=4,
    prep_time_minutes=20,
    ingredients=[Ingredient(name="된장", amount="3", unit="스푼")],
    steps=["물을 끓인다", "된장을 넣는다"],
    difficulty="easy",
).model_dump_json(indent=2)
```

## 3. 흔한 실수
- `response_format`/스키마 없이 자유 텍스트로 JSON을 요청 → 파싱이 깨진다.
- raw 응답을 검증 없이 그대로 사용 → 값 범위·타입이 어긋나도 다운스트림에서 터진다.
- 파싱 실패를 조용히 무시 → raw 로깅·재시도·폴백이 없어 원인 추적이 불가능하다.
- 중첩 구조를 한 덩어리로 정의하고 프롬프트에 예시를 안 줌 → LLM이 구조를 자주 틀린다.

## 4. 체크리스트
- [ ] JSON 출력에 `response_format`/`response_schema`(또는 strict 스키마)를 사용했는가
- [ ] 응답을 Pydantic·Zod 모델로 파싱·검증하는가
- [ ] enum·범위·길이 제약을 스키마에 선언했는가
- [ ] 중첩 스키마를 분리 정의하고 프롬프트에 예시를 제공했는가
- [ ] 파싱 실패 시 raw 응답 로깅 + 재시도/폴백 경로가 있는가
