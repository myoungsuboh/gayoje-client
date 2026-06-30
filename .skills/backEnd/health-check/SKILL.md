---
name: 헬스체크 & 그레이스풀 셧다운 (Health Check & Graceful Shutdown)
description: 서비스의 생존(liveness)·트래픽 수용 준비(readiness)를 구분해 노출하고, 종료 시 진행 중 요청을 드레인하는 스택 중립 운영 표준 — liveness/readiness 분리, 의존성 반영, 그레이스풀 셧다운, 느린 기동(startup) 분리. 헬스 엔드포인트를 만들거나, 무중단 배포·오토스케일·컨테이너 프로브를 설정하거나, 종료 중 요청이 끊길 때 읽는다. 키워드: health-check, liveness, readiness, startup-probe, graceful-shutdown, SIGTERM, drain, zero-downtime.
rules:
  - "liveness ≠ readiness — liveness는 '프로세스가 살아 있나(아니면 재시작)', readiness는 '트래픽을 받을 준비가 됐나(아니면 LB에서 제외)'. 섞으면 안 된다."
  - "liveness는 단순하게 — 외부 의존성을 넣지 않는다. DB·캐시 장애로 liveness가 깨지면 정상 인스턴스가 무한 재시작된다."
  - "readiness는 필수 의존성을 반영하되 가볍게 — 트래픽을 받으려면 꼭 필요한 의존(DB 등)이 끊기면 not-ready로 트래픽을 차단한다. 단, 체크는 가볍고 타임아웃·캐시를 둔다."
  - "그레이스풀 셧다운 — 종료 신호(SIGTERM)를 받으면 즉시 죽지 말고: readiness off → 새 요청 차단 → 진행 중 요청 드레인 → 연결 정리 → 종료."
  - "느린 기동은 분리한다 — 초기화가 오래 걸리면 startup 단계로 분리해, 기동 중을 liveness 실패로 오판해 죽이지 않게 한다."
  - "헬스 응답의 정보 노출에 주의 — 상세 의존성·버전·내부 주소는 인증/내부망에만. 외부 공개 프로브는 최소 정보만."
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

# 💓 헬스체크 & 그레이스풀 셧다운 (Health Check & Graceful Shutdown)

> 서비스가 "살아 있는가(liveness)"와 "트래픽을 받을 준비가 됐는가(readiness)"는 다른 질문이다 — 이 둘을 구분해 노출하고, 종료할 땐 진행 중인 요청을 끝까지 처리하고 빠진다. 헬스 엔드포인트를 만들거나, 무중단 배포·오토스케일·컨테이너 프로브를 설정할 때 읽는다.

오케스트레이터(쿠버네티스 등)·로드밸런서는 헬스체크로 **재시작할지, 트래픽을 보낼지**를 결정한다. 그래서 헬스체크를 잘못 만들면 운영이 흔들린다 — liveness에 DB 의존성을 넣으면 DB가 잠깐 느려질 때 멀쩡한 인스턴스가 줄줄이 재시작되고(재시작 폭주), 종료 시 드레인을 안 하면 배포할 때마다 진행 중 요청이 끊긴다. 두 개념을 분리하고 종료를 우아하게 다루면 무중단 배포가 가능해진다. 탐지·메트릭은 `observability`, 컨테이너 프로브 설정은 `docker-containerization`을 함께 본다.

## 1. 핵심 원칙

- **liveness ≠ readiness** — liveness는 "프로세스가 살아 있나(아니면 재시작)", readiness는 "트래픽을 받을 준비가 됐나(아니면 LB에서 제외)". 섞으면 안 된다.
- **liveness는 단순하게** — 외부 의존성을 넣지 않는다. DB·캐시 장애로 liveness가 깨지면 정상 인스턴스가 무한 재시작된다.
- **readiness는 필수 의존성을 반영하되 가볍게** — 트래픽을 받으려면 꼭 필요한 의존(DB 등)이 끊기면 not-ready로 트래픽을 차단한다. 단, 체크는 가볍고 타임아웃·캐시를 둔다.
- **그레이스풀 셧다운** — 종료 신호(SIGTERM)를 받으면 즉시 죽지 말고: readiness off → 새 요청 차단 → 진행 중 요청 드레인 → 연결 정리 → 종료.
- **느린 기동은 분리한다** — 초기화가 오래 걸리면 startup 단계로 분리해, 기동 중을 liveness 실패로 오판해 죽이지 않게 한다.
- **헬스 응답의 정보 노출에 주의** — 상세 의존성·버전·내부 주소는 인증/내부망에만. 외부 공개 프로브는 최소 정보만.

## 2. 규칙

### 2-1. liveness와 readiness를 분리해 노출한다

| 프로브 | 묻는 것 | 실패 시 | 포함 대상 |
|---|---|---|---|
| **liveness** | 프로세스가 살아 있나 | 재시작(restart) | 프로세스 자체만 (외부 의존 ❌) |
| **readiness** | 트래픽을 받을 준비됐나 | LB/서비스에서 제외 | 필수 의존성(DB 등) 반영 |
| **startup** | 기동이 끝났나 | 기동 대기(미죽임) | 느린 초기화 완료 여부 |

### 2-2. liveness에 외부 의존성을 넣지 않는다

```text
❌ 금지 — liveness가 DB를 핑 → DB 일시 장애에 멀쩡한 앱이 줄줄이 재시작(폭주)
   GET /health/liveness → SELECT 1 from DB

✅ 권장 — liveness는 프로세스 생존만 (이벤트 루프·데드락 아님 정도)
   GET /health/liveness → 200 (의존성 검사 없음)
```

### 2-3. readiness에 필수 의존성을 가볍게 반영한다

```text
❌ 금지 — readiness에서 모든 외부 시스템을 매번 무겁게 점검 → 느리고 캐스케이드
✅ 권장 — 트래픽 처리에 "필수"인 의존만, 타임아웃·짧은 캐시와 함께
   GET /health/readiness → 필수 DB 연결 확인(타임아웃 1s, 결과 수초 캐시)
   - 선택적 의존(추천 서비스 등)이 죽었다고 not-ready로 만들지 않는다(부분 동작 유지)
```

### 2-4. 그레이스풀 셧다운 시퀀스를 지킨다

```text
종료 신호(SIGTERM) 수신 시:
  1) readiness를 off → LB가 새 트래픽을 더 안 보냄
  2) (LB 반영까지) 새 요청 수신 중단, 진행 중 요청은 계속 처리(drain)
  3) 진행 중 요청 완료 대기 (셧다운 타임아웃 상한 둠)
  4) DB 커넥션·큐 소비자·파일 핸들 등 자원 정리
  5) 프로세스 종료

❌ 금지 — SIGTERM에 즉시 exit / 드레인 없음 → 배포마다 진행 중 요청 끊김(5xx)
```

### 2-5. 느린 기동은 startup으로 분리한다

```text
❌ 금지 — 초기화 30초 걸리는 앱에 liveness만 두면, 기동 중을 "죽음"으로 보고 재시작 → 영영 못 뜸
✅ 권장 — startup 프로브로 기동 완료를 기다린 뒤 liveness/readiness 활성화
```

### 2-6. 헬스 응답의 정보 노출을 통제한다

```text
❌ 금지 — 외부 공개 /health 가 DB 호스트·버전·내부 의존성 상세를 그대로 노출
✅ 권장 — 공개 프로브는 up/down 최소 정보. 상세 진단은 인증/내부망 전용 (`transport-security`)
```

## 3. 흔한 실수

- ❌ liveness에 DB·캐시 등 외부 의존성 포함 → 일시 장애에 정상 인스턴스 재시작 폭주
- ❌ liveness와 readiness를 같은 엔드포인트로 통합 → 트래픽 차단과 재시작이 뒤섞임
- ❌ readiness 체크가 무겁거나 타임아웃 없음 → 헬스체크 자체가 부하·캐스케이드 유발
- ❌ SIGTERM에 즉시 종료 → 무중단 배포 시마다 진행 중 요청이 5xx로 끊김
- ❌ 느린 기동을 startup으로 분리 안 함 → 기동 중을 죽음으로 오판해 재시작 루프
- ❌ 헬스 엔드포인트가 내부 구조·버전을 외부에 노출

> **적용 팁**: 프로브 주기·타임아웃·실패 임계는 오케스트레이터(쿠버네티스 등) 쪽 설정과 맞춰야 한다 — 앱이 보고하는 readiness와 LB가 트래픽을 빼는 시점 사이의 지연을 셧다운 드레인 시간에 반영한다. 컨테이너/프로브 설정은 `docker-containerization`, 의존성 실패의 회복 정책은 `error-handling-resilience`.

## 4. 체크리스트

- [ ] liveness와 readiness를 분리해 노출하는가
- [ ] liveness가 외부 의존성을 포함하지 않는가 (재시작 폭주 방지)
- [ ] readiness가 필수 의존성을 가볍게(타임아웃·캐시) 반영하는가
- [ ] SIGTERM 시 readiness off → 드레인 → 자원 정리 → 종료 순서를 지키는가
- [ ] 느린 기동을 startup 단계로 분리했는가
- [ ] 헬스 응답이 민감한 내부 정보를 외부에 노출하지 않는가

## 부록: 스택별 예시

> 아래는 참고용이다. 팀 스택에 맞게 같은 패턴을 적용한다. 위 1~4의 원칙이 표준이고, 부록은 적용 사례일 뿐이다.

### Spring Boot (Actuator)

```properties
# liveness/readiness 그룹 활성화 (쿠버네티스 환경에선 자동)
management.endpoint.health.probes.enabled=true
# → /actuator/health/liveness, /actuator/health/readiness 노출
# readiness 그룹에 필수 의존성 health indicator를 포함(예: db)
management.endpoint.health.group.readiness.include=readinessState,db

# 그레이스풀 셧다운
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

- 커스텀 의존성 점검은 `HealthIndicator`를 구현해 readiness 그룹에 넣는다. liveness 그룹엔 외부 의존성을 넣지 않는다.

### Node.js

```js
let ready = false
initialize().then(() => { ready = true })          // 기동 완료 후 readiness on

app.get('/health/liveness', (_req, res) => res.sendStatus(200))   // 의존성 없음
app.get('/health/readiness', async (_req, res) => {
  if (!ready) return res.sendStatus(503)
  res.sendStatus(await pingDbWithTimeout(1000) ? 200 : 503)        // 필수 의존만, 타임아웃
})

process.on('SIGTERM', async () => {
  ready = false                                    // 1) readiness off
  await sleep(LB_PROBE_DELAY)                       //    LB가 not-ready를 감지할 시간 확보 후
  server.close(async () => {                       // 2~3) 새 연결 중단 + 진행 중 드레인
    await closeDbPool()                            // 4) 자원 정리
    process.exit(0)                                // 5) 종료
  })
  setTimeout(() => process.exit(1), 30_000).unref() // 드레인 타임아웃 상한
})
```
