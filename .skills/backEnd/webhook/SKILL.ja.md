---
name: Webhook の発行 & 受信
description: 外部サービスにイベントを通知する Webhook 発行者の実装と、受信者検証の標準。Webhook を新たに発行する場合や、外部 Webhook を安全に受信・検証・再試行する場合に読む。キーワード: webhook, hmac, event, signature, X-Signature, callback, retry.
rules:
  - "Webhook の送信は同期 HTTP 経路ではなく、バックグラウンドジョブ（キュー）で非同期に処理する (background-job 参照)。"
  - "受信者の真正性を検証するため、HMAC-SHA256 署名を X-Signature ヘッダーに付与し、受信側で検証する。"
  - "送信失敗時は指数バックオフで最大 N 回再試行し、再試行ログを保管する。"
  - "Webhook ペイロードはイベント種別・バージョン・タイムスタンプ・冪等 ID を含む envelope 構造に従う。"
  - "受信エンドポイントは 200 OK を即座に返し、実際の処理は非同期で行ってタイムアウトを防ぐ。"
tags:
  - "webhook"
  - "hmac"
  - "event"
  - "signature"
  - "X-Signature"
  - "callback"
  - "retry"
---

# 🪝 Webhook の発行 & 受信

> 外部サービスへイベントを安全に送受信する方式を統一する。Webhook 発行者を実装する場合や、外部 Webhook の受信エンドポイントを作る場合に読む。

## 1. 中核原則
- Webhook の送信は同期 HTTP 経路ではなく、バックグラウンドジョブ（キュー）で非同期に処理する (`background-job` 参照)。
- 受信者の真正性を検証するため、HMAC-SHA256 署名を `X-Signature` ヘッダーに付与し、受信側で検証する。
- 送信失敗時は指数バックオフで最大 N 回再試行し、再試行ログを保管する。
- Webhook ペイロードはイベント種別・バージョン・タイムスタンプ・冪等 ID を含む envelope 構造に従う。
- 受信エンドポイントは 200 OK を即座に返し、実際の処理は非同期で行ってタイムアウトを防ぐ。

## 2. ルール

### 2-1. ペイロード Envelope 標準

イベント種別・バージョン・タイムスタンプ・冪等 ID（`id`）を含める。

```json
{
  "id": "evt_01JXYZ",
  "type": "order.completed",
  "version": "1.0",
  "created_at": "2026-06-13T12:00:00Z",
  "data": {
    "order_id": "ORD-123",
    "amount": 50000
  }
}
```

### 2-2. 署名生成（送信側）

```python
import hmac, hashlib

def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
```

### 2-3. 署名検証（受信側）

受信エンドポイントは署名を定数時間で比較し、即座に 200 を返したうえで実際の処理は非同期に回す。

```python
def verify_signature(secret: str, body: bytes, header: str) -> bool:
    expected = sign_payload(secret, body)
    return hmac.compare_digest(expected, header)  # 定数時間比較は必須

@router.post("/webhooks/payment")
async def receive_webhook(request: Request):
    body = await request.body()
    if not verify_signature(WEBHOOK_SECRET, body, request.headers.get("X-Signature", "")):
        raise HTTPException(403)
    background_tasks.add_task(process_event, json.loads(body))
    return {"ok": True}  # 即座に 200 を返す
```

### 2-4. 再試行ログのスキーマ

送信失敗時は指数バックオフで再試行し、試行履歴を保管する。

```sql
CREATE TABLE webhook_attempts (
  id UUID PRIMARY KEY,
  event_id VARCHAR,
  endpoint_url VARCHAR,
  status_code INT,
  attempt_no INT,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 3. よくある誤り
- ❌ 署名検証なしで受信処理 → 偽造リクエストの実行。HMAC 検証は必須。
- ❌ 署名比較を `==` で行う → タイミング攻撃。`hmac.compare_digest` などの定数時間比較を用いる。
- ❌ 同期送信（リクエスト経路上で）→ 受信者の遅延が自分の API 遅延に伝播する。バックグラウンドジョブ（`background-job`）で行う。
- ❌ 受信時に即座に 200 を返さず同期処理 → 送信者のタイムアウト・再送の殺到。即座に 200 を返してから非同期処理。
- ❌ 再試行・冪等性なし → 重複処理/欠落。envelope `id` で冪等処理 + 指数バックオフ再試行。
- ❌ 送信失敗を無視または無限に再試行 → 再試行上限・DLQ で管理する。
- ❌ 例が Python のみで主スタック（Spring）を反映していない → HMAC・キューの概念は同一なので、当該スタックの API に移植する。

## 4. チェックリスト
- [ ] Webhook の送信をバックグラウンドジョブ（キュー）で非同期に処理しているか
- [ ] ペイロードが `id`・`type`・`version`・`created_at` の envelope 構造に従っているか
- [ ] 送信側で HMAC-SHA256 署名を `X-Signature` ヘッダーに付与しているか
- [ ] 受信側で `hmac.compare_digest` により定数時間比較で検証しているか
- [ ] 受信エンドポイントが即座に 200 を返し、処理を非同期に回しているか
- [ ] 送信失敗時に指数バックオフ再試行と試行ログを保管しているか
