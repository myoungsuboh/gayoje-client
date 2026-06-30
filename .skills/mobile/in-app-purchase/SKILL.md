---
name: 인앱 결제 (IAP)
description: iOS StoreKit·Android Billing 인앱 결제 표준. 영수증 서버 검증·구독 상태 추적·멱등 지급·구매 복원을 구현할 때 읽는다. 키워드: iap, in-app-purchase, storekit, billing, subscription, receipt, play-billing, restore.
rules:
  - "결제 영수증은 클라이언트가 아닌 서버에서 검증한다(App Store·Play Developer API) — 클라이언트 검증은 위변조 가능."
  - "구매 완료 후 콘텐츠 지급은 서버 영수증 검증 성공 후에만 처리하고, 멱등하게 설계해 중복 지급을 방지한다."
  - "구독은 갱신·만료·환불·유예 기간(grace period) 상태를 서버 to 서버 알림(App Store Server Notifications·RTDN)으로 추적한다."
  - "구매 복원(Restore Purchases) 기능을 반드시 제공한다 — 앱 재설치·기기 변경 사용자 대응."
  - "결제 실패·취소·보류(pending) 상태를 각각 명시적으로 처리하고 사용자에게 안내한다."
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

# 💳 인앱 결제 (IAP)

> iOS StoreKit·Android Billing 결제를 서버 영수증 검증 기반으로 안전하게 구현한다. 인앱 구매·구독·복원을 만들거나 결제 상태 처리를 정할 때 읽는다.

## 1. 핵심 원칙
- 결제 영수증은 클라이언트가 아닌 서버에서 검증한다(App Store·Play Developer API) — 클라이언트 검증은 위변조 가능.
- 구매 완료 후 콘텐츠 지급은 서버 영수증 검증 성공 후에만 처리하고, 멱등하게 설계해 중복 지급을 방지한다.
- 구독은 갱신·만료·환불·유예 기간(grace period) 상태를 서버 to 서버 알림(App Store Server Notifications·RTDN)으로 추적한다.
- 구매 복원(Restore Purchases) 기능을 반드시 제공한다 — 앱 재설치·기기 변경 사용자 대응.
- 결제 실패·취소·보류(pending) 상태를 각각 명시적으로 처리하고 사용자에게 안내한다.

## 2. 규칙

### 2-1. 결제 흐름 (서버 검증 필수)
```
앱: 상품 조회 → 구매 요청 → OS 결제 시트 → 영수증 수신
         ↓
앱 → 서버: 영수증 전송
서버 → App Store / Play API: 영수증 검증
서버: 검증 성공 → 콘텐츠 지급(멱등) → 앱에 결과
```

### 2-2. 영수증 서버 검증 (iOS StoreKit 2)
```
POST https://api.storekit.itunes.apple.com/inApps/v1/...
또는 JWS 서명된 트랜잭션을 서버에서 Apple 공개키로 검증
```

### 2-3. 구독 상태 추적 (서버 알림)
| 플랫폼 | 알림 | 추적 이벤트 |
|--------|------|------------|
| iOS | App Store Server Notifications V2 | SUBSCRIBED, DID_RENEW, EXPIRED, REFUND |
| Android | Real-time Developer Notifications (Pub/Sub) | SUBSCRIPTION_RENEWED, _CANCELED, _EXPIRED |

### 2-4. 멱등 지급 (중복 방지)
```python
# ❌ 금지 — 트랜잭션 중복 체크 없이 매번 지급 (재전송 시 중복 지급)
# ✅ 권장 — transaction_id UNIQUE 제약으로 멱등 처리
async def grant_purchase(user_id: str, transaction_id: str, product_id: str):
    # 이미 처리된 트랜잭션이면 스킵
    if await db.exists("purchases", transaction_id=transaction_id):
        return
    await db.insert("purchases", {
        "transaction_id": transaction_id,  # UNIQUE 제약
        "user_id": user_id,
        "product_id": product_id,
    })
    await grant_content(user_id, product_id)
```

## 3. 흔한 실수
- 클라이언트에서만 영수증 검증 → 위변조로 무료 콘텐츠 탈취.
- 멱등 처리 없이 지급 → 알림 재전송 시 중복 지급.
- 복원 버튼 미제공 → 스토어 심사 거절.
- pending 상태 미처리 → 가족 승인·결제 지연 시 사용자 혼란.
- 가격 하드코딩 → 스토어 가격 변경·지역 통화 불일치.

## 4. 체크리스트
- [ ] 영수증을 서버에서 검증하고 검증 성공 후에만 지급하는가
- [ ] 지급을 멱등하게 설계했는가 (transaction_id UNIQUE)
- [ ] 구독 상태를 서버 알림으로 추적하는가
- [ ] 구매 복원 버튼을 제공하는가 (스토어 심사 요구사항)
- [ ] pending(보류) 상태를 처리하는가 (가족 승인·결제 지연)
- [ ] 환불 시 콘텐츠를 회수하는가 (서버 알림 기반)
- [ ] 가격을 스토어에서 동적 조회하는가 (하드코딩 금지)
