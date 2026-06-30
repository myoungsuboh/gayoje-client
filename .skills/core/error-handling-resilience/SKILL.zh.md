---
name: 错误处理 & 韧性 (Error Handling & Resilience)
description: 一份与技术栈无关的指南，规定如何捕获、传播和恢复异常 — 禁止吞掉错误、fail-fast vs graceful degradation、重试·超时·熔断器·降级·部分失败。在编写或审查外部 API·DB·队列调用或异常策略时阅读(错误收集·观测委托给 `error-monitoring`·`async-error-handling`)。关键词: error-handling, resilience, retry, backoff, timeout, circuit-breaker, fallback, fail-fast。
rules:
  - "不要吞掉错误 — 捕获了就处理，处理不了就重新抛出。禁止没有日志·处理的空 catch。"
  - "区分失败类型 — 编程错误(bug·错误输入)用 fail-fast(立即中断·暴露)，外部依赖失败(网络·DB·外部 API)用 graceful degradation(降级·部分运行)。"
  - "瞬时失败要重试但要安全 — 始终同时配置指数退避 + 抖动、超时、重试上限。禁止无限·立即重试。"
  - "重试需要幂等性 — 有副作用的操作用幂等键防止重复 (参见 idempotency)。"
  - "隔离故障 — 对反复失败的依赖用熔断器切断调用并降级。不要让一处的失败蔓延到整体。"
  - "消息按受众区分 — 给用户友好且安全的消息，给日志详细的上下文(但排除密码·令牌·个人信息)。"
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

# 🛡️ 错误处理 & 韧性 (Error Handling & Resilience)

> 把异常如何捕获、传播和恢复的方式以规则的形式钉死，使得即便失败系统也不会崩溃，且原因能被暴露出来。在调用外部依赖或编写·审查 try/catch·异常策略时阅读。

AI 智能体最常犯的错误是 **静默吞掉错误**(空 catch、无日志的忽略)和 **把所有失败一视同仁**。这样故障会被隐藏，连瞬时错误也会让整体停摆。把失败分为「编程错误」和「外部依赖失败」，并为各自钉死合适的策略，AI 也会在这个框架内生成安全的代码。

## 1. 核心原则

- **不要吞掉错误** — 捕获了就处理，处理不了就重新抛出。禁止没有日志·处理的空 catch。
- **区分失败类型** — 编程错误(bug·错误输入)用 **fail-fast**(立即中断·暴露)，外部依赖失败(网络·DB·外部 API)用 **graceful degradation**(降级·部分运行)。
- **瞬时失败要重试但要安全** — 始终同时配置指数退避 + 抖动、超时、重试上限。禁止无限·立即重试。
- **重试需要幂等性** — 有副作用的操作用幂等键防止重复 (参见 `idempotency`)。
- **隔离故障** — 对反复失败的依赖用熔断器切断调用并降级。不要让一处的失败蔓延到整体。
- **消息按受众区分** — 给用户友好且安全的消息，给日志详细的上下文(但排除密码·令牌·个人信息)。

## 2. 规则

### 2-1. 不要吞掉错误

```text
# ❌ 禁止 — 静默吞掉: 故障被隐藏且无法调试
try { charge(order) } catch (e) { /* 什么都不做 */ }
try { ... } catch (e) { return null }   // 原因丢失

# ✅ 推荐 — 处理它，或附上上下文后重新抛出
try {
  charge(order)
} catch (e) {
  log.error("charge 失败 orderId=%s", order.id, e)   // 保留原因(e)
  throw new PaymentError("支付处理失败", cause=e)    // 让上层来决定
}
```

- 捕获的异常 **必须** 记录日志或重新传播。禁止「以后再看」的空 catch。
- 重新抛出时 **保留原始原因(cause/stack)** — 不要用新异常覆盖它。
- 不要用宽泛的 catch(`catch (Exception)`/`except:`)把一切一次性吞掉 — 要具体指定捕获的异常。

### 2-2. fail-fast vs graceful degradation

| 失败类型 | 示例 | 策略 |
|---|---|---|
| 编程错误 | null 引用、错误参数、损坏配置 | **fail-fast** — 立即中断·暴露，不隐藏 |
| 错误的外部输入 | 校验失败的请求 | 拒绝 + 明确的 4xx (输入校验是 `input-validation`) |
| 外部依赖失败 | DB·外部 API·队列超时 | **graceful degradation** — 重试·降级·部分运行 |

```text
# ✅ 启动时缺少必需配置 → fail-fast (不要静默使用默认值)
if (config.apiKey == null) throw new ConfigError("API_KEY 必需")

# ✅ 推荐服务宕机 → 核心流程用降级继续
recs = tryGet(() => recoApi.fetch(user), fallback=[])  // 用空列表继续
```

### 2-3. 重试 + 退避 + 超时 + 上限

```text
# ❌ 禁止 — 无超时·上限的立即无限重试 (放大故障)
while (true) { try { return call() } catch (e) { /* 立刻重试 */ } }

# ✅ 推荐 — 超时 + 指数退避 + 抖动 + 次数上限
for (attempt in 1..MAX_RETRIES) {        // 上限 (例如: 3)
  try {
    return call(timeout=2s)              // 每次调用的超时
  } catch (e) {
    if (!isTransient(e) || attempt == MAX_RETRIES) throw e
    sleep(min(base * 2^attempt, cap) + random_jitter)  // 指数退避 + 抖动
  }
}
```

- **禁止无超时的外部调用** — 无限等待会导致线程·连接耗尽。
- 重试只针对 **瞬时错误**(网络·5xx·超时)。重试 4xx·校验错误毫无用处。
- 在退避上加 **抖动** 以防止同时重试的洪峰(thundering herd)。
- 重试有副作用的操作(支付·创建)必须有 **幂等性** (参见 `idempotency`)。

### 2-4. 熔断器 & 降级

```text
# ✅ 反复失败就打开熔断器快速失败，并用降级响应
if (breaker.isOpen()) return cachedOrDefault()   // 不再持续敲击已死的依赖
try { r = call(); breaker.onSuccess(); return r }
catch (e) { breaker.onFailure(); return cachedOrDefault() }
```

- 如果依赖持续失败，就 **打开** 熔断器立即失败 — 防止资源浪费·级联故障。
- 降级用 **安全的默认值/缓存/缩减功能**。不要让降级引发又一次故障。

### 2-5. 处理部分失败

```text
# ❌ 禁止 — 100 件中 1 件失败导致整体中断·回滚
for (item in batch) process(item)   // 哪怕一个 throw → 其余丢失

# ✅ 推荐 — 逐件隔离，汇总成功/失败后报告
results = batch.map(item => trySettle(() => process(item)))
failed = results.filter(isFailure)
if (failed) log.warn("部分失败 %d/%d", failed.size, batch.size)
// 失败的送进重处理队列 (既不全部丢弃，也不全部阻塞)
```

- 批量·扇出调用要 **逐件隔离**，使一件的失败不会阻塞整体。
- 区分「要么全成功要么全失败」**正确的情况**(原子事务)与 **允许部分** 正确的情况。

### 2-6. 消息: 用户 vs 日志

```text
# ❌ 禁止 — 把原始异常·栈·内部信息暴露给用户
return Response(500, e.toString())   // 有泄露 SQL·路径·令牌的风险

# ✅ 推荐 — 给用户友好+关联ID，给日志详细(排除敏感信息)
log.error("订单创建失败 traceId=%s userId=%s", traceId, userId, e)
return Response(500, { message: "请稍后重试", traceId })
```

- 不要在用户消息中暴露内部结构·栈·原始错误。用关联 ID 与日志关联。
- 日志中留下足够的上下文(标识符·输入摘要)，但 **掩码/排除密码·令牌·个人信息**。

## 3. 常见错误

AI 经常制造的 — 审查时筛掉。

- ❌ 空 catch / `catch (e) {}` / 既无日志也无重新传播的忽略
- ❌ 用 `catch (Exception)`·`except:` 把所有异常笼统地吞掉
- ❌ 外部调用没有超时 → 无限等待·资源耗尽
- ❌ 无超时·上限的重试，或连 4xx 也重试
- ❌ 无幂等性地重试支付·创建操作 → 重复执行
- ❌ 用新异常包装而丢失原始 cause/stack
- ❌ 向用户暴露原始栈·SQL·内部路径，在日志中原样记录令牌·个人信息
- ❌ 用 try/catch 掩盖编程 bug 使其看起来「正常」(静默失败)

> **应用技巧**: 在 AGENTS.md / 规则文件中钉死一行「禁止空 catch、外部调用要超时、重试要退避+上限」，智能体每次生成都会遵守。本文档只涉及 **处理·恢复策略**，错误收集·聚合·告警委托给 `error-monitoring`(FE)·`async-error-handling`(Mobile)(输入校验是 `input-validation`)。

## 4. 检查清单

- [ ] 是否没有无日志·处理的空 catch，且捕获的异常都被处理或保留原因后重新传播?
- [ ] 是否把编程错误区分为 fail-fast、外部依赖失败区分为 graceful degradation?
- [ ] 是否每个外部调用都有超时，重试都有指数退避+抖动+次数上限?
- [ ] 重试的副作用操作是否保证了幂等性 (`idempotency`)?
- [ ] 反复失败的依赖是否有熔断器/降级，批量是否逐件隔离部分失败?
- [ ] 用户消息是否友好·安全，日志是否详细但排除敏感信息?
