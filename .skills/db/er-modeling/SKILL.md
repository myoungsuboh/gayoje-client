---
name: ER 모델링 컨벤션
description: 엔티티-관계 모델링, 정규화, 네이밍, 관계 설계 표준(DB 중립). 새 테이블·스키마를 설계하거나 PK·FK·N:M 관계·정규화 수준을 정할 때 읽는다. 키워드: er, entity, relationship, normalization, foreign-key, schema, naming, uuid.
rules:
  - "테이블·컬럼명은 snake_case, 복수형(users·orders)을 사용하고, 예약어와 충돌하는 이름을 피한다."
  - "기본 키는 UUID(v7) 또는 auto-increment BIGINT를 사용하고, 비즈니스 키(이메일·주문번호)를 PK로 사용하지 않는다."
  - "제3정규형(3NF)을 기본으로 설계하되, 성능이 필요하면 의도적으로 비정규화하고 이유를 주석으로 남긴다."
  - "FK 제약은 반드시 선언해 참조 무결성을 DB가 보장하게 한다 — 애플리케이션에서만 검증하지 않는다."
  - "N:M 관계는 중간 테이블(join table)로 해소하고, 중간 테이블에도 감사 컬럼(created_at)을 포함한다."
tags:
  - "er"
  - "entity"
  - "relationship"
  - "normalization"
  - "foreign-key"
  - "schema"
  - "naming"
  - "uuid"
---

# 🗂️ ER 모델링 컨벤션

> 엔티티-관계 모델링의 네이밍·정규화·관계 설계를 통일한다. 새 테이블이나 스키마를 설계하거나 PK·FK·N:M 관계를 정할 때 읽는다.

## 1. 핵심 원칙
- 테이블·컬럼명은 snake_case, 복수형(users·orders)을 사용하고, 예약어와 충돌하는 이름을 피한다.
- 기본 키는 UUID(v7) 또는 auto-increment BIGINT를 사용하고, 비즈니스 키(이메일·주문번호)를 PK로 사용하지 않는다.
- 제3정규형(3NF)을 기본으로 설계하되, 성능이 필요하면 의도적으로 비정규화하고 이유를 주석으로 남긴다.
- FK 제약은 반드시 선언해 참조 무결성을 DB가 보장하게 한다 — 애플리케이션에서만 검증하지 않는다.
- N:M 관계는 중간 테이블(join table)로 해소하고, 중간 테이블에도 감사 컬럼(created_at)을 포함한다.

## 2. 규칙

### 2-1. 네이밍 규칙
| 대상 | 컨벤션 | 예시 |
|------|--------|------|
| 테이블 | snake_case, 복수형 | `users`, `order_items` |
| 컬럼 | snake_case | `created_at`, `user_id` |
| PK | `id` | `id UUID PRIMARY KEY` |
| FK | `{table_singular}_id` | `user_id`, `order_id` |
| 인덱스 | `idx_{table}_{cols}` | `idx_orders_user_status` |
| 유니크 | `uq_{table}_{cols}` | `uq_users_email` |

```sql
-- ❌ 금지 — 단수형·camelCase·비즈니스 키를 PK로 사용
CREATE TABLE User (userEmail VARCHAR(200) PRIMARY KEY);

-- ✅ 권장 — 복수형·snake_case·대리 키(PK)
CREATE TABLE users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL
);
```

### 2-2. 기본 테이블 구조
```sql
CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  category_id  UUID NOT NULL REFERENCES categories(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP   -- soft delete
);
```

### 2-3. N:M 관계 (중간 테이블)
```sql
-- 사용자 ↔ 역할 (N:M)
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

### 2-4. 정규화 수준
```
1NF: 원자값, 반복 그룹 제거
2NF: 부분 함수 종속 제거 (복합 PK일 때)
3NF: 이행 함수 종속 제거 (A→B→C 에서 B,C 분리)

비정규화 예: 집계 값 캐싱 (order.total_amount)
  → 이유: 매번 SUM(order_items.price) 는 비용이 크다.
```

### 2-5. FK 행동 정책
| 정책 | 설명 | 사용 시점 |
|------|------|-----------|
| RESTRICT | 참조 행이 있으면 삭제 거부 | 기본값 권장 |
| CASCADE | 부모 삭제 시 자식도 삭제 | 의존 데이터 |
| SET NULL | 부모 삭제 시 FK를 NULL로 | 선택적 참조 |

## 3. 흔한 실수
- 비즈니스 키(이메일·주문번호)를 PK로 사용 → 값이 바뀌면 참조가 깨진다.
- FK 제약을 선언하지 않고 애플리케이션에서만 검증 → 무결성이 보장되지 않는다.
- 이유 없는 비정규화 → 데이터 불일치의 원인이 된다.
- 중간 테이블에 감사 컬럼 누락 → 관계 생성 시점을 추적할 수 없다.

## 4. 체크리스트
- [ ] 테이블·컬럼명이 snake_case, 복수형인가
- [ ] PK가 대리 키(UUID/BIGINT)이고 비즈니스 키를 쓰지 않는가
- [ ] 기본은 3NF, 비정규화에는 이유 주석이 있는가
- [ ] FK 제약을 선언하고 행동 정책(RESTRICT/CASCADE/SET NULL)을 정했는가
- [ ] N:M을 중간 테이블로 해소하고 감사 컬럼을 포함했는가
