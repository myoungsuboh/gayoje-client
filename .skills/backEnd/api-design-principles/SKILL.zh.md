---
name: API 设计原则（REST/HTTP，技术栈中立）
description: REST/HTTP API 的设计原则 — 资源建模·URL 命名、HTTP 方法/状态码语义、一致的错误响应格式（RFC 7807）、过滤·排序·分页的查询约定、无状态性。这是与技术栈无关的通用标准，在设计新端点或确定响应·错误格式时阅读。（版本策略委派给 `api-versioning-swagger`，幂等性委派给 `idempotency`，分页实现委派给 `pagination-filtering`，认证/授权委派给 `authn-authz`。）关键词: REST, resource, HTTP method, status code, idempotent, RFC 7807, problem+json, content negotiation, HATEOAS。
rules:
  - "以资源为中心的 URL: 路径用名词（资源）而非动词命名 — /users/{id}/orders (O)、/getUserOrders (X)。集合用复数。"
  - "遵守方法语义: GET（查询·无副作用）·POST（创建）·PUT（整体替换）·PATCH（部分修改）·DELETE（删除）。不用 GET 改变状态。"
  - "遵守状态码语义: 2xx 成功·4xx 客户端错误·5xx 服务端错误。不要把错误装进 200 返回（例如用 200 返回 {success:false}）。"
  - "一致的错误格式: 所有错误以相同结构响应。遵循 RFC 7807（application/problem+json: type·title·status·detail）或项目通用错误模式。"
  - "查询约定标准化: 将过滤·排序·分页作为查询参数一致地暴露（例: ?status=open&sort=-created_at&page=2）。"
  - "无状态性: 每个请求必须自包含 — 不在服务端会话中隐藏请求间状态（认证令牌等每次请求都传递）。"
tags:
  - "REST"
  - "resource"
  - "HTTP method"
  - "status code"
  - "idempotent"
  - "RFC 7807"
  - "problem+json"
  - "content negotiation"
  - "HATEOAS"
  - "PATCH"
  - "ETag"
---

# 🔌 API 设计原则（REST/HTTP，技术栈中立）

> 统一设计原则，使 REST/HTTP API 可预测且一致。规定资源建模·方法/状态码语义·错误格式·查询约定。在设计新端点或确定响应·错误格式时阅读。这是不依赖特定语言/框架的通用标准。
>
> 边界: API 的**版本策略**见 [api-versioning-swagger](../api-versioning-swagger/SKILL.md)，**幂等性保证**见 [idempotency](../idempotency/SKILL.md)，**分页实现**见 [pagination-filtering](../pagination-filtering/SKILL.md)，**认证/授权**见 [authn-authz](../../security/authn-authz/SKILL.md)。本技能处理其上层的**设计原则**。

## 1. 核心原则

- **以资源为中心**: URL 指向资源（noun），而非行为（verb）。
- **遵守方法·状态码语义**: 原样使用 HTTP 的标准语义 — 不重新发明。
- **一致的错误格式**: 所有错误必须形状相同，客户端才能只处理一次。
- **无状态性**: 请求自包含 — 不在服务端会话中隐藏状态。

## 2. 规则

### 2-1. 资源建模 & URL 命名

```
✅ 推荐（名词·复数·层级）
GET    /users/{id}/orders          # 用户的订单列表
POST   /orders                     # 创建订单
GET    /orders/{id}                # 单个订单
PATCH  /orders/{id}                # 订单部分修改

❌ 禁止（在 URL 中放动词·行为）
POST   /createOrder
GET    /getUserOrders?userId=5
POST   /orders/{id}/cancelAndRefund   # 将行为建模为状态变更
```

- 集合用复数（`/orders`），单个用 `/orders/{id}`。
- 若行为确有必要（搜索·批处理），用子资源或明确的动作: `POST /orders/{id}/refunds`。

### 2-2. HTTP 方法语义

| 方法 | 用途 | 幂等性 | 备注 |
|--------|------|--------|------|
| GET | 查询 | ✓ | 无副作用 — 可缓存 |
| POST | 创建·非幂等操作 | ✗ | 每次调用产生新资源 |
| PUT | 整体替换 | ✓ | 同一请求体多次 = 同一结果 |
| PATCH | 部分修改 | △ | 通常非幂等 |
| DELETE | 删除 | ✓ | 已删除也可按成功处理 |

> 关于**保证幂等性的实现**（重复请求防御、Idempotency-Key），见 `idempotency` 技能。

### 2-3. 状态码语义

```
2xx 成功       200 OK · 201 Created(+Location) · 204 No Content
4xx 客户端错误  400 校验失败 · 401 未认证 · 403 无权限 · 404 不存在 · 409 冲突 · 422 语义错误 · 429 请求过多
5xx 服务端错误  500 内部错误 · 503 暂时不可用
```

- ❌ 禁止: 在 `200 OK` 的响应体中放 `{ "success": false, "error": ... }` — 把错误藏进 200 会让客户端·代理·监控误判为成功。
- 创建成功用 `201` + `Location` 头告知新资源位置。

### 2-4. 一致的错误响应（RFC 7807）

```json
// Content-Type: application/problem+json
{
  "type": "https://example.com/errors/insufficient-stock",
  "title": "재고 부족",
  "status": 409,
  "detail": "상품 SKU-123 의 재고가 3개 남아 5개 주문 불가",
  "instance": "/orders/789"
}
```

- 所有错误遵循**相同模式**（RFC 7807 或项目通用错误对象）。
- `detail` 供人阅读，`type` 供机器分支。
- 不要把敏感信息（堆栈跟踪·内部路径）放进响应体。

### 2-5. 查询约定 — 过滤·排序·分页

```
GET /orders?status=open&customer=5&sort=-created_at&page=2&size=20
```

- 过滤用字段名查询（`status=open`），排序定下 `sort=-created_at`（`-` 降序）约定并一致应用。
- 分页的**方式选择·实现**（offset vs cursor）见 `pagination-filtering` 技能 — 此处仅讲"用查询一致暴露"的原则。

### 2-6. 内容协商 & 缓存（基础）

- 请求/响应格式通过 `Content-Type`·`Accept` 协商（默认 `application/json`）。
- 在查询响应上给出 `ETag`/`Last-Modified`，可通过条件请求（`If-None-Match`）节省带宽。

## 3. 常见错误

- 在 URL 中嵌入行为（`/getX`、`/doY`）→ 变成 RPC 而非 REST。用资源+方法表达。
- 所有响应都返回 `200` 并用响应体标志区分成败 → 这是抛弃 HTTP 语义。要正确使用状态码。
- 每个端点错误形状不同 → 客户端必须逐例分支。统一为一个。
- 给 GET 加副作用（状态变更）→ 缓存·预取·重试会无意中改变数据。

## 4. 检查清单

- [ ] URL 是资源（名词·复数）而非动词吗
- [ ] 是否按标准语义使用了方法·状态码（没有把错误藏进 200）
- [ ] 所有错误是否为相同格式（RFC 7807 或通用模式）
- [ ] 是否以一致的查询约定暴露过滤·排序·分页
- [ ] 请求是否自包含（没有在服务端会话中隐藏请求间状态）

## 附录: 相关技能委派

- 版本策略（`/v1/`、Deprecation/Sunset）: `api-versioning-swagger`
- 幂等性保证（Idempotency-Key、重复防御）: `idempotency`
- 分页实现（offset/cursor）: `pagination-filtering`
- 认证/授权: `authn-authz` · 输入校验: `input-validation`
