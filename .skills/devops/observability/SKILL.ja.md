---
name: 可観測性 — 運用ダッシュボード・SLO・メトリクス基盤
description: プロダクションシステムを観測・診断するための運用面の標準 — SLO メトリクス収集としきい値アラート、メトリクス/トレース収集基盤、外部依存の計測。ダッシュボード・アラート・SLO・リクエスト追跡基盤を構成するときに読む。キーワード: metrics, SLO, alert, prometheus, opentelemetry, sentry, dashboard, tracing。
rules:
  - "SLO(サービスレベル目標)基準のメトリクス — 応答時間 p99・エラー率・可用性 — を収集し、しきい値超過時にアラートを発報する。"
  - "外部依存(DB・キャッシュ・外部 API)の呼び出し時間とエラー率を別途計測してボトルネックを特定する。"
  - "メトリクス・トレース収集基盤(Prometheus/OTel Collector など)を標準化し、収集対象・保持期間・サンプリングを運用基準として定める。"
  - "アプリケーションログ自体の作成ルール(構造化・correlationId・マスキング・レベル)は logging-observability に従う — 運用はそうして残ったログを収集・検索・アラートするパイプラインに集中する。"
tags:
  - "metrics"
  - "SLO"
  - "alert"
  - "prometheus"
  - "opentelemetry"
  - "sentry"
  - "dashboard"
  - "tracing"
  - "logger"
  - "logging"
  - "trace"
  - "correlation_id"
  - "structured_log"
---

# 🔭 可観測性 — 運用ダッシュボード・SLO・メトリクス基盤

> ログ・メトリクス・トレースでプロダクションシステムを観測し、障害を素早く診断する。本文書は**運用面**(SLO アラート・メトリクス収集基盤・外部依存の計測・収集ツール選定)を扱う。
>
> **権威の境界**: 構造化ロギング(JSON)・correlationId/traceId 伝播・機微情報マスキング・ログレベルポリシーなど**アプリケーションロギングの共通概念は `logging-observability` が権威**だ。ここでは繰り返さず参照する。W3C トレース伝播の標準ルールも `logging-observability`、サービス間トレース連携の詳細は `distributed-tracing` を参照。

## 1. 核心原則
- SLO(サービスレベル目標)基準のメトリクス — 応答時間 p99・エラー率・可用性 — を収集し、しきい値超過時にアラートを発報する。
- 外部依存(DB・キャッシュ・外部 API)の呼び出し時間とエラー率を別途計測してボトルネックを特定する。
- メトリクス・トレース収集基盤(Prometheus/OTel Collector など)を標準化し、収集対象・保持期間・サンプリングを運用基準として定める。
- アプリケーションログ自体の作成ルール(構造化・correlationId・マスキング・レベル)は `logging-observability` に従う — 運用はそうして残ったログを**収集・検索・アラート**するパイプラインに集中する。

## 2. ルール

### 2-1. 可観測性の 3 本柱 (収集ツール選定)
| 柱 | 用途 | ツール例 |
|------|------|-----------|
| Logs | イベント記録、デバッグ | ELK, Loki, CloudWatch |
| Metrics | 集計値、トレンド、アラート | Prometheus, Datadog, CloudWatch |
| Traces | 分散リクエストフローの追跡 | Jaeger, Zipkin, OpenTelemetry |

> ログの**形式・内容**(構造化 JSON、correlation_id、マスキング)は `logging-observability` が権威。運用は上記ツールで**収集・保持・アラート**する責任を負う。

### 2-2. メトリクス収集 + SLO アラート (Prometheus)
SLO なきメトリクス収集は障害を事後にしか認識できなくする。収集と同時にしきい値アラートを掛ける。
```python
from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "Request duration", ["path"])

# SLO アラートルール (Prometheus AlertManager)
# - p99 応答時間 > 500ms
# - 5xx エラー率 > 1%
# - 可用性 < 99.9%
```

### 2-3. 外部依存の計測 (OpenTelemetry)
外部依存の呼び出し時間・エラー率を別途計測してボトルネックを特定する。トレース伝播標準(W3C traceparent)は `logging-observability` 参照。
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

tracer = trace.get_tracer("my-service")

with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.amount", amount)
    # 外部 DB 呼び出し — 自動計測され、呼び出し時間・エラーがトレースに記録される
    result = await db.execute(query)
```

## 3. よくある失敗
- SLO・しきい値なきメトリクス収集 → 障害を事後にしか認識できない。収集と同時にアラートルールを定義。
- 外部依存を計測しない → ボトルネックがアプリケーションなのか DB/外部 API なのか区別できない。
- メトリクス/トレースの保持・サンプリング基準の欠如 → コスト急増または可視性不足。
- アプリケーションロギングルール(構造化・correlation_id・マスキング・レベル)をここで勝手に再定義 → `logging-observability` を単一の出典として従う。

## 4. チェックリスト
- [ ] SLO メトリクス(p99・エラー率・可用性)を収集し、しきい値アラートを設定したか
- [ ] 外部依存(DB・キャッシュ・外部 API)の呼び出し時間・エラー率を別途計測するか
- [ ] メトリクス/トレース収集基盤の収集対象・保持期間・サンプリングが運用基準として定義されているか
- [ ] アプリケーションログ作成ルールは `logging-observability` に従い、運用はそのログの収集・検索・アラートを保証するか
