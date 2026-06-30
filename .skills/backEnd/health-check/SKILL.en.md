---
name: Health Check & Graceful Shutdown
description: A stack-neutral operational standard that distinguishes and exposes a service's liveness (alive) and readiness (ready to accept traffic), and drains in-flight requests on shutdown — liveness/readiness separation, dependency reflection, graceful shutdown, slow-startup separation. Read when building health endpoints, configuring zero-downtime deploys, autoscaling, or container probes, or when requests drop during shutdown. Keywords: health-check, liveness, readiness, startup-probe, graceful-shutdown, SIGTERM, drain, zero-downtime.
rules:
  - "liveness ≠ readiness — liveness asks 'is the process alive (otherwise restart)', readiness asks 'is it ready to accept traffic (otherwise remove from the LB)'. They must not be mixed."
  - "Keep liveness simple — do not include external dependencies. If liveness breaks due to a DB/cache failure, healthy instances will restart endlessly."
  - "readiness should reflect required dependencies but stay lightweight — if a dependency that is essential to serve traffic (such as the DB) is down, block traffic by reporting not-ready. But keep the check lightweight, with a timeout and caching."
  - "Graceful shutdown — when a termination signal (SIGTERM) arrives, do not die immediately: readiness off → block new requests → drain in-flight requests → clean up connections → terminate."
  - "Separate slow startup — if initialization takes a long time, separate it into a startup phase so that being mid-startup is not misjudged as a liveness failure and killed."
  - "Be careful about information exposure in health responses — detailed dependencies, versions, and internal addresses belong to authenticated/internal networks only. Public probes expose minimal information only."
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

# 💓 Health Check & Graceful Shutdown

> Whether a service "is alive (liveness)" and whether it "is ready to accept traffic (readiness)" are different questions — expose these two separately, and when terminating, finish in-flight requests fully before leaving. Read when building health endpoints, or configuring zero-downtime deploys, autoscaling, or container probes.

Orchestrators (such as Kubernetes) and load balancers use health checks to decide **whether to restart or whether to send traffic**. So a badly built health check shakes operations — if you put a DB dependency into liveness, healthy instances restart one after another whenever the DB briefly slows down (restart storm), and if you do not drain on shutdown, in-flight requests get cut off on every deploy. Separating the two concepts and handling shutdown gracefully makes zero-downtime deploys possible. For detection and metrics see `observability`, and for container probe configuration see `docker-containerization`.

## 1. Core Principles

- **liveness ≠ readiness** — liveness asks "is the process alive (otherwise restart)", readiness asks "is it ready to accept traffic (otherwise remove from the LB)". They must not be mixed.
- **Keep liveness simple** — do not include external dependencies. If liveness breaks due to a DB/cache failure, healthy instances will restart endlessly.
- **readiness should reflect required dependencies but stay lightweight** — if a dependency that is essential to serve traffic (such as the DB) is down, block traffic by reporting not-ready. But keep the check lightweight, with a timeout and caching.
- **Graceful shutdown** — when a termination signal (SIGTERM) arrives, do not die immediately: readiness off → block new requests → drain in-flight requests → clean up connections → terminate.
- **Separate slow startup** — if initialization takes a long time, separate it into a startup phase so that being mid-startup is not misjudged as a liveness failure and killed.
- **Be careful about information exposure in health responses** — detailed dependencies, versions, and internal addresses belong to authenticated/internal networks only. Public probes expose minimal information only.

## 2. Rules

### 2-1. Expose liveness and readiness separately

| Probe | What it asks | On failure | What it includes |
|---|---|---|---|
| **liveness** | Is the process alive | restart | The process itself only (external deps ❌) |
| **readiness** | Is it ready to accept traffic | Removed from LB/service | Reflects required dependencies (DB, etc.) |
| **startup** | Has startup finished | Wait for startup (no kill) | Whether slow initialization is complete |

### 2-2. Do not put external dependencies into liveness

```text
❌ Forbidden — liveness pings the DB → on a brief DB failure, healthy apps restart one after another (storm)
   GET /health/liveness → SELECT 1 from DB

✅ Recommended — liveness checks process survival only (event loop / not-deadlocked level)
   GET /health/liveness → 200 (no dependency check)
```

### 2-3. Reflect required dependencies into readiness, lightly

```text
❌ Forbidden — readiness heavily checks every external system every time → slow and cascading
✅ Recommended — only dependencies "essential" to serving traffic, with a timeout and a short cache
   GET /health/readiness → verify required DB connection (timeout 1s, cache result for a few seconds)
   - Do not mark not-ready just because an optional dependency (recommendation service, etc.) is down (keep partial operation)
```

### 2-4. Follow the graceful shutdown sequence

```text
On receiving a termination signal (SIGTERM):
  1) Turn readiness off → the LB stops sending new traffic
  2) (Until the LB reflects it) stop accepting new requests, keep processing in-flight requests (drain)
  3) Wait for in-flight requests to complete (set an upper bound on the shutdown timeout)
  4) Clean up resources: DB connections, queue consumers, file handles, etc.
  5) Terminate the process

❌ Forbidden — exit immediately on SIGTERM / no drain → in-flight requests are cut off (5xx) on every deploy
```

### 2-5. Separate slow startup into startup

```text
❌ Forbidden — for an app that takes 30s to initialize, having only liveness treats mid-startup as "dead" and restarts → it can never come up
✅ Recommended — use a startup probe to wait for startup completion, then activate liveness/readiness
```

### 2-6. Control information exposure in health responses

```text
❌ Forbidden — a publicly exposed /health reveals DB host, version, and detailed internal dependencies as-is
✅ Recommended — public probes give minimal up/down info. Detailed diagnostics are authenticated/internal-network only (`transport-security`)
```

## 3. Common Mistakes

- ❌ Including external dependencies such as DB/cache in liveness → restart storm of healthy instances on a brief failure
- ❌ Merging liveness and readiness into the same endpoint → traffic blocking and restarts get tangled
- ❌ A heavy readiness check or one with no timeout → the health check itself causes load and cascades
- ❌ Terminating immediately on SIGTERM → in-flight requests are cut off as 5xx on every zero-downtime deploy
- ❌ Not separating slow startup into startup → mid-startup misjudged as dead, causing a restart loop
- ❌ The health endpoint exposes internal structure and version externally

> **Application tip**: Probe interval, timeout, and failure threshold must align with the orchestrator (such as Kubernetes) settings — reflect the delay between the readiness the app reports and the moment the LB pulls traffic into the shutdown drain time. For container/probe configuration see `docker-containerization`, and for the recovery policy on dependency failures see `error-handling-resilience`.

## 4. Checklist

- [ ] Are liveness and readiness exposed separately?
- [ ] Does liveness exclude external dependencies (preventing a restart storm)?
- [ ] Does readiness reflect required dependencies lightly (timeout, cache)?
- [ ] On SIGTERM, is the order readiness off → drain → resource cleanup → terminate followed?
- [ ] Is slow startup separated into a startup phase?
- [ ] Does the health response avoid exposing sensitive internal information externally?

## Appendix: Per-Stack Examples

> The following is for reference. Apply the same pattern to fit your team's stack. The principles in sections 1–4 above are the standard; the appendix is merely an application example.

### Spring Boot (Actuator)

```properties
# Enable liveness/readiness groups (automatic in a Kubernetes environment)
management.endpoint.health.probes.enabled=true
# → exposes /actuator/health/liveness, /actuator/health/readiness
# Include required dependency health indicators in the readiness group (e.g., db)
management.endpoint.health.group.readiness.include=readinessState,db

# Graceful shutdown
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

- For custom dependency checks, implement a `HealthIndicator` and add it to the readiness group. Do not put external dependencies into the liveness group.

### Node.js

```js
let ready = false
initialize().then(() => { ready = true })          // readiness on after startup completes

app.get('/health/liveness', (_req, res) => res.sendStatus(200))   // no dependency
app.get('/health/readiness', async (_req, res) => {
  if (!ready) return res.sendStatus(503)
  res.sendStatus(await pingDbWithTimeout(1000) ? 200 : 503)        // required deps only, with timeout
})

process.on('SIGTERM', async () => {
  ready = false                                    // 1) readiness off
  await sleep(LB_PROBE_DELAY)                       //    after giving the LB time to detect not-ready
  server.close(async () => {                       // 2~3) stop new connections + drain in-flight
    await closeDbPool()                            // 4) resource cleanup
    process.exit(0)                                // 5) terminate
  })
  setTimeout(() => process.exit(1), 30_000).unref() // upper bound on drain timeout
})
```
