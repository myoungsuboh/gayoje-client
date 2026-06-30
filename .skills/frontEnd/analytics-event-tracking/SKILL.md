---
name: 분석 이벤트 트래킹 (Analytics Event Tracking)
description: 일관된 이벤트 명명·단일 래퍼·PII 마스킹·동의 후 수집·환경 분리를 다루는 제품 메트릭(전환율·funnel) 이벤트 트래킹의 범용 표준으로, 특정 언어/프레임워크/분석 벤더에 무관하다. 분석 도구를 도입하거나 이벤트를 새로 정의·전송할 때, 개인정보 마스킹·동의(opt-out)·디바운싱을 정할 때 읽는다. 에러 수집은 error-monitoring을 본다.
rules:
  - "이벤트는 카탈로그로 관리한다: 이벤트 이름과 속성을 자유 형식으로 흩뿌리지 말고, 객체_동작(snake_case·과거형) 같은 단일 규칙으로 통일해 문서(카탈로그)로 관리한다. 같은 행동이 여러 이름으로 적재되면 분석 자체가 불가능해진다."
  - "핵심 지표부터 정의한다: 모든 것을 추적하려 들지 말고, 운영 의사결정에 쓰이는 전환·funnel 핵심 이벤트를 먼저 정의한다. 측정 목적이 없는 이벤트는 노이즈다."
  - "수집은 사용자 동의가 전제다: 동의(opt-out/opt-in) 상태를 확인하기 전에는 트래킹을 시작하지 않는다. 동의는 분석의 선결 조건이지 부가 기능이 아니다."
  - "개인정보(PII)는 보내지 않는다: 분석 도구는 PII 저장소가 아니다. 이메일·전화·주소·좌표·평문 식별자 등은 전송 경로에서 제거하거나, 결합 위험이 없는 형태(해싱·분석 전용 ID)로만 보낸다."
  - "벤더는 단일 래퍼 뒤에 숨긴다: 분석 SDK를 화면·도메인 코드에서 직접 호출하지 말고, 공통 래퍼(track/init/setOptOut 등)를 통해서만 호출한다. 도구 교체가 한 파일 수정으로 끝나게 하고, 마스킹·동의 검사를 한곳에 모은다."
  - "고빈도 이벤트는 줄여서 보낸다: 스크롤·드래그·이동·입력처럼 짧은 간격으로 쏟아지는 이벤트는 디바운싱/스로틀링으로 묶어 트래픽과 비용을 통제한다."
  - "환경을 분리한다: 개발 이벤트가 운영 대시보드를 오염시키지 않도록 분석 키/엔드포인트를 환경(dev/prod)별로 분리한다."
tags:
  - "gtag"
  - "ga4"
  - "analytics"
  - "mixpanel"
  - "track("
  - "trackEvent"
  - "datalayer"
---

# 📊 분석 이벤트 트래킹 (Analytics Event Tracking)

> 운영 의사결정에 필요한 사용자 행동 메트릭(DAU/MAU·전환율·funnel)을, 일관된 이름으로 정의하고 단일 진입점을 통해 적재한다. 개인정보는 전송 전에 제거하고, 사용자 동의를 받은 뒤에만 수집하며, 특정 분석 벤더에 종속되지 않게 추상화한다. 분석 도구를 도입하거나 이벤트를 정의·전송할 때 읽는다. 특정 언어/프레임워크/벤더에 종속되지 않는 범용 표준이다. (에러는 `error-monitoring`, 사용자 행동은 분석 — 트랙이 다르다.)

## 1. 핵심 원칙
- **이벤트는 카탈로그로 관리한다**: 이벤트 이름과 속성을 자유 형식으로 흩뿌리지 말고, `객체_동작`(snake_case·과거형) 같은 단일 규칙으로 통일해 문서(카탈로그)로 관리한다. 같은 행동이 여러 이름으로 적재되면 분석 자체가 불가능해진다.
- **핵심 지표부터 정의한다**: 모든 것을 추적하려 들지 말고, 운영 의사결정에 쓰이는 전환·funnel 핵심 이벤트를 먼저 정의한다. 측정 목적이 없는 이벤트는 노이즈다.
- **수집은 사용자 동의가 전제다**: 동의(opt-out/opt-in) 상태를 확인하기 전에는 트래킹을 시작하지 않는다. 동의는 분석의 선결 조건이지 부가 기능이 아니다.
- **개인정보(PII)는 보내지 않는다**: 분석 도구는 PII 저장소가 아니다. 이메일·전화·주소·좌표·평문 식별자 등은 전송 경로에서 제거하거나, 결합 위험이 없는 형태(해싱·분석 전용 ID)로만 보낸다.
- **벤더는 단일 래퍼 뒤에 숨긴다**: 분석 SDK를 화면·도메인 코드에서 직접 호출하지 말고, 공통 래퍼(`track`/`init`/`setOptOut` 등)를 통해서만 호출한다. 도구 교체가 한 파일 수정으로 끝나게 하고, 마스킹·동의 검사를 한곳에 모은다.
- **고빈도 이벤트는 줄여서 보낸다**: 스크롤·드래그·이동·입력처럼 짧은 간격으로 쏟아지는 이벤트는 디바운싱/스로틀링으로 묶어 트래픽과 비용을 통제한다.
- **환경을 분리한다**: 개발 이벤트가 운영 대시보드를 오염시키지 않도록 분석 키/엔드포인트를 환경(dev/prod)별로 분리한다.

## 2. 규칙

### 2-1. 이벤트 이름은 단일 규칙으로 통일하고 카탈로그화한다
- `객체_동작`(snake_case·과거형) 같은 한 가지 규칙을 정해 모든 이벤트에 적용하고, 이름·속성·의미를 카탈로그 문서로 관리한다.
- subject 누락, 대소문자 혼용, 특수문자, 즉흥 작명을 금지한다.

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

### 2-2. 트래킹은 단일 래퍼를 통해서만 호출한다 (벤더 종속 차단)
- 분석 SDK를 화면/도메인 코드에서 직접 부르지 말고, 공통 래퍼(`init`/`track`/`setOptOut`)를 두고 그곳에서만 SDK를 부른다.
- 초기화 여부·동의 여부 검사와 PII 마스킹을 래퍼 한곳에 모은다 — 호출부는 "무엇을 보낼지"만 신경 쓴다.

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

### 2-3. PII는 전송 전에 제거한다 (래퍼 내부 sanitize)
- 민감 속성(이메일·전화·비밀번호·토큰·주소·좌표 등)은 래퍼의 단일 정제 단계에서 걸러낸 뒤 전송한다.
- 사용자 식별이 필요하면 평문 ID가 아니라 해싱/분석 전용 ID로 보낸다.

```text
// ✅ 권장 — 금지 키를 단일 지점에서 제거 후 전송
FORBIDDEN = [email, phone, password, token, lat, lng, address, ...]
sanitize(props): props에서 키 이름이 FORBIDDEN을 포함하는 항목을 제거해 반환

track(name, props): vendorSdk.logEvent(name, sanitize(props))
```

### 2-4. 동의(opt-out/opt-in) 후에만 수집한다
- 앱 시작 시 동의 상태를 먼저 확인하고, 미결정 사용자에게는 (한 번만) 동의 UI를 표시한다.
- 동의를 받기 전에는 분석 초기화(`init`)와 전송(`track`)을 하지 않는다 (GDPR/PIPL 등 개인정보 규제 준수).

```text
// ✅ 권장 — 동의가 트래킹의 선결 조건
on app start:
  consent = readConsent()
  if consent is undecided: showConsentDialogOnce()
  if consent is granted:   analytics.init()    // 동의 전에는 init/track 금지
```

### 2-5. 고빈도 이벤트는 디바운싱한다
- 스크롤·드래그·지도 이동·이어지는 입력처럼 짧은 간격으로 연속 발생하는 이벤트는 디바운싱/스로틀링으로 묶어 한 번만 보낸다.
- 매 발생마다 전송하면 트래픽·비용이 폭증하고 분석에도 잡음이 된다.

```text
// ❌ 금지 — 매 발생마다 전송
onMove(() => track("map_panned", { zoom }))

// ✅ 권장 — 일정 시간 묶어 한 번 전송
trackPan = debounce((zoom) => track("map_panned", { zoom }), 2000ms)
onMove(() => trackPan(currentZoom))
```

### 2-6. 환경(dev/prod)별 키를 분리한다
- 분석 키/엔드포인트를 환경 변수로 분리해, 개발 중 발생한 이벤트가 운영 대시보드를 오염시키지 않게 한다.
- 운영/개발 키를 공유하면 데이터 신뢰성이 무너진다.

```text
// ✅ 권장 — 환경별로 다른 키 주입 (코드에 하드코딩 금지)
key = env.ANALYTICS_KEY        // dev 환경엔 dev 키, prod 환경엔 prod 키
analytics.init(key)
```

## 3. 흔한 실수
- **PII를 이벤트 속성으로 전송** → 이메일·전화·좌표·평문 user_id를 그대로 보낸다. 분석 도구는 PII 저장소가 아니다. 래퍼에서 제거하고 식별자는 해싱한다.
- **동의 없이 트래킹 시작** → 동의 상태 확인 전에 init/track을 호출한다. 개인정보 규제 위반.
- **이벤트 이름 자유 형식** → 같은 행동이 여러 이름으로 적재돼 분석 시 카테고리가 폭발한다. 단일 규칙 + 카탈로그로 묶는다.
- **고빈도 이벤트를 매번 전송** → 스크롤·이동·키 입력마다 발송해 트래픽·비용이 폭증한다. 디바운싱한다.
- **운영/개발 키 공유** → 개발 이벤트가 운영 대시보드를 오염시켜 데이터 신뢰성이 무너진다. 환경별로 분리한다.
- **벤더 SDK를 화면 코드에서 직접 호출** → 도구 교체·마스킹·동의 검사가 여기저기 흩어진다. 단일 래퍼 뒤로 숨긴다.

## 4. 체크리스트
- [ ] 이벤트 이름이 단일 규칙(`객체_동작`·snake_case·과거형)을 따르고 카탈로그로 문서화돼 있는가
- [ ] 전환·funnel 핵심 이벤트를 우선 정의했는가
- [ ] 트래킹을 화면/도메인 코드에서 직접 부르지 않고 단일 래퍼를 경유하는가
- [ ] PII 마스킹(sanitize)을 단일 래퍼에서 처리하고, 식별자는 해싱/분석 전용 ID로 보내는가
- [ ] 동의(opt-out/opt-in) 확인 후에만 init/track 하는가
- [ ] 고빈도 이벤트를 디바운싱/스로틀링하는가
- [ ] dev/prod 분석 키를 분리했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React/Next.js, Vue 3, 모바일/네이티브, 서버측 트래킹 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (Vite) + Amplitude

> 본문 1~4의 원칙·규칙을 Vite 환경 변수 + Amplitude SDK로 구현한 **코드 예시**다. 명명 규칙(본문 2-1)·동의(본문 2-4)·디바운싱(본문 2-5)·환경 분리(본문 2-6)의 "왜"는 본문을 본다. 여기서는 단일 래퍼(`src/lib/analytics.js`)가 벤더 종속과 PII 마스킹을 한곳에서 처리하는 실코드만 싣는다.

#### 도구 선택 (벤더 비교 — 참고)

| 도구 | 무료 한도 | 강점 |
|---|---|---|
| Amplitude | 월 10M | 무료 한도 큼, 빠른 학습 (권장 기본) |
| Mixpanel | 월 1M | funnel/cohort 분석 최강 |
| GA4 | 무제한(샘플링) | 무료, 광고 연계 |
| PostHog(셀프호스트) | 무제한 | 오픈소스, 데이터 주권 |

#### 통합 래퍼 (본문 2-2·2-3 — 벤더 종속 차단 + PII 마스킹)

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

#### 디바운싱 (본문 2-5)

```js
import { debounce } from 'lodash-es'
const trackPan = debounce((zoom) => track('map_panned', { zoom }), 2000)
map.on('moveend', () => trackPan(map.getZoom()))
```
