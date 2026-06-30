---
name: パフォーマンス & 負荷テスト
description: k6・Locust・JMeter で API パフォーマンスのベースラインを確立し、負荷・ストレス・スパイクテストで本番のキャパシティを検証する標準。SLO を定義する、デプロイ前にパフォーマンス回帰を CI で防ぐ、スロークエリを特定する際に読む。キーワード: k6, locust, performance, load-test, p99, throughput, latency, concurrent。
rules:
  - "デプロイ前にパフォーマンス回帰テストを CI で実行し、応答時間 p99 がベースライン比で 20% 以上劣化した場合にアラートを出す。"
  - "負荷テストのシナリオは実際の利用パターン（ユーザー数・アクション比率）に基づいて作成する。"
  - "パフォーマンステストの結果を記録し、デプロイのたびにベースラインと比較して推移を追跡する。"
  - "DB クエリのパフォーマンスを分離して計測し、N+1 問題とスロークエリを特定する。"
  - "パフォーマンステストは本番と同一スペックのステージング環境で実行する。"
tags:
  - "k6"
  - "locust"
  - "performance"
  - "load-test"
  - "p99"
  - "throughput"
  - "latency"
  - "concurrent"
---

# 🚀 パフォーマンス & 負荷テスト

> API パフォーマンスのベースラインを確立し、負荷・ストレス・スパイクで本番のキャパシティを検証する。SLO を定義する、デプロイ前にパフォーマンス回帰を CI で防ぐ、DB のスロークエリを捕まえる際に読む。

## 1. 基本原則
- デプロイ前にパフォーマンス回帰テストを CI で実行し、応答時間 p99 がベースライン比で 20% 以上劣化した場合にアラートを出す。
- 負荷テストのシナリオは実際の利用パターン（ユーザー数・アクション比率）に基づいて作成する。
- パフォーマンステストの結果を記録し、デプロイのたびにベースラインと比較して推移を追跡する。
- DB クエリのパフォーマンスを分離して計測し、N+1 問題とスロークエリを特定する。
- パフォーマンステストは本番と同一スペックのステージング環境で実行する。

## 2. ルール

### 2-1. パフォーマンス目標の定義 (SLO)
テスト前に応答時間・スループット・エラー率・可用性の目標をまず定める。

```
応答時間: p50 < 100ms, p95 < 500ms, p99 < 1000ms
スループット: 秒間リクエスト > 100 RPS
エラー率: < 0.1%
可用性: > 99.9%
```

### 2-2. k6 負荷テストスクリプト
ウォームアップ → 持続負荷 → クールダウンの段階を設け、threshold で SLO をコードに明示する。

```javascript
// load-test.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 50 },   // ウォームアップ: 50 VU まで段階的に増加
    { duration: "3m", target: 100 },  // 持続負荷: 100 VU を維持
    { duration: "1m", target: 0 },    // クールダウン
  ],
  thresholds: {
    "http_req_duration": ["p(99)<1000"],  // p99 < 1秒
    "errors": ["rate<0.001"],             // エラー率 < 0.1%
  },
};

export default function () {
  const res = http.get("https://api.example.com/products");

  check(res, {
    "status 200": (r) => r.status === 200,
    "応答 < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);  // 実際のユーザー行動をシミュレーション
}
```

### 2-3. Locust (Python) — 複合シナリオ
実際の利用比率を `@task` の重みで反映し、ユーザーの思考時間を設ける。

```python
from locust import HttpUser, task, between

class ShoppingUser(HttpUser):
    wait_time = between(1, 3)  # ユーザーの思考時間

    def on_start(self):
        # セッション開始 — ログイン
        self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })

    @task(3)          # 重み 3 — 最も多い比率
    def browse_products(self):
        self.client.get("/products?page=1&limit=20")

    @task(1)          # 重み 1
    def view_product_detail(self):
        self.client.get("/products/prod-001")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart/items", json={"product_id": "prod-001", "qty": 1})
```

### 2-4. CI パフォーマンス回帰テスト
結果を JSON にエクスポートし、p99 が基準を超えたらビルドを失敗させる。

```yaml
- name: パフォーマンスベースラインテスト
  run: k6 run --out json=results.json load-test.js
- name: 結果分析
  run: |
    p99=$(cat results.json | jq '.metrics.http_req_duration.values["p(99)"]')
    if [ $(echo "$p99 > 1000" | bc -l) -eq 1 ]; then
      echo "❌ p99 応答時間が基準を超過: ${p99}ms"
      exit 1
    fi
```

### 2-5. DB スロークエリの検出
スロークエリログを有効にし、`pg_stat_statements` で上位のボトルネッククエリを探す。

```sql
-- PostgreSQL スロークエリログの設定
log_min_duration_statement = 200  -- 200ms 以上のクエリをロギング
-- pg_stat_statements で上位スロークエリを照会
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

## 3. よくある間違い
- 非現実的なシナリオ（均等な呼び出し） → 実際のボトルネックを見逃す。
- ローカル・低スペック環境での計測 → 本番キャパシティと無関係な数値。
- ベースライン未記録 → 回帰を検知できない。
- アプリの応答だけを見て DB クエリの分離計測を怠る → N+1・スロークエリを発見できない。

## 4. チェックリスト
- [ ] SLO（p50/p95/p99・RPS・エラー率）をまず定義したか
- [ ] シナリオが実際の利用パターン・アクション比率を反映しているか
- [ ] CI でパフォーマンス回帰を計測し、基準超過時に失敗させているか
- [ ] 結果を記録してデプロイのたびにベースラインと比較しているか
- [ ] DB のスロークエリ・N+1 を分離して計測したか
- [ ] 本番と同一スペックのステージングで実行したか
