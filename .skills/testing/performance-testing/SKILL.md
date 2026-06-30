---
name: 성능 & 부하 테스트
description: k6·Locust·JMeter로 API 성능 기준선을 잡고 부하·스트레스·스파이크 테스트로 프로덕션 용량을 검증하는 표준. SLO를 정의하거나 배포 전 성능 회귀를 CI에서 막고, 슬로우 쿼리를 식별할 때 읽는다. 키워드: k6, locust, performance, load-test, p99, throughput, latency, concurrent.
rules:
  - "배포 전 성능 회귀 테스트를 CI에서 실행하고, 응답 시간 p99가 기준치 대비 20% 이상 저하 시 알람을 낸다."
  - "부하 테스트 시나리오는 실제 사용 패턴(사용자 수·액션 비율)을 기반으로 작성한다."
  - "성능 테스트 결과를 기록하고, 배포마다 기준선과 비교해 추세를 추적한다."
  - "DB 쿼리 성능을 분리해 측정하고, N+1 문제와 슬로우 쿼리를 식별한다."
  - "성능 테스트는 프로덕션과 동일한 스펙의 스테이징 환경에서 실행한다."
tags:
  - "k6"
  - "locust"
  - "performance"
  - "load-test"
  - "p99"
  - "throughput"
  - "latency"
  - "concurrent"
---

# 🚀 성능 & 부하 테스트

> API 성능 기준선을 잡고 부하·스트레스·스파이크로 프로덕션 용량을 검증한다. SLO를 정의하거나, 배포 전 성능 회귀를 CI에서 막고, DB 슬로우 쿼리를 잡을 때 읽는다.

## 1. 핵심 원칙
- 배포 전 성능 회귀 테스트를 CI에서 실행하고, 응답 시간 p99가 기준치 대비 20% 이상 저하 시 알람을 낸다.
- 부하 테스트 시나리오는 실제 사용 패턴(사용자 수·액션 비율)을 기반으로 작성한다.
- 성능 테스트 결과를 기록하고, 배포마다 기준선과 비교해 추세를 추적한다.
- DB 쿼리 성능을 분리해 측정하고, N+1 문제와 슬로우 쿼리를 식별한다.
- 성능 테스트는 프로덕션과 동일한 스펙의 스테이징 환경에서 실행한다.

## 2. 규칙

### 2-1. 성능 목표 정의 (SLO)
테스트 전에 응답 시간·처리량·오류율·가용성 목표를 먼저 정한다.

```
응답 시간: p50 < 100ms, p95 < 500ms, p99 < 1000ms
처리량: 초당 요청 > 100 RPS
오류율: < 0.1%
가용성: > 99.9%
```

### 2-2. k6 부하 테스트 스크립트
워밍업 → 지속 부하 → 쿨다운 단계를 두고, threshold로 SLO를 코드에 명시한다.

```javascript
// load-test.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 50 },   // 워밍업: 50 VU까지 점진 증가
    { duration: "3m", target: 100 },  // 지속 부하: 100 VU 유지
    { duration: "1m", target: 0 },    // 쿨다운
  ],
  thresholds: {
    "http_req_duration": ["p(99)<1000"],  // p99 < 1초
    "errors": ["rate<0.001"],             // 오류율 < 0.1%
  },
};

export default function () {
  const res = http.get("https://api.example.com/products");

  check(res, {
    "status 200": (r) => r.status === 200,
    "응답 < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);  // 실제 사용자 행동 시뮬레이션
}
```

### 2-3. Locust (Python) — 복합 시나리오
실제 사용 비율을 `@task` 가중치로 반영하고, 사용자 생각 시간을 둔다.

```python
from locust import HttpUser, task, between

class ShoppingUser(HttpUser):
    wait_time = between(1, 3)  # 사용자 생각 시간

    def on_start(self):
        # 세션 시작 — 로그인
        self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })

    @task(3)          # 가중치 3 — 가장 많은 비율
    def browse_products(self):
        self.client.get("/products?page=1&limit=20")

    @task(1)          # 가중치 1
    def view_product_detail(self):
        self.client.get("/products/prod-001")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart/items", json={"product_id": "prod-001", "qty": 1})
```

### 2-4. CI 성능 회귀 테스트
결과를 JSON으로 내보내 p99가 기준을 넘으면 빌드를 실패시킨다.

```yaml
- name: 성능 기준선 테스트
  run: k6 run --out json=results.json load-test.js
- name: 결과 분석
  run: |
    p99=$(cat results.json | jq '.metrics.http_req_duration.values["p(99)"]')
    if [ $(echo "$p99 > 1000" | bc -l) -eq 1 ]; then
      echo "❌ p99 응답 시간 기준 초과: ${p99}ms"
      exit 1
    fi
```

### 2-5. DB 슬로우 쿼리 탐지
슬로우 쿼리 로그를 켜고 `pg_stat_statements`로 상위 병목 쿼리를 찾는다.

```sql
-- PostgreSQL 슬로우 쿼리 로그 설정
log_min_duration_statement = 200  -- 200ms 이상 쿼리 로깅
-- pg_stat_statements로 상위 슬로우 쿼리 조회
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

## 3. 흔한 실수
- 비현실적 시나리오(균등 호출) → 실제 병목을 놓친다.
- 로컬·저사양 환경에서 측정 → 프로덕션 용량과 무관한 수치.
- 기준선 미기록 → 회귀를 감지하지 못한다.
- 앱 응답만 보고 DB 쿼리 분리 측정 누락 → N+1·슬로우 쿼리 미발견.

## 4. 체크리스트
- [ ] SLO(p50/p95/p99·RPS·오류율)를 먼저 정의했는가
- [ ] 시나리오가 실제 사용 패턴·액션 비율을 반영하는가
- [ ] CI에서 성능 회귀를 측정하고 기준 초과 시 실패시키는가
- [ ] 결과를 기록해 배포마다 기준선과 비교하는가
- [ ] DB 슬로우 쿼리·N+1을 분리해 측정했는가
- [ ] 프로덕션 동일 스펙 스테이징에서 실행했는가
