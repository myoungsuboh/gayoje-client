---
name: アプリ内課金 (IAP)
description: iOS StoreKit・Android Billingのアプリ内課金の標準。レシートのサーバー検証・サブスクリプション状態の追跡・冪等な付与・購入の復元を実装するときに読む。キーワード: iap, in-app-purchase, storekit, billing, subscription, receipt, play-billing, restore。
rules:
  - "決済レシートはクライアントではなくサーバーで検証する(App Store・Play Developer API) — クライアント検証は改ざん可能。"
  - "購入完了後のコンテンツ付与はサーバーのレシート検証が成功した後のみ処理し、冪等に設計して重複付与を防ぐ。"
  - "サブスクリプションは更新・失効・返金・猶予期間(grace period)の状態をサーバー間通知(App Store Server Notifications・RTDN)で追跡する。"
  - "購入の復元(Restore Purchases)機能を必ず提供する — アプリの再インストール・端末変更のユーザー対応。"
  - "決済の失敗・キャンセル・保留(pending)状態をそれぞれ明示的に処理し、ユーザーに案内する。"
tags:
  - "iap"
  - "in-app-purchase"
  - "storekit"
  - "billing"
  - "subscription"
  - "receipt"
  - "play-billing"
  - "restore"
---

# 💳 アプリ内課金 (IAP)

> iOS StoreKit・Android Billingの決済をサーバーのレシート検証ベースで安全に実装する。アプリ内購入・サブスクリプション・復元を作る、または決済状態の処理を決めるときに読む。

## 1. 核心原則
- 決済レシートはクライアントではなくサーバーで検証する(App Store・Play Developer API) — クライアント検証は改ざん可能。
- 購入完了後のコンテンツ付与はサーバーのレシート検証が成功した後のみ処理し、冪等に設計して重複付与を防ぐ。
- サブスクリプションは更新・失効・返金・猶予期間(grace period)の状態をサーバー間通知(App Store Server Notifications・RTDN)で追跡する。
- 購入の復元(Restore Purchases)機能を必ず提供する — アプリの再インストール・端末変更のユーザー対応。
- 決済の失敗・キャンセル・保留(pending)状態をそれぞれ明示的に処理し、ユーザーに案内する。

## 2. ルール

### 2-1. 決済フロー (サーバー検証必須)
```
アプリ: 商品照会 → 購入要求 → OS決済シート → レシート受信
         ↓
アプリ → サーバー: レシート送信
サーバー → App Store / Play API: レシート検証
サーバー: 検証成功 → コンテンツ付与(冪等) → アプリに結果
```

### 2-2. レシートのサーバー検証 (iOS StoreKit 2)
```
POST https://api.storekit.itunes.apple.com/inApps/v1/...
またはJWS署名されたトランザクションをサーバーでAppleの公開鍵で検証
```

### 2-3. サブスクリプション状態の追跡 (サーバー通知)
| プラットフォーム | 通知 | 追跡イベント |
|--------|------|------------|
| iOS | App Store Server Notifications V2 | SUBSCRIBED, DID_RENEW, EXPIRED, REFUND |
| Android | Real-time Developer Notifications (Pub/Sub) | SUBSCRIPTION_RENEWED, _CANCELED, _EXPIRED |

### 2-4. 冪等な付与 (重複防止)
```python
# ❌ 禁止 — トランザクションの重複チェックなしに毎回付与(再送時に重複付与)
# ✅ 推奨 — transaction_id UNIQUE制約で冪等に処理
async def grant_purchase(user_id: str, transaction_id: str, product_id: str):
    # すでに処理済みのトランザクションならスキップ
    if await db.exists("purchases", transaction_id=transaction_id):
        return
    await db.insert("purchases", {
        "transaction_id": transaction_id,  # UNIQUE制約
        "user_id": user_id,
        "product_id": product_id,
    })
    await grant_content(user_id, product_id)
```

## 3. よくある間違い
- クライアントでのみレシート検証 → 改ざんで無料コンテンツを奪取。
- 冪等処理なしで付与 → 通知の再送時に重複付与。
- 復元ボタン未提供 → ストア審査で拒否。
- pending状態の未処理 → ファミリー承認・決済遅延時にユーザーが混乱。
- 価格のハードコード → ストアの価格変更・地域通貨の不一致。

## 4. チェックリスト
- [ ] レシートをサーバーで検証し、検証成功後のみ付与しているか
- [ ] 付与を冪等に設計したか (transaction_id UNIQUE)
- [ ] サブスクリプション状態をサーバー通知で追跡しているか
- [ ] 購入の復元ボタンを提供しているか (ストア審査の要件)
- [ ] pending(保留)状態を処理しているか (ファミリー承認・決済遅延)
- [ ] 返金時にコンテンツを回収しているか (サーバー通知ベース)
- [ ] 価格をストアから動的に照会しているか (ハードコード禁止)
