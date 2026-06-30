---
name: 应用内购买 (IAP)
description: iOS StoreKit、Android Billing 应用内购买标准。在实现收据服务端验证、订阅状态跟踪、幂等发放、购买恢复时阅读。关键词: iap, in-app-purchase, storekit, billing, subscription, receipt, play-billing, restore。
rules:
  - "支付收据应在服务端而非客户端验证(App Store、Play Developer API) — 客户端验证可被伪造。"
  - "购买完成后的内容发放仅在服务端收据验证成功后才处理，并设计为幂等以防止重复发放。"
  - "订阅应通过服务器到服务器通知(App Store Server Notifications、RTDN)跟踪续订、到期、退款、宽限期(grace period)状态。"
  - "必须提供购买恢复(Restore Purchases)功能 — 应对重新安装应用、更换设备的用户。"
  - "分别明确处理支付失败、取消、挂起(pending)状态，并向用户告知。"
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

# 💳 应用内购买 (IAP)

> 基于服务端收据验证安全地实现 iOS StoreKit、Android Billing 支付。在制作应用内购买、订阅、恢复，或确定支付状态处理时阅读。

## 1. 核心原则
- 支付收据应在服务端而非客户端验证(App Store、Play Developer API) — 客户端验证可被伪造。
- 购买完成后的内容发放仅在服务端收据验证成功后才处理，并设计为幂等以防止重复发放。
- 订阅应通过服务器到服务器通知(App Store Server Notifications、RTDN)跟踪续订、到期、退款、宽限期(grace period)状态。
- 必须提供购买恢复(Restore Purchases)功能 — 应对重新安装应用、更换设备的用户。
- 分别明确处理支付失败、取消、挂起(pending)状态，并向用户告知。

## 2. 规则

### 2-1. 支付流程 (必须服务端验证)
```
应用: 查询商品 → 发起购买 → OS 支付面板 → 接收收据
         ↓
应用 → 服务器: 发送收据
服务器 → App Store / Play API: 验证收据
服务器: 验证成功 → 发放内容(幂等) → 将结果返回应用
```

### 2-2. 收据服务端验证 (iOS StoreKit 2)
```
POST https://api.storekit.itunes.apple.com/inApps/v1/...
或在服务端用 Apple 公钥验证 JWS 签名的交易
```

### 2-3. 订阅状态跟踪 (服务器通知)
| 平台 | 通知 | 跟踪事件 |
|--------|------|------------|
| iOS | App Store Server Notifications V2 | SUBSCRIBED, DID_RENEW, EXPIRED, REFUND |
| Android | Real-time Developer Notifications (Pub/Sub) | SUBSCRIPTION_RENEWED, _CANCELED, _EXPIRED |

### 2-4. 幂等发放 (防止重复)
```python
# ❌ 禁止 — 不做交易重复检查每次都发放(重发时重复发放)
# ✅ 推荐 — 用 transaction_id UNIQUE 约束做幂等处理
async def grant_purchase(user_id: str, transaction_id: str, product_id: str):
    # 若交易已处理则跳过
    if await db.exists("purchases", transaction_id=transaction_id):
        return
    await db.insert("purchases", {
        "transaction_id": transaction_id,  # UNIQUE 约束
        "user_id": user_id,
        "product_id": product_id,
    })
    await grant_content(user_id, product_id)
```

## 3. 常见错误
- 仅在客户端验证收据 → 通过伪造窃取免费内容。
- 不做幂等处理就发放 → 通知重发时重复发放。
- 未提供恢复按钮 → 商店审核被拒。
- 未处理 pending 状态 → 家庭批准、支付延迟时用户困惑。
- 价格硬编码 → 商店价格变更、地区货币不一致。

## 4. 检查清单
- [ ] 是否在服务端验证收据并仅在验证成功后才发放
- [ ] 是否将发放设计为幂等 (transaction_id UNIQUE)
- [ ] 是否通过服务器通知跟踪订阅状态
- [ ] 是否提供购买恢复按钮 (商店审核要求)
- [ ] 是否处理 pending(挂起)状态 (家庭批准、支付延迟)
- [ ] 退款时是否回收内容 (基于服务器通知)
- [ ] 是否从商店动态查询价格 (禁止硬编码)
