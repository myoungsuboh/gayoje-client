---
name: API Gateway & BFF パターン
description: API Gateway と Backend-for-Frontend（BFF）パターンの役割・ルーティング・認証集中化・クライアント別集約の標準。ゲートウェイレイヤを設計するとき、クライアント別の画面集約 API を作るとき、認証・レートリミット・Circuit Breaker の配置を決めるときに読む。キーワード: api-gateway, bff, backend-for-frontend, gateway, circuit-breaker, rate-limit, proxy, aggregation。
rules:
  - "認証・認可、レートリミット、ロギング、リクエスト追跡（trace-id）は Gateway レイヤで中央化する。"
  - "BFF は特定クライアント（Web・Mobile・TV）の画面要求に合わせて複数のマイクロサービスを集約・変換する。"
  - "BFF はクライアントと 1:1 対応し、共用 BFF は作らない — 共通ロジックは共通ライブラリに分離する。"
  - "Gateway で上流サービス障害時に Circuit Breaker を作動させ、連鎖障害を防ぐ。"
  - "Gateway のルーティング設定はコード（IaC）で管理し、手動 UI クリックだけで変更しない。"
tags:
  - "api-gateway"
  - "bff"
  - "backend-for-frontend"
  - "gateway"
  - "circuit-breaker"
  - "rate-limit"
  - "proxy"
  - "aggregation"
---

# 🚪 API Gateway & BFF パターン

> Gateway に認証・レートリミット・ルーティングといった横断的関心事を集中し、BFF にクライアント別集約を分離する。ゲートウェイレイヤを設計するときやクライアント別の画面 API を作るときに読む。

## 1. 中核原則

- 認証・認可、レートリミット、ロギング、リクエスト追跡（trace-id）は Gateway レイヤで中央化する。
- BFF は特定クライアント（Web・Mobile・TV）の画面要求に合わせて複数のマイクロサービスを集約・変換する。
- BFF はクライアントと 1:1 対応し、共用 BFF は作らない — 共通ロジックは共通ライブラリに分離する。
- Gateway で上流サービス障害時に Circuit Breaker を作動させ、連鎖障害を防ぐ。
- Gateway のルーティング設定はコード（IaC）で管理し、手動 UI クリックだけで変更しない。

## 2. 規則

### 2-1. アーキテクチャレイヤ

```
Client (Web/Mobile)
       ↓
  BFF Layer  ← クライアント別の集約・変換
       ↓
API Gateway  ← 認証・レートリミット・ルーティング・トレース
    ↙  ↘
Svc-A  Svc-B  ← ドメインマイクロサービス
```

### 2-2. API Gateway の中核機能

| 機能 | 実装 |
|------|------|
| 認証検証 | JWT 検証 + ユーザーコンテキスト伝達 |
| レートリミット | IP/トークン別 RPS 制限 |
| リクエスト追跡 | X-Trace-ID ヘッダ生成・伝播 |
| Circuit Breaker | 障害上流の遮断（Resilience4j・Hystrix） |
| SSL Termination | HTTPS → HTTP ダウンストリーム |

### 2-3. BFF — クライアント別集約

```python
# ✅ 推奨 — BFF がモバイルホーム画面に必要な複数サービスを並列集約
@router.get("/mobile/home")
async def mobile_home(user_id: str):
    user, notifications, feed = await asyncio.gather(
        user_svc.get_profile(user_id),
        notif_svc.get_unread(user_id, limit=5),
        feed_svc.get_latest(user_id, limit=10),
    )
    return {"user": user, "notifications": notifications, "feed": feed}
```

### 2-4. Circuit Breaker の状態

```
Closed → (失敗率 > 50%) → Open → (タイムアウト後) → Half-Open → (成功) → Closed
                                                        ↓ (失敗)
                                                       Open
```

### 2-5. 実装の選択

| 用途 | ツール |
|------|------|
| API Gateway | Kong, AWS API GW, NGINX, Traefik |
| BFF | Node.js/Express, FastAPI, NestJS |
| Circuit Breaker | Resilience4j (Java), tenacity (Python) |

## 3. よくある誤り

- 横断的関心事（認証・レートリミット）を各マイクロサービスに重複実装 → Gateway に集中していない。
- 複数のクライアントが一つの共用 BFF を共有 → 画面要求が衝突し変更が難しくなる。
- Circuit Breaker なしで上流呼び出し → 一サービスの障害が全体へ連鎖伝播する。
- ルーティングを UI で手動変更 → 構成管理不能、環境間の不一致。

## 4. チェックリスト

- [ ] 認証・レートリミット・トレースを Gateway に中央化したか
- [ ] BFF がクライアントと 1:1 対応するか（共用 BFF 禁止）
- [ ] 上流呼び出しに Circuit Breaker を適用したか
- [ ] Gateway のルーティングをコード（IaC）で管理するか
- [ ] BFF の集約呼び出しを並列化したか
