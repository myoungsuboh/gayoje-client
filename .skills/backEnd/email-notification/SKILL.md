---
name: 이메일 & 알림 발송
description: 이메일·SMS·푸시·인앱 알림 발송의 채널 추상화, 비동기 큐 발송, 템플릿 관리, 발송 이력·추적 표준. 스택에 무관한 범용 알림 발송 표준으로, 알림 발송 기능을 설계·구현하거나 채널·벤더를 추가/교체할 때, opt-out 동의·트랜잭션/마케팅 분리·전송성(SPF/DKIM)을 정할 때 읽는다. 키워드: email, notification, smtp, sendgrid, ses, sms, push, template, opt-out, queue, SPF, DKIM, DMARC.
rules:
  - "채널 추상화: 알림 채널(이메일·SMS·앱 푸시)을 공통 인터페이스로 추상화해, 채널별 벤더 변경이 서비스 로직에 영향을 주지 않게 한다."
  - "비동기 큐 발송: 이메일·SMS·푸시 발송은 동기 HTTP 경로에서 직접 호출하지 않고 큐(비동기 잡)를 통해 처리한다 — 외부 발송 지연/실패가 요청 응답을 막지 않도록 한다."
  - "발송 이력 기록: 발송 이력(수신자·채널·템플릿·상태·타임스탬프)을 DB에 기록해 재발송과 감사 추적을 지원한다."
  - "opt-out 동의 존중: 사용자별 알림 수신 설정(opt-out)을 존중하고, 발송 전에 수신 동의 여부를 확인한다."
  - "트랜잭션/마케팅 분리: 트랜잭션 이메일(회원가입·비밀번호 재설정)과 마케팅 이메일을 별도 발신 도메인·IP로 분리한다."
  - "전송성 확보: SPF·DKIM·DMARC 인증을 갖춰 발신 도메인의 신뢰도와 도달률을 유지한다."
tags:
  - "email"
  - "notification"
  - "smtp"
  - "sendgrid"
  - "ses"
  - "sms"
  - "push"
  - "template"
  - "opt-out"
  - "queue"
  - "SPF"
  - "DKIM"
  - "DMARC"
---

# 📧 이메일 & 알림 발송

> 모든 채널(이메일·SMS·푸시·인앱)의 알림 발송 방식을 통일한다. 알림 발송 기능을 설계·구현하거나, 새 채널·벤더를 추가/교체하거나, 수신 동의·전송성 정책을 정할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **채널 추상화**: 알림 채널(이메일·SMS·앱 푸시)을 공통 인터페이스로 추상화해, 채널별 벤더 변경이 서비스 로직에 영향을 주지 않게 한다.
- **비동기 큐 발송**: 이메일·SMS·푸시 발송은 동기 HTTP 경로에서 직접 호출하지 않고 큐(비동기 잡)를 통해 처리한다 — 외부 발송 지연/실패가 요청 응답을 막지 않도록 한다.
- **발송 이력 기록**: 발송 이력(수신자·채널·템플릿·상태·타임스탬프)을 DB에 기록해 재발송과 감사 추적을 지원한다.
- **opt-out 동의 존중**: 사용자별 알림 수신 설정(opt-out)을 존중하고, 발송 전에 수신 동의 여부를 확인한다.
- **트랜잭션/마케팅 분리**: 트랜잭션 이메일(회원가입·비밀번호 재설정)과 마케팅 이메일을 별도 발신 도메인·IP로 분리한다.
- **전송성 확보**: SPF·DKIM·DMARC 인증을 갖춰 발신 도메인의 신뢰도와 도달률을 유지한다.

## 2. 규칙

### 2-1. 채널 추상화 (벤더 격리)
- 채널마다 `send(recipient, template, context)` 형태의 공통 인터페이스를 두고, 서비스 로직은 인터페이스에만 의존한다.
- 벤더(SES·SendGrid·Twilio 등) 교체는 채널 구현체만 바꾸고 서비스 로직은 건드리지 않는다.
- 발송 진입점은 사용자 수신 설정을 조회해, 활성화된 채널로만 발송한다.

```text
notify(user_id, event, context)
  └─ 수신 설정(prefs) 조회
     └─ 활성 채널마다 → Channel.send(주소, 템플릿, context)
```
(구체 구현 코드는 맨 끝 `## 부록: 스택별 예시` 참고)

### 2-2. 비동기 큐 발송
- 외부 발송 호출은 큐에 잡으로 적재하고, 워커가 비동기로 처리한다.
- 동기 요청 경로(예: 회원가입 API)에서 발송 완료를 기다리지 않는다.

```text
// ❌ 금지 — 동기 경로에서 직접 발송 (외부 지연/실패가 응답을 막음)
signup(): ...; ses.send_email(...); return 200

// ✅ 권장 — 큐 적재 후 즉시 응답, 워커가 발송
signup(): ...; queue.enqueue(send_email_job, ...); return 200
```

### 2-3. 발송 이력 기록
- 모든 발송 시도를 수신자·채널·템플릿·상태·타임스탬프와 함께 기록한다.
- 상태는 최소 `queued → sent → failed/bounced` 흐름을 표현한다. 재발송과 감사 추적의 근거가 된다.

```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  channel VARCHAR,        -- email | sms | push
  template VARCHAR,
  status VARCHAR,         -- queued | sent | failed | bounced
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2-4. opt-out 수신 동의
- 발송 전 사용자 수신 설정을 확인하고, 거부한 채널/유형으로는 발송하지 않는다.
- 마케팅 발송에는 수신 거부 링크를 반드시 포함한다(트랜잭션 필수 알림은 예외).

### 2-5. 트랜잭션/마케팅 분리 & 전송성
- 트랜잭션과 마케팅을 별도 발신 도메인·IP로 분리해 한쪽의 평판 문제가 다른 쪽에 번지지 않게 한다.
- 두 유형 모두 SPF·DKIM·DMARC를 설정한다.

| 항목 | 트랜잭션 | 마케팅 |
|------|---------|--------|
| 발신 도메인 | transact.example.com | news.example.com |
| Opt-out | 불필요 (필수 알림) | 필수 (수신 거부 링크) |
| 발송 빈도 | 이벤트 기반 | 스케줄 기반 |
| SPF/DKIM | 필수 | 필수 |

## 3. 흔한 실수
- 동기 경로에서 직접 발송 → 외부 지연/실패가 사용자 요청 응답을 막는다.
- 채널을 추상화하지 않음 → 벤더 교체 시 서비스 로직 전반을 수정해야 한다.
- 발송 이력 미기록 → 재발송·감사·바운스 추적이 불가능하다.
- opt-out 미확인 → 수신 거부한 사용자에게 발송되어 신뢰도·법적 문제가 생긴다.
- 트랜잭션/마케팅을 같은 도메인·IP로 발송 → 마케팅 스팸 신고가 트랜잭션 도달률까지 떨어뜨린다.

## 4. 체크리스트
- [ ] 채널을 공통 인터페이스로 추상화해 서비스 로직이 벤더에 의존하지 않는가
- [ ] 발송을 동기 경로가 아닌 큐(비동기 잡)로 처리하는가
- [ ] 발송 이력(수신자·채널·템플릿·상태·타임스탬프)을 DB에 기록하는가
- [ ] 발송 전 사용자 opt-out 수신 설정을 확인하는가
- [ ] 트랜잭션과 마케팅을 별도 발신 도메인·IP로 분리했는가
- [ ] SPF, DKIM, DMARC 레코드를 설정했는가
- [ ] 발신 IP 워밍업을 했는가 (신규 도메인)
- [ ] 바운스·스팸 신고율을 모니터링하는가 (SendGrid·SES 대시보드)
- [ ] HTML + plain-text 대안을 포함했는가

## 부록: 스택별 예시

### Python — 채널 추상화 구현
```python
class NotificationChannel(ABC):
    @abstractmethod
    async def send(self, recipient: str, template: str, context: dict): ...

class EmailChannel(NotificationChannel):
    async def send(self, recipient, template, context):
        html = render_template(template, context)
        await ses_client.send_email(to=recipient, body=html)

class SmsChannel(NotificationChannel):
    async def send(self, recipient, template, context):
        text = render_template(template, context)
        await twilio_client.send(to=recipient, body=text)

async def notify(user_id: str, event: str, context: dict):
    prefs = await get_user_preferences(user_id)
    for channel_name in prefs.enabled_channels:
        channel = CHANNELS[channel_name]
        await channel.send(prefs.address[channel_name], event, context)
```
