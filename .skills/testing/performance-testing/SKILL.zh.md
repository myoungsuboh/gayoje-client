---
name: 性能 & 负载测试
description: 用 k6·Locust·JMeter 建立 API 性能基线，并通过负载、压力、尖峰测试验证生产容量的标准。在定义 SLO、在 CI 中阻止部署前的性能回归，或识别慢查询时阅读。关键词: k6, locust, performance, load-test, p99, throughput, latency, concurrent。
rules:
  - "在部署前于 CI 中运行性能回归测试，当响应时间 p99 相比基线劣化 20% 以上时发出告警。"
  - "负载测试场景基于真实使用模式（用户数·动作比例）编写。"
  - "记录性能测试结果，并在每次部署时与基线比较以追踪趋势。"
  - "隔离测量 DB 查询性能，识别 N+1 问题与慢查询。"
  - "性能测试在与生产规格相同的预发布环境中运行。"
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

# 🚀 性能 & 负载测试

> 建立 API 性能基线，并通过负载、压力、尖峰验证生产容量。在定义 SLO、在 CI 中阻止部署前的性能回归，或抓出 DB 慢查询时阅读。

## 1. 核心原则
- 在部署前于 CI 中运行性能回归测试，当响应时间 p99 相比基线劣化 20% 以上时发出告警。
- 负载测试场景基于真实使用模式（用户数·动作比例）编写。
- 记录性能测试结果，并在每次部署时与基线比较以追踪趋势。
- 隔离测量 DB 查询性能，识别 N+1 问题与慢查询。
- 性能测试在与生产规格相同的预发布环境中运行。

## 2. 规则

### 2-1. 定义性能目标 (SLO)
测试前先确定响应时间·吞吐量·错误率·可用性目标。

```
响应时间: p50 < 100ms, p95 < 500ms, p99 < 1000ms
吞吐量: 每秒请求 > 100 RPS
错误率: < 0.1%
可用性: > 99.9%
```

### 2-2. k6 负载测试脚本
设置预热 → 持续负载 → 冷却阶段，并用 threshold 在代码中明确 SLO。

```javascript
// load-test.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 50 },   // 预热: 逐步增加到 50 VU
    { duration: "3m", target: 100 },  // 持续负载: 维持 100 VU
    { duration: "1m", target: 0 },    // 冷却
  ],
  thresholds: {
    "http_req_duration": ["p(99)<1000"],  // p99 < 1秒
    "errors": ["rate<0.001"],             // 错误率 < 0.1%
  },
};

export default function () {
  const res = http.get("https://api.example.com/products");

  check(res, {
    "status 200": (r) => r.status === 200,
    "响应 < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);  // 模拟真实用户行为
}
```

### 2-3. Locust (Python) — 复合场景
用 `@task` 权重反映真实使用比例，并设置用户思考时间。

```python
from locust import HttpUser, task, between

class ShoppingUser(HttpUser):
    wait_time = between(1, 3)  # 用户思考时间

    def on_start(self):
        # 会话开始 — 登录
        self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password"
        })

    @task(3)          # 权重 3 — 比例最高
    def browse_products(self):
        self.client.get("/products?page=1&limit=20")

    @task(1)          # 权重 1
    def view_product_detail(self):
        self.client.get("/products/prod-001")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart/items", json={"product_id": "prod-001", "qty": 1})
```

### 2-4. CI 性能回归测试
将结果导出为 JSON，若 p99 超过基准则让构建失败。

```yaml
- name: 性能基线测试
  run: k6 run --out json=results.json load-test.js
- name: 结果分析
  run: |
    p99=$(cat results.json | jq '.metrics.http_req_duration.values["p(99)"]')
    if [ $(echo "$p99 > 1000" | bc -l) -eq 1 ]; then
      echo "❌ p99 响应时间超过基准: ${p99}ms"
      exit 1
    fi
```

### 2-5. DB 慢查询检测
开启慢查询日志，用 `pg_stat_statements` 找出排名靠前的瓶颈查询。

```sql
-- PostgreSQL 慢查询日志配置
log_min_duration_statement = 200  -- 记录耗时 200ms 以上的查询
-- 用 pg_stat_statements 查询排名靠前的慢查询
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

## 3. 常见错误
- 不现实的场景（均匀调用） → 错过真正的瓶颈。
- 在本地·低规格环境测量 → 与生产容量无关的数值。
- 未记录基线 → 无法检测回归。
- 只看应用响应而遗漏隔离测量 DB 查询 → 发现不了 N+1·慢查询。

## 4. 清单
- [ ] 是否先定义了 SLO（p50/p95/p99·RPS·错误率）
- [ ] 场景是否反映真实使用模式·动作比例
- [ ] CI 是否测量性能回归并在超过基准时失败
- [ ] 是否记录结果并在每次部署时与基线比较
- [ ] 是否隔离测量了 DB 慢查询·N+1
- [ ] 是否在与生产规格相同的预发布环境中运行
