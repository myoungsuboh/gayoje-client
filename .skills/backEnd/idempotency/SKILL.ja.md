---
name: 冪等性 (Idempotency) の保証
description: 重複リクエスト・リトライでも同じ結果を保証する冪等性キーのパターンと実装標準。決済・注文・メール送信など副作用のある POST エンドポイントを作る、またはリトライ・重複リクエスト処理を決めるときに読む。キーワード: idempotency, idempotent, Idempotency-Key, retry, payment, duplicate, redis。
rules:
  - "決済・注文・メール送信など副作用のある POST エンドポイントは Idempotency-Key ヘッダーをサポートする。"
  - "同一キーの最初のリクエスト結果をキャッシュ(Redis・DB)に保存し、再リクエスト時は保存された結果を返す。"
  - "冪等性キーはクライアントが生成した UUID v4 を使い、TTL は 24 時間以上に設定する。"
  - "処理中のリクエストへの重複到達は 409 Conflict で応答するか、完了まで polling 方式を提供する。"
  - "PUT/DELETE は URI+パラメータが同一なら冪等なので別途キーは不要だ。"
tags:
  - "idempotency"
  - "idempotent"
  - "Idempotency-Key"
  - "retry"
  - "payment"
  - "duplicate"
  - "redis"
---

# 🔁 冪等性 (Idempotency) の保証

> 重複リクエスト・リトライでも同じ結果を保証する。副作用のある POST エンドポイントを作る、またはリトライ・重複処理を決めるときに読む。

## 1. 核心原則
- 決済・注文・メール送信など副作用のある POST エンドポイントは `Idempotency-Key` ヘッダーをサポートする。
- 同一キーの最初のリクエスト結果をキャッシュ(Redis・DB)に保存し、再リクエスト時は保存された結果を返す。
- 冪等性キーはクライアントが生成した UUID v4 を使い、TTL は 24 時間以上に設定する。
- 処理中のリクエストへの重複到達は 409 Conflict で応答するか、完了まで polling 方式を提供する。
- PUT/DELETE は URI+パラメータが同一なら冪等なので別途キーは不要だ。

## 2. ルール

### 2-1. 処理フロー
```
Client → POST /payments  (Idempotency-Key: uuid-abc)
         ↓
Server: Redis に key=uuid-abc が存在するか?
  No  → 処理 → 結果保存(TTL 24h) → 201 Created
  Yes → 保存された結果を返す → 200 OK (処理を省略)
```

### 2-2. Redis ベースの実装 (Python 例)
```python
IDEMPOTENCY_TTL = 86400  # 24時間

async def idempotent(key: str, handler):
    cached = await redis.get(f"idem:{key}")
    if cached:
        return json.loads(cached)          # ✅ 再リクエスト — 保存された結果を返す
    result = await handler()
    await redis.set(f"idem:{key}", json.dumps(result), ex=IDEMPOTENCY_TTL)
    return result
```

### 2-3. API リクエスト例
```http
POST /api/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{"amount": 10000, "currency": "KRW"}
```

### 2-4. エラー処理
- キー衝突(処理中): `409 Conflict`、Retry-After ヘッダーを含む
- キーなしの POST: `400 Bad Request` (冪等性必須エンドポイント)
- 期限切れ後の再利用: 新規リクエストとして処理(キー再生成を推奨)

## 3. よくある間違い
- 副作用のある POST に冪等性キー未サポート → リトライ時に重複決済・重複送信。
- 結果を保存せずキーの存在有無だけ確認 → 再リクエストに応答本文を返せない。
- TTL を短く設定しすぎる → 正当なリトライが新規リクエストとして処理される。
- PUT/DELETE に不要なキーを要求 → 本来冪等なので過設計。

## 4. チェックリスト
- [ ] 副作用のある POST エンドポイントが `Idempotency-Key` をサポートしているか
- [ ] 最初のリクエスト結果をキャッシュに保存し再リクエスト時に返すか
- [ ] キーはクライアント UUID v4、TTL は 24 時間以上か
- [ ] 処理中の重複は 409 Conflict で応答するか
- [ ] PUT/DELETE に不要なキーを要求していないか
