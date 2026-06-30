# 결제 Go-Live 체크리스트 — Paddle MoR (2026-06-08 개정)

> **결정:** 결제는 **Paddle 단일 Merchant of Record**로 간다. 한국 사업자 유지, USD 글로벌 + 한국 로컬결제(네이버페이·삼성페이·한국카드)를 단일 통합으로 커버.
> **이전 토스(KRW) 계획은 폐기.** 토스 결제 코드는 Paddle 마이그레이션 시 은퇴.

## 왜 Paddle (근거)
- 한국 사업자도 셀러 가입 + 한국 계좌 페이아웃 가능 (해외 법인 불필요).
- MoR이 전 세계 VAT/판매세를 대신 징수·납부 → 세금 컴플라이언스 오프로드.
- USD + 다통화 + 한국 로컬결제(네이버페이·삼성페이·Payco·한국카드 22종) 동시 지원.
- 비용: 수수료 ~5% + $0.5 (토스 ~2.9%보다 높음 — 세금/컴플라이언스 대행값).

## 아키텍처 변화 (토스 → Paddle)
MoR은 호스티드 체크아웃 + 구독관리 + 웹훅을 제공하므로, **커스텀 결제 코드가 대폭 줄어든다.**

| 기존 (토스, 폐기) | 신규 (Paddle) |
|---|---|
| `billing.js` issue-key/subscribe/upgrade/cancel | Paddle.js 체크아웃 + Paddle 고객포털 |
| `billing/callback.vue` (토스 리다이렉트) | Paddle 체크아웃 success + **웹훅** |
| BE `/api/billing/*` (토스 청구) | BE **Paddle 웹훅 핸들러** → entitlement 갱신 |
| customerKey/billingKey 관리 | Paddle customer/subscription id |
| **quota/usage(subscription_type→한도) 시스템** | **그대로 유지** — 웹훅이 entitlement만 갱신 |

핵심: **엔타이틀먼트 레이어(등급→한도)는 살아남고**, 결제 실행만 Paddle 웹훅 기반으로 바뀐다.

## 작업 분담

### 🔴 ops / 사업 (리드타임 가장 김 — 지금 시작)
- [ ] **Paddle 가맹점 신청 + 언더라이팅(심사) 통과** — 운영 중인 사이트·제품 설명 필요. 거절/보류 가능성 대비.
- [ ] Paddle 대시보드에 **Products/Prices 등록**: Pro/Pro+/Pro Max 구독(USD) + (추후) 초과팩 one-time.
- [ ] **Payout 설정** (한국 계좌 — Payoneer/송금 방식 셋업 시 확인).
- [ ] 가격 USD 확정 — **원가(USD) 기준 마진 + R1 정합성 규칙** 적용 (아래 "비용 USD 측정" 참조).

### 🟠 BE (별도 서버 — 이 repo 밖)
- [ ] **Paddle 웹훅 핸들러**: `subscription.created/updated/canceled`, `transaction.completed` 수신 → 사용자 `subscription_type`/entitlement 갱신 (멱등).
- [ ] 웹훅 **서명 검증**(Paddle signature) — 위조 차단.
- [ ] 기존 토스 `/api/billing/*` 라우트 은퇴/리다이렉트.
- [ ] quota 강제(402) 로직은 유지 — entitlement 소스만 Paddle로.

### 🟡 FE (이 repo)
- [ ] **Paddle.js 체크아웃** 연동 (`pricing.vue` 구독 버튼 → Paddle 체크아웃 오버레이/링크).
- [ ] 토스 코드 은퇴: `billing.js`(토스부), `billing/callback.vue`, `pricing.vue`의 토스 위젯 흐름.
- [ ] 구독 관리(해지/재개/카드변경)는 **Paddle 고객포털 링크**로 대체.
- [ ] `VITE_TOSS_CLIENT_KEY` 게이팅 → `VITE_PADDLE_*`(client token/환경) 게이팅으로 교체.
- [ ] `UpgradePromptDialog` CTA → Paddle 체크아웃 진입으로.
- [ ] i18n: 결제 관련 문자열 Paddle 흐름에 맞게 점검(ko/en/zh/ja).

### ⚖️ 법무 / 운영
- [ ] **MoR이라 한국 전자상거래법/통신판매업/VAT 부담이 상당 부분 Paddle로 이전** — 단, 자체 서비스 이용약관·개인정보처리방침은 여전히 필요. (전문가 1회 확인 권장.)
- [ ] 환불정책: Paddle 자체 정책 + 우리 정책 정합성 확인.
- [ ] 푸터/약관의 결제·사업자 고지 문구를 MoR 구조에 맞게 갱신.

## 비용 USD 측정 (지금 바로 — 결제와 독립적으로 옳음)
- COGS 전부 USD 네이티브: Gemini API, Vercel, Vultr, (Neo4j 호스팅).
- **R1 정합성 규칙(USD 기준)**: `초과팩 단위가 > 구독 환산 단위가 > 원가(토큰비용)`.
- 실제 Gemini 토큰 단가로 "미팅 1건 분석 ≈ $X" 산정 → 구독/팩 가격의 마진 바닥 결정.

## 권장 순서
1. (ops) **Paddle 가맹점 신청 — 오늘 시작** (심사 리드타임).
2. (분석) 원가 USD 측정 → 가격(USD) 확정.
3. (승인 후) FE Paddle.js 체크아웃 + BE 웹훅 핸들러 구현 (토스 코드 은퇴).
4. 소수 베타에 실제 USD 과금 → **첫 매출 신호**.
5. 그 후 → 초과팩(스펙: `docs/superpowers/specs/2026-06-08-overage-packs-design.md`) 구현.
