---
name: 무중단 배포 — Blue-Green & Canary
description: Blue-Green·Canary·Rolling 배포 전략으로 다운타임 없이 새 버전을 릴리즈하고, 문제 발생 시 즉시 롤백하는 표준. 무중단 배포 방식을 고르거나 헬스체크·DB 마이그레이션·자동 롤백을 설계할 때 읽는다. 키워드: blue-green, canary, rolling, healthcheck, /health, /ready, rollback, zero-downtime.
rules:
  - "헬스체크 엔드포인트(/health·/ready)를 구현하고 로드밸런서가 이를 기반으로 트래픽을 라우팅하게 한다."
  - "데이터베이스 스키마 변경은 애플리케이션 배포와 분리해 하위 호환(Expand-Contract) 방식으로 진행한다."
  - "배포 후 5~10분 관찰 기간을 두고 에러율·응답 시간이 기준치를 초과하면 자동 또는 즉시 수동 롤백한다."
  - "배포 이전 이미지·버전을 최소 2~3개 보존해 롤백이 즉시 가능하도록 유지한다."
  - "기능 플래그(Feature Flag)로 코드 배포와 기능 활성화를 분리해 위험을 낮춘다."
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

# 🔄 무중단 배포 — Blue-Green & Canary

> 다운타임 없이 새 버전을 릴리즈하고 문제 시 즉시 롤백한다. 배포 전략을 고르거나 헬스체크·DB 마이그레이션·자동 롤백을 설계할 때 읽는다.

## 1. 핵심 원칙
- 헬스체크 엔드포인트(/health·/ready)를 구현하고 로드밸런서가 이를 기반으로 트래픽을 라우팅하게 한다.
- 데이터베이스 스키마 변경은 애플리케이션 배포와 분리해 하위 호환(Expand-Contract) 방식으로 진행한다.
- 배포 후 5~10분 관찰 기간을 두고 에러율·응답 시간이 기준치를 초과하면 자동 또는 즉시 수동 롤백한다.
- 배포 이전 이미지·버전을 최소 2~3개 보존해 롤백이 즉시 가능하도록 유지한다.
- 기능 플래그(Feature Flag)로 코드 배포와 기능 활성화를 분리해 위험을 낮춘다.

## 2. 규칙

### 2-1. 배포 전략 비교
서비스 특성과 비용에 맞게 전략을 선택한다.

| 전략 | 개요 | 장점 | 단점 |
|------|------|------|------|
| Blue-Green | 동일 환경 2개 — 한 번에 전환 | 즉시 롤백 | 인프라 2배 비용 |
| Canary | 소수 사용자에게 먼저 배포 | 위험 분산 | 복잡한 라우팅 |
| Rolling | 인스턴스 순차 교체 | 리소스 효율 | 구버전 혼재 |

### 2-2. 헬스체크 엔드포인트
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

### 2-3. Blue-Green 전환 (Kubernetes)
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

### 2-4. DB 마이그레이션 Expand-Contract 패턴
배포와 스키마 변경을 분리해 어느 시점에 롤백해도 호환되게 한다.

```
Phase 1 (Expand): 새 컬럼 추가 (nullable) — 구버전과 호환
Phase 2 (Migrate): 데이터 백필 — 배포와 무관하게 진행
Phase 3 (Contract): 구 컬럼 삭제 — 신버전 완전 전환 후
```

### 2-5. 자동 롤백 트리거
```yaml
# 배포 후 관찰 메트릭 (예: Argo Rollouts)
metrics:
  - name: error-rate
    thresholdRange: { max: 0.01 }   # 에러율 1% 초과 시 롤백
  - name: p99-latency
    thresholdRange: { max: 500 }    # p99 500ms 초과 시 롤백
```

## 3. 흔한 실수
- /ready에서 의존성(DB·Redis)을 확인하지 않음 → 준비 안 된 인스턴스로 트래픽 유입.
- 스키마 변경과 앱 배포를 한 번에 진행 → 롤백 시 구버전이 새 스키마와 호환되지 않음.
- 이전 버전 이미지를 보존하지 않음 → 즉시 롤백 불가.
- 관찰 기간 없이 100% 전환 → 문제를 늦게 발견.

## 4. 체크리스트
- [ ] /health·/ready 헬스체크를 구현하고 LB 라우팅에 연결했는가
- [ ] 서비스 특성에 맞는 배포 전략(Blue-Green·Canary·Rolling)을 선택했는가
- [ ] DB 스키마 변경을 Expand-Contract로 배포와 분리했는가
- [ ] 배포 후 5~10분 관찰 기간과 자동/수동 롤백 기준을 정했는가
- [ ] 이전 버전 이미지를 2~3개 보존하고 있는가
- [ ] 기능 플래그로 코드 배포와 기능 활성화를 분리했는가
