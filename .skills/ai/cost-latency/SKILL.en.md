---
name: LLM Cost & Latency Optimization
description: A guide to reducing LLM API cost and minimizing response latency through token counting, caching, model selection, and batching strategies. Read it when LLM call costs are high or responses are slow, or when selecting a model or introducing prompt caching or batch processing. Keywords: cost, token, caching, prompt-cache, batch-api, model-routing, tiktoken, gpt-4o-mini, haiku, latency, ttft.
rules:
  - "To minimize input tokens, keep system prompts concise and remove unnecessary few-shot examples."
  - "For repeated system prompts, use prompt caching (Anthropic Prompt Cache · OpenAI Cached Input) to cut cost by up to 90%."
  - "Route simple classification/summarization to small models (GPT-4o-mini · Haiku), and only complex reasoning to large models."
  - "For batchable tasks (document embedding · offline analysis), use the Batch API to cut cost by 50%."
  - "Track monthly token usage and cost on a dashboard, and set alerts when the budget threshold is exceeded."
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

# 💰 LLM Cost & Latency Optimization

> Reduce LLM API cost and response latency through tokens, caching, model selection, and batching. Read it when LLM call costs are high or responses are slow, or when choosing a model or introducing caching or batch processing.

## 1. Core Principles
- To minimize input tokens, keep system prompts concise and remove unnecessary few-shot examples.
- For repeated system prompts, use prompt caching (Anthropic Prompt Cache · OpenAI Cached Input) to cut cost by up to 90%.
- Route simple classification/summarization to small models (GPT-4o-mini · Haiku), and only complex reasoning to large models.
- For batchable tasks (document embedding · offline analysis), use the Batch API to cut cost by 50%.
- Track monthly token usage and cost on a dashboard, and set alerts when the budget threshold is exceeded.

## 2. Rules

### 2-1. Token Counting and Estimation
```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """Cost estimate in USD"""
    pricing = {
        "gpt-4o":          {"input": 2.50, "output": 10.00},  # per 1M tokens
        "gpt-4o-mini":     {"input": 0.15, "output": 0.60},
        "claude-opus-4-8": {"input": 15.0, "output": 75.0},
        "claude-haiku-4-5-20251001":  {"input": 0.80, "output": 4.00},
    }
    p = pricing.get(model, {"input": 5.0, "output": 15.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
```

### 2-2. Model Routing (Based on Task Complexity)
```python
from enum import Enum

class Complexity(Enum):
    SIMPLE = "simple"    # classification, keyword extraction, summarization
    MEDIUM = "medium"    # translation, sentiment analysis, structured extraction
    COMPLEX = "complex"  # multi-step reasoning, code generation, creative writing

MODEL_ROUTING = {
    Complexity.SIMPLE:  "gpt-4o-mini",       # ~10x cheaper
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

### 2-3. Prompt Caching (Anthropic)
```python
import anthropic

client = anthropic.Anthropic()

# System prompt caching — 90% input cost savings on repeated calls
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_SYSTEM_PROMPT,  # 1024+ tokens required
            "cache_control": {"type": "ephemeral"},  # 5-minute cache
        }
    ],
    messages=[{"role": "user", "content": user_query}],
)
# First call: billed as cache_creation_input_tokens
# Subsequent calls: cache_read_input_tokens (90% discount)
print(response.usage)
```

### 2-4. OpenAI Batch API (Asynchronous Batch)
```python
import json
from pathlib import Path

def create_batch_job(tasks: list[dict]) -> str:
    """Bulk processing job — completes within 24 hours, 50% cost savings"""
    # Create JSONL file
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

    # Upload file and create batch
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

### 2-5. Cost Monitoring
```python
# Monthly cost tracking and alerts
def track_usage(model: str, input_tokens: int, output_tokens: int):
    cost = estimate_cost(input_tokens, output_tokens, model)
    budget_tracker.add(cost)

    monthly_total = budget_tracker.monthly_total()
    budget_limit = float(os.environ.get("LLM_MONTHLY_BUDGET_USD", "100"))

    if monthly_total > budget_limit * 0.8:
        alert_slack(f"LLM 비용 경고: 월 예산의 {monthly_total/budget_limit:.0%} 사용 (${monthly_total:.2f}/${budget_limit:.2f})")
```

## 3. Common Mistakes
- ❌ Handling all tasks with a large model → even simple classification/summarization is called expensively. ✅ Prefer small models with complexity-based routing.
- ❌ Sending a repeated long system prompt as-is every time → wasted input cost. ✅ Apply prompt caching.
- ❌ Calling bulk tasks that don't need real-time synchronously → 2x cost. ✅ Save 50% with the Batch API.
- ❌ Trusting hardcoded model prices in code → prices change with model updates and estimates drift. ✅ Update quarterly based on the official price list.
- ❌ Not setting up cost tracking/alerts → noticing budget overruns after the fact.

## 4. Checklist
- [ ] Kept system prompts concise and removed unnecessary few-shot examples
- [ ] Applied prompt caching to repeated system prompts
- [ ] Routed to small/large models based on task complexity
- [ ] Used the Batch API for batchable tasks
- [ ] Tracked monthly token usage/cost and set budget threshold alerts
- [ ] Updated model prices in code based on the official price list (beware example values)
