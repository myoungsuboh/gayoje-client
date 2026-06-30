---
name: AI 에이전트 & 툴 설계 (AI Agent & Tool Design)
description: LLM이 외부 도구를 호출하는 에이전트 루프(ReAct 패턴)와 안전한 툴 정의·실행 제어·루프 종료 조건을 설계하는 가이드. 함수 호출형 에이전트를 만들거나, 파괴적 툴을 다루거나, 무한 루프·권한 범위를 정할 때 읽는다. 키워드: agent, tool-use, function-calling, react, tool-loop, human-in-the-loop, function_call, tool_choice, parallel_tool_use.
rules:
  - "툴 정의는 이름·파라미터·반환 형식·사이드이펙트를 명확히 문서화하고, LLM이 오용하지 않도록 설명을 구체적으로 작성한다."
  - "에이전트 루프는 최대 반복 횟수(≤10)와 타임아웃을 설정해 무한 루프를 방지한다."
  - "파괴적 툴(삭제·전송·결제)은 별도 확인 단계를 두거나 사람 검토(Human-in-the-loop)를 거친다."
  - "툴 실행 결과와 에이전트 추론 과정을 모두 로깅해 디버깅과 감사를 가능하게 한다."
  - "에이전트에게 최소 권한의 툴만 제공하고, 필요한 범위(읽기/쓰기/삭제)를 툴별로 분리한다."
tags:
  - "agent"
  - "tool-use"
  - "function-calling"
  - "react"
  - "tool-loop"
  - "human-in-the-loop"
  - "function_call"
  - "tool_choice"
  - "parallel_tool_use"
---

# 🤖 AI 에이전트 & 툴 설계

> LLM이 외부 도구를 호출하는 에이전트 루프와 안전한 툴 설계를 표준화한다. 함수 호출형 에이전트를 만들거나, 파괴적 툴·루프 종료 조건·권한 범위를 정할 때 읽는다.

## 1. 핵심 원칙
- 툴 정의는 이름·파라미터·반환 형식·사이드이펙트를 명확히 문서화하고, LLM이 오용하지 않도록 설명을 구체적으로 작성한다.
- 에이전트 루프는 최대 반복 횟수(≤10)와 타임아웃을 설정해 무한 루프를 방지한다.
- 파괴적 툴(삭제·전송·결제)은 별도 확인 단계를 두거나 사람 검토(Human-in-the-loop)를 거친다.
- 툴 실행 결과와 에이전트 추론 과정을 모두 로깅해 디버깅과 감사를 가능하게 한다.
- 에이전트에게 최소 권한의 툴만 제공하고, 필요한 범위(읽기/쓰기/삭제)를 툴별로 분리한다.

## 2. 규칙

### 2-1. 툴 정의 (OpenAI Function Calling)
설명에 가능/불가 동작과 사이드이펙트를 명시한다 (✅ "읽기 전용", "구매·삭제·수정 불가").

```python
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "상품 카탈로그에서 키워드로 상품을 검색합니다. 구매·삭제·수정 불가.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "검색 키워드 (예: '무선 이어폰', '노트북 16인치')",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "반환할 최대 결과 수 (1-20)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_order_status",
            "description": "주문 ID로 배송 상태를 조회합니다. 읽기 전용.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "주문 ID (예: ORD-12345)"},
                },
                "required": ["order_id"],
            },
        },
    },
]
```

### 2-2. ReAct 에이전트 루프
`max_iterations`로 무한 루프를 막고, 정의되지 않은 툴은 화이트리스트로 거부한다.

```python
import json

def run_agent(user_query: str, max_iterations: int = 10) -> str:
    messages = [
        {"role": "system", "content": "사용자의 쇼핑 문의를 도와주는 에이전트입니다. 필요시 툴을 호출하세요."},
        {"role": "user", "content": user_query},
    ]

    for iteration in range(max_iterations):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        msg = response.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:
            # 최종 답변 반환
            return msg.content

        # 툴 실행
        for tool_call in msg.tool_calls:
            result = execute_tool(tool_call.function.name, json.loads(tool_call.function.arguments))
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    return "최대 반복 횟수 초과 — 다시 시도해주세요."

def execute_tool(name: str, args: dict) -> dict:
    """툴 실행 + 로깅"""
    logger.info(f"툴 호출: {name}({args})")
    # ✅ 화이트리스트 — match 의 명시된 case 만 실행되고, 그 외(case _)는 거부한다.
    # 툴 이름이 신뢰할 수 없는 출처에서 오면 임의 함수 호출로 악용되지 않게 이 경계가 필수.
    match name:
        case "search_products":
            return product_service.search(**args)
        case "get_order_status":
            return order_service.get_status(**args)
        case _:
            # ❌ 정의되지 않은 툴 — 거부(예외/에러). 절대 동적 eval/import 로 풀지 않는다.
            return {"error": f"알 수 없는 툴: {name}"}
```

### 2-3. Human-in-the-Loop (파괴적 툴)
삭제·전송·결제처럼 되돌릴 수 없는 툴은 실행 전 사람 승인을 받는다.

```python
async def execute_tool_with_approval(name: str, args: dict, websocket) -> dict:
    DESTRUCTIVE_TOOLS = {"cancel_order", "send_refund", "delete_account"}

    if name in DESTRUCTIVE_TOOLS:
        # 사람 확인 요청
        await websocket.send_json({
            "type": "approval_required",
            "tool": name,
            "args": args,
            "message": f"'{name}' 실행을 승인하시겠습니까?",
        })
        approval = await websocket.receive_json()
        if not approval.get("approved"):
            return {"error": "사용자가 작업을 취소했습니다."}

    return execute_tool(name, args)
```

### 2-4. Anthropic Tool Use
공급자가 달라도 원칙은 동일하다 — 툴 스키마를 명확히 정의하고 `tool_result`로 루프를 이어간다.

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=4096,
    tools=[{
        "name": "search_products",
        "description": "상품 카탈로그 검색",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    }],
    messages=[{"role": "user", "content": user_query}],
)

for block in response.content:
    if block.type == "tool_use":
        result = execute_tool(block.name, block.input)
        # tool_result 메시지로 이어받아 루프 계속
```

## 3. 흔한 실수
- 루프 종료 조건(최대 반복·타임아웃) 미설정 → 무한 호출로 비용·지연 폭증.
- 툴 화이트리스트 없이 이름으로 동적 호출 → 임의 함수 실행 취약점.
- 파괴적 툴을 확인 없이 실행 → 되돌릴 수 없는 삭제·결제 사고.
- 툴 설명이 모호함(사이드이펙트·제약 미기재) → LLM이 오용·잘못 호출.
- 추론·실행 로그 누락 → 장애 시 원인 추적 불가.

## 4. 체크리스트
- [ ] 툴 정의에 파라미터·반환·사이드이펙트가 설명에 명시되어 있는가
- [ ] 루프에 최대 반복 횟수(≤10)와 타임아웃이 있는가
- [ ] 정의되지 않은 툴을 화이트리스트로 거부하는가 (동적 eval/import 금지)
- [ ] 파괴적 툴에 사람 승인(Human-in-the-loop) 단계가 있는가
- [ ] 툴에 최소 권한만 부여하고 읽기/쓰기/삭제 범위를 분리했는가
- [ ] 추론 과정과 툴 실행 결과를 모두 로깅하는가
