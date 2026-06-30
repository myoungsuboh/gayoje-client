---
name: API Gateway & BFF 패턴
description: API Gateway와 Backend-for-Frontend(BFF) 패턴의 역할·라우팅·인증 집중화·클라이언트별 집계 표준. 게이트웨이 레이어를 설계하거나, 클라이언트별 화면 집계 API를 만들거나, 인증·레이트리밋·Circuit Breaker 위치를 정할 때 읽는다. 키워드: api-gateway, bff, backend-for-frontend, gateway, circuit-breaker, rate-limit, proxy, aggregation.
rules:
  - "인증·인가, 레이트 리밋, 로깅, 요청 추적(trace-id)은 Gateway 레이어에서 중앙화한다."
  - "BFF는 특정 클라이언트(Web·Mobile·TV)의 화면 요구에 맞게 여러 마이크로서비스를 집계·변환한다."
  - "BFF는 클라이언트와 1:1 대응하고, 공용 BFF는 만들지 않는다 — 공용 로직은 공통 라이브러리로 분리한다."
  - "Gateway에서 업스트림 서비스 장애 시 Circuit Breaker를 작동시켜 연쇄 장애를 막는다."
  - "Gateway 라우팅 설정은 코드(IaC)로 관리하고, 수동 UI 클릭으로만 변경하지 않는다."
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

# 🚪 API Gateway & BFF 패턴

> Gateway에 인증·레이트리밋·라우팅 같은 횡단 관심사를 집중하고, BFF에 클라이언트별 집계를 분리한다. 게이트웨이 레이어를 설계하거나 클라이언트별 화면 API를 만들 때 읽는다.

## 1. 핵심 원칙

- 인증·인가, 레이트 리밋, 로깅, 요청 추적(trace-id)은 Gateway 레이어에서 중앙화한다.
- BFF는 특정 클라이언트(Web·Mobile·TV)의 화면 요구에 맞게 여러 마이크로서비스를 집계·변환한다.
- BFF는 클라이언트와 1:1 대응하고, 공용 BFF는 만들지 않는다 — 공용 로직은 공통 라이브러리로 분리한다.
- Gateway에서 업스트림 서비스 장애 시 Circuit Breaker를 작동시켜 연쇄 장애를 막는다.
- Gateway 라우팅 설정은 코드(IaC)로 관리하고, 수동 UI 클릭으로만 변경하지 않는다.

## 2. 규칙

### 2-1. 아키텍처 레이어

```
Client (Web/Mobile)
       ↓
  BFF Layer  ← 클라이언트별 집계·변환
       ↓
API Gateway  ← 인증·레이트리밋·라우팅·트레이스
    ↙  ↘
Svc-A  Svc-B  ← 도메인 마이크로서비스
```

### 2-2. API Gateway 핵심 기능

| 기능 | 구현 |
|------|------|
| 인증 검증 | JWT 검증 + 사용자 컨텍스트 전달 |
| 레이트 리밋 | IP/토큰별 RPS 제한 |
| 요청 추적 | X-Trace-ID 헤더 생성·전파 |
| Circuit Breaker | 장애 업스트림 차단 (Resilience4j·Hystrix) |
| SSL Termination | HTTPS → HTTP 다운스트림 |

### 2-3. BFF — 클라이언트별 집계

```python
# ✅ 권장 — BFF가 모바일 홈 화면에 필요한 여러 서비스를 병렬 집계
@router.get("/mobile/home")
async def mobile_home(user_id: str):
    user, notifications, feed = await asyncio.gather(
        user_svc.get_profile(user_id),
        notif_svc.get_unread(user_id, limit=5),
        feed_svc.get_latest(user_id, limit=10),
    )
    return {"user": user, "notifications": notifications, "feed": feed}
```

### 2-4. Circuit Breaker 상태

```
Closed → (실패율 > 50%) → Open → (타임아웃 후) → Half-Open → (성공) → Closed
                                                        ↓ (실패)
                                                       Open
```

### 2-5. 구현체 선택

| 용도 | 도구 |
|------|------|
| API Gateway | Kong, AWS API GW, NGINX, Traefik |
| BFF | Node.js/Express, FastAPI, NestJS |
| Circuit Breaker | Resilience4j (Java), tenacity (Python) |

## 3. 흔한 실수

- 횡단 관심사(인증·레이트리밋)를 각 마이크로서비스에 중복 구현 → Gateway로 집중하지 않음.
- 여러 클라이언트가 하나의 공용 BFF를 공유 → 화면 요구가 충돌하고 변경이 어려워짐.
- Circuit Breaker 없이 업스트림 호출 → 한 서비스 장애가 전체로 연쇄 전파됨.
- 라우팅을 UI에서 수동 변경 → 형상관리 불가, 환경 간 불일치.

## 4. 체크리스트

- [ ] 인증·레이트리밋·트레이스를 Gateway에 중앙화했는가
- [ ] BFF가 클라이언트와 1:1 대응하는가 (공용 BFF 금지)
- [ ] 업스트림 호출에 Circuit Breaker를 적용했는가
- [ ] Gateway 라우팅을 코드(IaC)로 관리하는가
- [ ] BFF 집계 호출을 병렬화했는가
