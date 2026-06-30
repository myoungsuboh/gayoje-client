---
name: Email & Notification Delivery
description: Standards for channel abstraction, asynchronous queue-based delivery, template management, and delivery history/tracking for email, SMS, push, and in-app notifications. A stack-agnostic general standard for notification delivery; read it when designing/implementing notification delivery features, adding/replacing channels or vendors, or deciding opt-out consent, transactional/marketing separation, and deliverability (SPF/DKIM). Keywords: email, notification, smtp, sendgrid, ses, sms, push, template, opt-out, queue, SPF, DKIM, DMARC.
rules:
  - "Channel abstraction: abstract notification channels (email, SMS, app push) behind a common interface so that per-channel vendor changes do not affect service logic."
  - "Asynchronous queue delivery: do not call email/SMS/push delivery directly on the synchronous HTTP path; process it via a queue (asynchronous job) — so that external delivery delays/failures do not block the request response."
  - "Delivery history recording: record delivery history (recipient, channel, template, status, timestamp) in the DB to support resending and audit tracing."
  - "Respect opt-out consent: respect each user's notification preferences (opt-out) and check consent before sending."
  - "Transactional/marketing separation: separate transactional email (signup, password reset) and marketing email onto distinct sending domains/IPs."
  - "Secure deliverability: set up SPF, DKIM, and DMARC authentication to maintain the sending domain's reputation and delivery rate."
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

# 📧 Email & Notification Delivery

> Unify the notification delivery approach across all channels (email, SMS, push, in-app). Read it when designing/implementing notification delivery features, adding/replacing a new channel or vendor, or deciding consent and deliverability policies. It is a general standard that is not tied to a specific language/framework.

## 1. Core Principles
- **Channel abstraction**: abstract notification channels (email, SMS, app push) behind a common interface so that per-channel vendor changes do not affect service logic.
- **Asynchronous queue delivery**: do not call email/SMS/push delivery directly on the synchronous HTTP path; process it via a queue (asynchronous job) — so that external delivery delays/failures do not block the request response.
- **Delivery history recording**: record delivery history (recipient, channel, template, status, timestamp) in the DB to support resending and audit tracing.
- **Respect opt-out consent**: respect each user's notification preferences (opt-out) and check consent before sending.
- **Transactional/marketing separation**: separate transactional email (signup, password reset) and marketing email onto distinct sending domains/IPs.
- **Secure deliverability**: set up SPF, DKIM, and DMARC authentication to maintain the sending domain's reputation and delivery rate.

## 2. Rules

### 2-1. Channel Abstraction (Vendor Isolation)
- Provide a common interface of the form `send(recipient, template, context)` for each channel, and have service logic depend only on the interface.
- Replacing a vendor (SES, SendGrid, Twilio, etc.) changes only the channel implementation and leaves service logic untouched.
- The delivery entry point queries the user's notification preferences and sends only over enabled channels.

```text
notify(user_id, event, context)
  └─ query preferences (prefs)
     └─ for each active channel → Channel.send(address, template, context)
```
(For concrete implementation code, see `## Appendix: Per-Stack Examples` at the very end.)

### 2-2. Asynchronous Queue Delivery
- Enqueue external delivery calls as jobs on a queue, and have a worker process them asynchronously.
- Do not wait for delivery completion on the synchronous request path (e.g., the signup API).

```text
// ❌ Forbidden — direct delivery on the synchronous path (external delay/failure blocks the response)
signup(): ...; ses.send_email(...); return 200

// ✅ Recommended — respond immediately after enqueuing, worker delivers
signup(): ...; queue.enqueue(send_email_job, ...); return 200
```

### 2-3. Delivery History Recording
- Record every delivery attempt together with the recipient, channel, template, status, and timestamp.
- The status expresses at minimum a `queued → sent → failed/bounced` flow. It becomes the basis for resending and audit tracing.

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

### 2-4. Opt-out Consent
- Check the user's notification preferences before sending, and do not send over channels/types they have declined.
- Marketing deliveries must include an unsubscribe link (required transactional notifications are an exception).

### 2-5. Transactional/Marketing Separation & Deliverability
- Separate transactional and marketing onto distinct sending domains/IPs so that a reputation problem on one side does not spread to the other.
- Configure SPF, DKIM, and DMARC for both types.

| Item | Transactional | Marketing |
|------|---------|--------|
| Sending domain | transact.example.com | news.example.com |
| Opt-out | Not needed (required notification) | Required (unsubscribe link) |
| Delivery frequency | Event-based | Schedule-based |
| SPF/DKIM | Required | Required |

## 3. Common Mistakes
- Direct delivery on the synchronous path → external delay/failure blocks the user's request response.
- Not abstracting channels → replacing a vendor requires modifying service logic throughout.
- Not recording delivery history → resending, auditing, and bounce tracing become impossible.
- Not checking opt-out → sends to users who declined, causing trust and legal problems.
- Sending transactional/marketing over the same domain/IP → marketing spam reports drag down even transactional delivery rates.

## 4. Checklist
- [ ] Are channels abstracted behind a common interface so service logic does not depend on the vendor?
- [ ] Is delivery processed via a queue (asynchronous job) rather than the synchronous path?
- [ ] Is delivery history (recipient, channel, template, status, timestamp) recorded in the DB?
- [ ] Are the user's opt-out notification preferences checked before sending?
- [ ] Are transactional and marketing separated onto distinct sending domains/IPs?
- [ ] Are SPF, DKIM, and DMARC records configured?
- [ ] Has the sending IP been warmed up (new domains)?
- [ ] Are bounce and spam-report rates monitored (SendGrid, SES dashboards)?
- [ ] Is an HTML + plain-text alternative included?

## Appendix: Per-Stack Examples

### Python — Channel Abstraction Implementation
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
