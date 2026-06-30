---
name: 국제화 (i18n Internationalization)
description: 텍스트 하드코딩 금지·번역 분리·안정적 키 네이밍·복수형/보간·로케일 포맷·fallback·언어 선택 영속을 다루는 프런트엔드 다국어의 범용 표준으로, 특정 언어/프레임워크에 무관하다. 다국어를 도입·정비하거나 메시지 키 네이밍·포맷·언어 전환 영속을 정할 때 읽는다.
rules:
  - "UI 텍스트를 코드에 하드코딩하지 않는다: 화면에 보이는 모든 문자열은 번역 카탈로그(키 → 문구)에서 가져온다. 컴포넌트/템플릿에 자연어 리터럴을 직접 쓰지 않는다."
  - "번역은 코드와 분리한다: 메시지는 로케일별 리소스 파일로 분리해, 문구 변경이 코드 수정으로 번지지 않게 한다. 코드는 '키'만 안다."
  - "키는 안정적이고 의미 기반으로: 키는 번역문이 아니라 '역할'을 가리킨다. 자연어 문구 자체를 키로 쓰지 않는다(문구가 바뀌면 키가 깨진다). 도메인·화면·요소를 드러내는 계층적 키를 쓴다."
  - "동적 값은 보간으로, 복수형은 규칙으로: 문자열을 직접 이어붙이지(concatenation) 말고 이름 있는 자리표시자(placeholder)로 주입한다. 개수에 따른 단/복수 변화는 언어별 복수형 규칙을 따른다."
  - "날짜·숫자·통화는 로케일 포맷터로: 직접 문자열을 조립하거나 한 로케일 기준으로 고정하지 않는다. 로케일별 포맷 규칙(자릿수 구분·통화 기호·날짜 표기)을 적용한다."
  - "누락은 fallback으로 안전하게: 특정 로케일에 키가 없으면 기본 로케일로 떨어지게 한다. 개발 단계에서는 누락 키를 경고로 즉시 드러낸다."
  - "언어 선택을 영속한다: 사용자가 고른 언어를 저장소(예: 로컬 스토리지/쿠키/서버 설정)에 영속하고, 재방문 시 복원한다."
  - "문서 언어 속성을 갱신한다: 언어 전환 시 문서 루트의 언어 속성(<html lang>)을 함께 갱신해 접근성·검색엔진·브라우저 기능이 올바른 언어를 인식하게 한다."
tags:
  - "vue-i18n"
  - "useI18n"
  - "$t("
  - "createI18n"
  - "messages"
  - "locale"
---

# 🌐 국제화 (i18n Internationalization)

> UI에 노출되는 모든 텍스트를 코드 밖 번역 카탈로그로 분리하고, 안정적인 키로 참조하며, 날짜·숫자·통화를 로케일 규칙으로 포맷하고, 사용자의 언어 선택을 영속한다. 다국어를 도입·정비하거나 메시지 키·포맷·언어 전환을 다룰 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **UI 텍스트를 코드에 하드코딩하지 않는다**: 화면에 보이는 모든 문자열은 번역 카탈로그(키 → 문구)에서 가져온다. 컴포넌트/템플릿에 자연어 리터럴을 직접 쓰지 않는다.
- **번역은 코드와 분리한다**: 메시지는 로케일별 리소스 파일로 분리해, 문구 변경이 코드 수정으로 번지지 않게 한다. 코드는 "키"만 안다.
- **키는 안정적이고 의미 기반으로**: 키는 번역문이 아니라 "역할"을 가리킨다. 자연어 문구 자체를 키로 쓰지 않는다(문구가 바뀌면 키가 깨진다). 도메인·화면·요소를 드러내는 계층적 키를 쓴다.
- **동적 값은 보간으로, 복수형은 규칙으로**: 문자열을 직접 이어붙이지(concatenation) 말고 이름 있는 자리표시자(placeholder)로 주입한다. 개수에 따른 단/복수 변화는 언어별 복수형 규칙을 따른다.
- **날짜·숫자·통화는 로케일 포맷터로**: 직접 문자열을 조립하거나 한 로케일 기준으로 고정하지 않는다. 로케일별 포맷 규칙(자릿수 구분·통화 기호·날짜 표기)을 적용한다.
- **누락은 fallback으로 안전하게**: 특정 로케일에 키가 없으면 기본 로케일로 떨어지게 한다. 개발 단계에서는 누락 키를 경고로 즉시 드러낸다.
- **언어 선택을 영속한다**: 사용자가 고른 언어를 저장소(예: 로컬 스토리지/쿠키/서버 설정)에 영속하고, 재방문 시 복원한다.
- **문서 언어 속성을 갱신한다**: 언어 전환 시 문서 루트의 언어 속성(`<html lang>`)을 함께 갱신해 접근성·검색엔진·브라우저 기능이 올바른 언어를 인식하게 한다.

## 2. 규칙

### 2-1. UI 텍스트를 하드코딩하지 않는다
- 화면에 보이는 문자열은 번역 함수/카탈로그를 거친다. 컴포넌트에 자연어 리터럴을 박지 않는다.

```text
// ❌ 금지 — 자연어를 화면에 직접 박음
render: "안녕하세요"

// ✅ 권장 — 키로 참조, 문구는 카탈로그에서
render: t("user.profile.greeting")
```

### 2-2. 번역을 로케일별 리소스로 분리한다
- 로케일마다 별도 리소스(파일/번들)를 두고, 같은 키 집합을 공유한다.
- 코드는 키만 안다. 문구 변경은 리소스만 고친다.

```text
// 로케일별 리소스 (같은 키, 다른 문구)
resource[ko]:  common.save = "저장"
resource[en]:  common.save = "Save"
```

### 2-3. 키는 안정적·계층적·의미 기반으로
- 키는 "역할"을 가리킨다. **자연어 문구를 키로 쓰지 않는다**(문구가 바뀌면 깨진다).
- `<도메인>.<화면>.<요소>` 같은 계층 네임스페이스로 충돌·중복을 막는다. 공통 문구는 공용 네임스페이스(예: `common.*`)로 모은다.

```text
// ❌ 금지 — 자연어 자체가 키
t("안녕하세요")

// ✅ 권장 — 의미 기반 계층 키
t("user.profile.greeting")     // <도메인>.<화면>.<요소>
t("common.save")               // 공통 네임스페이스
```

### 2-4. 동적 값은 보간, 복수형은 규칙으로
- 문자열을 직접 이어붙이지 말고 **이름 있는 자리표시자**로 값을 주입한다(어순이 언어마다 다르다).
- 개수에 따른 표현 변화는 **언어별 복수형 규칙**으로 처리한다 — 코드에서 `if (n === 1)` 분기를 만들지 않는다.

```text
// ❌ 금지 — 문자열 이어붙이기 (어순/복수 깨짐)
"항목 " + count + "개"

// ✅ 권장 — 보간 + 복수형 규칙
t("user.profile.greeting", { name })       // "안녕하세요, {name}님"
t("user.profile.itemCount", count)         // 복수형 규칙으로 단/복수 선택
```

### 2-5. 날짜·숫자·통화는 로케일 포맷터로
- 직접 문자열을 조립하거나 한 로케일에 고정하지 않는다. 로케일 규칙(자릿수 구분·통화 기호·날짜 표기 순서)을 적용한다.
- 포맷 정의(예: `short` 날짜, `currency` 숫자)는 한곳에 모아 재사용한다.

```text
// ❌ 금지 — 한 로케일 기준 수동 조립
year + "-" + month + "-" + day
"₩" + price

// ✅ 권장 — 로케일 포맷터
formatDate(value, "short")     // ko: 2026-06-17 / en: Jun 17, 2026
formatNumber(price, "currency")// ko: ₩1,234 / en: $1,234.00
```

### 2-6. 누락 키는 fallback + 개발 경고로
- 현재 로케일에 키가 없으면 **기본 로케일로 fallback**해 화면이 깨지거나 키 문자열이 그대로 노출되지 않게 한다.
- 개발 단계에서는 누락 키/누락 fallback을 **경고로 즉시 드러낸다**(운영에서는 조용히 fallback).

```text
// 설정 개념
fallbackLocale = 기본 로케일
missingWarn    = (개발 모드에서만) on

// en에 없으면 → 기본 로케일 문구로, 개발 중엔 경고 출력
```

### 2-7. 언어 선택 영속 + 문서 lang 갱신
- 사용자가 고른 언어를 **영속 저장소**(로컬 스토리지/쿠키/서버 프로필 등)에 저장하고, 시작 시 복원한다.
- 언어 전환 시 한곳(상태 관리/전환 함수)에서 ① 활성 로케일 변경 ② 영속 저장 ③ **문서 루트 lang 속성 갱신**을 함께 수행한다.

```text
// ✅ 권장 — 전환을 한곳에서 일관 처리
setLocale(lang):
  activeLocale = lang                 // 활성 로케일 변경
  persist("locale", lang)             // 영속 저장 (재방문 복원용)
  document.root.lang = lang           // <html lang> 갱신 (접근성/SEO)

// 시작 시
activeLocale = persisted("locale") ?? 기본 로케일
```

## 3. 흔한 실수
- **텍스트 하드코딩** → 자연어를 컴포넌트에 직접 박으면 번역 자체가 불가능하다. 키로 참조한다.
- **자연어를 키로 사용** → 문구가 바뀌면 키가 깨진다. 의미 기반 계층 키를 쓴다.
- **문자열 이어붙이기로 문장 조립** → 어순이 다른 언어에서 깨진다. 이름 있는 보간을 쓴다.
- **복수형을 코드 분기로 처리** → 언어마다 복수형 규칙이 달라 틀린다. 복수형 규칙 기능에 맡긴다.
- **날짜/숫자/통화를 수동 조립·단일 로케일 고정** → 로케일별 포맷이 깨진다. 로케일 포맷터를 쓴다.
- **키 네임스페이스 미사용** → 키 충돌·중복 정의가 잦다. 계층 네임스페이스로 분리한다.
- **fallback/누락 감지 미설정** → 키 문자열이 그대로 노출되거나 누락을 못 잡는다. fallback + 개발 경고를 켠다.
- **언어 선택 미영속** → 새로고침/재방문 시 언어가 초기화된다. 영속 저장 후 복원한다.
- **문서 lang 미갱신** → 스크린리더·검색엔진·브라우저 기능이 잘못된 언어로 동작한다. 전환 시 `<html lang>`을 갱신한다.

## 4. 체크리스트
- [ ] UI 텍스트를 하드코딩하지 않고 **번역 카탈로그**에서 가져오는가
- [ ] 번역을 **로케일별 리소스**로 분리하고 코드는 키만 참조하는가
- [ ] 키가 자연어가 아니라 **의미 기반 계층 키**(`<도메인>.<화면>.<요소>`)인가
- [ ] 동적 값을 **이름 있는 보간**으로 주입하는가 (문자열 이어붙이기 금지)
- [ ] 복수형을 **언어별 복수형 규칙**으로 처리하는가 (코드 분기 금지)
- [ ] 날짜·숫자·통화를 **로케일 포맷터**로 처리하는가 (단일 로케일 고정 금지)
- [ ] 누락 키에 **fallback**이 동작하고, 개발 모드에서 **누락 경고**가 켜져 있는가
- [ ] 사용자의 언어 선택을 **영속**하고 시작 시 복원하는가
- [ ] 언어 전환 시 **문서 루트 lang 속성**을 갱신하는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React/react-i18next·FormatJS, Angular i18n, Svelte 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 오류 메시지 등 서버측 다국어는 백엔드 입력값 검증 표준(validation-bean)을 함께 참고한다.

### Vue 3 (vue-i18n)

> 본문 1~4의 원칙·규칙을 vue-i18n 9 + Vuetify locale 어댑터로 구현한 **코드 예시**다. 키 네이밍(본문 2-3)·fallback(본문 2-6)·언어 전환 영속과 `<html lang>` 갱신(본문 2-7)의 "왜"는 본문을 본다. 여기서는 `legacy: false`(Composition API 모드) 초기화와 실제 영속 코드만 싣는다.

#### 설치 및 초기화
```bash
npm install vue-i18n@9
```

```javascript
// src/plugins/i18n.js
import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko.json'
import en from '@/locales/en.json'

export const i18n = createI18n({
  legacy: false, // Composition API 모드 필수
  locale: localStorage.getItem('locale') || 'ko',
  fallbackLocale: 'en',
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
  messages: { ko, en },
  datetimeFormats: {
    ko: { short: { year: 'numeric', month: '2-digit', day: '2-digit' } },
    en: { short: { year: 'numeric', month: 'short', day: '2-digit' } }
  },
  numberFormats: {
    ko: { currency: { style: 'currency', currency: 'KRW' } },
    en: { currency: { style: 'currency', currency: 'USD' } }
  }
})
```

#### 메시지 파일 구조
- `src/locales/ko.json`, `src/locales/en.json`
- 키는 영문 도메인 표기. **한국어를 키로 쓰지 말 것.**

복수형은 `|`로 단/복수 형태를 구분한다. 언어마다 형태 수가 다르다 — 한국어는 단·복수 굴절이 없어 한 형태(`"항목 {count}개"`)면 충분하고, 영어는 단수/복수가 갈리므로 두 형태가 필요하다.

```json
// en.json — 단수/복수가 실제로 다른 언어
{
  "common": { "save": "Save", "cancel": "Cancel" },
  "user": {
    "profile": {
      "title": "Profile",
      "greeting": "Hello, {name}",
      "itemCount": "1 item | {count} items"
    }
  }
}
// ko.json — 굴절이 없어 한 형태로 충분: "itemCount": "항목 {count}개"
```

#### Vuetify Locale 어댑터 연동
```javascript
// src/plugins/vuetify.js
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n } from './i18n'

export const vuetify = createVuetify({
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n })
  }
})
```

#### 컴포넌트 사용
```vue
<template>
  <VCard>
    <VCardTitle>{{ t('user.profile.title') }}</VCardTitle>
    <VCardText>
      <p>{{ t('user.profile.greeting', { name: userName }) }}</p>
      <p>{{ t('user.profile.itemCount', count) }}</p>
      <p>{{ d(new Date(), 'short') }}</p>
      <p>{{ n(1234.5, 'currency') }}</p>
      <VBtn @click="changeLocale('en')">English</VBtn>
    </VCardText>
  </VCard>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/store/locale'

const { t, d, n } = useI18n()
const userName = ref('홍길동')
const count = ref(3)

const localeStore = useLocaleStore()
const changeLocale = (lang) => localeStore.setLocale(lang)
</script>
```

#### 언어 전환 + 영속 (본문 2-7 — 한곳에서 로케일 변경·영속·`<html lang>` 갱신)
```javascript
// src/store/locale.js
import { defineStore } from 'pinia'
import { i18n } from '@/plugins/i18n'

export const useLocaleStore = defineStore('locale', {
  state: () => ({ locale: localStorage.getItem('locale') || 'ko' }),
  actions: {
    setLocale(lang) {
      this.locale = lang
      i18n.global.locale.value = lang
      localStorage.setItem('locale', lang)
      document.documentElement.setAttribute('lang', lang)
    }
  }
})
```

> 키 네이밍(`<도메인>.<화면>.<요소>`·`common.*`)은 본문 2-3, fallback과 `missingWarn` 동작은 본문 2-6을 따른다 — 위 초기화 코드의 `fallbackLocale`/`missingWarn` 설정이 그 구현이다.
