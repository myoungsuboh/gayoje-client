---
name: LLM コスト & レイテンシ最適化
description: トークン計算・キャッシュ・モデル選択・バッチ処理戦略で LLM API コストを削減し、応答レイテンシを最小化するガイド。LLM 呼び出しコストが高い、または応答が遅いとき、モデルを選択したりプロンプトキャッシュ・バッチ処理を導入したりするときに読む。キーワード: cost, token, caching, prompt-cache, batch-api, model-routing, tiktoken, gpt-4o-mini, haiku, latency, ttft。
rules:
  - "入力トークンを最小化するため、システムプロンプトを簡潔に保ち、不要な few-shot 例を取り除く。"
  - "繰り返されるシステムプロンプトは、プロンプトキャッシュ(Anthropic Prompt Cache・OpenAI Cached Input)を活用してコストを最大90%削減する。"
  - "単純な分類・要約は小型モデル(GPT-4o-mini・Haiku)へ、複雑な推論のみ大型モデルへルーティングする。"
  - "バッチ処理が可能な作業(ドキュメント埋め込み・オフライン分析)は Batch API を使い50%のコストを削減する。"
  - "月別のトークン使用量とコストをダッシュボードで追跡し、予算しきい値を超えたら通知を設定する。"
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

# 💰 LLM コスト & レイテンシ最適化

> トークン・キャッシュ・モデル選択・バッチ処理で LLM API コストと応答レイテンシを削減する。LLM 呼び出しコストが高い、または応答が遅いとき、モデルを選んだりキャッシュ・バッチ処理を導入したりするときに読む。

## 1. 核心原則
- 入力トークンを最小化するため、システムプロンプトを簡潔に保ち、不要な few-shot 例を取り除く。
- 繰り返されるシステムプロンプトは、プロンプトキャッシュ(Anthropic Prompt Cache・OpenAI Cached Input)を活用してコストを最大90%削減する。
- 単純な分類・要約は小型モデル(GPT-4o-mini・Haiku)へ、複雑な推論のみ大型モデルへルーティングする。
- バッチ処理が可能な作業(ドキュメント埋め込み・オフライン分析)は Batch API を使い50%のコストを削減する。
- 月別のトークン使用量とコストをダッシュボードで追跡し、予算しきい値を超えたら通知を設定する。

## 2. ルール

### 2-1. トークン計算および推定
```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    """USD 基準のコスト推定"""
    pricing = {
        "gpt-4o":          {"input": 2.50, "output": 10.00},  # per 1M tokens
        "gpt-4o-mini":     {"input": 0.15, "output": 0.60},
        "claude-opus-4-8": {"input": 15.0, "output": 75.0},
        "claude-haiku-4-5-20251001":  {"input": 0.80, "output": 4.00},
    }
    p = pricing.get(model, {"input": 5.0, "output": 15.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
```

### 2-2. モデルルーティング (タスク複雑度ベース)
```python
from enum import Enum

class Complexity(Enum):
    SIMPLE = "simple"    # 分類, キーワード抽出, 要約
    MEDIUM = "medium"    # 翻訳, 感情分析, 構造化抽出
    COMPLEX = "complex"  # 多段階推論, コード生成, 創作

MODEL_ROUTING = {
    Complexity.SIMPLE:  "gpt-4o-mini",       # ~10x 安価
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

### 2-3. プロンプトキャッシュ (Anthropic)
```python
import anthropic

client = anthropic.Anthropic()

# システムプロンプトキャッシュ — 繰り返し呼び出し時に入力コスト90%削減
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_SYSTEM_PROMPT,  # 1024+ トークン必要
            "cache_control": {"type": "ephemeral"},  # 5分キャッシュ
        }
    ],
    messages=[{"role": "user", "content": user_query}],
)
# 初回呼び出し: cache_creation_input_tokens 課金
# 以降の呼び出し: cache_read_input_tokens (90%割引)
print(response.usage)
```

### 2-4. OpenAI Batch API (非同期バッチ)
```python
import json
from pathlib import Path

def create_batch_job(tasks: list[dict]) -> str:
    """大量処理ジョブ — 24時間以内に完了, 50%コスト削減"""
    # JSONL ファイル生成
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

    # ファイルアップロードおよびバッチ生成
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

### 2-5. コストモニタリング
```python
# 月別コスト追跡および通知
def track_usage(model: str, input_tokens: int, output_tokens: int):
    cost = estimate_cost(input_tokens, output_tokens, model)
    budget_tracker.add(cost)

    monthly_total = budget_tracker.monthly_total()
    budget_limit = float(os.environ.get("LLM_MONTHLY_BUDGET_USD", "100"))

    if monthly_total > budget_limit * 0.8:
        alert_slack(f"LLM 비용 경고: 월 예산의 {monthly_total/budget_limit:.0%} 사용 (${monthly_total:.2f}/${budget_limit:.2f})")
```

## 3. よくある間違い
- ❌ すべてのタスクを大型モデルで処理 → 単純な分類・要約も高コストで呼び出される。✅ 複雑度ベースのルーティングで小型モデルを優先。
- ❌ 繰り返される長いシステムプロンプトを毎回そのまま送信 → 入力コストの無駄。✅ プロンプトキャッシュを適用。
- ❌ リアルタイムが不要な大量作業を同期呼び出し → コスト2倍。✅ Batch API で50%削減。
- ❌ コード内のモデル価格を固定値として信頼 → モデル更新で価格が変わり推定がずれる。✅ 公式価格表を基準に四半期ごとに更新。
- ❌ コスト追跡・通知の未設定 → 予算超過を事後に認識。

## 4. チェックリスト
- [ ] システムプロンプトを簡潔に保ち、不要な few-shot 例を取り除いたか
- [ ] 繰り返しのシステムプロンプトにプロンプトキャッシュを適用したか
- [ ] タスク複雑度に応じて小型/大型モデルにルーティングしたか
- [ ] バッチ可能な作業に Batch API を使ったか
- [ ] 月別のトークン使用量・コストを追跡し予算しきい値の通知を設定したか
- [ ] コード内のモデル価格を公式価格表を基準に更新したか(例示値に注意)
