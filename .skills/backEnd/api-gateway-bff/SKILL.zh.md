---
name: API Gateway & BFF 模式
description: API Gateway 与 Backend-for-Frontend（BFF）模式的角色·路由·认证集中化·按客户端聚合的标准。在设计网关层、构建按客户端的页面聚合 API、或确定认证·限流·Circuit Breaker 位置时阅读。关键词: api-gateway, bff, backend-for-frontend, gateway, circuit-breaker, rate-limit, proxy, aggregation。
rules:
  - "认证·授权、限流、日志、请求追踪（trace-id）在 Gateway 层集中化。"
  - "BFF 按特定客户端（Web·Mobile·TV）的页面需求，聚合·转换多个微服务。"
  - "BFF 与客户端 1:1 对应，不建公用 BFF — 公用逻辑分离到通用库。"
  - "在 Gateway 上当上游服务故障时触发 Circuit Breaker，阻止级联故障。"
  - "Gateway 路由配置用代码（IaC）管理，不仅靠手动 UI 点击更改。"
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

# 🚪 API Gateway & BFF 模式

> 把认证·限流·路由等横切关注点集中在 Gateway，把按客户端的聚合分离到 BFF。在设计网关层或构建按客户端的页面 API 时阅读。

## 1. 核心原则

- 认证·授权、限流、日志、请求追踪（trace-id）在 Gateway 层集中化。
- BFF 按特定客户端（Web·Mobile·TV）的页面需求，聚合·转换多个微服务。
- BFF 与客户端 1:1 对应，不建公用 BFF — 公用逻辑分离到通用库。
- 在 Gateway 上当上游服务故障时触发 Circuit Breaker，阻止级联故障。
- Gateway 路由配置用代码（IaC）管理，不仅靠手动 UI 点击更改。

## 2. 规则

### 2-1. 架构层

```
Client (Web/Mobile)
       ↓
  BFF Layer  ← 按客户端聚合·转换
       ↓
API Gateway  ← 认证·限流·路由·追踪
    ↙  ↘
Svc-A  Svc-B  ← 领域微服务
```

### 2-2. API Gateway 核心功能

| 功能 | 实现 |
|------|------|
| 认证校验 | JWT 校验 + 传递用户上下文 |
| 限流 | 按 IP/令牌的 RPS 限制 |
| 请求追踪 | 生成·传播 X-Trace-ID 头 |
| Circuit Breaker | 阻断故障上游（Resilience4j·Hystrix） |
| SSL Termination | HTTPS → HTTP 下游 |

### 2-3. BFF — 按客户端聚合

```python
# ✅ 推荐 — BFF 并行聚合移动端首页所需的多个服务
@router.get("/mobile/home")
async def mobile_home(user_id: str):
    user, notifications, feed = await asyncio.gather(
        user_svc.get_profile(user_id),
        notif_svc.get_unread(user_id, limit=5),
        feed_svc.get_latest(user_id, limit=10),
    )
    return {"user": user, "notifications": notifications, "feed": feed}
```

### 2-4. Circuit Breaker 状态

```
Closed → (失败率 > 50%) → Open → (超时后) → Half-Open → (成功) → Closed
                                                        ↓ (失败)
                                                       Open
```

### 2-5. 实现选型

| 用途 | 工具 |
|------|------|
| API Gateway | Kong, AWS API GW, NGINX, Traefik |
| BFF | Node.js/Express, FastAPI, NestJS |
| Circuit Breaker | Resilience4j (Java), tenacity (Python) |

## 3. 常见错误

- 把横切关注点（认证·限流）在各微服务重复实现 → 未集中到 Gateway。
- 多个客户端共享一个公用 BFF → 页面需求冲突，变更困难。
- 没有 Circuit Breaker 就调用上游 → 一个服务故障级联蔓延到整体。
- 在 UI 里手动改路由 → 无法做配置管理，环境间不一致。

## 4. 检查清单

- [ ] 是否把认证·限流·追踪集中到了 Gateway
- [ ] BFF 是否与客户端 1:1 对应（禁止公用 BFF）
- [ ] 是否对上游调用应用了 Circuit Breaker
- [ ] 是否用代码（IaC）管理 Gateway 路由
- [ ] 是否并行化了 BFF 的聚合调用
