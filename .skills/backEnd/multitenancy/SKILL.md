---
name: 멀티테넌시 설계 (Multitenancy)
description: 테넌트 격리 전략(DB/스키마/행)·테넌트 식별·교차 테넌트 데이터 누출 방지·공용 리소스 네임스페이싱 표준. SaaS에서 한 인스턴스로 여러 고객을 서비스하거나 격리 수준을 정할 때 읽는다. 키워드: multitenancy, tenant-isolation, row-level-security, RLS, saas, data-isolation, tenant_id.
rules:
  - "격리 수준을 먼저 정한다 — DB-per-tenant(강격리·고비용) / 스키마-per-tenant / 행 기반(tenant_id, 저비용·누출위험)."
  - "행 기반이면 모든 쿼리에 tenant_id 필터를 강제한다 — ORM 글로벌 필터 또는 DB Row-Level Security로 누락을 원천 차단."
  - "테넌트 식별은 인증 토큰(JWT claim)·서브도메인에서 도출한다 — 클라이언트가 보낸 tenant 파라미터를 신뢰하지 않는다."
  - "교차 테넌트 데이터 누출은 치명적 — '다른 테넌트 데이터에 접근 시도 → 차단'을 필수 테스트 케이스로 둔다."
  - "공용 리소스(커넥션 풀·캐시 키·파일 경로)에 tenant_id를 네임스페이스로 섞어 충돌·누출을 막는다."
tags:
  - "multitenancy"
  - "tenant-isolation"
  - "row-level-security"
  - "RLS"
  - "saas"
  - "data-isolation"
  - "tenant_id"
---

# 🏢 멀티테넌시 설계

> 한 인스턴스가 여러 고객(테넌트)을 서비스하는 SaaS의 핵심. 격리·식별·누출방지 3대 축을 정할 때 읽는다.

## 1. 핵심 원칙
- 격리 수준을 먼저 정한다 — DB-per-tenant(강격리·고비용) / 스키마-per-tenant / 행 기반(tenant_id, 저비용·누출위험).
- 행 기반이면 모든 쿼리에 tenant_id 필터를 강제한다 — ORM 글로벌 필터 또는 DB Row-Level Security로 누락을 원천 차단.
- 테넌트 식별은 인증 토큰(JWT claim)·서브도메인에서 도출한다 — 클라이언트가 보낸 tenant 파라미터를 신뢰하지 않는다.
- 교차 테넌트 데이터 누출은 치명적 — "다른 테넌트 데이터에 접근 시도 → 차단"을 필수 테스트 케이스로 둔다.
- 공용 리소스(커넥션 풀·캐시 키·파일 경로)에 tenant_id를 네임스페이스로 섞어 충돌·누출을 막는다.

## 2. 규칙

### 2-1. 격리 전략 비교
| 전략 | 격리 강도 | 비용·확장 | 특징 |
|---|---|---|---|
| DB per tenant | 가장 강함 | 테넌트 많으면 운영비 급증 | 백업·복구·규제 대응 쉬움 |
| 스키마 per tenant | 중간 | 중간 | 한 DB 안에서 스키마 분리 |
| 행 기반(공유 테이블) | 가장 약함 | 가장 저렴·확장 쉬움 | tenant_id 누락 시 즉시 누출 — RLS·글로벌 필터 필수 |

### 2-2. 테넌트 식별 — 클라이언트 입력 불신
```text
// ❌ 금지 — 클라이언트가 보낸 tenant 파라미터를 그대로 신뢰
tenantId = request.query.tenantId

// ✅ 권장 — 인증 토큰(JWT claim)·서브도메인에서 도출
tenantId = jwt.claims.tenant_id   // 또는 subdomain → tenant 매핑
```

### 2-3. 행 기반 쿼리 — tenant_id 강제
```text
// ❌ 금지 — 쿼리에서 tenant_id 필터가 빠지면 즉시 누출
SELECT * FROM orders WHERE id = :id

// ✅ 권장 — ORM 글로벌 필터 또는 DB Row-Level Security로 누락을 원천 차단
SELECT * FROM orders WHERE id = :id AND tenant_id = :tenantId
```

### 2-4. 공용 리소스 네임스페이싱
```text
// ❌ 금지 — 캐시 키·파일 경로에 tenant 구분이 없어 충돌·누출
cache.get("user:" + userId)

// ✅ 권장 — tenant_id 를 네임스페이스로 섞는다
cache.get(tenantId + ":user:" + userId)
```

### 2-5. 안전장치 흐름
- 인증에서 테넌트 확정 → 요청 컨텍스트에 고정 → 데이터 접근 계층에서 강제 적용.
- 교차 테넌트 접근 테스트를 회귀 스위트에 포함(보안 회귀 방지).

## 3. 흔한 실수
- 행 기반인데 일부 쿼리에서 tenant_id 필터 누락 → 교차 테넌트 누출.
- 클라이언트가 보낸 tenant 파라미터를 신뢰 → 위변조로 타 테넌트 접근.
- 캐시 키·파일 경로에 tenant 네임스페이스 미적용 → 데이터 충돌·누출.
- 교차 테넌트 접근 테스트 부재 → 보안 회귀를 못 잡는다.

## 4. 체크리스트
- [ ] 격리 수준(DB/스키마/행)을 먼저 정했는가
- [ ] 행 기반이면 모든 쿼리에 tenant_id 필터가 강제되는가(글로벌 필터·RLS)
- [ ] 테넌트를 인증 토큰·서브도메인에서 도출했는가(클라이언트 입력 불신)
- [ ] 공용 리소스에 tenant_id 네임스페이스를 적용했는가
- [ ] "타 테넌트 접근 시도 → 차단" 테스트를 회귀 스위트에 넣었는가
