---
name: 트랜잭션과 락 (Transaction & Locking)
description: 트랜잭션 경계·전파·격리수준·비관/낙관 락·데드락 회피의 범용 표준이다 — 트랜잭션은 짧게, 외부 I/O는 경계 밖으로, 충돌 빈도로 락 전략을 고르고 락 순서를 일관되게 한다. 트랜잭션 경계를 정하거나 동시 갱신·재고 차감·이체 정합성을 다룰 때, 커넥션 풀 고갈·데드락·롤백 누락을 점검할 때 읽는다. 키워드: transaction, propagation, isolation, deadlock, pessimistic lock, optimistic lock, SELECT FOR UPDATE, version, rollback.
rules:
  - "트랜잭션 경계는 비즈니스 계층(서비스 단위)에: 한 단위 작업의 시작과 끝을 서비스 경계에 둔다. 진입점(컨트롤러/핸들러)이나 데이터 접근 계층에 트랜잭션 경계를 두지 않는다 — 책임 경계가 무너진다."
  - "트랜잭션은 짧게 유지한다: 트랜잭션 길이 = 커넥션 점유 시간 = 동시성 한계. 모든 최적화는 '트랜잭션을 짧게'로 귀결된다."
  - "트랜잭션 안에서 외부 호출·대기를 금지한다: 외부 API 호출, 슬립/대기, 대용량 I/O를 트랜잭션 경계 안에서 하지 않는다 — 그동안 커넥션을 붙잡아 풀을 고갈시킨다 (connection-pool-tuning 스킬의 풀 고갈 시나리오와 직결)."
  - "충돌 빈도로 락 전략을 고른다: 동시 수정 충돌이 드물면 버전 기반 낙관 락으로 감지·재시도하고, 충돌이 잦거나 정합성이 결정적이면 행 잠금 기반 비관 락을 쓴다."
  - "여러 자원은 항상 같은 순서로 잠근다: 락 획득 순서를 일관되게 정해 데드락을 회피한다."
  - "격리 수준은 필요한 만큼만 올린다: 기본은 커밋된 읽기, 동일성 보장이 필요한 구간만 한 단계 올리고, 직렬화는 최후 수단으로 둔다."
  - "실패는 반드시 롤백으로 이어지게 한다: 예외를 삼키거나, 롤백 대상에서 빠지는 예외 유형을 방치해 부분 커밋이 새지 않게 한다."
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

# 🔒 트랜잭션과 락 (Transaction & Locking)

> 트랜잭션을 짧게·명확하게·외부 호출 없이 운영하고, 동시 갱신은 충돌 빈도에 맞는 락 전략으로 다룬다. 트랜잭션 경계를 정하거나 동시 갱신·정합성·데드락을 다룰 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **트랜잭션 경계는 비즈니스 계층(서비스 단위)에**: 한 단위 작업의 시작과 끝을 서비스 경계에 둔다. 진입점(컨트롤러/핸들러)이나 데이터 접근 계층에 트랜잭션 경계를 두지 않는다 — 책임 경계가 무너진다.
- **트랜잭션은 짧게 유지한다**: 트랜잭션 길이 = 커넥션 점유 시간 = 동시성 한계. **모든 최적화는 "트랜잭션을 짧게"로 귀결된다.**
- **트랜잭션 안에서 외부 호출·대기를 금지한다**: 외부 API 호출, 슬립/대기, 대용량 I/O를 트랜잭션 경계 안에서 하지 않는다 — 그동안 커넥션을 붙잡아 풀을 고갈시킨다 (connection-pool-tuning 스킬의 풀 고갈 시나리오와 직결).
- **충돌 빈도로 락 전략을 고른다**: 동시 수정 충돌이 드물면 버전 기반 **낙관 락**으로 감지·재시도하고, 충돌이 잦거나 정합성이 결정적이면 행 잠금 기반 **비관 락**을 쓴다.
- **여러 자원은 항상 같은 순서로 잠근다**: 락 획득 순서를 일관되게 정해 데드락을 회피한다.
- **격리 수준은 필요한 만큼만 올린다**: 기본은 커밋된 읽기, 동일성 보장이 필요한 구간만 한 단계 올리고, 직렬화는 최후 수단으로 둔다.
- **실패는 반드시 롤백으로 이어지게 한다**: 예외를 삼키거나, 롤백 대상에서 빠지는 예외 유형을 방치해 부분 커밋이 새지 않게 한다.

## 2. 규칙

### 2-1. 트랜잭션 경계는 서비스 단위에, 컨트롤러/DAO 금지
- 한 단위 작업(여러 쓰기를 원자적으로 묶어야 하는 범위)을 서비스 경계에 둔다.
- 진입점 핸들러나 데이터 접근 계층에 트랜잭션을 열지 않는다 — 경계가 흩어지면 어디서 커밋/롤백되는지 추적이 안 된다.

```text
// ❌ 금지 — 진입점/데이터 계층에 트랜잭션 경계
handler(req):
  begin tx
    ...
  commit                 // 책임 경계 파괴, 추적 불가

// ✅ 권장 — 서비스 한 메서드가 한 단위 작업의 경계
service.placeOrder(req):
  begin tx
    orders.insert(...)
    payments.insert(...)  // 한쪽 실패 시 전체 롤백
  commit
```

### 2-2. 전파(propagation): 참여 / 독립 / 금지 3가지로 충분
대부분의 케이스는 세 가지 의미로 끝난다. 나머지 전파 모드는 거의 쓸 일이 없다.

- **참여(기존 트랜잭션에 합류, 없으면 새로 시작)**: 기본값. 호출 묶음이 하나의 원자 단위가 된다.
- **독립(부모와 분리된 별도 트랜잭션)**: 감사 로그·실패 기록처럼 부모가 롤백돼도 살아남아야 하는 작업. 단, **별도 커넥션을 추가로 점유**하므로 풀 크기 산정에 반드시 반영한다 (connection-pool-tuning 스킬 참조).
- **금지(트랜잭션 안에서 호출되면 거부)**: 외부 API·장기 작업처럼 절대 트랜잭션 경계 안에서 돌면 안 되는 작업의 가드.

```text
// 참여  — 한 트랜잭션, 한쪽 실패 시 전체 롤백
placeOrder: [ orders.insert ; payments.insert ]   (one tx)

// 독립  — 부모 롤백과 무관하게 커밋 (별도 커넥션 점유 주의)
writeAuditLog(event): (new tx) audit.insert(event)

// 금지  — 트랜잭션 안에서 호출되면 예외로 막음
callExternalApi(): assert no-active-tx ; external.post(...)
```

### 2-3. 격리 수준(isolation): 필요한 만큼만 올린다
| 수준 | 용도 | 비고 |
|---|---|---|
| 커밋된 읽기 (Read Committed) | **기본값(권장)**. 대부분의 OLTP | 더티 리드 차단 |
| 반복 가능한 읽기 (Repeatable Read) | 한 트랜잭션에서 같은 행을 여러 번 읽고 동일성 보장 필요 (정산, 재고 차감) | 한 단계 위 |
| 직렬화 (Serializable) | 최후 수단 | 락 폭증/처리량 급감 |
| 커밋 안 된 읽기 (Read Uncommitted) | 사용 금지 | 더티 리드 |

```text
// 같은 잔액을 두 번 읽어도 동일 보장이 필요한 구간만 한 단계 올린다
settleAccount(accountId): isolation = RepeatableRead { ... }
```

> 기본 격리 수준과 명칭은 DB 제품마다 다르다. 팀이 쓰는 DB의 기본값을 확인하고, "필요한 구간만 올린다"는 원칙을 따른다.

### 2-4. 비관 락: 행을 먼저 잠그고 작업 (SELECT ... FOR UPDATE)
동시에 같은 행을 수정할 가능성이 높을 때 (재고 차감, 좌석 예약).

- 읽는 시점에 행을 잠가, 트랜잭션이 끝날 때까지 다른 트랜잭션의 수정을 막는다.
- 락 범위는 **반드시 트랜잭션 안에서만 유효**하다. 락을 트랜잭션 밖으로 들고 나갈 수 없다.

```text
// ✅ 비관 락 — 잠그고, 확인하고, 갱신 (전 구간 한 트랜잭션)
decreaseStock(productId, qty):
  begin tx
    stock = SELECT stock FROM products WHERE id = productId FOR UPDATE  // 행 잠금
    if stock < qty: throw OutOfStock
    UPDATE products SET stock = stock - qty WHERE id = productId
  commit                                                                // 락 해제
```

> 큐/워커 패턴에서 잠긴 행을 건너뛰고 가져오는 변형(예: 잠긴 행 스킵)을 지원하는 DB도 있다. 팀 DB의 지원 여부를 확인한다.

### 2-5. 낙관 락: 버전으로 충돌 감지 후 재시도
읽기 비중이 압도적이고 동시 수정 충돌이 드물 때.

- 행에 버전 값을 두고, 갱신 시 "내가 읽은 버전과 같을 때만" 갱신하며 버전을 올린다.
- 갱신된 행이 0이면 그 사이 누군가 먼저 바꾼 것 → 충돌로 보고 **다시 읽어 재시도**한다.

```text
// 행에 version 컬럼을 둔다
products(id, stock, version, ...)

// ✅ 낙관 락 — 읽은 버전이 그대로일 때만 갱신, 0건이면 충돌 → 재시도
updateStock(id, newStock):
  retry up to N times:
    cur = read(id)                       // cur.version 확보
    affected = UPDATE products
                 SET stock = newStock, version = cur.version + 1
               WHERE id = id AND version = cur.version
    if affected == 0: conflict → 재시도
    else: 성공
```

> 충돌률이 대략 5%를 넘으면 낙관 락은 오히려 비효율(재시도 낭비) — 비관 락으로 전환을 검토한다.

### 2-6. 데드락 회피: 락 순서 일관성
- **락 획득 순서를 일관되게**: 여러 자원을 잠글 때 항상 같은 기준으로 정렬해 잠근다. 한쪽이 A→B, 다른 쪽이 B→A로 잠그면 즉시 데드락.
- **트랜잭션을 짧게**: 락 보유 시간이 곧 데드락 확률이다.
- **인덱스 없는 대량 갱신 금지**: 조건에 인덱스가 없으면 풀스캔하며 행 락이 더 넓은 락으로 확장될 수 있다.

```text
// ❌ 금지 — 호출자마다 잠그는 순서가 다름 → 데드락
transfer(from, to): lock(from) ; lock(to)   // 다른 요청은 lock(to);lock(from)

// ✅ 권장 — 항상 같은 순서(예: id 오름차순)로 잠근다
transfer(from, to):
  first  = min(from, to)
  second = max(from, to)
  lock(first) ; lock(second)
  // 이제 실제 이체
```

### 2-7. 외부 호출은 트랜잭션 경계 밖으로
- 외부 API·원격 호출·장기 대기는 트랜잭션을 열기 전이나 닫은 뒤에 한다.
- 큰 단위 작업은 "짧은 트랜잭션 → 외부 호출 → 짧은 트랜잭션"으로 쪼갠다.

```text
// ❌ 금지 — 트랜잭션 점유한 채 외부 API 대기 → 커넥션 풀 고갈
begin tx
  orders.insert(...)
  payment.charge(...)   // 수 초 대기 → 그동안 커넥션 점유
  orders.markPaid(...)
commit

// ✅ 권장 — 외부 호출을 경계 밖으로 분리
orderId = (tx) createPending(...)     // 짧은 TX
result  = payment.charge(...)         // TX 밖
          (tx) markPaid(orderId, result)  // 짧은 TX
```

> 외부 호출 1초 × 풀 크기 10이면, 동시 11번째 요청부터 즉시 타임아웃. connection-pool-tuning 스킬의 풀 고갈 시나리오와 직결된다.

### 2-8. 읽기 전용 의도 표시
- 쓰기가 없는 작업은 "읽기 전용"임을 명시한다 — 일부 런타임/ORM은 이를 근거로 최적화(불필요한 플러시 생략 등)하고, 그렇지 않더라도 "이 작업은 변경이 없다"는 리뷰 신호가 된다.
- 읽기 전용 경계 안에서 쓰기를 호출하지 않는다.

```text
// ✅ 권장 — 조회 작업은 읽기 전용으로 표시
findAll(): readOnly { ... }
```

### 2-9. 자기호출/우회 경로로 트랜잭션이 누락되지 않게
선언적 트랜잭션이 **호출 가로채기(인터셉션/프록시)** 로 동작하는 환경에서는, 같은 객체 내부에서 자기 메서드를 직접 부르면 가로채기를 우회해 트랜잭션 설정이 무시될 수 있다.

- 트랜잭션 경계가 필요한 메서드는 **다른 단위(별도 컴포넌트)로 분리해 외부 경로로 호출**되게 한다.
- 같은 함정이 동일 메커니즘으로 동작하는 다른 선언적 기능(비동기 실행·캐싱 등)에도 적용된다 — scheduler-async 스킬의 자기호출 함정과 같은 메커니즘.

```text
// ❌ 버그 — 같은 객체 내부 직접 호출이 가로채기를 우회 → 트랜잭션 무시
outer():            // 트랜잭션 경계
  this.inner()      // inner의 트랜잭션 설정이 안 걸림

// ✅ 권장 — inner를 별도 단위로 분리해 경계가 보장되게 호출
outer(): other.inner()   // 외부 경로 → 트랜잭션 설정 적용
```

### 2-10. 실패가 롤백으로 이어지게
- **예외를 삼키지 않는다**: try/catch로 잡고 로그만 남기면 작업은 그대로 커밋된다. 실패를 알리려면 예외를 다시 던지거나 명시적으로 롤백한다.
- **롤백 대상에서 빠지는 예외 유형에 주의**: 환경에 따라 특정 예외 유형(예: 일부 언어의 검사 예외)은 기본적으로 롤백을 트리거하지 않을 수 있다. 그런 경우 롤백 대상을 명시한다.

```text
// ❌ 금지 — 예외를 삼켜 부분 커밋이 샌다
save():
  begin tx
    try { mapper.insert(...) }
    catch (e) { log(e) }   // 안 던지면 그대로 커밋됨
  commit

// ✅ 권장 — 실패 시 예외를 전파해 롤백
save():
  begin tx
    mapper.insert(...)     // 예외 발생 시 롤백
  commit
```

## 3. 흔한 실수
- **트랜잭션이 길다** → 외부 호출/대기/대용량 I/O가 경계 안에 있어 커넥션을 오래 붙잡고 동시성이 무너진다. 경계를 짧게 쪼갠다.
- **외부 호출을 트랜잭션 안에서** → 풀 고갈의 1순위 원인. 호출을 경계 밖으로 뺀다.
- **락 순서 불일치** → 두 자원을 서로 다른 순서로 잠가 데드락. 항상 같은 기준으로 정렬해 잠근다.
- **충돌 빈도와 안 맞는 락 선택** → 충돌 잦은데 낙관 락(재시도 낭비)·드문데 비관 락(불필요한 직렬화). 빈도로 고른다.
- **예외 삼킴** → 잡고 로그만 남겨 실패가 커밋된다. 다시 던지거나 명시적으로 롤백한다.
- **롤백 안 되는 예외 유형 방치** → 특정 예외가 기본 롤백 대상이 아니라 부분 커밋이 샌다. 롤백 대상을 명시한다.
- **자기호출로 트랜잭션 누락** → 가로채기 우회로 설정이 무시된다. 별도 단위로 분리한다.
- **격리 수준을 과하게 올림** → 전역 직렬화로 처리량 급감. 필요한 구간만 한 단계 올린다.
- **인덱스 없는 대량 갱신** → 행 락이 넓은 락으로 확장돼 동시성 붕괴. 갱신 조건에 인덱스를 둔다.

## 4. 체크리스트
- [ ] 트랜잭션 경계를 **서비스 단위**에 두었는가 (진입점/데이터 계층 금지)
- [ ] 트랜잭션 안에서 외부 호출·대기·대용량 I/O 를 제거했는가
- [ ] 큰 작업을 "짧은 TX → 외부 호출 → 짧은 TX"로 쪼갰는가
- [ ] 충돌 빈도에 맞게 비관 락 / 낙관 락을 선택했는가
- [ ] 여러 자원의 락을 항상 같은 순서로 획득하는가 (데드락 회피)
- [ ] 격리 수준을 필요한 구간만 한 단계 올렸는가 (전역 직렬화 회피)
- [ ] 자기호출/우회 경로로 트랜잭션이 누락되는 곳은 없는가
- [ ] 실패가 반드시 롤백으로 이어지는가 (예외 삼킴·롤백 누락 점검)
- [ ] 독립 트랜잭션이 추가로 점유하는 커넥션을 풀 크기에 반영했는가

## 부록: 스택별 예시

> 아래는 위 1~4 표준을 Spring(Java)에 매핑한 코드 예시다. 개념·원칙 설명은 본문(괄호 안 절 번호)을 참조하고, 여기서는 Spring 고유의 적용만 다룬다. 팀이 쓰는 다른 스택은 같은 패턴으로 추가한다.

### Spring (Java)

`@Transactional`(AOP 프록시 기반)으로 서비스 메서드에 트랜잭션 경계를 두고, MyBatis 매퍼로 락을 건다.

#### 전파(2-2) — `REQUIRED` / `REQUIRES_NEW` / `NEVER`

```java
@Transactional                                                   // 참여(기본)
public void placeOrder(OrderRequest req) { orderMapper.insert(...); paymentMapper.insert(...); }

@Transactional(propagation = Propagation.REQUIRES_NEW)            // 독립 — 별도 커넥션 점유 주의
public void writeAuditLog(AuditEvent event) { auditMapper.insert(event); }

@Transactional(propagation = Propagation.NEVER)                   // 금지 — 외부 API 가드
public void callExternalApi() { restClient.post(...); }
```

#### 격리 수준(2-3) — Spring 기본값과 매핑

본문 표의 각 수준에 대응하는 enum과 DB별 기본값만 적는다.

| Spring enum | 본문 수준 | DB 기본값 |
|---|---|---|
| `READ_COMMITTED` | 커밋된 읽기(기본 권장) | Postgres·Oracle 기본 |
| `REPEATABLE_READ` | 반복 가능한 읽기 | MariaDB/MySQL 기본 |
| `SERIALIZABLE` | 직렬화(최후 수단) | — |
| `READ_UNCOMMITTED` | 커밋 안 된 읽기(금지) | — |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void settleAccount(Long accountId) { /* 같은 잔액 두 번 읽어도 동일 보장 */ }
```

#### 비관 락(2-4) — MyBatis `FOR UPDATE`

```xml
<select id="selectStockForUpdate" resultType="int">
    SELECT stock_count FROM products WHERE id = #{id} FOR UPDATE
</select>
```
```java
@Transactional
public void decreaseStock(Long productId, int qty) {
    int stock = productMapper.selectStockForUpdate(productId);  // 행 잠금
    if (stock < qty) throw new OutOfStockException();
    productMapper.decreaseStock(productId, qty);
}                                                                // 트랜잭션 종료 시 락 해제
```

#### 낙관 락(2-5) — `version` 컬럼 + `@Retryable`

`affected == 0`이면 충돌. Spring Retry로 재시도를 선언한다.

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
        throw new OptimisticLockException("재시도");
}
```

#### 데드락 회피(2-6) — 락 순서 정렬

```java
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    accountMapper.lockForUpdate(Math.min(from, to));   // 항상 id 오름차순
    accountMapper.lockForUpdate(Math.max(from, to));
    // 이제 실제 이체
}
```

#### 외부 호출은 경계 밖으로(2-7)

```java
// ✅ 트랜잭션 분리 — 외부 API는 TX 밖
public void placeOrder(...) {
    Long orderId = orderService.createPending(...);  // 짧은 TX
    PaymentResult r = paymentApi.charge(...);         // TX 밖
    orderService.markPaid(orderId, r);                // 짧은 TX
}
```

#### `readOnly = true`(2-8)

```java
@Transactional(readOnly = true)
public List<UserResponse> findAll() { ... }
```
- **JPA**: 1차 캐시 flush 생략 등 실질 최적화. **MyBatis**: 의도 표시 위주(리뷰 신호).

#### 자기호출 함정(2-9) — 프록시 우회

```java
@Service
public class OrderService {
    @Transactional
    public void outer() { this.inner(); }   // ❌ 프록시 우회 → @Transactional 무시
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void inner() { ... }
}
```
해결: ① 다른 빈으로 추출(권장) ② `AopContext.currentProxy()` ③ 자기 주입(`@Autowired self`). 동일 함정이 `@Async`·`@Cacheable`에도 적용된다(scheduler-async 스킬).

#### 롤백(2-10) — Spring 고유 함정

```java
// ❌ 예외 삼킴 → 커밋됨
@Transactional
public void save() { try { mapper.insert(...); } catch (Exception e) { log.error("실패", e); } }

// ❌ 체크 예외는 기본적으로 롤백 안 함 → rollbackFor 명시 필요
@Transactional   // (rollbackFor = Exception.class)
public void save() throws IOException { mapper.insert(...); throw new IOException(); }
```
- `@Transactional`을 controller에 두지 않는다(책임 경계 파괴) — 서비스 계층에서 관리한다(2-1).
- 트랜잭션 안에서 `Thread.sleep`·대용량 파일 I/O 금지(2-7).
