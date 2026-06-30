---
name: メール & 通知送信
description: メール・SMS・プッシュ・アプリ内通知送信のチャネル抽象化、非同期キュー送信、テンプレート管理、送信履歴・追跡の標準。スタックに依存しない汎用通知送信標準で、通知送信機能を設計・実装したり、チャネル・ベンダーを追加/交換したり、opt-out 同意・トランザクション/マーケティング分離・到達性(SPF/DKIM)を定めるときに読む。キーワード: email, notification, smtp, sendgrid, ses, sms, push, template, opt-out, queue, SPF, DKIM, DMARC.
rules:
  - "チャネル抽象化: 通知チャネル(メール・SMS・アプリプッシュ)を共通インターフェースで抽象化し、チャネルごとのベンダー変更がサービスロジックに影響しないようにする。"
  - "非同期キュー送信: メール・SMS・プッシュ送信は同期 HTTP 経路で直接呼び出さずキュー(非同期ジョブ)を通じて処理する — 外部送信の遅延/失敗がリクエスト応答を妨げないようにする。"
  - "送信履歴記録: 送信履歴(受信者・チャネル・テンプレート・状態・タイムスタンプ)を DB に記録し、再送信と監査追跡をサポートする。"
  - "opt-out 同意尊重: ユーザーごとの通知受信設定(opt-out)を尊重し、送信前に受信同意の有無を確認する。"
  - "トランザクション/マーケティング分離: トランザクションメール(会員登録・パスワード再設定)とマーケティングメールを別の送信ドメイン・IP に分離する。"
  - "到達性確保: SPF・DKIM・DMARC 認証を整え、送信ドメインの信頼度と到達率を維持する。"
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

# 📧 メール & 通知送信

> すべてのチャネル(メール・SMS・プッシュ・アプリ内)の通知送信方式を統一する。通知送信機能を設計・実装したり、新しいチャネル・ベンダーを追加/交換したり、受信同意・到達性ポリシーを定めるときに読む。特定の言語/フレームワークに依存しない汎用標準である。

## 1. 中核原則
- **チャネル抽象化**: 通知チャネル(メール・SMS・アプリプッシュ)を共通インターフェースで抽象化し、チャネルごとのベンダー変更がサービスロジックに影響しないようにする。
- **非同期キュー送信**: メール・SMS・プッシュ送信は同期 HTTP 経路で直接呼び出さずキュー(非同期ジョブ)を通じて処理する — 外部送信の遅延/失敗がリクエスト応答を妨げないようにする。
- **送信履歴記録**: 送信履歴(受信者・チャネル・テンプレート・状態・タイムスタンプ)を DB に記録し、再送信と監査追跡をサポートする。
- **opt-out 同意尊重**: ユーザーごとの通知受信設定(opt-out)を尊重し、送信前に受信同意の有無を確認する。
- **トランザクション/マーケティング分離**: トランザクションメール(会員登録・パスワード再設定)とマーケティングメールを別の送信ドメイン・IP に分離する。
- **到達性確保**: SPF・DKIM・DMARC 認証を整え、送信ドメインの信頼度と到達率を維持する。

## 2. ルール

### 2-1. チャネル抽象化 (ベンダー隔離)
- チャネルごとに `send(recipient, template, context)` 形式の共通インターフェースを置き、サービスロジックはインターフェースのみに依存する。
- ベンダー(SES・SendGrid・Twilio など)の交換はチャネル実装だけを変え、サービスロジックには手を付けない。
- 送信エントリーポイントはユーザーの受信設定を照会し、有効化されたチャネルにのみ送信する。

```text
notify(user_id, event, context)
  └─ 受信設定(prefs) 照회
     └─ 有効チャネルごとに → Channel.send(アドレス, テンプレート, context)
```
(具体的な実装コードは末尾の `## 付録: スタック別の例` を参照)

### 2-2. 非同期キュー送信
- 外部送信呼び出しはキューにジョブとして積み、ワーカーが非同期で処理する。
- 同期リクエスト経路(例: 会員登録 API)で送信完了を待たない。

```text
// ❌ 禁止 — 同期経路で直接送信 (外部の遅延/失敗が応答を妨げる)
signup(): ...; ses.send_email(...); return 200

// ✅ 推奨 — キュー積載後すぐに応答し、ワーカーが送信
signup(): ...; queue.enqueue(send_email_job, ...); return 200
```

### 2-3. 送信履歴記録
- すべての送信試行を受信者・チャネル・テンプレート・状態・タイムスタンプとともに記録する。
- 状態は最低でも `queued → sent → failed/bounced` の流れを表現する。再送信と監査追跡の根拠となる。

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

### 2-4. opt-out 受信同意
- 送信前にユーザーの受信設定を確認し、拒否したチャネル/種別へは送信しない。
- マーケティング送信には配信停止リンクを必ず含める(トランザクション必須通知は例外)。

### 2-5. トランザクション/マーケティング分離 & 到達性
- トランザクションとマーケティングを別の送信ドメイン・IP に分離し、一方の評判問題が他方に波及しないようにする。
- 両種別とも SPF・DKIM・DMARC を設定する。

| 項目 | トランザクション | マーケティング |
|------|---------|--------|
| 送信ドメイン | transact.example.com | news.example.com |
| Opt-out | 不要 (必須通知) | 必須 (配信停止リンク) |
| 送信頻度 | イベントベース | スケジュールベース |
| SPF/DKIM | 必須 | 必須 |

## 3. よくある間違い
- 同期経路で直接送信 → 外部の遅延/失敗がユーザーリクエストの応答を妨げる。
- チャネルを抽象化しない → ベンダー交換時にサービスロジック全般を修正しなければならない。
- 送信履歴未記録 → 再送信・監査・バウンス追跡が不可能。
- opt-out 未確認 → 受信拒否したユーザーへ送信され、信頼度・法的問題が生じる。
- トランザクション/マーケティングを同じドメイン・IP で送信 → マーケティングのスパム報告がトランザクションの到達率まで下げる。

## 4. チェックリスト
- [ ] チャネルを共通インターフェースで抽象化し、サービスロジックがベンダーに依存しないか
- [ ] 送信を同期経路ではなくキュー(非同期ジョブ)で処理するか
- [ ] 送信履歴(受信者・チャネル・テンプレート・状態・タイムスタンプ)を DB に記録するか
- [ ] 送信前にユーザーの opt-out 受信設定を確認するか
- [ ] トランザクションとマーケティングを別の送信ドメイン・IP に分離したか
- [ ] SPF、DKIM、DMARC レコードを設定したか
- [ ] 送信 IP のウォームアップをしたか (新規ドメイン)
- [ ] バウンス・スパム報告率をモニタリングするか (SendGrid・SES ダッシュボード)
- [ ] HTML + plain-text の代替を含めたか

## 付録: スタック別の例

### Python — チャネル抽象化の実装
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
