---
name: 파티셔닝 전략
description: 시계열·범위·해시 파티셔닝 설계, 파티션 프루닝, 관리 자동화 표준(PostgreSQL 중심). 수억 행 대용량·시계열 테이블을 설계하거나, 오래된 데이터를 DROP/아카이빙하거나, 파티션 키·프루닝을 점검할 때 읽는다. 키워드: partition, partitioning, range-partition, hash-partition, list-partition, pg_partman, time-series, pruning, DETACH.
rules:
  - "수억 행 이상 대용량 테이블, 또는 오래된 파티션을 DROP해야 하는 시계열 데이터에 파티셔닝을 적용한다."
  - "파티션 키는 쿼리의 WHERE 조건에 항상 포함되는 컬럼(예: created_at)을 선택해 파티션 프루닝을 활용한다."
  - "시계열 데이터는 월·분기 단위 RANGE 파티셔닝으로 관리하고, 새 파티션 생성을 스케줄러로 자동화한다."
  - "파티션 인덱스는 파티션별로 생성되므로, 전체 테이블 인덱스 크기가 줄어드는 효과를 확인한다."
  - "파티션 DROP 전에 DETACH로 검증하고, 실수 방지를 위해 즉시 DELETE하지 않는다."
tags:
  - "partition"
  - "partitioning"
  - "range-partition"
  - "hash-partition"
  - "list-partition"
  - "pg_partman"
  - "time-series"
  - "pruning"
  - "DETACH"
---

# 🗂️ 파티셔닝 전략

> 대용량·시계열 테이블을 파티션으로 나눠 쿼리 성능과 관리 비용을 통제한다. 수억 행 테이블을 설계하거나 오래된 파티션을 정리할 때 읽는다.

## 1. 핵심 원칙
- 수억 행 이상 대용량 테이블, 또는 오래된 파티션을 DROP해야 하는 시계열 데이터에 파티셔닝을 적용한다.
- 파티션 키는 쿼리의 WHERE 조건에 항상 포함되는 컬럼(예: `created_at`)을 선택해 파티션 프루닝을 활용한다.
- 시계열 데이터는 월·분기 단위 RANGE 파티셔닝으로 관리하고, 새 파티션 생성을 스케줄러로 자동화한다.
- 파티션 인덱스는 파티션별로 생성되므로, 전체 테이블 인덱스 크기가 줄어드는 효과를 확인한다.
- 파티션 DROP 전에 DETACH로 검증하고, 실수 방지를 위해 즉시 DELETE하지 않는다.

## 2. 규칙

### 2-1. 파티셔닝 유형 선택
| 유형 | 기준 | 적합 상황 |
|------|------|-----------|
| RANGE | 숫자·날짜 범위 | 시계열 로그·이벤트 |
| LIST | 고정 값 목록 | 지역·상태 코드 |
| HASH | 해시 분산 | 균등 분산 대용량 |

### 2-2. RANGE 파티셔닝 (PostgreSQL)
```sql
-- ✅ 부모 테이블 생성 — 파티션 키는 WHERE에 항상 쓰이는 created_at
CREATE TABLE events (
  id         BIGINT NOT NULL,
  event_type VARCHAR,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- ✅ 월별 파티션 생성
CREATE TABLE events_2026_01
  PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02
  PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 2-3. 파티션 프루닝 확인
```sql
-- ✅ 파티션 키를 WHERE에 넣어 단일 파티션만 스캔되는지 확인
EXPLAIN SELECT * FROM events WHERE created_at >= '2026-06-01';
-- "Seq Scan on events_2026_06" 만 출력돼야 함
-- "Append" 아래 다른 파티션이 없으면 프루닝 성공
```

### 2-4. 파티션 자동 관리 (pg_partman)
```sql
-- ✅ 미래 파티션을 미리 생성해 적재 누락 방지
SELECT partman.create_parent(
  p_parent_table => 'public.events',
  p_control => 'created_at',
  p_type => 'range',
  p_interval => '1 month',
  p_premake => 3   -- 미래 3개월 미리 생성
);
```

### 2-5. 오래된 파티션 보관 (DETACH 후 DROP)
```sql
-- ✅ 먼저 분리(테이블로 남김)하여 검증
ALTER TABLE events DETACH PARTITION events_2025_01;

-- ✅ 검증 후 삭제 또는 아카이빙
DROP TABLE events_2025_01;  -- 또는 ARCHIVE DB로 pg_dump 후 삭제

-- ❌ 금지 — 검증 없이 곧장 파티션을 삭제 (복구 불가)
-- DROP TABLE events_2025_01;  (DETACH 단계 생략)
```

## 3. 흔한 실수
- 파티션 키를 WHERE에 안 넣어 모든 파티션을 스캔 → 프루닝 무효.
- 미래 파티션을 미리 만들지 않아 적재 시점에 파티션 없음 오류.
- DETACH 없이 곧장 DROP → 실수 시 복구 불가.
- 파티션 수를 과도하게 쪼개 메타데이터·플래닝 비용 증가.

## 4. 체크리스트
- [ ] 파티셔닝이 정말 필요한 규모(수억 행/시계열 DROP)인가
- [ ] 파티션 키가 WHERE에 항상 포함되는 컬럼인가
- [ ] EXPLAIN으로 파티션 프루닝을 확인했는가
- [ ] 미래 파티션 생성을 스케줄러(pg_partman 등)로 자동화했는가
- [ ] 파티션 제거를 DETACH → 검증 → DROP 순으로 하는가
