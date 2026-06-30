---
name: 백그라운드 잡 & 큐 (스택 중립)
description: 비동기 작업 큐 설계, 재시도 전략, 데드레터 큐, 모니터링 표준 (스택 중립). 긴 작업을 HTTP 요청에서 분리해 큐로 처리하거나, 재시도·멱등성·DLQ를 설계할 때 읽는다. 키워드: queue, job, background, celery, bull, sidekiq, dead-letter, retry, async.
rules:
  - "긴 작업(이메일·리포트·외부 API 호출)은 HTTP 요청에서 분리해 큐에 넣고 즉시 202 Accepted를 반환한다."
  - "실패한 잡은 지수 백오프(예: 1m→5m→15m→1h)로 최대 N회 재시도하고, 초과 시 Dead Letter Queue로 이동한다."
  - "잡 정의는 멱등하게 설계한다 — 같은 잡이 두 번 실행돼도 부작용이 중복되지 않도록 한다."
  - "잡별 timeout을 설정하고, 실행 시간이 길어지면 heartbeat로 활성 상태를 갱신한다."
  - "DLQ를 주기적으로 모니터링하고, 수동 재처리 인터페이스를 제공한다."
tags:
  - "queue"
  - "job"
  - "background"
  - "celery"
  - "bull"
  - "sidekiq"
  - "dead-letter"
  - "retry"
  - "async"
---

# ⚙️ 백그라운드 잡 & 큐

> 긴 작업을 큐로 분리하고, 멱등·지수 백오프 재시도·DLQ로 안정적으로 처리한다. 비동기 잡 파이프라인을 설계하거나 재시도·모니터링을 정할 때 읽는다.

## 1. 핵심 원칙

- 긴 작업(이메일·리포트·외부 API 호출)은 HTTP 요청에서 분리해 큐에 넣고 즉시 202 Accepted를 반환한다.
- 실패한 잡은 지수 백오프(예: 1m→5m→15m→1h)로 최대 N회 재시도하고, 초과 시 Dead Letter Queue로 이동한다.
- 잡 정의는 멱등하게 설계한다 — 같은 잡이 두 번 실행돼도 부작용이 중복되지 않도록 한다.
- 잡별 timeout을 설정하고, 실행 시간이 길어지면 heartbeat로 활성 상태를 갱신한다.
- DLQ를 주기적으로 모니터링하고, 수동 재처리 인터페이스를 제공한다.

## 2. 규칙

### 2-1. 아키텍처 패턴

```
HTTP 요청 → API 서버 → 큐(Redis/RabbitMQ/SQS) → 워커 프로세스
              ↓                                        ↓
          202 + job_id                          결과 저장(DB/Cache)
```

### 2-2. 재시도 전략 (지수 백오프)

```
시도 1: 즉시
시도 2: 1분 후
시도 3: 5분 후
시도 4: 15분 후
시도 5: 1시간 후
→ 초과: Dead Letter Queue (수동 검토)
```

### 2-3. 잡 멱등성

```python
# ✅ 권장 — 중복 실행돼도 부작용이 한 번만 발생하도록 가드
def send_welcome_email(user_id: str):
    # 이미 발송됐으면 스킵
    if cache.get(f"welcome_sent:{user_id}"):
        return
    email_service.send(user_id, template="welcome")
    cache.set(f"welcome_sent:{user_id}", 1, ex=86400)
```

### 2-4. 스택별 구현체

| 스택 | 라이브러리 |
|------|-----------|
| Python | Celery + Redis, ARQ |
| Node.js | BullMQ, pg-boss |
| Java | Spring Batch, Quartz |
| Ruby | Sidekiq |
| Go | asynq, machinery |

### 2-5. 모니터링 필수 항목

- 큐 길이 알림 (임계값 초과 시 Slack·PagerDuty)
- DLQ 잡 수 대시보드
- 잡 처리 시간 히스토그램 (P95 기준 SLA 설정)
- 워커 프로세스 가동 상태 헬스체크

## 3. 흔한 실수

- 긴 작업을 HTTP 요청 안에서 동기 처리 → 타임아웃·느린 응답.
- 재시도 없이 한 번 실패하면 잡 유실, 또는 무한 재시도로 큐 과부하.
- 멱등성 미보장 → 재시도 시 이메일·결제가 중복 실행됨.
- DLQ만 쌓고 모니터링·재처리 수단이 없어 실패 잡을 방치.

## 4. 체크리스트

- [ ] 긴 작업을 큐로 분리하고 202 + job_id를 즉시 반환하는가
- [ ] 실패 잡에 지수 백오프 재시도와 DLQ를 적용했는가
- [ ] 잡이 멱등하게 설계되어 중복 실행에 안전한가
- [ ] 잡별 timeout과 heartbeat를 설정했는가
- [ ] DLQ 모니터링과 수동 재처리 인터페이스가 있는가
