---
name: Zero-Downtime Deployment — Blue-Green & Canary
description: A standard for releasing new versions without downtime using Blue-Green·Canary·Rolling deployment strategies, and rolling back immediately when problems occur. Read it when choosing a zero-downtime deployment method or designing health checks, DB migrations, and automatic rollback. Keywords: blue-green, canary, rolling, healthcheck, /health, /ready, rollback, zero-downtime.
rules:
  - "Implement health check endpoints (/health·/ready) and have the load balancer route traffic based on them."
  - "Separate database schema changes from application deployment and proceed in a backward-compatible (Expand-Contract) manner."
  - "Set a 5–10 minute observation window after deployment and roll back automatically or immediately by hand if error rate·response time exceeds the threshold."
  - "Retain at least 2–3 previous images·versions so that rollback is immediately possible."
  - "Use feature flags to separate code deployment from feature activation, lowering risk."
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

# 🔄 Zero-Downtime Deployment — Blue-Green & Canary

> Release new versions without downtime and roll back immediately on problems. Read it when choosing a deployment strategy or designing health checks, DB migrations, and automatic rollback.

## 1. Core Principles
- Implement health check endpoints (/health·/ready) and have the load balancer route traffic based on them.
- Separate database schema changes from application deployment and proceed in a backward-compatible (Expand-Contract) manner.
- Set a 5–10 minute observation window after deployment and roll back automatically or immediately by hand if error rate·response time exceeds the threshold.
- Retain at least 2–3 previous images·versions so that rollback is immediately possible.
- Use feature flags to separate code deployment from feature activation, lowering risk.

## 2. Rules

### 2-1. Deployment Strategy Comparison
Choose a strategy that fits the service characteristics and cost.

| Strategy | Overview | Pros | Cons |
|------|------|------|------|
| Blue-Green | Two identical environments — switch all at once | Instant rollback | 2x infrastructure cost |
| Canary | Deploy to a small set of users first | Risk distribution | Complex routing |
| Rolling | Replace instances sequentially | Resource efficiency | Mixed old/new versions |

### 2-2. Health Check Endpoints
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

### 2-3. Blue-Green Switch (Kubernetes)
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

### 2-4. DB Migration Expand-Contract Pattern
Separate deployment and schema changes so it stays compatible no matter when you roll back.

```
Phase 1 (Expand): 새 컬럼 추가 (nullable) — 구버전과 호환
Phase 2 (Migrate): 데이터 백필 — 배포와 무관하게 진행
Phase 3 (Contract): 구 컬럼 삭제 — 신버전 완전 전환 후
```

### 2-5. Automatic Rollback Triggers
```yaml
# 배포 후 관찰 메트릭 (예: Argo Rollouts)
metrics:
  - name: error-rate
    thresholdRange: { max: 0.01 }   # 에러율 1% 초과 시 롤백
  - name: p99-latency
    thresholdRange: { max: 500 }    # p99 500ms 초과 시 롤백
```

## 3. Common Mistakes
- Not checking dependencies (DB·Redis) in /ready → traffic flows to instances that aren't ready.
- Doing schema changes and app deployment in one go → on rollback, the old version isn't compatible with the new schema.
- Not retaining previous version images → immediate rollback impossible.
- Switching 100% with no observation window → problems are found too late.

## 4. Checklist
- [ ] Did you implement /health·/ready health checks and wire them into LB routing?
- [ ] Did you choose a deployment strategy (Blue-Green·Canary·Rolling) that fits the service?
- [ ] Did you separate DB schema changes from deployment with Expand-Contract?
- [ ] Did you set a 5–10 minute observation window after deployment and automatic/manual rollback criteria?
- [ ] Are you retaining 2–3 previous version images?
- [ ] Did you separate code deployment from feature activation with feature flags?
