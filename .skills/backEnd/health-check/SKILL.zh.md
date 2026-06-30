---
name: 健康检查 & 优雅关闭 (Health Check & Graceful Shutdown)
description: 区分并暴露服务的存活性(liveness)与接收流量准备状态(readiness),并在关闭时排空进行中请求的栈中立运维标准 — liveness/readiness 分离、依赖反映、优雅关闭、慢启动(startup)分离。在创建健康端点、配置无停机部署·自动扩缩·容器探针,或关闭过程中请求被切断时阅读。关键词: health-check, liveness, readiness, startup-probe, graceful-shutdown, SIGTERM, drain, zero-downtime。
rules:
  - "liveness ≠ readiness — liveness 是「进程是否存活(否则重启)」,readiness 是「是否准备好接收流量(否则从 LB 中剔除)」。不可混用。"
  - "liveness 要保持简单 — 不放入外部依赖。若因 DB·缓存故障导致 liveness 失败,正常实例会无限重启。"
  - "readiness 要反映必需依赖但保持轻量 — 接收流量所必需的依赖(如 DB)断开时,以 not-ready 阻断流量。但检查要轻量,并设置超时·缓存。"
  - "优雅关闭 — 收到终止信号(SIGTERM)时不要立即死亡: readiness off → 阻断新请求 → 排空进行中请求 → 清理连接 → 终止。"
  - "慢启动要分离 — 若初始化耗时较长,分离为 startup 阶段,避免把启动过程误判为 liveness 失败而被杀掉。"
  - "注意健康响应的信息暴露 — 详细依赖·版本·内部地址仅限认证/内网。对外公开探针只暴露最少信息。"
tags:
  - "health-check"
  - "liveness"
  - "readiness"
  - "startup-probe"
  - "graceful-shutdown"
  - "SIGTERM"
  - "drain"
  - "zero-downtime"
---

# 💓 健康检查 & 优雅关闭 (Health Check & Graceful Shutdown)

> 服务「是否存活(liveness)」与「是否准备好接收流量(readiness)」是不同的问题 — 把这两者区分暴露,并在终止时把进行中的请求处理到底再退出。在创建健康端点,或配置无停机部署·自动扩缩·容器探针时阅读。

编排器(如 Kubernetes)·负载均衡器通过健康检查决定**是否重启、是否发送流量**。所以健康检查做错会动摇运维 — 若把 DB 依赖放进 liveness,DB 一旦短暂变慢,正常实例就会接连重启(重启风暴);关闭时不排空,每次部署都会切断进行中的请求。把两个概念分离并优雅处理关闭,就能实现无停机部署。检测·指标参见 `observability`,容器探针配置参见 `docker-containerization`。

## 1. 核心原则

- **liveness ≠ readiness** — liveness 是「进程是否存活(否则重启)」,readiness 是「是否准备好接收流量(否则从 LB 中剔除)」。不可混用。
- **liveness 要保持简单** — 不放入外部依赖。若因 DB·缓存故障导致 liveness 失败,正常实例会无限重启。
- **readiness 要反映必需依赖但保持轻量** — 接收流量所必需的依赖(如 DB)断开时,以 not-ready 阻断流量。但检查要轻量,并设置超时·缓存。
- **优雅关闭** — 收到终止信号(SIGTERM)时不要立即死亡: readiness off → 阻断新请求 → 排空进行中请求 → 清理连接 → 终止。
- **慢启动要分离** — 若初始化耗时较长,分离为 startup 阶段,避免把启动过程误判为 liveness 失败而被杀掉。
- **注意健康响应的信息暴露** — 详细依赖·版本·内部地址仅限认证/内网。对外公开探针只暴露最少信息。

## 2. 规则

### 2-1. 把 liveness 与 readiness 分离暴露

| 探针 | 询问什么 | 失败时 | 包含对象 |
|---|---|---|---|
| **liveness** | 进程是否存活 | 重启(restart) | 仅进程本身(外部依赖 ❌) |
| **readiness** | 是否准备好接收流量 | 从 LB/服务中剔除 | 反映必需依赖(如 DB) |
| **startup** | 启动是否完成 | 等待启动(不杀) | 慢初始化是否完成 |

### 2-2. 不要把外部依赖放进 liveness

```text
❌ 禁止 — liveness ping DB → DB 临时故障时正常应用接连重启(风暴)
   GET /health/liveness → SELECT 1 from DB

✅ 推荐 — liveness 仅检查进程存活(事件循环·非死锁程度)
   GET /health/liveness → 200 (无依赖检查)
```

### 2-3. 把必需依赖轻量地反映进 readiness

```text
❌ 禁止 — readiness 每次都重量级地检查所有外部系统 → 缓慢且级联
✅ 推荐 — 只检查处理流量「必需」的依赖,并配合超时·短缓存
   GET /health/readiness → 确认必需 DB 连接(超时 1s,结果缓存数秒)
   - 不要因为可选依赖(如推荐服务)挂了就置为 not-ready(保持部分运行)
```

### 2-4. 遵守优雅关闭序列

```text
收到终止信号(SIGTERM)时:
  1) 把 readiness 置为 off → LB 不再发送新流量
  2) (直到 LB 反映为止) 停止接收新请求,进行中请求继续处理(drain)
  3) 等待进行中请求完成(设置关闭超时上限)
  4) 清理 DB 连接·队列消费者·文件句柄等资源
  5) 终止进程

❌ 禁止 — SIGTERM 时立即 exit / 无排空 → 每次部署都切断进行中请求(5xx)
```

### 2-5. 把慢启动分离为 startup

```text
❌ 禁止 — 对初始化需 30 秒的应用只设 liveness,会把启动过程视为「死亡」而重启 → 永远起不来
✅ 推荐 — 用 startup 探针等待启动完成后再激活 liveness/readiness
```

### 2-6. 控制健康响应的信息暴露

```text
❌ 禁止 — 对外公开的 /health 原样暴露 DB 主机·版本·内部依赖详情
✅ 推荐 — 公开探针只给 up/down 最少信息。详细诊断仅限认证/内网 (`transport-security`)
```

## 3. 常见错误

- ❌ 在 liveness 中包含 DB·缓存等外部依赖 → 临时故障时正常实例重启风暴
- ❌ 把 liveness 与 readiness 合并到同一端点 → 流量阻断与重启混在一起
- ❌ readiness 检查过重或无超时 → 健康检查本身引发负载·级联
- ❌ SIGTERM 时立即终止 → 每次无停机部署都把进行中请求以 5xx 切断
- ❌ 不把慢启动分离为 startup → 启动过程被误判为死亡,陷入重启循环
- ❌ 健康端点把内部结构·版本暴露给外部

> **应用提示**: 探针周期·超时·失败阈值必须与编排器(如 Kubernetes)侧的设置对齐 — 把应用上报的 readiness 与 LB 撤出流量时刻之间的延迟反映到关闭排空时间中。容器/探针配置参见 `docker-containerization`,依赖失败的恢复策略参见 `error-handling-resilience`。

## 4. 检查清单

- [ ] 是否把 liveness 与 readiness 分离暴露
- [ ] liveness 是否不包含外部依赖(防止重启风暴)
- [ ] readiness 是否轻量地(超时·缓存)反映必需依赖
- [ ] SIGTERM 时是否遵守 readiness off → 排空 → 资源清理 → 终止的顺序
- [ ] 是否把慢启动分离为 startup 阶段
- [ ] 健康响应是否未把敏感内部信息暴露给外部

## 附录: 各栈示例

> 以下供参考。请按团队的栈应用相同模式。上面 1~4 的原则是标准,附录只是应用案例。

### Spring Boot (Actuator)

```properties
# 启用 liveness/readiness 组 (Kubernetes 环境下自动)
management.endpoint.health.probes.enabled=true
# → 暴露 /actuator/health/liveness, /actuator/health/readiness
# 在 readiness 组中包含必需依赖的 health indicator(例: db)
management.endpoint.health.group.readiness.include=readinessState,db

# 优雅关闭
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

- 自定义依赖检查通过实现 `HealthIndicator` 放入 readiness 组。liveness 组中不放入外部依赖。

### Node.js

```js
let ready = false
initialize().then(() => { ready = true })          // 启动完成后 readiness on

app.get('/health/liveness', (_req, res) => res.sendStatus(200))   // 无依赖
app.get('/health/readiness', async (_req, res) => {
  if (!ready) return res.sendStatus(503)
  res.sendStatus(await pingDbWithTimeout(1000) ? 200 : 503)        // 仅必需依赖,带超时
})

process.on('SIGTERM', async () => {
  ready = false                                    // 1) readiness off
  await sleep(LB_PROBE_DELAY)                       //    在给 LB 时间检测 not-ready 之后
  server.close(async () => {                       // 2~3) 停止新连接 + 排空进行中
    await closeDbPool()                            // 4) 资源清理
    process.exit(0)                                // 5) 终止
  })
  setTimeout(() => process.exit(1), 30_000).unref() // 排空超时上限
})
```
