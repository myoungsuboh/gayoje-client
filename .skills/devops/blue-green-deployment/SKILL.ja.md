---
name: 無停止デプロイ — Blue-Green & Canary
description: Blue-Green・Canary・Rolling デプロイ戦略でダウンタイムなく新バージョンをリリースし、問題発生時には即座にロールバックする標準。無停止デプロイ方式を選ぶとき、またはヘルスチェック・DBマイグレーション・自動ロールバックを設計するときに読む。キーワード: blue-green, canary, rolling, healthcheck, /health, /ready, rollback, zero-downtime。
rules:
  - "ヘルスチェックエンドポイント(/health・/ready)を実装し、ロードバランサーがそれを基にトラフィックをルーティングするようにする。"
  - "データベースのスキーマ変更はアプリケーションのデプロイと分離し、後方互換(Expand-Contract)方式で進める。"
  - "デプロイ後に5〜10分の観察期間を設け、エラー率・応答時間が基準値を超えたら自動または即時の手動でロールバックする。"
  - "デプロイ前のイメージ・バージョンを最低2〜3個保持し、ロールバックが即座に可能な状態を維持する。"
  - "機能フラグ(Feature Flag)でコードのデプロイと機能の有効化を分離してリスクを下げる。"
tags:
  - "blue-green"
  - "canary"
  - "rolling"
  - "healthcheck"
  - "/health"
  - "/ready"
  - "rollback"
  - "zero-downtime"
---

# 🔄 無停止デプロイ — Blue-Green & Canary

> ダウンタイムなく新バージョンをリリースし、問題時には即座にロールバックする。デプロイ戦略を選ぶとき、またはヘルスチェック・DBマイグレーション・自動ロールバックを設計するときに読む。

## 1. 基本原則
- ヘルスチェックエンドポイント(/health・/ready)を実装し、ロードバランサーがそれを基にトラフィックをルーティングするようにする。
- データベースのスキーマ変更はアプリケーションのデプロイと分離し、後方互換(Expand-Contract)方式で進める。
- デプロイ後に5〜10分の観察期間を設け、エラー率・応答時間が基準値を超えたら自動または即時の手動でロールバックする。
- デプロイ前のイメージ・バージョンを最低2〜3個保持し、ロールバックが即座に可能な状態を維持する。
- 機能フラグ(Feature Flag)でコードのデプロイと機能の有効化を分離してリスクを下げる。

## 2. ルール

### 2-1. デプロイ戦略の比較
サービスの特性とコストに合わせて戦略を選択する。

| 戦略 | 概要 | 長所 | 短所 |
|------|------|------|------|
| Blue-Green | 同一環境2個 — 一度に切り替え | 即時ロールバック | インフラ2倍のコスト |
| Canary | 少数のユーザーに先行デプロイ | リスク分散 | 複雑なルーティング |
| Rolling | インスタンスを順次置換 | リソース効率 | 旧バージョンの混在 |

### 2-2. ヘルスチェックエンドポイント
```python
@app.get("/health")
async def health():
    """Liveness probe — 앱이 살아있는지"""
    return {"status": "ok"}

@app.get("/ready")
async def ready():
    """Readiness probe — 트래픽을 받을 준비가 됐는지"""
    try:
        await db.execute("SELECT 1")
        await redis.ping()
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(503, detail=f"Not ready: {e}")
```

### 2-3. Blue-Green 切り替え (Kubernetes)
```yaml
# service.yaml — selector로 활성 버전 전환
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app
    version: blue   # ← "green"으로 변경하면 전환 완료
```

```bash
# 전환 커맨드
kubectl patch service my-app -p '{"spec":{"selector":{"version":"green"}}}'

# 롤백
kubectl patch service my-app -p '{"spec":{"selector":{"version":"blue"}}}'
```

### 2-4. DBマイグレーション Expand-Contract パターン
デプロイとスキーマ変更を分離し、どの時点でロールバックしても互換になるようにする。

```
Phase 1 (Expand): 새 컬럼 추가 (nullable) — 구버전과 호환
Phase 2 (Migrate): 데이터 백필 — 배포와 무관하게 진행
Phase 3 (Contract): 구 컬럼 삭제 — 신버전 완전 전환 후
```

### 2-5. 自動ロールバックのトリガー
```yaml
# 배포 후 관찰 메트릭 (예: Argo Rollouts)
metrics:
  - name: error-rate
    thresholdRange: { max: 0.01 }   # 에러율 1% 초과 시 롤백
  - name: p99-latency
    thresholdRange: { max: 500 }    # p99 500ms 초과 시 롤백
```

## 3. よくある間違い
- /ready で依存関係(DB・Redis)を確認しない → 準備のできていないインスタンスにトラフィックが流入。
- スキーマ変更とアプリのデプロイを一度に行う → ロールバック時に旧バージョンが新スキーマと互換しない。
- 以前のバージョンのイメージを保持しない → 即時ロールバック不可。
- 観察期間なしで100%切り替え → 問題の発見が遅れる。

## 4. チェックリスト
- [ ] /health・/ready ヘルスチェックを実装しLBルーティングに接続したか
- [ ] サービスの特性に合うデプロイ戦略(Blue-Green・Canary・Rolling)を選択したか
- [ ] DBスキーマ変更をExpand-Contractでデプロイと分離したか
- [ ] デプロイ後5〜10分の観察期間と自動/手動ロールバック基準を定めたか
- [ ] 以前のバージョンのイメージを2〜3個保持しているか
- [ ] 機能フラグでコードのデプロイと機能の有効化を分離したか
