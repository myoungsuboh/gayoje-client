---
name: LLM 结构化输出 & 校验
description: 用 JSON Schema、Pydantic 或 Zod 强制、解析并校验 LLM 响应，使其在下游代码中安全使用的指南。当向 LLM 请求 JSON 输出，或以类型安全的方式解析、校验响应并处理解析失败时阅读。关键词: structured-output, response_format, json-schema, pydantic, zod, parse, json_object, json_schema, BaseModel, model_validate_json.
rules:
  - "向 LLM 请求 JSON 输出时，使用 response_format 或 response_schema 参数以消除解析失败的风险。"
  - "将响应解析为 Pydantic(Python)·Zod(TypeScript) 模型以确保类型安全，解析失败立即作为异常处理。"
  - "将 LLM 响应的 enum·范围约束声明在 schema 中以强制值范围，减少应用代码中的额外校验。"
  - "需要嵌套对象·数组时分别定义 schema，并在 LLM 提示中提供相同结构的示例。"
  - "解析失败时记录 raw 响应日志，并向用户提供重试或回退响应。"
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

# 🧱 LLM 结构化输出 & 校验

> 用 schema 强制、解析并校验 LLM 响应，使其在下游代码中安全使用。当向 LLM 请求 JSON 输出或以类型安全的方式处理响应时阅读。

## 1. 核心原则
- 向 LLM 请求 JSON 输出时，使用 `response_format` 或 `response_schema` 参数以消除解析失败的风险。
- 将响应解析为 Pydantic(Python)·Zod(TypeScript) 模型以确保类型安全，解析失败立即作为异常处理。
- 将 LLM 响应的 enum·范围约束声明在 schema 中以强制值范围，减少应用代码中的额外校验。
- 需要嵌套对象·数组时分别定义 schema，并在 LLM 提示中提供相同结构的示例。
- 解析失败时记录 raw 响应日志，并向用户提供重试或回退响应。

## 2. 规则

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

### 2-2. Anthropic 结构化输出
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

### 2-3. TypeScript + Zod 校验
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

### 2-4. 复杂嵌套 schema
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

## 3. 常见错误
- 没有 `response_format`/schema 而以自由文本请求 JSON → 解析会出错。
- 不经校验直接使用 raw 响应 → 即使值范围·类型出错也会在下游崩溃。
- 静默忽略解析失败 → 没有 raw 日志·重试·回退，无法追踪根因。
- 将嵌套结构定义为一整块且不在提示中给出示例 → LLM 经常弄错结构。

## 4. 检查清单
- [ ] JSON 输出是否使用了 `response_format`/`response_schema`(或 strict schema)
- [ ] 是否用 Pydantic·Zod 模型解析·校验响应
- [ ] 是否在 schema 中声明了 enum·范围·长度约束
- [ ] 是否分别定义了嵌套 schema 并在提示中提供示例
- [ ] 解析失败时是否有 raw 响应日志 + 重试/回退路径
