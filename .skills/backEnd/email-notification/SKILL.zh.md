---
name: 邮件 & 通知发送
description: 邮件·短信·推送·应用内通知发送的渠道抽象、异步队列发送、模板管理、发送历史·追踪标准。与技术栈无关的通用通知发送标准,在设计·实现通知发送功能、添加/替换渠道·供应商,或确定 opt-out 同意·事务/营销分离·送达率(SPF/DKIM)时阅读。关键词: email, notification, smtp, sendgrid, ses, sms, push, template, opt-out, queue, SPF, DKIM, DMARC.
rules:
  - "渠道抽象: 将通知渠道(邮件·短信·应用推送)用统一接口抽象,使各渠道的供应商变更不影响服务逻辑。"
  - "异步队列发送: 邮件·短信·推送发送不在同步 HTTP 路径上直接调用,而通过队列(异步任务)处理 — 使外部发送延迟/失败不阻塞请求响应。"
  - "发送历史记录: 将发送历史(收件人·渠道·模板·状态·时间戳)记录到 DB,以支持重发与审计追踪。"
  - "尊重 opt-out 同意: 尊重每个用户的通知接收设置(opt-out),发送前确认是否同意接收。"
  - "事务/营销分离: 将事务邮件(注册·密码重置)与营销邮件分离到不同的发送域名·IP。"
  - "确保送达率: 配置 SPF·DKIM·DMARC 认证,维持发送域名的信誉度与送达率。"
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

# 📧 邮件 & 通知发送

> 统一所有渠道(邮件·短信·推送·应用内)的通知发送方式。在设计·实现通知发送功能、添加/替换新渠道·供应商,或确定接收同意·送达率策略时阅读。这是不依赖特定语言/框架的通用标准。

## 1. 核心原则
- **渠道抽象**: 将通知渠道(邮件·短信·应用推送)用统一接口抽象,使各渠道的供应商变更不影响服务逻辑。
- **异步队列发送**: 邮件·短信·推送发送不在同步 HTTP 路径上直接调用,而通过队列(异步任务)处理 — 使外部发送延迟/失败不阻塞请求响应。
- **发送历史记录**: 将发送历史(收件人·渠道·模板·状态·时间戳)记录到 DB,以支持重发与审计追踪。
- **尊重 opt-out 同意**: 尊重每个用户的通知接收设置(opt-out),发送前确认是否同意接收。
- **事务/营销分离**: 将事务邮件(注册·密码重置)与营销邮件分离到不同的发送域名·IP。
- **确保送达率**: 配置 SPF·DKIM·DMARC 认证,维持发送域名的信誉度与送达率。

## 2. 规则

### 2-1. 渠道抽象 (供应商隔离)
- 为每个渠道设置 `send(recipient, template, context)` 形式的统一接口,服务逻辑仅依赖接口。
- 替换供应商(SES·SendGrid·Twilio 等)只更改渠道实现,不触碰服务逻辑。
- 发送入口查询用户的接收设置,仅向已启用的渠道发送。

```text
notify(user_id, event, context)
  └─ 接收设置(prefs) 查询
     └─ 对每个有效渠道 → Channel.send(地址, 模板, context)
```
(具体实现代码参见末尾的 `## 附录: 各技术栈示例`)

### 2-2. 异步队列发送
- 外部发送调用作为任务积入队列,由工作者异步处理。
- 不在同步请求路径(例如注册 API)上等待发送完成。

```text
// ❌ 禁止 — 在同步路径上直接发送 (外部延迟/失败阻塞响应)
signup(): ...; ses.send_email(...); return 200

// ✅ 推荐 — 入队后立即响应,由工作者发送
signup(): ...; queue.enqueue(send_email_job, ...); return 200
```

### 2-3. 发送历史记录
- 将每次发送尝试连同收件人·渠道·模板·状态·时间戳一起记录。
- 状态至少表达 `queued → sent → failed/bounced` 流程。它成为重发与审计追踪的依据。

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

### 2-4. opt-out 接收同意
- 发送前确认用户的接收设置,不向其拒绝的渠道/类型发送。
- 营销发送必须包含退订链接(事务必需通知除外)。

### 2-5. 事务/营销分离 & 送达率
- 将事务与营销分离到不同的发送域名·IP,使一侧的信誉问题不波及另一侧。
- 两种类型都配置 SPF·DKIM·DMARC。

| 项目 | 事务 | 营销 |
|------|---------|--------|
| 发送域名 | transact.example.com | news.example.com |
| Opt-out | 不需要 (必需通知) | 必需 (退订链接) |
| 发送频率 | 基于事件 | 基于计划 |
| SPF/DKIM | 必需 | 必需 |

## 3. 常见错误
- 在同步路径上直接发送 → 外部延迟/失败阻塞用户请求的响应。
- 未抽象渠道 → 替换供应商时需修改服务逻辑全局。
- 未记录发送历史 → 重发·审计·退信追踪不可能。
- 未确认 opt-out → 向拒绝接收的用户发送,产生信誉·法律问题。
- 用同一域名·IP 发送事务/营销 → 营销垃圾邮件举报连带拉低事务的送达率。

## 4. 检查清单
- [ ] 是否将渠道用统一接口抽象,使服务逻辑不依赖供应商
- [ ] 是否通过队列(异步任务)而非同步路径处理发送
- [ ] 是否将发送历史(收件人·渠道·模板·状态·时间戳)记录到 DB
- [ ] 是否在发送前确认用户的 opt-out 接收设置
- [ ] 是否将事务与营销分离到不同的发送域名·IP
- [ ] 是否配置了 SPF、DKIM、DMARC 记录
- [ ] 是否对发送 IP 进行了预热 (新域名)
- [ ] 是否监控退信·垃圾邮件举报率 (SendGrid·SES 仪表盘)
- [ ] 是否包含 HTML + plain-text 备选

## 附录: 各技术栈示例

### Python — 渠道抽象实现
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
