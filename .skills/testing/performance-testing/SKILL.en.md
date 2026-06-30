---
name: Performance & Load Testing
description: A standard for establishing API performance baselines with k6, Locust, and JMeter, and validating production capacity through load, stress, and spike tests. Read this when defining SLOs, blocking performance regressions in CI before deployment, or identifying slow queries. Keywords: k6, locust, performance, load-test, p99, throughput, latency, concurrent.
rules:
  - "Run performance regression tests in CI before deployment, and alert when the p99 response time degrades by 20% or more from the baseline."
  - "Write load test scenarios based on real usage patterns (number of users, action ratios)."
  - "Record performance test results and track trends by comparing against the baseline on every deployment."
  - "Measure DB query performance in isolation, and identify N+1 problems and slow queries."
  - "Run performance tests in a staging environment with the same specs as production."
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

# 🚀 Performance & Load Testing

> Establish API performance baselines and validate production capacity through load, stress, and spike testing. Read this when defining SLOs, blocking performance regressions in CI before deployment, or catching DB slow queries.

## 1. Core Principles
- Run performance regression tests in CI before deployment, and alert when the p99 response time degrades by 20% or more from the baseline.
- Write load test scenarios based on real usage patterns (number of users, action ratios).
- Record performance test results and track trends by comparing against the baseline on every deployment.
- Measure DB query performance in isolation, and identify N+1 problems and slow queries.
- Run performance tests in a staging environment with the same specs as production.

## 2. Rules

### 2-1. Define Performance Goals (SLO)
Before testing, first set goals for response time, throughput, error rate, and availability.

```
Response time: p50 < 100ms, p95 < 500ms, p99 < 1000ms
Throughput: requests per second > 100 RPS
Error rate: < 0.1%
Availability: > 99.9%
```

### 2-2. k6 Load Test Script
Stage warmup → sustained load → cooldown, and express SLOs in code with thresholds.

```javascript
// load-test.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 50 },   // Warmup: ramp up gradually to 50 VU
    { duration: "3m", target: 100 },  // Sustained load: hold at 100 VU
    { duration: "1m", target: 0 },    // Cooldown
  ],
  thresholds: {
    "http_req_duration": ["p(99)<1000"],  // p99 < 1 second
    "errors": ["rate<0.001"],             // Error rate < 0.1%
  },
};

export default function () {
  const res = http.get("https://api.example.com/products");

  check(res, {
    "status 200": (r) => r.status === 200,
    "response < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);  // Simulate real user behavior
}
```

### 2-3. Locust (Python) — Composite Scenarios
Reflect real usage ratios with `@task` weights, and include user think time.

```python
from locust import HttpUser, task, between

class ShoppingUser(HttpUser):
    wait_time = between(1, 3)  # User think time

    def on_start(self):
        # Session start — login
        self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })

    @task(3)          # Weight 3 — highest ratio
    def browse_products(self):
        self.client.get("/products?page=1&limit=20")

    @task(1)          # Weight 1
    def view_product_detail(self):
        self.client.get("/products/prod-001")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart/items", json={"product_id": "prod-001", "qty": 1})
```

### 2-4. CI Performance Regression Testing
Export results as JSON and fail the build if p99 exceeds the baseline.

```yaml
- name: Performance baseline test
  run: k6 run --out json=results.json load-test.js
- name: Analyze results
  run: |
    p99=$(cat results.json | jq '.metrics.http_req_duration.values["p(99)"]')
    if [ $(echo "$p99 > 1000" | bc -l) -eq 1 ]; then
      echo "❌ p99 response time exceeds threshold: ${p99}ms"
      exit 1
    fi
```

### 2-5. DB Slow Query Detection
Turn on the slow query log and use `pg_stat_statements` to find the top bottleneck queries.

```sql
-- PostgreSQL slow query log configuration
log_min_duration_statement = 200  -- Log queries taking 200ms or more
-- Query top slow queries with pg_stat_statements
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

## 3. Common Mistakes
- Unrealistic scenarios (uniform calls) → miss the real bottleneck.
- Measuring on local/low-spec environments → numbers unrelated to production capacity.
- No recorded baseline → cannot detect regressions.
- Only looking at app responses and skipping isolated DB query measurement → fail to find N+1 / slow queries.

## 4. Checklist
- [ ] Did you first define SLOs (p50/p95/p99, RPS, error rate)?
- [ ] Does the scenario reflect real usage patterns and action ratios?
- [ ] Does CI measure performance regressions and fail when the threshold is exceeded?
- [ ] Do you record results and compare against the baseline on every deployment?
- [ ] Did you measure DB slow queries and N+1 in isolation?
- [ ] Did you run it in staging with the same specs as production?
