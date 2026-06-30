---
name: 幂等性 (Idempotency) 保证
description: 在重复请求·重试下也保证相同结果的幂等性键模式与实现标准。在创建支付·下单·邮件发送等有副作用的 POST 端点,或决定重试·重复请求处理方式时阅读。关键词: idempotency, idempotent, Idempotency-Key, retry, payment, duplicate, redis。
rules:
  - "支付·下单·邮件发送等有副作用的 POST 端点支持 Idempotency-Key 头。"
  - "把同一键的首次请求结果存入缓存(Redis·DB),再次请求时返回已存储的结果。"
  - "幂等性键使用客户端生成的 UUID v4,TTL 设置为 24 小时以上。"
  - "对处理中请求的重复到达以 409 Conflict 响应,或提供直至完成的 polling 方式。"
  - "PUT/DELETE 在 URI+参数相同时即为幂等,因此无需单独的键。"
tags:
  - "idempotency"
  - "idempotent"
  - "Idempotency-Key"
  - "retry"
  - "payment"
  - "duplicate"
  - "redis"
---

# 🔁 幂等性 (Idempotency) 保证

> 在重复请求·重试下也保证相同结果。在创建有副作用的 POST 端点或决定重试·重复处理时阅读。

## 1. 核心原则
- 支付·下单·邮件发送等有副作用的 POST 端点支持 `Idempotency-Key` 头。
- 把同一键的首次请求结果存入缓存(Redis·DB),再次请求时返回已存储的结果。
- 幂等性键使用客户端生成的 UUID v4,TTL 设置为 24 小时以上。
- 对处理中请求的重复到达以 409 Conflict 响应,或提供直至完成的 polling 方式。
- PUT/DELETE 在 URI+参数相同时即为幂等,因此无需单独的键。

## 2. 规则

### 2-1. 处理流程
```
Client → POST /payments  (Idempotency-Key: uuid-abc)
         ↓
Server: Redis 中是否存在 key=uuid-abc?
  No  → 处理 → 存储结果(TTL 24h) → 201 Created
  Yes → 返回已存储的结果 → 200 OK (跳过处理)
```

### 2-2. 基于 Redis 的实现 (Python 示例)
```python
IDEMPOTENCY_TTL = 86400  # 24小时

async def idempotent(key: str, handler):
    cached = await redis.get(f"idem:{key}")
    if cached:
        return json.loads(cached)          # ✅ 再次请求 — 返回已存储的结果
    result = await handler()
    await redis.set(f"idem:{key}", json.dumps(result), ex=IDEMPOTENCY_TTL)
    return result
```

### 2-3. API 请求示例
```http
POST /api/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{"amount": 10000, "currency": "KRW"}
```

### 2-4. 错误处理
- 键冲突(处理中): `409 Conflict`,包含 Retry-After 头
- 无键的 POST: `400 Bad Request` (要求幂等性的端点)
- 过期后重用: 作为新请求处理(建议重新生成键)

## 3. 常见错误
- 有副作用的 POST 不支持幂等性键 → 重试时重复支付·重复发送。
- 不存储结果只检查键是否存在 → 无法对再次请求返回响应体。
- TTL 设置过短 → 正当的重试被当作新请求处理。
- 对 PUT/DELETE 要求不必要的键 → 本就幂等,属于过度设计。

## 4. 检查清单
- [ ] 有副作用的 POST 端点是否支持 `Idempotency-Key`
- [ ] 是否把首次请求结果存入缓存并在再次请求时返回
- [ ] 键是否为客户端 UUID v4,TTL 是否为 24 小时以上
- [ ] 处理中的重复是否以 409 Conflict 响应
- [ ] 是否未对 PUT/DELETE 要求不必要的键
