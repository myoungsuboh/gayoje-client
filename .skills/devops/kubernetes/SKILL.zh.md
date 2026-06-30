---
name: Kubernetes 部署标准
description: 容器编排稳定运维的标准 — 资源 requests/limits、liveness/readiness 探针、ConfigMap/Secret 分离、零停机滚动更新、声明式 IaC 管理。在向 K8s 部署应用，或决定资源、健康检查、配置、部署策略时阅读。关键词: kubernetes, k8s, helm, deployment, health-probe.
rules:
  - "为每个容器明确指定 resources.requests/limits — 未设置时存在节点资源耗尽、OOMKill、邻居影响（noisy neighbor）的风险。用 requests 进行调度，用 limits 设上限。CPU 会被 throttle，内存超限触发 OOMKill。"
  - "分离 liveness 与 readiness 探针 — readiness 失败时仅从流量中剔除，liveness 失败时重启。用 startup 探针保护慢启动。"
  - "配置放入 ConfigMap，机密放入 Secret（或外部密钥管理器）分离 — 禁止在镜像、清单中硬编码明文。对 Secret 应用 RBAC 与加密（etcd at-rest）。"
  - "部署用 RollingUpdate + maxSurge/maxUnavailable 实现零停机，并设定失败判定标准与自动回滚。重要服务用 PodDisruptionBudget 防止同时终止。"
  - "清单用 Helm/Kustomize 按环境管理并放入 Git（IaC）— 禁止通过 kubectl edit 手动变更（GitOps）。"
tags:
  - "kubernetes"
  - "k8s"
  - "helm"
  - "deployment"
  - "health-probe"
---

# ☸️ Kubernetes 部署标准

> 容器编排的事实标准。在向 K8s 部署应用，或决定资源、健康检查、配置分离、零停机部署策略时阅读。

## 1. 核心原则
- 为每个容器明确指定 `resources.requests/limits` — 未设置时存在节点资源耗尽、OOMKill、邻居影响（noisy neighbor）的风险。用 requests 进行调度，用 limits 设上限。CPU 会被 throttle，内存超限触发 OOMKill。
- 分离 liveness 与 readiness 探针 — readiness 失败时仅从流量中剔除，liveness 失败时重启。用 startup 探针保护慢启动。
- 配置放入 ConfigMap，机密放入 Secret（或外部密钥管理器）分离 — 禁止在镜像、清单中硬编码明文。对 Secret 应用 RBAC 与加密（etcd at-rest）。
- 部署用 RollingUpdate + `maxSurge`/`maxUnavailable` 实现零停机，并设定失败判定标准与自动回滚。重要服务用 PodDisruptionBudget 防止同时终止。
- 清单用 Helm/Kustomize 按环境管理并放入 Git（IaC）— 禁止通过 `kubectl edit` 手动变更（GitOps）。

## 2. 规则

### 2-1. 资源 requests/limits（必须）
未设置时存在节点资源耗尽、OOMKill、noisy neighbor 风险。

```yaml
# ❌ 禁止 — resources 未设置（资源耗尽、OOMKill 风险）
containers:
  - name: app
    image: myapp:1.0

# ✅ 推荐 — requests 用于调度，limits 设上限
containers:
  - name: app
    image: myapp:1.0
    resources:
      requests: { cpu: "250m", memory: "256Mi" }
      limits:   { cpu: "500m", memory: "512Mi" }
```

### 2-2. 分离 liveness / readiness 探针
readiness 失败 → 仅从流量中剔除，liveness 失败 → 重启。

```yaml
# ✅ 推荐 — 分离角色不同的两个探针
readinessProbe:           # “已准备好接收流量”
  httpGet: { path: /ready, port: 8080 }
livenessProbe:            # “进程存活”
  httpGet: { path: /healthz, port: 8080 }
startupProbe:             # 保护慢启动
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
```

### 2-3. 分离配置/机密（禁止硬编码）
```yaml
# ❌ 禁止 — 镜像、清单中存在明文机密
env:
  - name: DB_PASSWORD
    value: "p@ssw0rd"

# ✅ 推荐 — 分离为 ConfigMap（配置）/ Secret（机密）
envFrom:
  - configMapRef: { name: app-config }
  - secretRef:    { name: app-secret }   # 应用 RBAC、etcd 加密
```

### 2-4. 零停机滚动更新 + 自动回滚
```yaml
# ✅ 推荐 — 渐进式发布 + PDB 防止同时终止
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
---
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
```

### 2-5. 声明式管理（GitOps）
```bash
# ❌ 禁止 — 手动变更（漂移、无法追踪）
kubectl edit deployment myapp

# ✅ 推荐 — 将 Helm/Kustomize 清单放入 Git 并通过 CI/CD 应用
helm upgrade --install myapp ./chart -f values-prod.yaml
```

## 3. 常见错误
- resources 未设置 → 单个 Pod 独占节点资源并杀死邻居。
- liveness/readiness 设置相同 → 即使短暂负载也会进入重启循环。
- 将机密以明文存于 ConfigMap、镜像 → 泄露风险。
- 用 `kubectl edit` 直接修改 → 与 Git 不一致，下次部署时被回滚。

## 4. 检查清单
- [ ] 是否为每个容器明确指定了 requests/limits
- [ ] 是否按角色分离了 liveness 与 readiness 探针
- [ ] 配置是否在 ConfigMap、机密是否在 Secret，且无硬编码
- [ ] 是否用 RollingUpdate + maxSurge/maxUnavailable 保证零停机，并有自动回滚标准
- [ ] 是否为重要服务设置了 PodDisruptionBudget
- [ ] 是否用 Git（IaC）管理清单，且无手动变更
