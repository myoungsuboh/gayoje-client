---
name: Kubernetes Deployment Standards
description: Standards for stable container-orchestration operations — resource requests/limits, liveness/readiness probes, ConfigMap/Secret separation, zero-downtime rolling updates, declarative IaC management. Read when deploying apps to K8s or deciding on resources, health checks, configuration, or deployment strategy. Keywords: kubernetes, k8s, helm, deployment, health-probe.
rules:
  - "Specify resources.requests/limits on every container — without them you risk node resource exhaustion, OOMKill, and noisy-neighbor impact. Use requests for scheduling and limits for the ceiling. CPU is throttled; exceeding memory triggers OOMKill."
  - "Separate liveness and readiness probes — on readiness failure, only remove from traffic; on liveness failure, restart. Protect slow startups with a startup probe."
  - "Separate configuration into ConfigMap and secrets into Secret (or an external secret manager) — never hardcode plaintext in images or manifests. Apply RBAC and encryption (etcd at-rest) to Secrets."
  - "Deploy with RollingUpdate + maxSurge/maxUnavailable for zero downtime, and define failure criteria and automatic rollback. Prevent simultaneous termination of critical services with a PodDisruptionBudget."
  - "Manage manifests per environment with Helm/Kustomize and keep them in Git (IaC) — no manual changes via kubectl edit (GitOps)."
tags:
  - "kubernetes"
  - "k8s"
  - "helm"
  - "deployment"
  - "health-probe"
---

# ☸️ Kubernetes Deployment Standards

> The de facto standard for container orchestration. Read when deploying apps to K8s or deciding on resources, health checks, configuration separation, or a zero-downtime deployment strategy.

## 1. Core Principles
- Specify `resources.requests/limits` on every container — without them you risk node resource exhaustion, OOMKill, and noisy-neighbor impact. Use requests for scheduling and limits for the ceiling. CPU is throttled; exceeding memory triggers OOMKill.
- Separate liveness and readiness probes — on readiness failure, only remove from traffic; on liveness failure, restart. Protect slow startups with a startup probe.
- Separate configuration into ConfigMap and secrets into Secret (or an external secret manager) — never hardcode plaintext in images or manifests. Apply RBAC and encryption (etcd at-rest) to Secrets.
- Deploy with RollingUpdate + `maxSurge`/`maxUnavailable` for zero downtime, and define failure criteria and automatic rollback. Prevent simultaneous termination of critical services with a PodDisruptionBudget.
- Manage manifests per environment with Helm/Kustomize and keep them in Git (IaC) — no manual changes via `kubectl edit` (GitOps).

## 2. Rules

### 2-1. Resource Requests/Limits (Required)
Without them you risk node resource exhaustion, OOMKill, and noisy neighbors.

```yaml
# ❌ Forbidden — resources unset (resource exhaustion / OOMKill risk)
containers:
  - name: app
    image: myapp:1.0

# ✅ Recommended — requests for scheduling, limits for the ceiling
containers:
  - name: app
    image: myapp:1.0
    resources:
      requests: { cpu: "250m", memory: "256Mi" }
      limits:   { cpu: "500m", memory: "512Mi" }
```

### 2-2. Separate liveness / readiness Probes
readiness failure → only remove from traffic, liveness failure → restart.

```yaml
# ✅ Recommended — separate two probes with different roles
readinessProbe:           # "ready to receive traffic"
  httpGet: { path: /ready, port: 8080 }
livenessProbe:            # "process is alive"
  httpGet: { path: /healthz, port: 8080 }
startupProbe:             # protects slow startup
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
```

### 2-3. Separate Config/Secrets (No Hardcoding)
```yaml
# ❌ Forbidden — plaintext secret in image/manifest
env:
  - name: DB_PASSWORD
    value: "p@ssw0rd"

# ✅ Recommended — separate into ConfigMap (config) / Secret (secret)
envFrom:
  - configMapRef: { name: app-config }
  - secretRef:    { name: app-secret }   # apply RBAC / etcd encryption
```

### 2-4. Zero-Downtime Rolling Update + Automatic Rollback
```yaml
# ✅ Recommended — gradual rollout + PDB to prevent simultaneous termination
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

### 2-5. Declarative Management (GitOps)
```bash
# ❌ Forbidden — manual changes (drift / untraceable)
kubectl edit deployment myapp

# ✅ Recommended — keep Helm/Kustomize manifests in Git and apply via CI/CD
helm upgrade --install myapp ./chart -f values-prod.yaml
```

## 3. Common Mistakes
- resources unset → a single Pod monopolizes node resources and kills its neighbors.
- liveness/readiness set identically → restart loops even under transient load.
- secrets stored as plaintext in ConfigMap/image → leak risk.
- editing directly with `kubectl edit` → diverges from Git and gets rolled back on the next deploy.

## 4. Checklist
- [ ] Are requests/limits specified on every container?
- [ ] Are liveness and readiness probes separated according to their roles?
- [ ] Is configuration in ConfigMap, secrets in Secret, with no hardcoding?
- [ ] Is zero downtime ensured with RollingUpdate + maxSurge/maxUnavailable, with automatic rollback criteria?
- [ ] Is a PodDisruptionBudget set for critical services?
- [ ] Are manifests managed in Git (IaC) with no manual changes?
