---
name: AI Agent & Tool Design (AI Agent & Tool Design)
description: A guide to designing the agent loop (ReAct pattern) in which an LLM calls external tools, plus safe tool definitions, execution control, and loop-termination conditions. Read when building a function-calling agent, handling destructive tools, or deciding infinite-loop and permission scope. Keywords: agent, tool-use, function-calling, react, tool-loop, human-in-the-loop, function_call, tool_choice, parallel_tool_use.
rules:
  - "Clearly document a tool definition's name, parameters, return format, and side effects, and write the description concretely so the LLM does not misuse it."
  - "Set a maximum iteration count (≤10) and a timeout on the agent loop to prevent infinite loops."
  - "For destructive tools (delete/send/payment), add a separate confirmation step or go through human review (Human-in-the-loop)."
  - "Log both tool execution results and the agent's reasoning process to make debugging and auditing possible."
  - "Provide the agent only with least-privilege tools, and separate the required scope (read/write/delete) per tool."
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

# 🤖 AI Agent & Tool Design

> Standardize the agent loop in which an LLM calls external tools and safe tool design. Read when building a function-calling agent or deciding destructive tools, loop-termination conditions, and permission scope.

## 1. Core Principles
- Clearly document a tool definition's name, parameters, return format, and side effects, and write the description concretely so the LLM does not misuse it.
- Set a maximum iteration count (≤10) and a timeout on the agent loop to prevent infinite loops.
- For destructive tools (delete/send/payment), add a separate confirmation step or go through human review (Human-in-the-loop).
- Log both tool execution results and the agent's reasoning process to make debugging and auditing possible.
- Provide the agent only with least-privilege tools, and separate the required scope (read/write/delete) per tool.

## 2. Rules

### 2-1. Tool Definition (OpenAI Function Calling)
Specify allowed/disallowed actions and side effects in the description (✅ "read-only", "cannot purchase/delete/modify").

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

### 2-2. ReAct Agent Loop
Block infinite loops with `max_iterations`, and reject undefined tools via a whitelist.

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

### 2-3. Human-in-the-Loop (Destructive Tools)
Irreversible tools like delete/send/payment require human approval before execution.

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
Even if the provider differs, the principle is the same — define the tool schema clearly and continue the loop with `tool_result`.

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

## 3. Common Mistakes
- No loop-termination condition (max iterations/timeout) → infinite calls explode cost and latency.
- Dynamic calling by name without a tool whitelist → arbitrary function execution vulnerability.
- Running destructive tools without confirmation → irreversible deletion/payment incidents.
- Ambiguous tool descriptions (side effects/constraints not stated) → the LLM misuses or wrongly calls them.
- Missing reasoning/execution logs → cannot trace the cause during an incident.

## 4. Checklist
- [ ] Are parameters, returns, and side effects stated in the tool definition's description?
- [ ] Does the loop have a maximum iteration count (≤10) and a timeout?
- [ ] Are undefined tools rejected via a whitelist (no dynamic eval/import)?
- [ ] Do destructive tools have a human approval (Human-in-the-loop) step?
- [ ] Are tools granted only least privilege with read/write/delete scopes separated?
- [ ] Are both the reasoning process and tool execution results logged?
