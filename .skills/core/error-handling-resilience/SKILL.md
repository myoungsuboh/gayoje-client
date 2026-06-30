---
name: 에러 처리 & 회복탄력성 (Error Handling & Resilience)
description: 예외를 어떻게 잡고·전파하고·복구할지 규정하는 스택 중립 가이드 — 에러 삼키기 금지, fail-fast vs graceful degradation, 재시도·타임아웃·회로 차단기·폴백·부분 실패. 외부 API·DB·큐 호출이나 예외 정책을 작성·검토할 때 읽는다(에러 수집·관측은 `error-monitoring`·`async-error-handling`에 위임). 키워드: error-handling, resilience, retry, backoff, timeout, circuit-breaker, fallback, fail-fast.
rules:
  - "에러를 삼키지 않는다 — 잡았으면 처리하거나, 못 하면 다시 던진다. 로그·처리 없는 빈 catch 금지."
  - "실패 유형을 구분한다 — 프로그래밍 오류(버그·잘못된 입력)는 fail-fast(즉시 중단·노출), 외부 의존 실패(네트워크·DB·외부 API)는 graceful degradation(폴백·부분 동작)으로."
  - "일시적 실패는 재시도하되 안전하게 — 지수 백오프 + 지터, 타임아웃, 재시도 상한을 항상 함께 둔다. 무한·즉시 재시도 금지."
  - "재시도하려면 멱등성이 필요하다 — 부수효과가 있는 작업은 멱등 키로 중복을 막는다 (idempotency 참조)."
  - "장애를 격리한다 — 반복 실패하는 의존엔 회로 차단기로 호출을 끊고 폴백한다. 한 부분의 실패가 전체로 번지지 않게 한다."
  - "메시지는 청중별로 — 사용자에겐 친절하고 안전한 메시지, 로그엔 상세 컨텍스트(단, 비밀번호·토큰·개인정보 제외)."
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

# 🛡️ 에러 처리 & 회복탄력성 (Error Handling & Resilience)

> 예외를 잡고·전파하고·복구하는 방식을 규칙으로 못 박아, 실패해도 시스템이 무너지지 않고 원인이 드러나게 한다. 외부 의존을 호출하거나 try/catch·예외 정책을 작성·검토할 때 읽는다.

AI 에이전트가 가장 흔히 저지르는 실수는 **에러를 조용히 삼키는 것**(빈 catch, 로그 없는 무시)과 **모든 실패를 똑같이 취급하는 것**이다. 그러면 장애가 숨고, 일시적 오류에도 전체가 멈춘다. 실패를 "프로그래밍 오류"와 "외부 의존 실패"로 나누고, 각각에 맞는 정책을 규칙으로 박아두면 AI도 그 틀 안에서 안전한 코드를 생성한다.

## 1. 핵심 원칙

- **에러를 삼키지 않는다** — 잡았으면 처리하거나, 못 하면 다시 던진다. 로그·처리 없는 빈 catch 금지.
- **실패 유형을 구분한다** — 프로그래밍 오류(버그·잘못된 입력)는 **fail-fast**(즉시 중단·노출), 외부 의존 실패(네트워크·DB·외부 API)는 **graceful degradation**(폴백·부분 동작)으로.
- **일시적 실패는 재시도하되 안전하게** — 지수 백오프 + 지터, 타임아웃, 재시도 상한을 항상 함께 둔다. 무한·즉시 재시도 금지.
- **재시도하려면 멱등성이 필요하다** — 부수효과가 있는 작업은 멱등 키로 중복을 막는다 (`idempotency` 참조).
- **장애를 격리한다** — 반복 실패하는 의존엔 회로 차단기로 호출을 끊고 폴백한다. 한 부분의 실패가 전체로 번지지 않게 한다.
- **메시지는 청중별로** — 사용자에겐 친절하고 안전한 메시지, 로그엔 상세 컨텍스트(단, 비밀번호·토큰·개인정보 제외).

## 2. 규칙

### 2-1. 에러를 삼키지 않는다

```text
# ❌ 금지 — 조용히 삼킴: 장애가 숨고 디버깅 불가
try { charge(order) } catch (e) { /* 아무것도 안 함 */ }
try { ... } catch (e) { return null }   // 원인 소실

# ✅ 권장 — 처리하거나, 컨텍스트 붙여 다시 던진다
try {
  charge(order)
} catch (e) {
  log.error("charge 실패 orderId=%s", order.id, e)   // 원인(e) 보존
  throw new PaymentError("결제 처리 실패", cause=e)    // 상위가 결정하게
}
```

- 잡은 예외는 **반드시** 로깅 또는 재전파한다. "나중에 보자" 빈 catch 금지.
- 다시 던질 땐 **원래 원인(cause/stack)을 보존**한다 — 새 예외로 덮어쓰지 않는다.
- 광범위 catch(`catch (Exception)`/`except:`)로 모든 걸 한 번에 삼키지 않는다 — 잡을 예외를 구체적으로.

### 2-2. fail-fast vs graceful degradation

| 실패 유형 | 예 | 정책 |
|---|---|---|
| 프로그래밍 오류 | null 참조, 잘못된 인자, 깨진 설정 | **fail-fast** — 즉시 중단·노출, 숨기지 않음 |
| 잘못된 외부 입력 | 검증 실패한 요청 | 거부 + 명확한 4xx (입력 검증은 `input-validation`) |
| 외부 의존 실패 | DB·외부 API·큐 타임아웃 | **graceful degradation** — 재시도·폴백·부분 동작 |

```text
# ✅ 시작 시 필수 설정 누락 → fail-fast (조용히 기본값 쓰지 말 것)
if (config.apiKey == null) throw new ConfigError("API_KEY 필수")

# ✅ 추천 서비스 다운 → 핵심 흐름은 폴백으로 계속
recs = tryGet(() => recoApi.fetch(user), fallback=[])  // 빈 목록으로 진행
```

### 2-3. 재시도 + 백오프 + 타임아웃 + 상한

```text
# ❌ 금지 — 타임아웃·상한 없는 즉시 무한 재시도 (장애 증폭)
while (true) { try { return call() } catch (e) { /* 곧장 재시도 */ } }

# ✅ 권장 — 타임아웃 + 지수 백오프 + 지터 + 횟수 상한
for (attempt in 1..MAX_RETRIES) {        // 상한 (예: 3)
  try {
    return call(timeout=2s)              // 매 호출 타임아웃
  } catch (e) {
    if (!isTransient(e) || attempt == MAX_RETRIES) throw e
    sleep(min(base * 2^attempt, cap) + random_jitter)  // 지수 백오프 + 지터
  }
}
```

- **타임아웃 없는 외부 호출 금지** — 무한 대기는 스레드·커넥션 고갈로 이어진다.
- 재시도는 **일시적 오류**(네트워크·5xx·타임아웃)에만. 4xx·검증 오류는 재시도해도 소용없다.
- 백오프에 **지터**를 더해 동시 재시도 폭주(thundering herd)를 막는다.
- 부수효과가 있는 작업(결제·생성)을 재시도하려면 **멱등성** 필수 (`idempotency` 참조).

### 2-4. 회로 차단기 & 폴백

```text
# ✅ 반복 실패하면 회로를 열어 빠르게 실패시키고, 폴백으로 응답
if (breaker.isOpen()) return cachedOrDefault()   // 죽은 의존을 계속 두드리지 않음
try { r = call(); breaker.onSuccess(); return r }
catch (e) { breaker.onFailure(); return cachedOrDefault() }
```

- 의존이 계속 실패하면 회로를 **열어** 즉시 실패시킨다 — 자원 낭비·연쇄 장애 방지.
- 폴백은 **안전한 기본값/캐시/축소 기능**으로. 폴백이 또 다른 장애를 부르지 않게.

### 2-5. 부분 실패 처리

```text
# ❌ 금지 — 100건 중 1건 실패로 전체 중단·롤백
for (item in batch) process(item)   // 하나라도 throw → 나머지 유실

# ✅ 권장 — 건별 격리, 성공/실패 집계 후 보고
results = batch.map(item => trySettle(() => process(item)))
failed = results.filter(isFailure)
if (failed) log.warn("부분 실패 %d/%d", failed.size, batch.size)
// 실패분은 재처리 큐로 (전부 버리지도, 전부 막지도 않는다)
```

- 배치·팬아웃 호출은 **건별로 격리**해 한 건 실패가 전체를 막지 않게 한다.
- 전부 성공 아니면 전부 실패가 **맞는 경우**(원자적 트랜잭션)와 **부분 허용**이 맞는 경우를 구분한다.

### 2-6. 메시지: 사용자 vs 로그

```text
# ❌ 금지 — 원시 예외·스택·내부정보를 사용자에게 노출
return Response(500, e.toString())   // SQL·경로·토큰 유출 위험

# ✅ 권장 — 사용자엔 친절+상관관계ID, 로그엔 상세(민감정보 제외)
log.error("주문 생성 실패 traceId=%s userId=%s", traceId, userId, e)
return Response(500, { message: "잠시 후 다시 시도해 주세요", traceId })
```

- 사용자 메시지엔 내부 구조·스택·원시 에러를 노출하지 않는다. 상관관계 ID로 로그와 연결.
- 로그엔 충분한 컨텍스트(식별자·입력 요약)를 남기되 **비밀번호·토큰·개인정보는 마스킹/제외**.

## 3. 흔한 실수

AI가 자주 만드는 것 — 검토 시 거른다.

- ❌ 빈 catch / `catch (e) {}` / 로그도 재전파도 없는 무시
- ❌ `catch (Exception)`·`except:`로 모든 예외를 뭉뚱그려 삼킴
- ❌ 외부 호출에 타임아웃 없음 → 무한 대기·자원 고갈
- ❌ 타임아웃·상한 없는 재시도, 또는 4xx까지 재시도
- ❌ 멱등성 없이 결제·생성 작업을 재시도 → 중복 실행
- ❌ 새 예외로 감싸며 원래 cause/stack 유실
- ❌ 사용자에게 원시 스택·SQL·내부 경로 노출, 로그엔 토큰·개인정보 그대로 기록
- ❌ 프로그래밍 버그를 try/catch로 가려 "정상"처럼 보이게 함 (조용한 실패)

> **적용 팁**: AGENTS.md / 규칙 파일에 "빈 catch 금지, 외부 호출엔 타임아웃, 재시도엔 백오프+상한" 한 줄을 박아두면 에이전트가 매 생성마다 지킨다. 이 문서는 **처리·복구 정책**만 다루고, 에러 수집·집계·알림은 `error-monitoring`(FE)·`async-error-handling`(Mobile)에 위임한다(입력 검증은 `input-validation`).

## 4. 체크리스트

- [ ] 로그·처리 없는 빈 catch가 없고, 잡은 예외는 처리하거나 원인 보존하며 재전파하는가
- [ ] 프로그래밍 오류는 fail-fast, 외부 의존 실패는 graceful degradation으로 구분했는가
- [ ] 모든 외부 호출에 타임아웃이 있고, 재시도엔 지수 백오프+지터+횟수 상한이 있는가
- [ ] 재시도하는 부수효과 작업에 멱등성이 보장되는가 (`idempotency`)
- [ ] 반복 실패 의존에 회로 차단기/폴백이 있고, 배치는 부분 실패를 건별 격리하는가
- [ ] 사용자 메시지는 친절·안전하고, 로그는 상세하되 민감정보를 제외하는가
