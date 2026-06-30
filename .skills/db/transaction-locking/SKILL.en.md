---
name: Transaction & Locking (Transaction & Locking)
description: A general-purpose standard for transaction boundaries, propagation, isolation levels, pessimistic/optimistic locking, and deadlock avoidance — keep transactions short, push external I/O outside the boundary, choose the locking strategy by conflict frequency, and keep lock ordering consistent. Read when defining transaction boundaries, handling concurrent updates/stock decrement/transfer consistency, or reviewing connection-pool exhaustion/deadlocks/missing rollbacks. Keywords: transaction, propagation, isolation, deadlock, pessimistic lock, optimistic lock, SELECT FOR UPDATE, version, rollback.
rules:
  - "Put transaction boundaries in the business layer (service unit): place the start and end of one unit of work at the service boundary. Do not put transaction boundaries at the entry point (controller/handler) or the data access layer — responsibility boundaries collapse."
  - "Keep transactions short: transaction length = connection hold time = concurrency limit. Every optimization reduces to 'keep the transaction short'."
  - "Forbid external calls/waits inside a transaction: do not make external API calls, sleeps/waits, or large I/O inside the transaction boundary — they hold the connection and exhaust the pool (directly tied to the pool-exhaustion scenario of the connection-pool-tuning skill)."
  - "Choose the locking strategy by conflict frequency: if concurrent modification conflicts are rare, use version-based optimistic locking to detect and retry; if conflicts are frequent or consistency is critical, use row-locking pessimistic locking."
  - "Always lock multiple resources in the same order: define a consistent lock acquisition order to avoid deadlocks."
  - "Raise the isolation level only as much as needed: the default is read committed; raise it one step only for sections requiring identity guarantees, and treat serialization as a last resort."
  - "Ensure failures always lead to rollback: do not swallow exceptions or leave exception types that are excluded from rollback unhandled, letting partial commits leak."
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

# 🔒 Transaction & Locking (Transaction & Locking)

> Run transactions short, clear, and free of external calls, and handle concurrent updates with a locking strategy matched to conflict frequency. Read when defining transaction boundaries or handling concurrent updates/consistency/deadlocks. This is a general-purpose standard not tied to any specific language/framework.

## 1. Core Principles
- **Put transaction boundaries in the business layer (service unit)**: place the start and end of one unit of work at the service boundary. Do not put transaction boundaries at the entry point (controller/handler) or the data access layer — responsibility boundaries collapse.
- **Keep transactions short**: transaction length = connection hold time = concurrency limit. **Every optimization reduces to "keep the transaction short".**
- **Forbid external calls/waits inside a transaction**: do not make external API calls, sleeps/waits, or large I/O inside the transaction boundary — they hold the connection and exhaust the pool (directly tied to the pool-exhaustion scenario of the connection-pool-tuning skill).
- **Choose the locking strategy by conflict frequency**: if concurrent modification conflicts are rare, use version-based **optimistic locking** to detect and retry; if conflicts are frequent or consistency is critical, use row-locking **pessimistic locking**.
- **Always lock multiple resources in the same order**: define a consistent lock acquisition order to avoid deadlocks.
- **Raise the isolation level only as much as needed**: the default is read committed; raise it one step only for sections requiring identity guarantees, and treat serialization as a last resort.
- **Ensure failures always lead to rollback**: do not swallow exceptions or leave exception types that are excluded from rollback unhandled, letting partial commits leak.

## 2. Rules

### 2-1. Transaction boundaries at the service unit, not controller/DAO
- Place one unit of work (the scope where multiple writes must be bundled atomically) at the service boundary.
- Do not open transactions at the entry-point handler or the data access layer — if the boundary is scattered, you cannot trace where commit/rollback happens.

```text
// ❌ Forbidden — transaction boundary at entry point/data layer
handler(req):
  begin tx
    ...
  commit                 // breaks responsibility boundary, untraceable

// ✅ Recommended — a single service method is the boundary of one unit of work
service.placeOrder(req):
  begin tx
    orders.insert(...)
    payments.insert(...)  // roll back everything if one side fails
  commit
```

### 2-2. Propagation: three modes — participate / independent / forbidden — are enough
Most cases come down to three meanings. The remaining propagation modes are rarely needed.

- **Participate (join the existing transaction, or start a new one if none)**: the default. The bundled calls become one atomic unit.
- **Independent (a separate transaction detached from the parent)**: work that must survive even if the parent rolls back, like audit logs/failure records. However, it **occupies an additional separate connection**, so always reflect this in pool sizing (see the connection-pool-tuning skill).
- **Forbidden (reject if called inside a transaction)**: a guard for work that must never run inside a transaction boundary, like external APIs/long-running tasks.

```text
// Participate  — one transaction, roll back everything if one side fails
placeOrder: [ orders.insert ; payments.insert ]   (one tx)

// Independent  — commit regardless of parent rollback (beware the extra connection)
writeAuditLog(event): (new tx) audit.insert(event)

// Forbidden  — block with an exception if called inside a transaction
callExternalApi(): assert no-active-tx ; external.post(...)
```

### 2-3. Isolation level: raise it only as much as needed
| Level | Use | Note |
|---|---|---|
| Read Committed | **Default (recommended)**. Most OLTP | Blocks dirty reads |
| Repeatable Read | Reading the same row multiple times in one transaction with an identity guarantee (settlement, stock decrement) | One step up |
| Serializable | Last resort | Lock explosion / sharp throughput drop |
| Read Uncommitted | Do not use | Dirty reads |

```text
// Raise one step only for sections that need the same balance read twice to be identical
settleAccount(accountId): isolation = RepeatableRead { ... }
```

> The default isolation level and naming differ by DB product. Confirm the default of the DB your team uses, and follow the principle of "raise only the sections that need it".

### 2-4. Pessimistic locking: lock the row first, then work (SELECT ... FOR UPDATE)
When the same row is likely to be modified concurrently (stock decrement, seat reservation).

- Lock the row at read time, preventing other transactions from modifying it until this transaction ends.
- The lock scope **is valid only inside the transaction**. You cannot carry a lock outside the transaction.

```text
// ✅ Pessimistic lock — lock, check, update (whole section in one transaction)
decreaseStock(productId, qty):
  begin tx
    stock = SELECT stock FROM products WHERE id = productId FOR UPDATE  // row lock
    if stock < qty: throw OutOfStock
    UPDATE products SET stock = stock - qty WHERE id = productId
  commit                                                                // lock release
```

> Some DBs support a variant that skips locked rows in queue/worker patterns (e.g., skip locked rows). Check whether your team's DB supports it.

### 2-5. Optimistic locking: detect conflicts by version, then retry
When reads overwhelmingly dominate and concurrent modification conflicts are rare.

- Keep a version value on the row, and on update apply "only if it equals the version I read" while incrementing the version.
- If the updated row count is 0, someone changed it first in the meantime → treat as a conflict and **re-read and retry**.

```text
// Keep a version column on the row
products(id, stock, version, ...)

// ✅ Optimistic lock — update only if the read version is unchanged; 0 rows means conflict → retry
updateStock(id, newStock):
  retry up to N times:
    cur = read(id)                       // capture cur.version
    affected = UPDATE products
                 SET stock = newStock, version = cur.version + 1
               WHERE id = id AND version = cur.version
    if affected == 0: conflict → retry
    else: success
```

> If the conflict rate exceeds roughly 5%, optimistic locking becomes inefficient (wasted retries) — consider switching to pessimistic locking.

### 2-6. Deadlock avoidance: consistent lock ordering
- **Consistent lock acquisition order**: when locking multiple resources, always sort by the same criterion and lock. If one side locks A→B and the other B→A, you get an immediate deadlock.
- **Keep transactions short**: lock hold time is directly the deadlock probability.
- **No bulk updates without an index**: if the condition has no index, it full-scans and a row lock can escalate into a wider lock.

```text
// ❌ Forbidden — each caller locks in a different order → deadlock
transfer(from, to): lock(from) ; lock(to)   // another request does lock(to);lock(from)

// ✅ Recommended — always lock in the same order (e.g., ascending id)
transfer(from, to):
  first  = min(from, to)
  second = max(from, to)
  lock(first) ; lock(second)
  // now the actual transfer
```

### 2-7. External calls outside the transaction boundary
- Do external API/remote calls/long waits before opening or after closing the transaction.
- Split a large unit of work into "short transaction → external call → short transaction".

```text
// ❌ Forbidden — waiting on an external API while holding a transaction → connection pool exhaustion
begin tx
  orders.insert(...)
  payment.charge(...)   // a few seconds of wait → holds the connection meanwhile
  orders.markPaid(...)
commit

// ✅ Recommended — separate external calls outside the boundary
orderId = (tx) createPending(...)     // short TX
result  = payment.charge(...)         // outside TX
          (tx) markPaid(orderId, result)  // short TX
```

> With a 1-second external call × pool size 10, the concurrent 11th request times out immediately. This is directly tied to the pool-exhaustion scenario of the connection-pool-tuning skill.

### 2-8. Marking read-only intent
- For operations with no writes, declare them "read-only" — some runtimes/ORMs optimize based on this (e.g., skipping unnecessary flushes), and even when they don't, it serves as a review signal that "this operation makes no changes".
- Do not call writes inside a read-only boundary.

```text
// ✅ Recommended — mark query operations as read-only
findAll(): readOnly { ... }
```

### 2-9. Don't let transactions get skipped via self-invocation/bypass paths
In environments where declarative transactions work via **call interception (interception/proxy)**, calling a self method directly inside the same object can bypass the interception and ignore the transaction settings.

- Methods that need a transaction boundary should be **separated into another unit (a separate component) so they are called via an external path**.
- The same pitfall applies to other declarative features operating by the same mechanism (asynchronous execution, caching, etc.) — the same mechanism as the self-invocation pitfall in the scheduler-async skill.

```text
// ❌ Bug — a direct internal call within the same object bypasses interception → transaction ignored
outer():            // transaction boundary
  this.inner()      // inner's transaction settings are not applied

// ✅ Recommended — separate inner into its own unit so the boundary is guaranteed when called
outer(): other.inner()   // external path → transaction settings applied
```

### 2-10. Let failures lead to rollback
- **Do not swallow exceptions**: catching with try/catch and only logging commits the work as-is. To signal failure, rethrow the exception or roll back explicitly.
- **Beware exception types excluded from rollback**: depending on the environment, certain exception types (e.g., checked exceptions in some languages) may not trigger rollback by default. In such cases, specify the rollback targets.

```text
// ❌ Forbidden — swallow the exception and a partial commit leaks
save():
  begin tx
    try { mapper.insert(...) }
    catch (e) { log(e) }   // not rethrowing commits as-is
  commit

// ✅ Recommended — propagate the exception on failure to roll back
save():
  begin tx
    mapper.insert(...)     // rollback on exception
  commit
```

## 3. Common Mistakes
- **Transactions are long** → external calls/waits/large I/O are inside the boundary, holding the connection long and collapsing concurrency. Split the boundary short.
- **External calls inside a transaction** → the number one cause of pool exhaustion. Move the call outside the boundary.
- **Inconsistent lock ordering** → locking two resources in different orders causes deadlock. Always sort by the same criterion and lock.
- **Lock choice mismatched to conflict frequency** → optimistic locking when conflicts are frequent (wasted retries) / pessimistic locking when rare (unnecessary serialization). Choose by frequency.
- **Swallowing exceptions** → catching and only logging commits the failure. Rethrow or roll back explicitly.
- **Leaving non-rolling-back exception types unhandled** → a specific exception is not a default rollback target, so a partial commit leaks. Specify the rollback targets.
- **Transaction skipped via self-invocation** → settings are ignored due to interception bypass. Separate into its own unit.
- **Raising the isolation level too high** → global serialization sharply drops throughput. Raise only the needed sections by one step.
- **Bulk updates without an index** → a row lock escalates into a wide lock, collapsing concurrency. Put an index on the update condition.

## 4. Checklist
- [ ] Did you put the transaction boundary at the **service unit** (no entry point/data layer)?
- [ ] Did you remove external calls/waits/large I/O from inside the transaction?
- [ ] Did you split large work into "short TX → external call → short TX"?
- [ ] Did you choose pessimistic / optimistic locking according to conflict frequency?
- [ ] Do you acquire locks on multiple resources always in the same order (deadlock avoidance)?
- [ ] Did you raise the isolation level by one step only for the needed sections (avoiding global serialization)?
- [ ] Are there any places where transactions get skipped via self-invocation/bypass paths?
- [ ] Do failures always lead to rollback (check exception swallowing/missing rollback)?
- [ ] Did you reflect the connection additionally occupied by independent transactions in the pool size?

## Appendix: Per-Stack Examples

> Below is a code example mapping the above standards 1–4 to Spring (Java). For concept/principle explanations, refer to the body (section numbers in parentheses); here we cover only Spring-specific application. Add other stacks your team uses with the same pattern.

### Spring (Java)

Use `@Transactional` (AOP proxy-based) to set transaction boundaries on service methods, and apply locks with MyBatis mappers.

#### Propagation (2-2) — `REQUIRED` / `REQUIRES_NEW` / `NEVER`

```java
@Transactional                                                   // participate (default)
public void placeOrder(OrderRequest req) { orderMapper.insert(...); paymentMapper.insert(...); }

@Transactional(propagation = Propagation.REQUIRES_NEW)            // independent — beware separate connection
public void writeAuditLog(AuditEvent event) { auditMapper.insert(event); }

@Transactional(propagation = Propagation.NEVER)                   // forbidden — external API guard
public void callExternalApi() { restClient.post(...); }
```

#### Isolation level (2-3) — mapping to Spring defaults

We only note the enum corresponding to each level in the body table and the per-DB default.

| Spring enum | Body level | DB default |
|---|---|---|
| `READ_COMMITTED` | Read committed (recommended default) | Postgres·Oracle default |
| `REPEATABLE_READ` | Repeatable read | MariaDB/MySQL default |
| `SERIALIZABLE` | Serializable (last resort) | — |
| `READ_UNCOMMITTED` | Read uncommitted (forbidden) | — |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void settleAccount(Long accountId) { /* same balance read twice guaranteed identical */ }
```

#### Pessimistic lock (2-4) — MyBatis `FOR UPDATE`

```xml
<select id="selectStockForUpdate" resultType="int">
    SELECT stock_count FROM products WHERE id = #{id} FOR UPDATE
</select>
```
```java
@Transactional
public void decreaseStock(Long productId, int qty) {
    int stock = productMapper.selectStockForUpdate(productId);  // row lock
    if (stock < qty) throw new OutOfStockException();
    productMapper.decreaseStock(productId, qty);
}                                                                // lock released at transaction end
```

#### Optimistic lock (2-5) — `version` column + `@Retryable`

`affected == 0` means a conflict. Declare retries with Spring Retry.

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
        throw new OptimisticLockException("retry");
}
```

#### Deadlock avoidance (2-6) — sorting lock order

```java
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    accountMapper.lockForUpdate(Math.min(from, to));   // always ascending id
    accountMapper.lockForUpdate(Math.max(from, to));
    // now the actual transfer
}
```

#### External calls outside the boundary (2-7)

```java
// ✅ Transaction separation — external API outside TX
public void placeOrder(...) {
    Long orderId = orderService.createPending(...);  // short TX
    PaymentResult r = paymentApi.charge(...);         // outside TX
    orderService.markPaid(orderId, r);                // short TX
}
```

#### `readOnly = true` (2-8)

```java
@Transactional(readOnly = true)
public List<UserResponse> findAll() { ... }
```
- **JPA**: real optimization such as skipping first-level cache flush. **MyBatis**: mainly intent marking (a review signal).

#### Self-invocation pitfall (2-9) — proxy bypass

```java
@Service
public class OrderService {
    @Transactional
    public void outer() { this.inner(); }   // ❌ proxy bypass → @Transactional ignored
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void inner() { ... }
}
```
Solution: ① extract into another bean (recommended) ② `AopContext.currentProxy()` ③ self-injection (`@Autowired self`). The same pitfall applies to `@Async`·`@Cacheable` (scheduler-async skill).

#### Rollback (2-10) — Spring-specific pitfalls

```java
// ❌ exception swallowed → committed
@Transactional
public void save() { try { mapper.insert(...); } catch (Exception e) { log.error("failed", e); } }

// ❌ checked exceptions do not roll back by default → rollbackFor must be specified
@Transactional   // (rollbackFor = Exception.class)
public void save() throws IOException { mapper.insert(...); throw new IOException(); }
```
- Do not put `@Transactional` on the controller (breaks the responsibility boundary) — manage it in the service layer (2-1).
- Forbid `Thread.sleep`·large file I/O inside a transaction (2-7).
