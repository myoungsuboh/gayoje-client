---
name: 分散トレーシング (OpenTelemetry)
description: マイクロサービスで 1 つのリクエストを trace/span として追跡する分散トレーシングの標準。OTel 計装・コンテキスト伝播・サンプリング・ログ/メトリクス相関・Jaeger/Tempo 連携を決めるとき、リクエストがどのサービスで遅かったか/失敗したかを診断するときに読む。キーワード: opentelemetry, otel, distributed-tracing, jaeger, tempo, observability, traceparent, sampling.
rules:
  - "OpenTelemetry(OTel)標準 SDK で計装する — ベンダー依存のエージェントより移植性・標準性を優先する。"
  - "trace-id をサービス境界(HTTP ヘッダ・メッセージキュー属性)で伝播する — 一箇所でも切れると追跡が断絶する。"
  - "span に意味のある属性(http.method・db.statement・error・tenant)を付ける — 名前だけでは原因診断ができない。"
  - "本番は確率・tail-based サンプリングでコストを調整する — 100% のトレース保存は高コストで遅い。"
  - "ログ・メトリクス・トレースを trace-id で相関(correlation)させ、1 つのリクエストを入口から最後まで追う。"
tags:
  - "opentelemetry"
  - "otel"
  - "distributed-tracing"
  - "jaeger"
  - "tempo"
  - "observability"
  - "traceparent"
  - "sampling"
---

# 🔍 分散トレーシング (OpenTelemetry)

> マイクロサービスで「1 つのリクエストがどのサービスで遅かったか/失敗したか」を追う、可観測性の一軸(トレーシング)。サービス境界を越えるリクエストを計装するとき、またはサンプリング・相関ポリシーを決めるときに読む。

## 1. 核心原則
- OpenTelemetry(OTel)標準 SDK で計装する — ベンダー依存のエージェントより移植性・標準性を優先する。
- trace-id をサービス境界(HTTP ヘッダ・メッセージキュー属性)で伝播する — 一箇所でも切れると追跡が断絶する。
- span に意味のある属性(http.method・db.statement・error・tenant)を付ける — 名前だけでは原因診断ができない。
- 本番は確率・tail-based サンプリングでコストを調整する — 100% のトレース保存は高コストで遅い。
- ログ・メトリクス・トレースを trace-id で相関(correlation)させ、1 つのリクエストを入口から最後まで追う。

## 2. ルール

### 2-1. trace / span 構造
- **trace**: リクエスト 1 つが trace、各作業区間が span。親子で呼び出しツリーを成す。
- 自動計装(フレームワーク)で広く敷き、核心となるビジネス区間だけ手動計装で補強する。

### 2-2. コンテキスト伝播
- W3C `traceparent` ヘッダでサービス間のコンテキストを渡す。
- キュー・バッチなど非同期経路にも trace-id を伝播し、追跡が切れないようにする。

### 2-3. span 属性
```text
// ❌ 禁止 — 名前だけの span(原因診断不可)
span: "queryUser"

// ✅ 推奨 — 意味のある属性を付与
span: "queryUser"
  http.method = GET
  db.statement = SELECT ...
  tenant = acme
  error = true
```

### 2-4. サンプリング
- **head**(リクエスト開始時)vs **tail**(完了後、エラー/遅延を基準に)。
- エラー・遅いリクエストは常に残すポリシーがコスト対比で診断価値が高い。

### 2-5. シグナル相関 (log・metric・trace)
- 3 つのシグナルを trace-id で結ぶと、アラート → トレース → ログへ即座に掘り下げられる。

## 3. よくある間違い
- ❌ 非同期・キュー経路で trace コンテキストの伝播漏れ → 追跡が切れる。`traceparent` をメッセージ属性にも載せる。
- ❌ span に名前だけで属性なし → 原因診断不可。`http.method`・`db.statement`・`error` などを付与。
- ❌ 本番 100% サンプリング → コスト・性能負担。確率/tail サンプリング(エラー・遅延は保存)。
- ❌ span/属性に PII・シークレットを記録 → 個人情報漏えい。マスキングする。
- ❌ ログ・メトリクスを trace-id で相関しない → シグナルが別々になり診断が遅い。
- ❌ ベンダー依存のエージェントに強結合 → 移植性低下。OTel 標準 SDK で。

## 4. チェックリスト
- [ ] OTel 標準 SDK で計装したか
- [ ] trace-id がすべてのサービス境界(HTTP・キュー)で伝播されるか
- [ ] span に診断に使う属性(method・statement・error など)を付けたか
- [ ] 本番のサンプリングポリシー(エラー・遅延は保存)を決めたか
- [ ] ログ・メトリクスが trace-id で相関されるか
