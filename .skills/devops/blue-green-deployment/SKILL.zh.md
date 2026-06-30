---
name: 零停机部署 — Blue-Green & Canary
description: 用 Blue-Green·Canary·Rolling 部署策略在无停机时间下发布新版本，并在出现问题时立即回滚的标准。选择无停机部署方式，或设计健康检查、DB 迁移、自动回滚时阅读。关键词：blue-green, canary, rolling, healthcheck, /health, /ready, rollback, zero-downtime。
rules:
  - "实现健康检查端点（/health·/ready），并让负载均衡器基于它来路由流量。"
  - "将数据库 schema 变更与应用部署分离，以向后兼容（Expand-Contract）的方式进行。"
  - "部署后设置 5~10 分钟的观察期，若错误率·响应时间超过基准值则自动或立即手动回滚。"
  - "至少保留 2~3 个部署前的镜像·版本，使回滚能够立即进行。"
  - "用功能开关（Feature Flag）将代码部署与功能启用分离以降低风险。"
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

# 🔄 零停机部署 — Blue-Green & Canary

> 在无停机时间下发布新版本，出现问题时立即回滚。选择部署策略，或设计健康检查、DB 迁移、自动回滚时阅读。

## 1. 核心原则
- 实现健康检查端点（/health·/ready），并让负载均衡器基于它来路由流量。
- 将数据库 schema 变更与应用部署分离，以向后兼容（Expand-Contract）的方式进行。
- 部署后设置 5~10 分钟的观察期，若错误率·响应时间超过基准值则自动或立即手动回滚。
- 至少保留 2~3 个部署前的镜像·版本，使回滚能够立即进行。
- 用功能开关（Feature Flag）将代码部署与功能启用分离以降低风险。

## 2. 规则

### 2-1. 部署策略对比
按服务特性与成本选择策略。

| 策略 | 概述 | 优点 | 缺点 |
|------|------|------|------|
| Blue-Green | 两个相同环境 — 一次性切换 | 即时回滚 | 基础设施 2 倍成本 |
| Canary | 先向少数用户部署 | 风险分散 | 路由复杂 |
| Rolling | 逐个替换实例 | 资源高效 | 新旧版本混杂 |

### 2-2. 健康检查端点
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

### 2-3. Blue-Green 切换 (Kubernetes)
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

### 2-4. DB 迁移 Expand-Contract 模式
将部署与 schema 变更分离，使得无论在哪个时点回滚都保持兼容。

```
Phase 1 (Expand): 새 컬럼 추가 (nullable) — 구버전과 호환
Phase 2 (Migrate): 데이터 백필 — 배포와 무관하게 진행
Phase 3 (Contract): 구 컬럼 삭제 — 신버전 완전 전환 후
```

### 2-5. 自动回滚触发器
```yaml
# 배포 후 관찰 메트릭 (예: Argo Rollouts)
metrics:
  - name: error-rate
    thresholdRange: { max: 0.01 }   # 에러율 1% 초과 시 롤백
  - name: p99-latency
    thresholdRange: { max: 500 }    # p99 500ms 초과 시 롤백
```

## 3. 常见错误
- 在 /ready 中不检查依赖（DB·Redis）→ 流量流入尚未就绪的实例。
- 将 schema 变更与应用部署一次性进行 → 回滚时旧版本与新 schema 不兼容。
- 不保留先前版本的镜像 → 无法即时回滚。
- 没有观察期就 100% 切换 → 问题发现得太晚。

## 4. 检查清单
- [ ] 是否实现了 /health·/ready 健康检查并接入 LB 路由
- [ ] 是否选择了符合服务特性的部署策略（Blue-Green·Canary·Rolling）
- [ ] 是否用 Expand-Contract 将 DB schema 变更与部署分离
- [ ] 是否设定了部署后 5~10 分钟的观察期和自动/手动回滚标准
- [ ] 是否保留着 2~3 个先前版本的镜像
- [ ] 是否用功能开关将代码部署与功能启用分离
