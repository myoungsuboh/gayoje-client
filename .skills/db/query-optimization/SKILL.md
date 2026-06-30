---
name: 쿼리 최적화
description: N+1 탐지, 슬로우 쿼리 분석, 쿼리 리팩토링, 통계 관리 표준(DB 중립). 느린 쿼리를 잡거나 실행 계획을 개선할 때, N+1을 제거하거나 인덱스가 안 먹는 원인을 찾을 때 읽는다. 키워드: slow-query, n+1, explain, query-plan, join, batch, select-star, analyze.
rules:
  - "N+1 쿼리를 탐지해 JOIN 또는 배치 로딩(IN 절·DataLoader)으로 교체한다."
  - "슬로우 쿼리 로그 임계값을 설정하고(예: 1초 이상), 주기적으로 검토·최적화한다."
  - "SELECT *를 피하고 필요한 컬럼만 명시해 I/O와 네트워크 전송을 줄인다."
  - "조인 조건의 컬럼 타입이 일치하는지 확인한다 — 타입 불일치는 묵시적 캐스팅으로 인덱스를 무효화한다."
  - "테이블 통계(ANALYZE)를 주기적으로 갱신하고, 플래너가 잘못된 실행 계획을 선택하면 통계 업데이트를 먼저 시도한다."
tags:
  - "slow-query"
  - "n+1"
  - "explain"
  - "query-plan"
  - "join"
  - "batch"
  - "select-star"
  - "analyze"
---

# 🐢 쿼리 최적화

> 느린 쿼리를 탐지·분석·리팩토링하는 표준(DB 중립)을 정한다. N+1을 제거하거나 슬로우 쿼리를 개선하고, 실행 계획이 이상할 때 읽는다.

## 1. 핵심 원칙
- N+1 쿼리를 탐지해 JOIN 또는 배치 로딩(IN 절·DataLoader)으로 교체한다.
- 슬로우 쿼리 로그 임계값을 설정하고(예: 1초 이상), 주기적으로 검토·최적화한다.
- `SELECT *`를 피하고 필요한 컬럼만 명시해 I/O와 네트워크 전송을 줄인다.
- 조인 조건의 컬럼 타입이 일치하는지 확인한다 — 타입 불일치는 묵시적 캐스팅으로 인덱스를 무효화한다.
- 테이블 통계(ANALYZE)를 주기적으로 갱신하고, 플래너가 잘못된 실행 계획을 선택하면 통계 업데이트를 먼저 시도한다.

## 2. 규칙

### 2-1. N+1 문제와 해결
```python
# ❌ 금지 — N+1: 주문 1번 조회 + 각 주문마다 사용자 조회
orders = db.query("SELECT * FROM orders WHERE status='paid'")
for order in orders:
    user = db.query("SELECT * FROM users WHERE id = ?", order.user_id)  # N번 실행

# ✅ 권장 — JOIN으로 한 번에
orders = db.query("""
    SELECT o.*, u.name, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid'
""")
```

### 2-2. 슬로우 쿼리 로그 설정
```sql
-- PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- 1초 이상
SELECT pg_reload_conf();

-- 슬로우 쿼리 보기
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;
```

### 2-3. EXPLAIN 읽기 포인트
```
Seq Scan       → 풀스캔. 인덱스 추가 검토
Hash Join      → 큰 테이블 조인. 대체로 정상
Nested Loop    → 작은 행일 때 효율적, 큰 테이블엔 위험
Sort(external) → 정렬이 메모리 초과. work_mem 증가 검토
```

### 2-4. 쿼리 리팩토링 패턴
```sql
-- ❌ WHERE YEAR(created_at) = 2026  (함수로 인덱스 무효화)
-- ✅ 범위 조건으로 인덱스 활용
WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'

-- ❌ NOT IN (subquery)  (NULL 주의 + 성능)
-- ✅ LEFT JOIN ... IS NULL
LEFT JOIN ... WHERE t2.id IS NULL

-- ❌ COUNT(*) > 0
-- ✅ EXISTS (조건 만족 시 즉시 중단)
EXISTS (SELECT 1 FROM ...)
```

### 2-5. SELECT * 회피
```sql
-- ❌ 금지 — 불필요한 컬럼까지 전송, 인덱스 온리 스캔 불가
SELECT * FROM orders WHERE status = 'paid';

-- ✅ 권장 — 필요한 컬럼만 명시
SELECT id, user_id, amount FROM orders WHERE status = 'paid';
```

## 3. 흔한 실수
- N+1을 ORM 편의 메서드 뒤에 숨겨 놓고 인지하지 못한다.
- 조인 컬럼 타입 불일치(varchar vs int)로 인덱스가 묵시적 캐스팅에 무효화된다.
- 통계가 오래되어 플래너가 풀스캔을 고르는데 인덱스부터 의심한다.
- WHERE 절 컬럼에 함수를 씌워 인덱스를 무효화한다.

## 4. 체크리스트
- [ ] N+1을 JOIN 또는 배치 로딩으로 교체했는가
- [ ] 슬로우 쿼리 로그 임계값을 설정하고 주기적으로 검토하는가
- [ ] `SELECT *` 대신 필요한 컬럼만 명시했는가
- [ ] 조인 컬럼 타입이 일치하는가
- [ ] 실행 계획이 이상할 때 통계(ANALYZE) 갱신을 먼저 확인했는가
