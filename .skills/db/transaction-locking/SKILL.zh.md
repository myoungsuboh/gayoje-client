---
name: 事务与锁 (Transaction & Locking)
description: 事务边界·传播·隔离级别·悲观/乐观锁·死锁规避的通用标准 — 事务要短，外部 I/O 移到边界外，按冲突频率选择锁策略并保持锁顺序一致。在确定事务边界、处理并发更新·库存扣减·转账一致性，或排查连接池耗尽·死锁·回滚遗漏时阅读。关键词: transaction, propagation, isolation, deadlock, pessimistic lock, optimistic lock, SELECT FOR UPDATE, version, rollback.
rules:
  - "事务边界放在业务层（服务单元）: 把一个工作单元的开始与结束放在服务边界。不要把事务边界放在入口（控制器/处理器）或数据访问层 — 职责边界会崩塌。"
  - "事务保持短: 事务长度 = 连接占用时间 = 并发上限。所有优化都归结为“把事务变短”。"
  - "禁止在事务内进行外部调用·等待: 不要在事务边界内调用外部 API、睡眠/等待或进行大批量 I/O — 期间会占住连接并耗尽连接池（与 connection-pool-tuning 技能的连接池耗尽场景直接相关）。"
  - "按冲突频率选择锁策略: 并发修改冲突罕见时用基于版本的乐观锁检测·重试，冲突频繁或一致性是决定性的时用基于行锁的悲观锁。"
  - "多个资源始终以相同顺序加锁: 确定一致的加锁顺序以规避死锁。"
  - "隔离级别只按需提升: 默认是已提交读，只对需要同一性保证的区段提升一级，序列化作为最后手段。"
  - "失败必须导向回滚: 不要吞掉异常，也不要放任被排除在回滚之外的异常类型，以免部分提交泄漏。"
tags:
  - "transaction"
  - "propagation"
  - "isolation"
  - "deadlock"
  - "pessimistic lock"
  - "optimistic lock"
  - "SELECT FOR UPDATE"
  - "version"
  - "rollback"
  - "@Transactional"
  - "ACID"
  - "PESSIMISTIC"
  - "OPTIMISTIC"
  - "rollbackFor"
---

# 🔒 事务与锁 (Transaction & Locking)

> 让事务短、清晰、无外部调用地运行，并以匹配冲突频率的锁策略处理并发更新。在确定事务边界或处理并发更新·一致性·死锁时阅读。这是不依赖特定语言/框架的通用标准。

## 1. 核心原则
- **事务边界放在业务层（服务单元）**: 把一个工作单元的开始与结束放在服务边界。不要把事务边界放在入口（控制器/处理器）或数据访问层 — 职责边界会崩塌。
- **事务保持短**: 事务长度 = 连接占用时间 = 并发上限。**所有优化都归结为“把事务变短”。**
- **禁止在事务内进行外部调用·等待**: 不要在事务边界内调用外部 API、睡眠/等待或进行大批量 I/O — 期间会占住连接并耗尽连接池（与 connection-pool-tuning 技能的连接池耗尽场景直接相关）。
- **按冲突频率选择锁策略**: 并发修改冲突罕见时用基于版本的**乐观锁**检测·重试，冲突频繁或一致性是决定性的时用基于行锁的**悲观锁**。
- **多个资源始终以相同顺序加锁**: 确定一致的加锁顺序以规避死锁。
- **隔离级别只按需提升**: 默认是已提交读，只对需要同一性保证的区段提升一级，序列化作为最后手段。
- **失败必须导向回滚**: 不要吞掉异常，也不要放任被排除在回滚之外的异常类型，以免部分提交泄漏。

## 2. 规则

### 2-1. 事务边界放在服务单元，禁止控制器/DAO
- 把一个工作单元（必须把多次写入原子地捆绑的范围）放在服务边界。
- 不要在入口处理器或数据访问层开启事务 — 边界一旦分散，就无法追踪在哪里提交/回滚。

```text
// ❌ 禁止 — 在入口/数据层设置事务边界
handler(req):
  begin tx
    ...
  commit                 // 破坏职责边界, 无法追踪

// ✅ 推荐 — 一个服务方法即一个工作单元的边界
service.placeOrder(req):
  begin tx
    orders.insert(...)
    payments.insert(...)  // 一方失败时整体回滚
  commit
```

### 2-2. 传播(propagation): 参与 / 独立 / 禁止 三种足够
大多数情况就归于三种语义。其余传播模式几乎用不到。

- **参与(加入已有事务，没有则新建)**: 默认值。一组调用成为一个原子单元。
- **独立(与父级分离的独立事务)**: 像审计日志·失败记录这类即使父级回滚也要存活的工作。但因为它**额外占用一条独立连接**，所以在连接池容量估算时务必计入（参见 connection-pool-tuning 技能）。
- **禁止(在事务内被调用则拒绝)**: 对像外部 API·长任务这类绝不能在事务边界内运行的工作的守卫。

```text
// 参与  — 一个事务, 一方失败时整体回滚
placeOrder: [ orders.insert ; payments.insert ]   (one tx)

// 独立  — 与父级回滚无关地提交 (注意占用独立连接)
writeAuditLog(event): (new tx) audit.insert(event)

// 禁止  — 在事务内被调用则以异常拦截
callExternalApi(): assert no-active-tx ; external.post(...)
```

### 2-3. 隔离级别(isolation): 只按需提升
| 级别 | 用途 | 备注 |
|---|---|---|
| 已提交读 (Read Committed) | **默认(推荐)**。大多数 OLTP | 阻断脏读 |
| 可重复读 (Repeatable Read) | 一个事务中多次读取同一行并需要同一性保证 (结算, 库存扣减) | 上调一级 |
| 序列化 (Serializable) | 最后手段 | 锁暴增/吞吐骤降 |
| 未提交读 (Read Uncommitted) | 禁止使用 | 脏读 |

```text
// 只对即使两次读取同一余额也需要同一性保证的区段提升一级
settleAccount(accountId): isolation = RepeatableRead { ... }
```

> 默认隔离级别和名称因 DB 产品而异。确认团队所用 DB 的默认值，并遵循“只对需要的区段提升”的原则。

### 2-4. 悲观锁: 先锁行再操作 (SELECT ... FOR UPDATE)
当很可能并发修改同一行时 (库存扣减, 座位预订)。

- 在读取时锁住行，直到事务结束都阻止其他事务的修改。
- 锁的范围**仅在事务内有效**。无法把锁带到事务之外。

```text
// ✅ 悲观锁 — 锁住, 确认, 更新 (整段为一个事务)
decreaseStock(productId, qty):
  begin tx
    stock = SELECT stock FROM products WHERE id = productId FOR UPDATE  // 行锁
    if stock < qty: throw OutOfStock
    UPDATE products SET stock = stock - qty WHERE id = productId
  commit                                                                // 释放锁
```

> 有些 DB 在队列/工作者模式中支持跳过被锁行取下一行的变体 (例如 skip locked)。确认团队 DB 是否支持。

### 2-5. 乐观锁: 用版本检测冲突后重试
当读取占绝对比重且并发修改冲突罕见时。

- 在行上放一个版本值，更新时“仅当与我读到的版本相同时”才更新并把版本加一。
- 若更新行数为 0，说明这期间有人先改了 → 视为冲突并**重新读取后重试**。

```text
// 在行上放 version 列
products(id, stock, version, ...)

// ✅ 乐观锁 — 仅当读到的版本未变时才更新, 0 行则冲突 → 重试
updateStock(id, newStock):
  retry up to N times:
    cur = read(id)                       // 获取 cur.version
    affected = UPDATE products
                 SET stock = newStock, version = cur.version + 1
               WHERE id = id AND version = cur.version
    if affected == 0: conflict → 重试
    else: 成功
```

> 当冲突率大约超过 5% 时，乐观锁反而低效（重试浪费）— 考虑切换到悲观锁。

### 2-6. 死锁规避: 锁顺序一致性
- **加锁顺序一致**: 锁多个资源时始终按相同标准排序加锁。一方按 A→B、另一方按 B→A 加锁就会立即死锁。
- **事务保持短**: 持锁时间即死锁概率。
- **禁止无索引的大批量更新**: 条件无索引时会全表扫描，行锁可能升级为更宽的锁。

```text
// ❌ 禁止 — 每个调用者加锁顺序不同 → 死锁
transfer(from, to): lock(from) ; lock(to)   // 另一请求是 lock(to);lock(from)

// ✅ 推荐 — 始终以相同顺序(例如 id 升序)加锁
transfer(from, to):
  first  = min(from, to)
  second = max(from, to)
  lock(first) ; lock(second)
  // 现在执行实际转账
```

### 2-7. 外部调用移到事务边界外
- 外部 API·远程调用·长等待要在开启事务前或关闭事务后进行。
- 大的工作单元拆成 "短事务 → 外部调用 → 短事务"。

```text
// ❌ 禁止 — 占着事务等待外部 API → 连接池耗尽
begin tx
  orders.insert(...)
  payment.charge(...)   // 等待数秒 → 期间占用连接
  orders.markPaid(...)
commit

// ✅ 推荐 — 把外部调用分离到边界外
orderId = (tx) createPending(...)     // 短 TX
result  = payment.charge(...)         // TX 外
          (tx) markPaid(orderId, result)  // 短 TX
```

> 外部调用 1 秒 × 池大小 10 时，第 11 个并发请求起即刻超时。与 connection-pool-tuning 技能的连接池耗尽场景直接相关。

### 2-8. 标注只读意图
- 没有写入的操作要标明为“只读” — 一些运行时/ORM 据此优化（如省略不必要的 flush），即便不优化，它也是“此操作无变更”的评审信号。
- 不要在只读边界内调用写入。

```text
// ✅ 推荐 — 查询操作标为只读
findAll(): readOnly { ... }
```

### 2-9. 别让事务因自调用/绕过路径而丢失
在声明式事务以**调用拦截(拦截/代理)**方式工作的环境中，在同一对象内部直接调用自身方法会绕过拦截，导致事务设置被忽略。

- 需要事务边界的方法应**拆分到另一单元(独立组件)，以便通过外部路径调用**。
- 同样的陷阱适用于以相同机制工作的其他声明式功能（异步执行·缓存等）— 与 scheduler-async 技能的自调用陷阱是同一机制。

```text
// ❌ Bug — 同一对象内部的直接调用绕过拦截 → 事务被忽略
outer():            // 事务边界
  this.inner()      // inner 的事务设置不生效

// ✅ 推荐 — 把 inner 拆为独立单元, 调用时保证边界
outer(): other.inner()   // 外部路径 → 事务设置生效
```

### 2-10. 让失败导向回滚
- **不要吞掉异常**: 用 try/catch 捕获后只记日志，操作会照常提交。要通知失败就重新抛出异常或显式回滚。
- **注意被排除在回滚之外的异常类型**: 视环境而定，某些异常类型（如某些语言的受检异常）默认可能不触发回滚。这种情况要显式指定回滚目标。

```text
// ❌ 禁止 — 吞掉异常导致部分提交泄漏
save():
  begin tx
    try { mapper.insert(...) }
    catch (e) { log(e) }   // 不抛出就会照常提交
  commit

// ✅ 推荐 — 失败时传播异常以回滚
save():
  begin tx
    mapper.insert(...)     // 发生异常时回滚
  commit
```

## 3. 常见错误
- **事务太长** → 外部调用/等待/大批量 I/O 在边界内，长时间占住连接，并发崩塌。把边界拆短。
- **在事务内做外部调用** → 连接池耗尽的头号原因。把调用移到边界外。
- **锁顺序不一致** → 以不同顺序锁两个资源导致死锁。始终按相同标准排序加锁。
- **锁选择与冲突频率不匹配** → 冲突频繁却用乐观锁(重试浪费)·罕见却用悲观锁(不必要的序列化)。按频率选择。
- **吞掉异常** → 捕获后只记日志使失败被提交。重新抛出或显式回滚。
- **放任不回滚的异常类型** → 某些异常不是默认回滚目标导致部分提交泄漏。指定回滚目标。
- **因自调用丢失事务** → 拦截被绕过使设置被忽略。拆为独立单元。
- **隔离级别提升过度** → 全局序列化使吞吐骤降。只对需要的区段提升一级。
- **无索引的大批量更新** → 行锁升级为宽锁使并发崩塌。在更新条件上加索引。

## 4. 检查清单
- [ ] 是否把事务边界放在**服务单元**(禁止入口/数据层)
- [ ] 是否在事务内移除了外部调用·等待·大批量 I/O
- [ ] 是否把大操作拆成 "短 TX → 外部调用 → 短 TX"
- [ ] 是否按冲突频率选择了悲观锁 / 乐观锁
- [ ] 多个资源的锁是否始终以相同顺序获取 (死锁规避)
- [ ] 隔离级别是否只对需要的区段提升一级 (规避全局序列化)
- [ ] 是否存在因自调用/绕过路径丢失事务之处
- [ ] 失败是否必然导向回滚 (排查吞异常·回滚遗漏)
- [ ] 是否把独立事务额外占用的连接计入了连接池大小

## 附录: 各技术栈示例

> 以下是把上述 1~4 标准映射到 Spring(Java) 的代码示例。概念·原则说明请参考正文(括号内的小节号)，此处只讲 Spring 特有的应用。团队所用的其他技术栈以相同模式补充。

### Spring (Java)

用 `@Transactional`(基于 AOP 代理) 在服务方法上设置事务边界，用 MyBatis mapper 加锁。

#### 传播(2-2) — `REQUIRED` / `REQUIRES_NEW` / `NEVER`

```java
@Transactional                                                   // 参与(默认)
public void placeOrder(OrderRequest req) { orderMapper.insert(...); paymentMapper.insert(...); }

@Transactional(propagation = Propagation.REQUIRES_NEW)            // 独立 — 注意占用独立连接
public void writeAuditLog(AuditEvent event) { auditMapper.insert(event); }

@Transactional(propagation = Propagation.NEVER)                   // 禁止 — 外部 API 守卫
public void callExternalApi() { restClient.post(...); }
```

#### 隔离级别(2-3) — 与 Spring 默认值的映射

只列出与正文表中各级别对应的 enum 和各 DB 的默认值。

| Spring enum | 正文级别 | DB 默认值 |
|---|---|---|
| `READ_COMMITTED` | 已提交读(默认推荐) | Postgres·Oracle 默认 |
| `REPEATABLE_READ` | 可重复读 | MariaDB/MySQL 默认 |
| `SERIALIZABLE` | 序列化(最后手段) | — |
| `READ_UNCOMMITTED` | 未提交读(禁止) | — |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void settleAccount(Long accountId) { /* 同一余额两次读取也保证同一 */ }
```

#### 悲观锁(2-4) — MyBatis `FOR UPDATE`

```xml
<select id="selectStockForUpdate" resultType="int">
    SELECT stock_count FROM products WHERE id = #{id} FOR UPDATE
</select>
```
```java
@Transactional
public void decreaseStock(Long productId, int qty) {
    int stock = productMapper.selectStockForUpdate(productId);  // 行锁
    if (stock < qty) throw new OutOfStockException();
    productMapper.decreaseStock(productId, qty);
}                                                                // 事务结束时释放锁
```

#### 乐观锁(2-5) — `version` 列 + `@Retryable`

`affected == 0` 即冲突。用 Spring Retry 声明重试。

```xml
<update id="updateWithVersion">
    UPDATE products SET stock_count = #{stock}, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = #{id} AND version = #{version}
</update>
```
```java
@Retryable(value = OptimisticLockException.class, maxAttempts = 3, backoff = @Backoff(delay = 50))
@Transactional
public void updateStock(Long id, int stock) {
    Product p = productMapper.findById(id);
    if (productMapper.updateWithVersion(id, stock, p.getVersion()) == 0)
        throw new OptimisticLockException("重试");
}
```

#### 死锁规避(2-6) — 锁顺序排序

```java
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    accountMapper.lockForUpdate(Math.min(from, to));   // 始终 id 升序
    accountMapper.lockForUpdate(Math.max(from, to));
    // 现在执行实际转账
}
```

#### 外部调用移到边界外(2-7)

```java
// ✅ 事务分离 — 外部 API 在 TX 外
public void placeOrder(...) {
    Long orderId = orderService.createPending(...);  // 短 TX
    PaymentResult r = paymentApi.charge(...);         // TX 外
    orderService.markPaid(orderId, r);                // 短 TX
}
```

#### `readOnly = true`(2-8)

```java
@Transactional(readOnly = true)
public List<UserResponse> findAll() { ... }
```
- **JPA**: 省略一级缓存 flush 等实质优化。**MyBatis**: 以意图标注为主(评审信号)。

#### 自调用陷阱(2-9) — 代理绕过

```java
@Service
public class OrderService {
    @Transactional
    public void outer() { this.inner(); }   // ❌ 代理绕过 → @Transactional 被忽略
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void inner() { ... }
}
```
解决: ① 抽取到另一个 bean(推荐) ② `AopContext.currentProxy()` ③ 自注入(`@Autowired self`)。同样的陷阱也适用于 `@Async`·`@Cacheable`(scheduler-async 技能)。

#### 回滚(2-10) — Spring 特有陷阱

```java
// ❌ 吞异常 → 被提交
@Transactional
public void save() { try { mapper.insert(...); } catch (Exception e) { log.error("실패", e); } }

// ❌ 受检异常默认不回滚 → 需显式指定 rollbackFor
@Transactional   // (rollbackFor = Exception.class)
public void save() throws IOException { mapper.insert(...); throw new IOException(); }
```
- 不要把 `@Transactional` 放在 controller 上(破坏职责边界) — 在服务层管理(2-1)。
- 禁止在事务内使用 `Thread.sleep`·大文件 I/O(2-7)。
