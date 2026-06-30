---
name: LLM 成本 & 延迟优化
description: 通过 token 计算·缓存·模型选择·批处理策略来降低 LLM API 成本并最小化响应延迟的指南。当 LLM 调用成本高或响应慢，或选择模型、引入提示缓存·批处理时阅读。关键词: cost, token, caching, prompt-cache, batch-api, model-routing, tiktoken, gpt-4o-mini, haiku, latency, ttft。
rules:
  - "为最小化输入 token，保持系统提示简洁，并移除不必要的 few-shot 示例。"
  - "对重复的系统提示，利用提示缓存(Anthropic Prompt Cache·OpenAI Cached Input)将成本降低至多 90%。"
  - "把简单的分类·摘要路由到小型模型(GPT-4o-mini·Haiku)，仅把复杂推理路由到大型模型。"
  - "对可批处理的任务(文档嵌入·离线分析)使用 Batch API，可降低 50% 成本。"
  - "用仪表盘追踪每月 token 用量与成本，并在超过预算阈值时设置告警。"
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

# 💰 LLM 成本 & 延迟优化

> 通过 token·缓存·模型选择·批处理来降低 LLM API 成本与响应延迟。当 LLM 调用成本高或响应慢，或选择模型、引入缓存·批处理时阅读。

## 1. 核心原则
- 为最小化输入 token，保持系统提示简洁，并移除不必要的 few-shot 示例。
- 对重复的系统提示，利用提示缓存(Anthropic Prompt Cache·OpenAI Cached Input)将成本降低至多 90%。
- 把简单的分类·摘要路由到小型模型(GPT-4o-mini·Haiku)，仅把复杂推理路由到大型模型。
- 对可批处理的任务(文档嵌入·离线分析)使用 Batch API，可降低 50% 成本。
- 用仪表盘追踪每月 token 用量与成本，并在超过预算阈值时设置告警。

## 2. 规则

### 2-1. Token 计算与估算
```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """以 USD 为基准的成本估算"""
    pricing = {
        "gpt-4o":          {"input": 2.50, "output": 10.00},  # per 1M tokens
        "gpt-4o-mini":     {"input": 0.15, "output": 0.60},
        "claude-opus-4-8": {"input": 15.0, "output": 75.0},
        "claude-haiku-4-5-20251001":  {"input": 0.80, "output": 4.00},
    }
    p = pricing.get(model, {"input": 5.0, "output": 15.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
```

### 2-2. 模型路由 (基于任务复杂度)
```python
from enum import Enum

class Complexity(Enum):
    SIMPLE = "simple"    # 分类, 关键词提取, 摘要
    MEDIUM = "medium"    # 翻译, 情感分析, 结构化提取
    COMPLEX = "complex"  # 多步推理, 代码生成, 创作

MODEL_ROUTING = {
    Complexity.SIMPLE:  "gpt-4o-mini",       # ~10x 更便宜
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

### 2-3. 提示缓存 (Anthropic)
```python
import anthropic

client = anthropic.Anthropic()

# 系统提示缓存 — 重复调用时输入成本降低 90%
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_SYSTEM_PROMPT,  # 需要 1024+ token
            "cache_control": {"type": "ephemeral"},  # 5 分钟缓存
        }
    ],
    messages=[{"role": "user", "content": user_query}],
)
# 首次调用: 按 cache_creation_input_tokens 计费
# 之后的调用: cache_read_input_tokens (90% 折扣)
print(response.usage)
```

### 2-4. OpenAI Batch API (异步批处理)
```python
import json
from pathlib import Path

def create_batch_job(tasks: list[dict]) -> str:
    """大量处理作业 — 24 小时内完成, 降低 50% 成本"""
    # 生成 JSONL 文件
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

    # 上传文件并创建批处理
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

### 2-5. 成本监控
```python
# 每月成本追踪与告警
def track_usage(model: str, input_tokens: int, output_tokens: int):
    cost = estimate_cost(input_tokens, output_tokens, model)
    budget_tracker.add(cost)

    monthly_total = budget_tracker.monthly_total()
    budget_limit = float(os.environ.get("LLM_MONTHLY_BUDGET_USD", "100"))

    if monthly_total > budget_limit * 0.8:
        alert_slack(f"LLM 비용 경고: 월 예산의 {monthly_total/budget_limit:.0%} 사용 (${monthly_total:.2f}/${budget_limit:.2f})")
```

## 3. 常见错误
- ❌ 用大型模型处理所有任务 → 连简单的分类·摘要也被昂贵地调用。✅ 用基于复杂度的路由优先小型模型。
- ❌ 每次都原样发送重复的长系统提示 → 浪费输入成本。✅ 应用提示缓存。
- ❌ 把不需要实时的大量任务同步调用 → 成本翻倍。✅ 用 Batch API 降低 50%。
- ❌ 把代码中的模型价格当作固定值信任 → 模型更新导致价格变化、估算失准。✅ 以官方价目表为准每季度更新。
- ❌ 未设置成本追踪·告警 → 事后才意识到预算超支。

## 4. 检查清单
- [ ] 保持系统提示简洁并移除了不必要的 few-shot 示例
- [ ] 对重复的系统提示应用了提示缓存
- [ ] 根据任务复杂度路由到小型/大型模型
- [ ] 对可批处理任务使用了 Batch API
- [ ] 追踪每月 token 用量·成本并设置了预算阈值告警
- [ ] 以官方价目表为准更新了代码中的模型价格(注意示例值)
