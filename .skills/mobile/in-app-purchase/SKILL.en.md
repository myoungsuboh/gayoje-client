---
name: In-App Purchase (IAP)
description: Standard for iOS StoreKit and Android Billing in-app purchases. Read this when implementing server-side receipt validation, subscription state tracking, idempotent granting, and purchase restoration. Keywords: iap, in-app-purchase, storekit, billing, subscription, receipt, play-billing, restore.
rules:
  - "Validate payment receipts on the server, not the client (App Store / Play Developer API) — client-side validation can be forged."
  - "Grant content after a purchase only after server-side receipt validation succeeds, and design it idempotently to prevent duplicate grants."
  - "Track subscription renewal, expiration, refund, and grace-period states via server-to-server notifications (App Store Server Notifications / RTDN)."
  - "Always provide a Restore Purchases feature — to handle users who reinstall the app or change devices."
  - "Explicitly handle payment failure, cancellation, and pending states each, and inform the user."
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

# 💳 In-App Purchase (IAP)

> Implement iOS StoreKit and Android Billing payments securely, based on server-side receipt validation. Read this when building in-app purchases, subscriptions, or restoration, or when deciding how to handle payment states.

## 1. Core Principles
- Validate payment receipts on the server, not the client (App Store / Play Developer API) — client-side validation can be forged.
- Grant content after a purchase only after server-side receipt validation succeeds, and design it idempotently to prevent duplicate grants.
- Track subscription renewal, expiration, refund, and grace-period states via server-to-server notifications (App Store Server Notifications / RTDN).
- Always provide a Restore Purchases feature — to handle users who reinstall the app or change devices.
- Explicitly handle payment failure, cancellation, and pending states each, and inform the user.

## 2. Rules

### 2-1. Payment Flow (Server Validation Required)
```
App: query product → request purchase → OS payment sheet → receive receipt
         ↓
App → Server: send receipt
Server → App Store / Play API: validate receipt
Server: validation success → grant content (idempotent) → result to app
```

### 2-2. Server-side Receipt Validation (iOS StoreKit 2)
```
POST https://api.storekit.itunes.apple.com/inApps/v1/...
or validate the JWS-signed transaction on the server with Apple's public key
```

### 2-3. Subscription State Tracking (Server Notifications)
| Platform | Notification | Tracked events |
|--------|------|------------|
| iOS | App Store Server Notifications V2 | SUBSCRIBED, DID_RENEW, EXPIRED, REFUND |
| Android | Real-time Developer Notifications (Pub/Sub) | SUBSCRIPTION_RENEWED, _CANCELED, _EXPIRED |

### 2-4. Idempotent Granting (Duplicate Prevention)
```python
# ❌ Forbidden — granting every time without checking for duplicate transactions (duplicate grant on resend)
# ✅ Recommended — idempotent handling with a transaction_id UNIQUE constraint
async def grant_purchase(user_id: str, transaction_id: str, product_id: str):
    # Skip if the transaction was already processed
    if await db.exists("purchases", transaction_id=transaction_id):
        return
    await db.insert("purchases", {
        "transaction_id": transaction_id,  # UNIQUE constraint
        "user_id": user_id,
        "product_id": product_id,
    })
    await grant_content(user_id, product_id)
```

## 3. Common Mistakes
- Validating the receipt only on the client → free content stolen via forgery.
- Granting without idempotency → duplicate grant when a notification is resent.
- Not providing a restore button → store review rejection.
- Not handling the pending state → user confusion on family approval / payment delay.
- Hardcoding prices → store price changes / regional currency mismatch.

## 4. Checklist
- [ ] Do you validate the receipt on the server and grant only after validation succeeds?
- [ ] Did you design granting idempotently (transaction_id UNIQUE)?
- [ ] Do you track subscription state via server notifications?
- [ ] Do you provide a Restore Purchases button (store review requirement)?
- [ ] Do you handle the pending state (family approval / payment delay)?
- [ ] Do you reclaim content on refund (based on server notifications)?
- [ ] Do you query prices dynamically from the store (no hardcoding)?
