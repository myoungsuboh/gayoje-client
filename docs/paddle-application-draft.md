# Paddle 가맹점 신청 — 제품·사업 개요 초안 (2026-06-08)

> 용도: Paddle(MoR) seller 신청 + 언더라이팅 통과용. **영문 블록은 그대로 붙여넣기**, 한글은 가이드.
> Paddle은 **라이브 사이트를 직접 확인**한다 → 신청 전 사이트에 가격·약관·환불·문의가 노출돼 있어야 통과율↑.
> (우리 사이트엔 이미 `/legal/terms`·`/legal/refund-policy`·`/legal/privacy-policy` 존재 — 유리.)

---

## 1. Product description (영문 — 붙여넣기)
> Harness is a B2B/prosumer SaaS that turns meeting notes and product ideas into structured software specifications and developer handoff packages for AI-assisted ("vibe") coding. The pipeline produces a consolidated summary (CPS), a product requirements document (PRD), and design artifacts (API/entity specs, domain model, architecture), then exports a handoff package developers feed into AI coding tools (Cursor, Claude Code, etc.). It also runs lint/quality checks on connected GitHub repositories.
>
> Customers are software developers, designers, product managers, and indie builders who want to go from idea to a structured, buildable spec faster. Access is delivered instantly online upon subscription. There are no physical goods.

## 2. What customers pay for (영문)
> Recurring SaaS subscription (monthly or annual) granting access to the spec-generation pipeline, with per-tier monthly usage quotas (number of meeting logs processed and AI processing capacity). Higher tiers raise the quotas and concurrent project limits. Optional one-time add-on packs (planned) top up usage within a billing period.

## 3. Pricing (영문 — `pricing-final.md`와 일치)
> - Free: $0 (limited trial quota)
> - Pro: $9/mo or $90/yr
> - Pro+: $19/mo or $190/yr
> - Pro Max: $29/mo or $290/yr
> Annual plans include 2 months free (~17% off).

## 4. Delivery & fulfillment (영문)
> Fully digital, instant. On successful payment, the customer's account is upgraded immediately via webhook; access is granted within the web application. No shipping.

## 5. Refund policy (영문 — ⚠️ 더블체크: 사용량 제품이라 악용 방지 필수)
> Because the service consumes AI processing resources per use, refunds are handled as follows:
> - **Subscriptions:** Full refund within 7 days of purchase **if usage is below 10% of the period quota**. Beyond that, refunds are pro-rated for the unused remainder of the term, at our discretion.
> - **One-time add-on packs:** Non-refundable once any portion is consumed (digital goods, immediately usable).
> - Annual plans: pro-rated refund for full unused months.
> Contact: kaki3010@naver.com.

**한글 메모:** 위 환불 정책은 *사용량 제품 악용*(풀소진 후 환불)을 막는 핵심입니다. "7일 + 사용량 10% 미만"이 안전선. 기존 `/legal/refund-policy` 페이지 내용도 이와 **일치하도록 갱신** 필요(불일치 시 분쟁·심사 감점).

## 6. Business & contact (← 당신이 채울 항목)
- [ ] Legal entity name / 사업자명:
- [ ] Business registration no. / 사업자등록번호:
- [ ] Registered address / 주소:
- [x] Support email / 지원 이메일: kaki3010@naver.com
- [ ] Website / 사이트: https://harness-system.com
- [ ] Category: Software / SaaS (developer productivity)

## 7. 언더라이팅 통과 팁 (한글)
- 신청 **전에** 라이브 사이트에 노출돼 있어야: 가격표 / 이용약관 / 환불정책 / 개인정보 / 문의처. (우리 대부분 있음 — 환불정책만 위 §5와 정합화.)
- AI 제품은 가끔 추가 질문받음 → "코드/콘텐츠 무단생성 도구 아님, 개발 기획·명세 생산성 도구"로 명확히.
- 거절 시 fallback = **Lemon Squeezy**(가입 쉬움, 단 한국 로컬결제 약함).

## 8. 신청 후 BE 연동(승인 후)
- `be-margin-levers-spec.md`(비용 레버) + `payments-go-live-checklist.md`(웹훅·체크아웃)로 이어짐.
