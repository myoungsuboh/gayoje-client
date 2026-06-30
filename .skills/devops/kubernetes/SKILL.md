---
name: Kubernetes 배포 표준
description: 컨테이너 오케스트레이션 안정 운영을 위한 표준 — 리소스 요청/제한, liveness/readiness probe, ConfigMap/Secret 분리, 무중단 롤링업데이트, 선언형 IaC 관리를 다룬다. K8s에 앱을 배포하거나 자원·헬스체크·설정·배포 전략을 정할 때 읽는다. 키워드: kubernetes, k8s, helm, deployment, health-probe.
rules:
  - "모든 컨테이너에 resources.requests/limits를 명시한다 — 미설정 시 노드 자원 고갈·OOMKill·이웃 영향(noisy neighbor) 위험. requests로 스케줄링, limits로 상한을 둔다. CPU는 throttle, 메모리 초과는 OOMKill."
  - "liveness와 readiness probe를 분리한다 — readiness 실패 시 트래픽에서만 제외, liveness 실패 시 재시작. startup probe로 느린 기동을 보호한다."
  - "설정은 ConfigMap, 비밀은 Secret(또는 외부 시크릿 매니저)으로 분리한다 — 이미지·매니페스트에 평문 하드코딩 금지. Secret은 RBAC·암호화(etcd at-rest)를 적용한다."
  - "배포는 RollingUpdate + maxSurge/maxUnavailable로 무중단, 실패 판정 기준과 자동 롤백을 둔다. 중요 서비스는 PodDisruptionBudget으로 동시 종료를 방지한다."
  - "매니페스트는 Helm/Kustomize로 환경별 관리하고 Git(IaC)에 둔다 — kubectl edit 수동 변경 금지(GitOps)."
tags:
  - "kubernetes"
  - "k8s"
  - "helm"
  - "deployment"
  - "health-probe"
---

# ☸️ Kubernetes 배포 표준

> 컨테이너 오케스트레이션의 사실상 표준. K8s에 앱을 배포하거나 자원·헬스체크·설정 분리·무중단 배포 전략을 정할 때 읽는다.

## 1. 핵심 원칙
- 모든 컨테이너에 `resources.requests/limits`를 명시한다 — 미설정 시 노드 자원 고갈·OOMKill·이웃 영향(noisy neighbor) 위험. requests로 스케줄링, limits로 상한을 둔다. CPU는 throttle, 메모리 초과는 OOMKill.
- liveness와 readiness probe를 분리한다 — readiness 실패 시 트래픽에서만 제외, liveness 실패 시 재시작. startup probe로 느린 기동을 보호한다.
- 설정은 ConfigMap, 비밀은 Secret(또는 외부 시크릿 매니저)으로 분리한다 — 이미지·매니페스트에 평문 하드코딩 금지. Secret은 RBAC·암호화(etcd at-rest)를 적용한다.
- 배포는 RollingUpdate + `maxSurge`/`maxUnavailable`로 무중단, 실패 판정 기준과 자동 롤백을 둔다. 중요 서비스는 PodDisruptionBudget으로 동시 종료를 방지한다.
- 매니페스트는 Helm/Kustomize로 환경별 관리하고 Git(IaC)에 둔다 — `kubectl edit` 수동 변경 금지(GitOps).

## 2. 규칙

### 2-1. 리소스 요청/제한 (필수)
미설정 시 노드 자원 고갈·OOMKill·noisy neighbor 위험.

```yaml
# ❌ 금지 — resources 미설정 (자원 고갈·OOMKill 위험)
containers:
  - name: app
    image: myapp:1.0

# ✅ 권장 — requests로 스케줄링, limits로 상한
containers:
  - name: app
    image: myapp:1.0
    resources:
      requests: { cpu: "250m", memory: "256Mi" }
      limits:   { cpu: "500m", memory: "512Mi" }
```

### 2-2. liveness / readiness probe 분리
readiness 실패 → 트래픽에서만 제외, liveness 실패 → 재시작.

```yaml
# ✅ 권장 — 역할이 다른 두 probe를 분리
readinessProbe:           # "트래픽 받을 준비됨"
  httpGet: { path: /ready, port: 8080 }
livenessProbe:            # "프로세스 살아있음"
  httpGet: { path: /healthz, port: 8080 }
startupProbe:             # 느린 기동 보호
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
```

### 2-3. 설정/비밀 분리 (하드코딩 금지)
```yaml
# ❌ 금지 — 이미지·매니페스트에 평문 비밀
env:
  - name: DB_PASSWORD
    value: "p@ssw0rd"

# ✅ 권장 — ConfigMap(설정) / Secret(비밀)으로 분리
envFrom:
  - configMapRef: { name: app-config }
  - secretRef:    { name: app-secret }   # RBAC·etcd 암호화 적용
```

### 2-4. 무중단 롤링업데이트 + 자동 롤백
```yaml
# ✅ 권장 — 점진 롤아웃 + PDB로 동시 종료 방지
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

### 2-5. 선언형 관리 (GitOps)
```bash
# ❌ 금지 — 수동 변경(드리프트·추적 불가)
kubectl edit deployment myapp

# ✅ 권장 — Helm/Kustomize 매니페스트를 Git에 두고 CI/CD로 적용
helm upgrade --install myapp ./chart -f values-prod.yaml
```

## 3. 흔한 실수
- resources 미설정 → 한 Pod가 노드 자원을 독점해 이웃을 죽인다.
- liveness/readiness를 동일하게 설정 → 일시적 부하에도 재시작 루프.
- 비밀을 ConfigMap·이미지에 평문 저장 → 유출 위험.
- `kubectl edit`로 직접 수정 → Git과 어긋나 다음 배포에서 롤백된다.

## 4. 체크리스트
- [ ] 모든 컨테이너에 requests/limits를 명시했는가
- [ ] liveness와 readiness probe를 역할에 맞게 분리했는가
- [ ] 설정은 ConfigMap, 비밀은 Secret으로 분리하고 하드코딩이 없는가
- [ ] RollingUpdate + maxSurge/maxUnavailable로 무중단을 보장하고 자동 롤백 기준이 있는가
- [ ] 중요 서비스에 PodDisruptionBudget을 두었는가
- [ ] 매니페스트를 Git(IaC)으로 관리하고 수동 변경이 없는가
