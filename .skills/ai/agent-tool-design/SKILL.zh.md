---
name: AI 智能体与工具设计 (AI Agent & Tool Design)
description: 设计 LLM 调用外部工具的智能体循环（ReAct 模式），以及安全的工具定义·执行控制·循环终止条件的指南。在构建函数调用型智能体、处理破坏性工具、或确定无限循环·权限范围时阅读。关键词: agent, tool-use, function-calling, react, tool-loop, human-in-the-loop, function_call, tool_choice, parallel_tool_use。
rules:
  - "工具定义要明确记录名称·参数·返回格式·副作用，并把说明写得具体，以免 LLM 误用。"
  - "智能体循环要设置最大迭代次数（≤10）和超时以防止无限循环。"
  - "破坏性工具（删除·发送·支付）要设置单独的确认步骤或经过人工审查（Human-in-the-loop）。"
  - "把工具执行结果与智能体推理过程全部记录日志，使调试和审计成为可能。"
  - "只向智能体提供最小权限的工具，并按工具分离所需范围（读取/写入/删除）。"
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

# 🤖 AI 智能体与工具设计

> 标准化 LLM 调用外部工具的智能体循环与安全的工具设计。在构建函数调用型智能体、或确定破坏性工具·循环终止条件·权限范围时阅读。

## 1. 核心原则
- 工具定义要明确记录名称·参数·返回格式·副作用，并把说明写得具体，以免 LLM 误用。
- 智能体循环要设置最大迭代次数（≤10）和超时以防止无限循环。
- 破坏性工具（删除·发送·支付）要设置单独的确认步骤或经过人工审查（Human-in-the-loop）。
- 把工具执行结果与智能体推理过程全部记录日志，使调试和审计成为可能。
- 只向智能体提供最小权限的工具，并按工具分离所需范围（读取/写入/删除）。

## 2. 规则

### 2-1. 工具定义 (OpenAI Function Calling)
在说明中明示可以/不可以的动作和副作用（✅「只读」「不可购买·删除·修改」）。

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

### 2-2. ReAct 智能体循环
用 `max_iterations` 阻止无限循环，未定义的工具用白名单拒绝。

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

### 2-3. Human-in-the-Loop（破坏性工具）
像删除·发送·支付这样无法撤销的工具，在执行前要获得人工批准。

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
即使提供商不同，原则也相同 — 明确定义工具 schema，用 `tool_result` 续接循环。

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

## 3. 常见错误
- 未设置循环终止条件（最大迭代·超时）→ 无限调用导致成本·延迟暴增。
- 没有工具白名单就按名称动态调用 → 任意函数执行漏洞。
- 未经确认就执行破坏性工具 → 无法撤销的删除·支付事故。
- 工具说明含糊（未记载副作用·约束）→ LLM 误用·错误调用。
- 缺少推理·执行日志 → 故障时无法追踪原因。

## 4. 检查清单
- [ ] 工具定义的说明中是否明示了参数·返回·副作用
- [ ] 循环是否有最大迭代次数（≤10）和超时
- [ ] 是否用白名单拒绝未定义的工具（禁止动态 eval/import）
- [ ] 破坏性工具是否有人工批准（Human-in-the-loop）步骤
- [ ] 是否只授予工具最小权限并分离读取/写入/删除范围
- [ ] 是否将推理过程与工具执行结果全部记录日志
