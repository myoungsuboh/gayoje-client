---
name: API Gateway & BFF Patterns
description: Standards for the roles, routing, auth centralization, and per-client aggregation of the API Gateway and Backend-for-Frontend (BFF) patterns. Read when designing the gateway layer, building per-client screen-aggregation APIs, or deciding where authentication, rate limiting, and the Circuit Breaker live. Keywords: api-gateway, bff, backend-for-frontend, gateway, circuit-breaker, rate-limit, proxy, aggregation.
rules:
  - "Centralize authentication/authorization, rate limiting, logging, and request tracing (trace-id) at the Gateway layer."
  - "A BFF aggregates and transforms multiple microservices to match the screen needs of a specific client (Web, Mobile, TV)."
  - "A BFF maps 1:1 to a client; do not build a shared BFF — extract shared logic into a common library."
  - "When an upstream service fails, trip the Circuit Breaker at the Gateway to prevent cascading failures."
  - "Manage Gateway routing configuration as code (IaC); do not change it only via manual UI clicks."
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

# 🚪 API Gateway & BFF Patterns

> Concentrate cross-cutting concerns like authentication, rate limiting, and routing at the Gateway, and split per-client aggregation into the BFF. Read when designing the gateway layer or building per-client screen APIs.

## 1. Core Principles

- Centralize authentication/authorization, rate limiting, logging, and request tracing (trace-id) at the Gateway layer.
- A BFF aggregates and transforms multiple microservices to match the screen needs of a specific client (Web, Mobile, TV).
- A BFF maps 1:1 to a client; do not build a shared BFF — extract shared logic into a common library.
- When an upstream service fails, trip the Circuit Breaker at the Gateway to prevent cascading failures.
- Manage Gateway routing configuration as code (IaC); do not change it only via manual UI clicks.

## 2. Rules

### 2-1. Architecture Layers

```
Client (Web/Mobile)
       ↓
  BFF Layer  ← per-client aggregation·transformation
       ↓
API Gateway  ← auth·rate-limit·routing·trace
    ↙  ↘
Svc-A  Svc-B  ← domain microservices
```

### 2-2. API Gateway Core Features

| Feature | Implementation |
|------|------|
| Auth verification | JWT verification + pass user context |
| Rate limiting | RPS limit per IP/token |
| Request tracing | Generate·propagate X-Trace-ID header |
| Circuit Breaker | Block failing upstream (Resilience4j·Hystrix) |
| SSL Termination | HTTPS → HTTP downstream |

### 2-3. BFF — Per-Client Aggregation

```python
# ✅ Recommended — the BFF aggregates in parallel the services needed by the mobile home screen
@router.get("/mobile/home")
async def mobile_home(user_id: str):
    user, notifications, feed = await asyncio.gather(
        user_svc.get_profile(user_id),
        notif_svc.get_unread(user_id, limit=5),
        feed_svc.get_latest(user_id, limit=10),
    )
    return {"user": user, "notifications": notifications, "feed": feed}
```

### 2-4. Circuit Breaker States

```
Closed → (failure rate > 50%) → Open → (after timeout) → Half-Open → (success) → Closed
                                                        ↓ (failure)
                                                       Open
```

### 2-5. Choosing Implementations

| Purpose | Tools |
|------|------|
| API Gateway | Kong, AWS API GW, NGINX, Traefik |
| BFF | Node.js/Express, FastAPI, NestJS |
| Circuit Breaker | Resilience4j (Java), tenacity (Python) |

## 3. Common Mistakes

- Duplicating cross-cutting concerns (auth·rate limiting) in each microservice → not concentrated at the Gateway.
- Multiple clients sharing a single common BFF → screen needs conflict and changes become hard.
- Upstream calls without a Circuit Breaker → one service failure cascades to the whole system.
- Changing routing manually in the UI → not version-controllable, inconsistency across environments.

## 4. Checklist

- [ ] Did you centralize auth·rate-limit·trace at the Gateway?
- [ ] Does the BFF map 1:1 to a client (no shared BFF)?
- [ ] Did you apply a Circuit Breaker to upstream calls?
- [ ] Do you manage Gateway routing as code (IaC)?
- [ ] Did you parallelize the BFF's aggregation calls?
