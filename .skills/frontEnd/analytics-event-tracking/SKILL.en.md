---
name: Analytics Event Tracking
description: A general-purpose standard for product-metric (conversion rate, funnel) event tracking covering consistent event naming, a single wrapper, PII masking, consent-gated collection, and environment separation, independent of any specific language/framework/analytics vendor. Read when adopting an analytics tool or newly defining/sending events, and when deciding on PII masking, consent (opt-out), and debouncing. For error collection, see error-monitoring.
rules:
  - "Manage events as a catalog: don't scatter event names and properties in free form; unify them under a single convention like object_action (snake_case, past tense) and manage them in a document (catalog). If the same behavior is logged under several names, analysis itself becomes impossible."
  - "Define core metrics first: don't try to track everything; first define the conversion/funnel core events used for operational decisions. An event with no measurement purpose is noise."
  - "Collection presupposes user consent: do not start tracking before checking the consent (opt-out/opt-in) status. Consent is a prerequisite for analytics, not an add-on feature."
  - "Don't send personal information (PII): an analytics tool is not a PII store. Remove email/phone/address/coordinates/plaintext identifiers from the transmission path, or send them only in a form with no joining risk (hashing, analytics-only IDs)."
  - "Hide the vendor behind a single wrapper: don't call the analytics SDK directly from screen/domain code; call it only through a common wrapper (track/init/setOptOut, etc.). Make a tool swap a one-file change, and gather masking and consent checks in one place."
  - "Reduce high-frequency events before sending: events that pour out at short intervals like scroll/drag/move/input should be grouped via debouncing/throttling to control traffic and cost."
  - "Separate environments: separate analytics keys/endpoints per environment (dev/prod) so that development events do not pollute the production dashboard."
tags:
  - "gtag"
  - "ga4"
  - "analytics"
  - "mixpanel"
  - "track("
  - "trackEvent"
  - "datalayer"
---

# 📊 Analytics Event Tracking

> Define the user-behavior metrics (DAU/MAU, conversion rate, funnel) needed for operational decisions with consistent names and log them through a single entry point. Remove personal information before sending, collect only after obtaining user consent, and abstract away dependence on a specific analytics vendor. Read when adopting an analytics tool or defining/sending events. This is a general-purpose standard not tied to any specific language/framework/vendor. (Errors go to `error-monitoring`, user behavior goes to analytics — they are different tracks.)

## 1. Core Principles
- **Manage events as a catalog**: don't scatter event names and properties in free form; unify them under a single convention like `object_action` (snake_case, past tense) and manage them in a document (catalog). If the same behavior is logged under several names, analysis itself becomes impossible.
- **Define core metrics first**: don't try to track everything; first define the conversion/funnel core events used for operational decisions. An event with no measurement purpose is noise.
- **Collection presupposes user consent**: do not start tracking before checking the consent (opt-out/opt-in) status. Consent is a prerequisite for analytics, not an add-on feature.
- **Don't send personal information (PII)**: an analytics tool is not a PII store. Remove email/phone/address/coordinates/plaintext identifiers from the transmission path, or send them only in a form with no joining risk (hashing, analytics-only IDs).
- **Hide the vendor behind a single wrapper**: don't call the analytics SDK directly from screen/domain code; call it only through a common wrapper (`track`/`init`/`setOptOut`, etc.). Make a tool swap a one-file change, and gather masking and consent checks in one place.
- **Reduce high-frequency events before sending**: events that pour out at short intervals like scroll/drag/move/input should be grouped via debouncing/throttling to control traffic and cost.
- **Separate environments**: separate analytics keys/endpoints per environment (dev/prod) so that development events do not pollute the production dashboard.

## 2. Rules

### 2-1. Unify event names under a single convention and catalog them
- Decide on one convention like `object_action` (snake_case, past tense), apply it to all events, and manage names/properties/meaning in a catalog document.
- Prohibit missing subjects, mixed casing, special characters, and ad-hoc naming.

```text
규칙: [Subject]_[Action]_[Object?]   // snake_case + 과거형, 언어 통일

// ❌ 금지 — subject 누락 · 표기 혼용 · 특수문자 · 자유 형식
track("signup")
track("inviteFriend")
track("course_complete!")

// ✅ 권장 — 객체_동작 과거형, 속성은 정해진 키로
track("user_signed_up", { method })
track("friend_invitation_sent", { to_user_id_hashed })
```

### 2-2. Tracking is invoked only through a single wrapper (block vendor lock-in)
- Don't call the analytics SDK directly from screen/domain code; place a common wrapper (`init`/`track`/`setOptOut`) and call the SDK only there.
- Gather the initialization check, the consent check, and PII masking in one place in the wrapper — the call site cares only about "what to send."

```text
// ❌ 금지 — 화면 코드가 벤더 SDK를 직접 호출 (교체·마스킹·동의 검사가 흩어짐)
vendorSdk.logEvent("user_signed_up", { email })   // PII까지 그대로 전송

// ✅ 권장 — 공통 래퍼 경유, 마스킹·동의 검사는 래퍼 내부에서 일괄
module analytics:
  state initialized, optedOut
  init():            if no key: return; vendorSdk.init(key, { collectIp: false }); initialized = true
  track(name, props):if not initialized or optedOut: return; vendorSdk.logEvent(name, sanitize(props))
  setOptOut(out):    optedOut = out; vendorSdk.setOptOut(out)

// 호출부
analytics.track("user_signed_up", { method })
```

### 2-3. Remove PII before sending (sanitize inside the wrapper)
- Filter out sensitive properties (email, phone, password, token, address, coordinates, etc.) in the wrapper's single sanitization step before sending.
- If user identification is needed, send a hashed/analytics-only ID rather than a plaintext ID.

```text
// ✅ 권장 — 금지 키를 단일 지점에서 제거 후 전송
FORBIDDEN = [email, phone, password, token, lat, lng, address, ...]
sanitize(props): props에서 키 이름이 FORBIDDEN을 포함하는 항목을 제거해 반환

track(name, props): vendorSdk.logEvent(name, sanitize(props))
```

### 2-4. Collect only after consent (opt-out/opt-in)
- Check the consent status first at app startup, and show the consent UI (only once) to undecided users.
- Do not run analytics initialization (`init`) or sending (`track`) before obtaining consent (compliance with privacy regulations such as GDPR/PIPL).

```text
// ✅ 권장 — 동의가 트래킹의 선결 조건
on app start:
  consent = readConsent()
  if consent is undecided: showConsentDialogOnce()
  if consent is granted:   analytics.init()    // 동의 전에는 init/track 금지
```

### 2-5. Debounce high-frequency events
- Events that occur consecutively at short intervals like scroll/drag/map move/continuous input should be grouped via debouncing/throttling and sent only once.
- Sending on every occurrence causes traffic and cost to explode and also becomes noise in analysis.

```text
// ❌ 금지 — 매 발생마다 전송
onMove(() => track("map_panned", { zoom }))

// ✅ 권장 — 일정 시간 묶어 한 번 전송
trackPan = debounce((zoom) => track("map_panned", { zoom }), 2000ms)
onMove(() => trackPan(currentZoom))
```

### 2-6. Separate keys per environment (dev/prod)
- Separate analytics keys/endpoints into environment variables so that events generated during development do not pollute the production dashboard.
- Sharing prod/dev keys breaks data reliability.

```text
// ✅ 권장 — 환경별로 다른 키 주입 (코드에 하드코딩 금지)
key = env.ANALYTICS_KEY        // dev 환경엔 dev 키, prod 환경엔 prod 키
analytics.init(key)
```

## 3. Common Mistakes
- **Sending PII as event properties** → sending email/phone/coordinates/plaintext user_id as-is. An analytics tool is not a PII store. Remove them in the wrapper and hash identifiers.
- **Starting tracking without consent** → calling init/track before checking consent status. A privacy-regulation violation.
- **Free-form event names** → the same behavior is logged under several names, so categories explode during analysis. Bind them with a single convention + catalog.
- **Sending high-frequency events every time** → sending on every scroll/move/keystroke makes traffic and cost explode. Debounce them.
- **Sharing prod/dev keys** → development events pollute the production dashboard and data reliability breaks. Separate by environment.
- **Calling the vendor SDK directly from screen code** → tool swap/masking/consent checks scatter all over. Hide it behind a single wrapper.

## 4. Checklist
- [ ] Do event names follow a single convention (`object_action`, snake_case, past tense) and are they documented as a catalog?
- [ ] Have you prioritized defining the conversion/funnel core events?
- [ ] Does tracking go through a single wrapper rather than being called directly from screen/domain code?
- [ ] Is PII masking (sanitize) handled in a single wrapper, and are identifiers sent as hashed/analytics-only IDs?
- [ ] Do init/track run only after checking consent (opt-out/opt-in)?
- [ ] Are high-frequency events debounced/throttled?
- [ ] Are dev/prod analytics keys separated?

## Appendix: Stack-Specific Examples

> The following are reference implementation examples. Add examples that match the stack your team uses (e.g., React/Next.js, Vue 3, mobile/native, server-side tracking, etc.) following the same pattern. The principles/rules in 1–4 above are the standard, and the appendix is merely an application example.

### Vue 3 (Vite) + Amplitude

> This is a **code example** that implements the principles/rules of sections 1–4 with Vite environment variables + the Amplitude SDK. For the "why" of the naming convention (§2-1), consent (§2-4), debouncing (§2-5), and environment separation (§2-6), see the main text. Here we include only the real code where the single wrapper (`src/lib/analytics.js`) handles vendor dependence and PII masking in one place.

#### Tool Selection (vendor comparison — reference)

| Tool | Free tier | Strength |
|---|---|---|
| Amplitude | 10M/month | Large free tier, quick to learn (recommended default) |
| Mixpanel | 1M/month | Strongest funnel/cohort analysis |
| GA4 | Unlimited (sampled) | Free, ad integration |
| PostHog (self-hosted) | Unlimited | Open source, data sovereignty |

#### Integration Wrapper (§2-2, §2-3 — block vendor lock-in + PII masking)

```js
// src/lib/analytics.js
import amplitude from 'amplitude-js'
let initialized = false, optedOut = false

export function initAnalytics() {
  const key = import.meta.env.VITE_AMPLITUDE_API_KEY  // dev/prod 키 분리 (본문 2-6)
  if (!key) return
  amplitude.getInstance().init(key, null, { trackingOptions: { ipAddress: false } })
  initialized = true
}
export function track(name, props = {}) {
  if (!initialized || optedOut) return
  amplitude.getInstance().logEvent(name, sanitize(props))
}
export function setOptOut(out) { optedOut = out; amplitude.getInstance().setOptOut(out) }

// 민감 키 자동 제거 (sanitize)
const FORBIDDEN = ['email', 'phone', 'password', 'token', 'lat', 'lng', 'address']
function sanitize(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !FORBIDDEN.some(f => k.toLowerCase().includes(f)))
  )
}

// 호출부: 이름은 객체_동작 과거형(본문 2-1)
track('user_signed_up', { method: 'kakao' })
```

#### Debouncing (§2-5)

```js
import { debounce } from 'lodash-es'
const trackPan = debounce((zoom) => track('map_panned', { zoom }), 2000)
map.on('moveend', () => trackPan(map.getZoom()))
```
