---
name: Webhook 发布 & 接收
description: 实现向外部服务通知事件的 Webhook 发布方，以及接收方校验的标准。新发布 Webhook，或安全地接收、校验、重试外部 Webhook 时阅读。关键词: webhook, hmac, event, signature, X-Signature, callback, retry.
rules:
  - "Webhook 发送不在同步 HTTP 路径上处理，而在后台任务（队列）中异步处理 (参见 background-job)。"
  - "为校验发送方真实性，将 HMAC-SHA256 签名附加到 X-Signature 头中，并在接收方进行校验。"
  - "发送失败时以指数退避最多重试 N 次，并保留重试日志。"
  - "Webhook 负载遵循包含事件类型、版本、时间戳、幂等 ID 的 envelope 结构。"
  - "接收端点立即返回 200 OK，实际处理异步执行以避免超时。"
tags:
  - "webhook"
  - "hmac"
  - "event"
  - "signature"
  - "X-Signature"
  - "callback"
  - "retry"
---

# 🪝 Webhook 发布 & 接收

> 统一向外部服务安全发送和接收事件的方式。实现 Webhook 发布方，或创建接收外部 Webhook 的端点时阅读。

## 1. 核心原则
- Webhook 发送不在同步 HTTP 路径上处理，而在后台任务（队列）中异步处理 (`background-job` 参照)。
- 为校验发送方真实性，将 HMAC-SHA256 签名附加到 `X-Signature` 头中，并在接收方进行校验。
- 发送失败时以指数退避最多重试 N 次，并保留重试日志。
- Webhook 负载遵循包含事件类型、版本、时间戳、幂等 ID 的 envelope 结构。
- 接收端点立即返回 200 OK，实际处理异步执行以避免超时。

## 2. 规则

### 2-1. 负载 Envelope 标准

包含事件类型、版本、时间戳、幂等 ID（`id`）。

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

### 2-2. 签名生成（发送方）

```python
import hmac, hashlib

def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
```

### 2-3. 签名校验（接收方）

接收端点以恒定时间比较签名，立即返回 200 后将实际处理交给异步执行。

```python
def verify_signature(secret: str, body: bytes, header: str) -> bool:
    expected = sign_payload(secret, body)
    return hmac.compare_digest(expected, header)  # 必须使用恒定时间比较

@router.post("/webhooks/payment")
async def receive_webhook(request: Request):
    body = await request.body()
    if not verify_signature(WEBHOOK_SECRET, body, request.headers.get("X-Signature", "")):
        raise HTTPException(403)
    background_tasks.add_task(process_event, json.loads(body))
    return {"ok": True}  # 立即返回 200
```

### 2-4. 重试日志 Schema

发送失败时以指数退避重试，并保留尝试历史。

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

## 3. 常见错误
- ❌ 未做签名校验就处理接收 → 执行伪造请求。必须进行 HMAC 校验。
- ❌ 用 `==` 比较签名 → 时序攻击。使用 `hmac.compare_digest` 等恒定时间比较。
- ❌ 同步发送（在请求路径上）→ 接收方延迟传导为自身 API 延迟。改用后台任务（`background-job`）。
- ❌ 接收时不立即返回 200 而做同步处理 → 发送方超时、重发风暴。立即返回 200 后再异步处理。
- ❌ 无重试、无幂等 → 重复处理/丢失。用 envelope `id` 做幂等处理 + 指数退避重试。
- ❌ 忽略发送失败或无限重试 → 用重试上限、DLQ 管理。
- ❌ 示例仅为 Python，未反映主技术栈（Spring）→ HMAC、队列概念相同，移植到对应技术栈的 API 即可。

## 4. 检查清单
- [ ] Webhook 发送是否在后台任务（队列）中异步处理
- [ ] 负载是否遵循 `id`·`type`·`version`·`created_at` 的 envelope 结构
- [ ] 发送方是否在 `X-Signature` 头中附加 HMAC-SHA256 签名
- [ ] 接收方是否用 `hmac.compare_digest` 进行恒定时间比较校验
- [ ] 接收端点是否立即返回 200 并将处理交给异步
- [ ] 发送失败时是否保留指数退避重试与尝试日志
