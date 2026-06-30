---
name: AIエージェント＆ツール設計 (AI Agent & Tool Design)
description: LLMが外部ツールを呼び出すエージェントループ（ReActパターン）と、安全なツール定義・実行制御・ループ終了条件を設計するガイド。関数呼び出し型エージェントを作るとき、破壊的ツールを扱うとき、無限ループ・権限範囲を決めるときに読む。キーワード: agent, tool-use, function-calling, react, tool-loop, human-in-the-loop, function_call, tool_choice, parallel_tool_use。
rules:
  - "ツール定義は名前・パラメータ・戻り値形式・サイドエフェクトを明確に文書化し、LLMが誤用しないよう説明を具体的に書く。"
  - "エージェントループは最大反復回数（≤10）とタイムアウトを設定して無限ループを防ぐ。"
  - "破壊的ツール（削除・送信・決済）は別途確認ステップを設けるか、人のレビュー（Human-in-the-loop）を経る。"
  - "ツール実行結果とエージェントの推論過程をすべてロギングして、デバッグと監査を可能にする。"
  - "エージェントには最小権限のツールだけを提供し、必要な範囲（読み取り/書き込み/削除）をツールごとに分離する。"
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

# 🤖 AIエージェント＆ツール設計

> LLMが外部ツールを呼び出すエージェントループと、安全なツール設計を標準化する。関数呼び出し型エージェントを作るとき、破壊的ツール・ループ終了条件・権限範囲を決めるときに読む。

## 1. 核心原則
- ツール定義は名前・パラメータ・戻り値形式・サイドエフェクトを明確に文書化し、LLMが誤用しないよう説明を具体的に書く。
- エージェントループは最大反復回数（≤10）とタイムアウトを設定して無限ループを防ぐ。
- 破壊的ツール（削除・送信・決済）は別途確認ステップを設けるか、人のレビュー（Human-in-the-loop）を経る。
- ツール実行結果とエージェントの推論過程をすべてロギングして、デバッグと監査を可能にする。
- エージェントには最小権限のツールだけを提供し、必要な範囲（読み取り/書き込み/削除）をツールごとに分離する。

## 2. ルール

### 2-1. ツール定義 (OpenAI Function Calling)
説明に可能/不可な動作とサイドエフェクトを明示する（✅「読み取り専用」「購入・削除・修正不可」）。

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

### 2-2. ReActエージェントループ
`max_iterations`で無限ループを防ぎ、定義されていないツールはホワイトリストで拒否する。

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

### 2-3. Human-in-the-Loop（破壊的ツール）
削除・送信・決済のように元に戻せないツールは、実行前に人の承認を受ける。

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
プロバイダが違っても原則は同じ — ツールスキーマを明確に定義し、`tool_result`でループをつなげる。

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

## 3. よくある間違い
- ループ終了条件（最大反復・タイムアウト）の未設定 → 無限呼び出しでコスト・遅延が急増。
- ツールのホワイトリストなしに名前で動的呼び出し → 任意関数実行の脆弱性。
- 破壊的ツールを確認なしに実行 → 元に戻せない削除・決済事故。
- ツール説明が曖昧（サイドエフェクト・制約の未記載）→ LLMが誤用・誤呼び出し。
- 推論・実行ログの欠落 → 障害時に原因追跡が不可能。

## 4. チェックリスト
- [ ] ツール定義の説明にパラメータ・戻り値・サイドエフェクトが明示されているか
- [ ] ループに最大反復回数（≤10）とタイムアウトがあるか
- [ ] 定義されていないツールをホワイトリストで拒否するか（動的 eval/import 禁止）
- [ ] 破壊的ツールに人の承認（Human-in-the-loop）ステップがあるか
- [ ] ツールに最小権限だけを付与し、読み取り/書き込み/削除の範囲を分離したか
- [ ] 推論過程とツール実行結果をすべてロギングするか
