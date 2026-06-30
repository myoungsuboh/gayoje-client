# Paddle 활성화 런북 — 등록일 컷오버 (2026-06-08)

> "등록 전에 다 깔끔하게"의 **정직한 정의**: 계정 없이 안전하게 만들 수 있는 건 **미리 만들고**(아래 A),
> 계정/토큰/price ID가 있어야 검증되는 건 **등록일에 샌드박스와 함께 컷오버**(아래 B)한다.
> **블라인드로 결제 페이지를 미리 바꾸지 않는 이유**: 토큰·price ID 없이는 E2E 검증 불가 → 미검증 코드를
> 결제 경로에 넣는 것 = 사용자가 가장 싫어할 "오류/버그"의 원인. 샌드박스와 동시 컷오버가 "버그 없음"의 유일한 길.

---

## A. 미리 만들어 둔 것 (계정 없이 안전 — 완료/완료예정)
- ✅ `src/utils/paddle.js` — `loadPaddleSdk`(싱글톤)·`initPaddle`·`openCheckout`·`openTierCheckout`·`getTierPriceId`·`isPaddleConfigured` 게이트. **미설정이면 전부 inert(throw/no-op)** → 현재 사이트 동작 변화 0.
- ✅ 단위테스트 13건 (게이트·가드·Checkout.open 인자·싱글톤·티어 매핑).
- ✅ Vite 정적 env 함정 회피(동적 키 미사용).
- ✅ env 변수 계약 확정 (아래).
- ✅ 결제 문서 패키지 (가격·원가·BE레버·Paddle신청·체크리스트).

### env 변수 계약 (등록일 Vercel에 설정)
```
VITE_PADDLE_CLIENT_TOKEN   = <Paddle client-side token>
VITE_PADDLE_ENV            = sandbox  → (검증 후) production
VITE_PADDLE_PRICE_PRO_M    = pri_xxx  (Pro 월)
VITE_PADDLE_PRICE_PRO_Y    = pri_xxx  (Pro 연)
VITE_PADDLE_PRICE_PROPLUS_M / _PROPLUS_Y
VITE_PADDLE_PRICE_PROMAX_M  / _PROMAX_Y
```

## B. 등록일 컷오버 (샌드박스와 함께 — 한 PR로 묶어 E2E 검증하며)
1. **Paddle 대시보드**: Products/Prices 생성 → `pri_xxx` 6개 확보(Free 제외).
2. **env(sandbox) 설정** → 위 계약대로.
3. **FE 컷오버 PR** (이때 한 번에, 샌드박스로 즉시 검증):
   - `pricing.vue`: 구독 버튼 → `openTierCheckout({tier,cycle,email,customData})` (isPaddleConfigured 게이트). 토스 위젯/약관-게이트/콜백 흐름 제거.
   - 구독관리(해지/재개/업글) → **Paddle 고객포털**(BE가 portal session URL 생성) 링크로 교체.
   - **토스 은퇴**: `src/utils/billing.js`(토스 함수), `src/pages/billing/callback.vue` 삭제, 관련 i18n/import 정리.
   - **환불정책 페이지**(`/legal/refund-policy`) USD + Paddle(MoR) 기준 갱신 + `[회사명]` 기입. (pricing 페이지가 USD로 바뀌는 시점과 **동시에** — 불일치 방지.)
4. **샌드박스 E2E**: 구독→웹훅→entitlement 반영 / 해지 / 환불 / 업그레이드. (BE 웹훅 필요.)
5. 통과 시 **env를 production 키로 교체 → 라이브.**

## C. BE 선결 (별도 repo — 내가 못 함, 핸드오프 완료)
- 웹훅 핸들러(`transaction.completed`·`subscription.*`) — 서명검증 + 멱등 + entitlement 갱신. (`be-margin-levers-spec.md`·`payments-go-live-checklist.md`)
- 환불 강제(사용량 10% 미만 체크).
- 캐싱/라우팅(마진) — 풀소진 전제 필수.

---

## 1~8 위험항목 처리 현황 (정직)
| # | 항목 | 처리 |
|---|---|---|
| 1 | Paddle 코드 부재 | **A에서 기반 완성**, 실배선은 B(컷오버) |
| 2 | 웹훅 entitlement 동기 | **C — BE** (스펙 핸드오프 완료) |
| 3 | 환불 악용 방지 | **C — BE** 강제 + B에서 정책 페이지 |
| 4 | 토스 잔재 은퇴 | **B(컷오버)** — 지금 지우면 검증 공백, 같이 처리 |
| 5 | 구독관리 재연결 | **B** — Paddle 포털(BE가 URL 생성) |
| 6 | 법무 페이지 정합 | **B** — pricing USD 전환과 동시(불일치 방지) |
| 7 | 샌드박스 E2E | **B — 계정 있어야 가능**(= 등록일) |
| 8 | 마진(캐싱/라우팅) | **C — BE** |

**요약: 등록 전 100% 완성은 물리적으로 불가**(2·3·8=BE, 7=계정필요). 가능한 최대치(A)는 완료. 나머지는 등록일 샌드박스 컷오버(B)에 묶는 것이 버그 없이 가는 유일한 경로.
