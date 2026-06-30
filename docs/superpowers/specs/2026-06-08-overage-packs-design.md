# 초과분 팩 (Overage Packs) 설계 스펙

**상태:** PROPOSED — 구현 보류 (선행조건 미충족)
**결제대행:** Paddle (Merchant of Record) 확정 — `docs/payments-go-live-checklist.md` 참조.
**선행조건(BLOCKER):** Paddle 기반 기본 구독이 라이브이고, 실제 유료 사용자가 월 한도에 부딪히는 현상이 관측될 것. (그 전엔 "없는 문제 풀기" = 전략적 YAGNI.)
**작성:** 2026-06-08 / **개정:** 2026-06-08 (토스→Paddle)

---

## Goal
현행 4티어 월 구독을 **유지**한 채, 사용자가 월 한도(미팅 로그 / AI 처리량)에 도달했을 때 *상위 등급 업그레이드 외에* **"추가 팩 단건 구매"** 라는 두 번째 선택지를 제공한다. 목적: (1) 버스티/프로젝트착수형 사용자에게 구독 강제 없이 결제 경로 제공, (2) 초과분에 프리미엄 단가를 매겨 마진 통제.

## Architecture (요약)
이 repo는 **프론트엔드 전용**. 결제 실행·세금·정산은 **Paddle(MoR)**, entitlement/원장은 **백엔드(별도 서버)**. 본 스펙은 FE 구현 + BE 계약을 정의하되 BE는 핸드오프.

```
[한도 도달] ── 사전 차단(pre-flight) 또는 402 QUOTA_EXCEEDED
      ↓
UpgradePromptDialog (기존 모달 확장)
   ├─ 기존: "상위 등급 업그레이드" 카드들
   └─ 신규: "추가 팩 구매" — 막힌 한도 종류에 맞는 팩 1종만 맥락 제시
      ↓
Paddle.js 체크아웃 (팩 = one-time Price)  ← 구독자/Free, 한국/글로벌 단일 경로
      ↓
Paddle → BE 웹훅 `transaction.completed`
      ↓
BE: topup_balance += 팩 용량 (영구, 월 리셋 무관)
      ↓
usage store refresh → "추가 잔액 +N" 표시
```

## 설계 결정 (D1–D5 + 더블체크 보완 R1–R3)

- **D1 — 팩은 기존 한도 단위 2종**: `미팅 로그 +N건`, `AI 처리량 +N`. 사용자가 추상적으로 고르지 않음 — **한도에 막힌 순간 그 한도용 팩만** 제시.
- **D2 — 산 건 안 사라진다**: 구매분은 별도 `topup_balance`로 적립, **월 리셋에 증발 안 함**. 소비 순서 = *기본 한도 먼저 → topup 나중*.
- **D3 — Free 등급도 팩 구매 가능**: 구독 안 해도 필요시 팩만 구매 → 버스티 유저용 경량 pay-per-use. **(Paddle 체크아웃이 비구독자도 처리하므로 추가 작업 없이 성립.)**
- **D4 — 가격은 Admin 동적 설정**: 팩 가격/용량을 Admin에서 관리(Paddle Price와 매핑). FE엔 fallback 기본값만.
- **D5 — 결제 경로는 Paddle 체크아웃 단일**: 구독자/Free·한국/글로벌 구분 없이 Paddle.js 체크아웃 하나. (토스 시절의 billingKey 청구 vs requestPayment 2경로 분기 불필요 — MoR이 흡수.)

### 더블체크 보완
- **R1 — 가격 정합성 규칙(필수, USD 기준)**: 모든 팩의 단위당 가격은 `팩 단가 > 동일 등급 구독 환산 단가 > 원가(토큰비용)` 만족. (committed < on-demand. 안 그러면 구독 카니발라이즈.) Admin UI에 위반 시 경고.
  - fallback 기본값(`pricing-final.md`와 일치 — Pro $9/월 기준, Paddle 고정 $0.50 때문에 $5+ 필수):
    - 미팅 팩: `+10건 / $4.90`
    - 처리량 팩: `+2,000,000 토큰 / $5.90`
- **R2 — 단계 구분 불필요(Paddle로 단순화)**: 토스 시절엔 "구독자 전용(2a) → Free 위젯(2b)" 단계 분리가 필요했으나, **Paddle 체크아웃이 누구든 처리**하므로 D3가 처음부터 포함된다. 단일 단계로 구현.
- **R3 — 토큰 팩 표현(사용자 언어)**: "AI 처리량 +N" 팩은 raw 토큰 대신 **체감 단위로 앵커링** — 예: `AI 처리량 +200만 (미팅 약 N건 분석 분량)`. (타깃이 디자이너/입문자라 raw 토큰은 무의미.)

## Data flow 세부
- **사전 차단(pre-flight)**: FE가 `usage` 스토어로 `meetingRemaining===0` 등을 알면, 작업 시작 전 모달로 업그레이드/팩 유도 (async 중간소진 회피).
- **async 중간소진(graceful)**: 파이프라인은 잡 큐. 잡 *도중* 소진 시 → graceful 실패(부분 결과 보존) + "처리량 부족 — 팩 구매 후 재시도" 안내. 자동 재개 없음(YAGNI), 사용자가 명시적 재시도.
- **소비 순서**: BE가 base quota 우선, 소진 후 topup_balance.

## Paddle / BE 계약 (핸드오프 — 이 repo 밖)
- Paddle 대시보드: 각 팩 = **one-time Price**(구독 아님). `custom_data`에 `{ pack_type: 'meeting'|'tokens', amount }`.
- FE: Paddle.js `Checkout.open({ items:[{priceId}], customer, customData })`.
- BE 웹훅 `transaction.completed` 수신 → `custom_data`로 팩 식별 → `topup_balance += amount` (멱등: Paddle transaction id 기준 1회).
- 웹훅 **서명 검증** 필수.
- `usage` 응답 확장: `topup: { meeting_logs, total_tokens }` (영구, 리셋 무관). 소비 순서 base→topup을 BE가 보장.
- Admin: 팩 가격/용량 config(↔Paddle Price 매핑) + R1 정합성 경고.

## FE 컴포넌트 / 파일 (이 repo)
| 구분 | 파일 | 역할 |
|---|---|---|
| 신규 | `src/utils/overagePacks.js` | 팩 카탈로그 메타 + fallback + R3 앵커링 표현 helper + Paddle priceId 매핑 |
| 수정 | `src/utils/billing.js`(또는 신규 `paddle.js`) | Paddle.js 로드 + `openPackCheckout(pack)` |
| 수정 | `src/components/common/UpgradePromptDialog.vue` | "추가 팩 구매" 선택지(막힌 한도용 1종) → Paddle 체크아웃. 핵심 터치포인트 |
| 수정 | `src/store/usage.js` | `topupMeeting`, `topupTokens` 파생값 + effective remaining(base+topup) |
| 수정 | `src/pages/pricing.vue` | "추가 팩" 섹션 + 구매 후 잔액 반영(웹훅 처리 지연 고려 — refresh 폴링/안내) |
| 수정 | 헤더칩 · UsageCard · plan 잔여 카운터 | "+N 추가 잔액" 노출 |
| 수정 | `src/locales/{ko,en,zh,ja}/billing.json` 등 | 신규 문자열 4개국어 |

## 에러 처리
체크아웃 취소/실패, 웹훅 지연(구매 직후 잔액 미반영) → 친화 안내(기존 `apiErrors` + "처리 중, 곧 반영" 토스트 + 자동 refresh). 환불은 Paddle 정책 경유.

## 테스트
- `overagePacks.js`: 카탈로그·fallback·R3 앵커링·R1 정합성 + priceId 매핑 단위테스트.
- `usage.js`: `topup` 파생값 + effective remaining 계산 테스트.
- `UpgradePromptDialog`: exceeded 모드에서 막힌 한도 종류에 맞는 팩만 렌더되는지 분기 테스트.

## 명시적 비범위 (YAGNI)
- 토큰형 크레딧(이전 2안), 프로젝트 패스(이전 1안) — 안 함.
- 팩 자동재구매/구독화 — 안 함(단건 유지).
- 토스 잔재(billingKey/requestPayment 경로) — Paddle로 대체, 부활 안 함.

## 구현 착수 조건
`docs/payments-go-live-checklist.md`의 Paddle 온보딩 + BE 웹훅이 완료되어 **실유료 사용자가 한도에 부딪히는 현상이 관측된 뒤** writing-plans로 전환. 그 전까지 본 문서는 파킹.
