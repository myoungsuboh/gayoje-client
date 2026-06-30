---
name: LLM Structured Output & Validation
description: A guide to forcing, parsing, and validating LLM responses with JSON Schema, Pydantic, or Zod so they can be used safely in downstream code. Read this when requesting JSON output from an LLM, or when parsing and validating responses in a type-safe way and handling parse failures. Keywords: structured-output, response_format, json-schema, pydantic, zod, parse, json_object, json_schema, BaseModel, model_validate_json.
rules:
  - "When requesting JSON output from an LLM, use the response_format or response_schema parameter to eliminate the risk of parse failures."
  - "Parse responses into Pydantic (Python) or Zod (TypeScript) models to ensure type safety, and handle parse failures immediately as exceptions."
  - "Declare enum and range constraints from LLM responses in the schema to enforce value ranges and reduce separate validation in application code."
  - "When nested objects or arrays are needed, define the schemas separately and provide examples of the same structure in the LLM prompt as well."
  - "On parse failure, log the raw response and provide the user with a retry or fallback response."
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

# 🧱 LLM Structured Output & Validation

> Force, parse, and validate LLM responses with a schema so they can be used safely in downstream code. Read this when requesting JSON output from an LLM or handling responses in a type-safe way.

## 1. Core Principles
- When requesting JSON output from an LLM, use the `response_format` or `response_schema` parameter to eliminate the risk of parse failures.
- Parse responses into Pydantic (Python) or Zod (TypeScript) models to ensure type safety, and handle parse failures immediately as exceptions.
- Declare enum and range constraints from LLM responses in the schema to enforce value ranges and reduce separate validation in application code.
- When nested objects or arrays are needed, define the schemas separately and provide examples of the same structure in the LLM prompt as well.
- On parse failure, log the raw response and provide the user with a retry or fallback response.

## 2. Rules

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

### 2-2. Anthropic Structured Output
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

### 2-3. TypeScript + Zod Validation
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

### 2-4. Complex Nested Schemas
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

## 3. Common Mistakes
- Requesting JSON as free text without a `response_format`/schema → parsing breaks.
- Using the raw response without validation → it blows up downstream even when value ranges or types are off.
- Silently ignoring parse failures → without raw logging, retry, or fallback, root-cause tracing becomes impossible.
- Defining nested structures as one lump without giving examples in the prompt → the LLM frequently gets the structure wrong.

## 4. Checklist
- [ ] Did you use `response_format`/`response_schema` (or a strict schema) for JSON output?
- [ ] Do you parse and validate responses with Pydantic or Zod models?
- [ ] Did you declare enum, range, and length constraints in the schema?
- [ ] Did you define nested schemas separately and provide examples in the prompt?
- [ ] On parse failure, is there raw-response logging plus a retry/fallback path?
