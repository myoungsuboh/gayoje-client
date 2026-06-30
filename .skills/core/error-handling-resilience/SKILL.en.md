---
name: Error Handling & Resilience (Error Handling & Resilience)
description: A stack-neutral guide defining how to catch, propagate, and recover from exceptions — no swallowing errors, fail-fast vs graceful degradation, retries, timeouts, circuit breakers, fallbacks, partial failure. Read it when writing or reviewing external API/DB/queue calls or exception policy (error collection and observability are delegated to `error-monitoring` and `async-error-handling`). Keywords: error-handling, resilience, retry, backoff, timeout, circuit-breaker, fallback, fail-fast.
rules:
  - "Do not swallow errors — if you catch it, handle it, or rethrow if you can't. No empty catch without logging or handling."
  - "Distinguish failure types — programming errors (bugs, bad input) get fail-fast (halt and surface immediately); external dependency failures (network, DB, external API) get graceful degradation (fallback, partial operation)."
  - "Retry transient failures, but safely — always pair exponential backoff + jitter, timeouts, and a retry cap. No infinite or immediate retries."
  - "Retrying requires idempotency — for operations with side effects, prevent duplicates with an idempotency key (see idempotency)."
  - "Isolate failures — for dependencies that fail repeatedly, cut off calls with a circuit breaker and fall back. Don't let one part's failure spread to the whole."
  - "Tailor messages to the audience — friendly, safe messages for users; detailed context in logs (but exclude passwords, tokens, and personal data)."
tags:
  - "error-handling"
  - "resilience"
  - "retry"
  - "backoff"
  - "timeout"
  - "circuit-breaker"
  - "fallback"
  - "fail-fast"
foundational: true
---

# 🛡️ Error Handling & Resilience (Error Handling & Resilience)

> Nail down how exceptions are caught, propagated, and recovered from as rules, so that even when something fails the system doesn't collapse and the cause is surfaced. Read it when calling external dependencies or writing/reviewing try/catch or exception policy.

The most common mistakes AI agents make are **silently swallowing errors** (empty catch, ignoring without logging) and **treating every failure the same**. That hides outages and makes the whole thing stop even on transient errors. Split failures into "programming errors" and "external dependency failures" and nail down a fitting policy for each as rules, and the AI will generate safe code within that frame too.

## 1. Core Principles

- **Do not swallow errors** — if you catch it, handle it, or rethrow if you can't. No empty catch without logging or handling.
- **Distinguish failure types** — programming errors (bugs, bad input) get **fail-fast** (halt and surface immediately); external dependency failures (network, DB, external API) get **graceful degradation** (fallback, partial operation).
- **Retry transient failures, but safely** — always pair exponential backoff + jitter, timeouts, and a retry cap. No infinite or immediate retries.
- **Retrying requires idempotency** — for operations with side effects, prevent duplicates with an idempotency key (see `idempotency`).
- **Isolate failures** — for dependencies that fail repeatedly, cut off calls with a circuit breaker and fall back. Don't let one part's failure spread to the whole.
- **Tailor messages to the audience** — friendly, safe messages for users; detailed context in logs (but exclude passwords, tokens, and personal data).

## 2. Rules

### 2-1. Do not swallow errors

```text
# ❌ Forbidden — silent swallow: outages hide and debugging is impossible
try { charge(order) } catch (e) { /* do nothing */ }
try { ... } catch (e) { return null }   // cause lost

# ✅ Recommended — handle it, or attach context and rethrow
try {
  charge(order)
} catch (e) {
  log.error("charge failed orderId=%s", order.id, e)   // preserve cause (e)
  throw new PaymentError("payment processing failed", cause=e)    // let the caller decide
}
```

- A caught exception **must** be logged or re-propagated. No "I'll look at it later" empty catch.
- When rethrowing, **preserve the original cause/stack** — don't overwrite it with a new exception.
- Don't swallow everything at once with a broad catch (`catch (Exception)`/`except:`) — be specific about which exceptions to catch.

### 2-2. fail-fast vs graceful degradation

| Failure type | Example | Policy |
|---|---|---|
| Programming error | null reference, bad argument, broken config | **fail-fast** — halt and surface immediately, don't hide |
| Bad external input | a request that failed validation | reject + clear 4xx (input validation is `input-validation`) |
| External dependency failure | DB/external API/queue timeout | **graceful degradation** — retry, fallback, partial operation |

```text
# ✅ Required config missing at startup → fail-fast (don't silently use a default)
if (config.apiKey == null) throw new ConfigError("API_KEY required")

# ✅ Recommendation service down → keep the core flow going with a fallback
recs = tryGet(() => recoApi.fetch(user), fallback=[])  // proceed with an empty list
```

### 2-3. Retry + backoff + timeout + cap

```text
# ❌ Forbidden — immediate infinite retry with no timeout or cap (amplifies the outage)
while (true) { try { return call() } catch (e) { /* retry right away */ } }

# ✅ Recommended — timeout + exponential backoff + jitter + count cap
for (attempt in 1..MAX_RETRIES) {        // cap (e.g., 3)
  try {
    return call(timeout=2s)              // timeout per call
  } catch (e) {
    if (!isTransient(e) || attempt == MAX_RETRIES) throw e
    sleep(min(base * 2^attempt, cap) + random_jitter)  // exponential backoff + jitter
  }
}
```

- **No external call without a timeout** — waiting forever leads to thread/connection exhaustion.
- Retry only on **transient errors** (network, 5xx, timeout). Retrying 4xx/validation errors is pointless.
- Add **jitter** to backoff to prevent a thundering herd of simultaneous retries.
- Retrying operations with side effects (payment, creation) requires **idempotency** (see `idempotency`).

### 2-4. Circuit breaker & fallback

```text
# ✅ On repeated failures, open the circuit to fail fast and respond with a fallback
if (breaker.isOpen()) return cachedOrDefault()   // don't keep hammering a dead dependency
try { r = call(); breaker.onSuccess(); return r }
catch (e) { breaker.onFailure(); return cachedOrDefault() }
```

- If a dependency keeps failing, **open** the circuit to fail immediately — prevents wasted resources and cascading failures.
- Make the fallback a **safe default / cache / reduced functionality**. Don't let the fallback cause yet another outage.

### 2-5. Handling partial failure

```text
# ❌ Forbidden — 1 failure out of 100 halts and rolls back everything
for (item in batch) process(item)   // one throw → the rest is lost

# ✅ Recommended — isolate per item, tally successes/failures, then report
results = batch.map(item => trySettle(() => process(item)))
failed = results.filter(isFailure)
if (failed) log.warn("partial failure %d/%d", failed.size, batch.size)
// send failures to a reprocessing queue (neither discard all nor block all)
```

- For batch/fan-out calls, **isolate per item** so one item's failure doesn't block the whole.
- Distinguish the case where all-or-nothing is **correct** (atomic transaction) from where partial acceptance is correct.

### 2-6. Messages: user vs log

```text
# ❌ Forbidden — exposing raw exceptions, stacks, internal info to the user
return Response(500, e.toString())   // risk of leaking SQL/paths/tokens

# ✅ Recommended — friendly + correlation ID for the user, detail in logs (no sensitive data)
log.error("order creation failed traceId=%s userId=%s", traceId, userId, e)
return Response(500, { message: "Please try again in a moment", traceId })
```

- Don't expose internal structure, stacks, or raw errors in user messages. Link to logs via a correlation ID.
- Leave enough context (identifiers, input summary) in logs but **mask/exclude passwords, tokens, and personal data**.

## 3. Common Mistakes

What AI often produces — filter these out in review.

- ❌ Empty catch / `catch (e) {}` / ignoring with neither logging nor re-propagation
- ❌ Lumping all exceptions together and swallowing them with `catch (Exception)`/`except:`
- ❌ No timeout on external calls → waiting forever, resource exhaustion
- ❌ Retries with no timeout or cap, or retrying even 4xx
- ❌ Retrying payment/creation operations without idempotency → duplicate execution
- ❌ Wrapping in a new exception and losing the original cause/stack
- ❌ Exposing raw stacks/SQL/internal paths to the user, recording tokens/personal data verbatim in logs
- ❌ Hiding a programming bug with try/catch so it looks "fine" (silent failure)

> **Application tip**: Pinning one line in AGENTS.md / a rules file — "no empty catch, timeouts on external calls, backoff + cap on retries" — makes the agent honor it on every generation. This document covers only **handling/recovery policy**; error collection, aggregation, and alerting are delegated to `error-monitoring` (FE) and `async-error-handling` (Mobile) (input validation is `input-validation`).

## 4. Checklist

- [ ] Are there no empty catches without logging or handling, and are caught exceptions either handled or re-propagated while preserving the cause?
- [ ] Did you distinguish programming errors (fail-fast) from external dependency failures (graceful degradation)?
- [ ] Does every external call have a timeout, and do retries have exponential backoff + jitter + a count cap?
- [ ] Is idempotency guaranteed for side-effect operations being retried (`idempotency`)?
- [ ] Do repeatedly-failing dependencies have a circuit breaker/fallback, and do batches isolate partial failure per item?
- [ ] Are user messages friendly and safe, and are logs detailed while excluding sensitive data?
