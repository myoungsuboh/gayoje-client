---
name: Internationalization (i18n Internationalization)
description: A general-purpose frontend multilingual standard covering no text hardcoding, separating translations, stable key naming, plurals/interpolation, locale formatting, fallback, and persisting the language choice — independent of any particular language/framework. Read this when introducing/maintaining multilingual support or deciding message key naming, formatting, and language-switch persistence.
rules:
  - "Don't hardcode UI text in code: every string visible on screen comes from a translation catalog (key → text). Don't write natural-language literals directly in components/templates."
  - "Separate translations from code: split messages into per-locale resource files so copy changes don't ripple into code changes. Code only knows the 'key'."
  - "Keys are stable and meaning-based: a key points to a 'role', not the translated text. Don't use the natural-language text itself as the key (if the copy changes, the key breaks). Use hierarchical keys that reveal domain, screen, and element."
  - "Dynamic values via interpolation, plurals via rules: don't directly concatenate strings; inject named placeholders. Handle singular/plural variation by count using per-language plural rules."
  - "Dates, numbers, currency via locale formatters: don't assemble strings by hand or pin to a single locale. Apply per-locale format rules (digit grouping, currency symbol, date notation)."
  - "Handle missing keys safely via fallback: if a key is absent in a given locale, fall back to the default locale. During development, surface missing keys immediately as warnings."
  - "Persist the language choice: persist the language the user picked to storage (e.g., local storage/cookie/server settings) and restore it on return."
  - "Update the document language attribute: when switching languages, also update the document root's language attribute (<html lang>) so accessibility, search engines, and browser features recognize the correct language."
tags:
  - "vue-i18n"
  - "useI18n"
  - "$t("
  - "createI18n"
  - "messages"
  - "locale"
---

# 🌐 Internationalization (i18n Internationalization)

> Separate every text exposed in the UI into a translation catalog outside the code, reference it by stable keys, format dates/numbers/currency by locale rules, and persist the user's language choice. Read this when introducing/maintaining multilingual support or dealing with message keys, formatting, and language switching. It's a general-purpose standard not tied to any particular language/framework.

## 1. Core principles
- **Don't hardcode UI text in code**: every string visible on screen comes from a translation catalog (key → text). Don't write natural-language literals directly in components/templates.
- **Separate translations from code**: split messages into per-locale resource files so copy changes don't ripple into code changes. Code only knows the "key".
- **Keys are stable and meaning-based**: a key points to a "role", not the translated text. Don't use the natural-language text itself as the key (if the copy changes, the key breaks). Use hierarchical keys that reveal domain, screen, and element.
- **Dynamic values via interpolation, plurals via rules**: don't directly concatenate strings; inject named placeholders. Handle singular/plural variation by count using per-language plural rules.
- **Dates, numbers, currency via locale formatters**: don't assemble strings by hand or pin to a single locale. Apply per-locale format rules (digit grouping, currency symbol, date notation).
- **Handle missing keys safely via fallback**: if a key is absent in a given locale, fall back to the default locale. During development, surface missing keys immediately as warnings.
- **Persist the language choice**: persist the language the user picked to storage (e.g., local storage/cookie/server settings) and restore it on return.
- **Update the document language attribute**: when switching languages, also update the document root's language attribute (`<html lang>`) so accessibility, search engines, and browser features recognize the correct language.

## 2. Rules

### 2-1. Don't hardcode UI text
- Strings visible on screen pass through a translation function/catalog. Don't embed natural-language literals into components.

```text
// ❌ 금지 — 자연어를 화면에 직접 박음
render: "안녕하세요"

// ✅ 권장 — 키로 참조, 문구는 카탈로그에서
render: t("user.profile.greeting")
```

### 2-2. Separate translations into per-locale resources
- Keep a separate resource (file/bundle) per locale, sharing the same set of keys.
- Code only knows keys. For copy changes, fix only the resources.

```text
// 로케일별 리소스 (같은 키, 다른 문구)
resource[ko]:  common.save = "저장"
resource[en]:  common.save = "Save"
```

### 2-3. Keys: stable, hierarchical, meaning-based
- A key points to a "role". **Don't use natural-language text as the key** (if the copy changes, it breaks).
- Use a hierarchical namespace like `<domain>.<screen>.<element>` to prevent collisions/duplication. Collect common copy under a shared namespace (e.g., `common.*`).

```text
// ❌ 금지 — 자연어 자체가 키
t("안녕하세요")

// ✅ 권장 — 의미 기반 계층 키
t("user.profile.greeting")     // <도메인>.<화면>.<요소>
t("common.save")               // 공통 네임스페이스
```

### 2-4. Dynamic values via interpolation, plurals via rules
- Don't directly concatenate strings; inject values via **named placeholders** (word order differs by language).
- Handle expression changes by count with **per-language plural rules** — don't write an `if (n === 1)` branch in code.

```text
// ❌ 금지 — 문자열 이어붙이기 (어순/복수 깨짐)
"항목 " + count + "개"

// ✅ 권장 — 보간 + 복수형 규칙
t("user.profile.greeting", { name })       // "안녕하세요, {name}님"
t("user.profile.itemCount", count)         // 복수형 규칙으로 단/복수 선택
```

### 2-5. Dates, numbers, currency via locale formatters
- Don't assemble strings by hand or pin to a single locale. Apply locale rules (digit grouping, currency symbol, date notation order).
- Collect format definitions (e.g., `short` date, `currency` number) in one place and reuse them.

```text
// ❌ 금지 — 한 로케일 기준 수동 조립
year + "-" + month + "-" + day
"₩" + price

// ✅ 권장 — 로케일 포맷터
formatDate(value, "short")     // ko: 2026-06-17 / en: Jun 17, 2026
formatNumber(price, "currency")// ko: ₩1,234 / en: $1,234.00
```

### 2-6. Missing keys via fallback + dev warnings
- If a key is absent in the current locale, **fall back to the default locale** so the screen doesn't break or expose the raw key string.
- During development, **surface missing keys/missing fallbacks immediately as warnings** (in production, fall back silently).

```text
// 설정 개념
fallbackLocale = 기본 로케일
missingWarn    = (개발 모드에서만) on

// en에 없으면 → 기본 로케일 문구로, 개발 중엔 경고 출력
```

### 2-7. Persist the language choice + update document lang
- Save the language the user picked to **persistent storage** (local storage/cookie/server profile, etc.) and restore it on startup.
- On a language switch, in one place (state management/switch function), do all of: ① change the active locale ② persist it ③ **update the document root lang attribute**.

```text
// ✅ 권장 — 전환을 한곳에서 일관 처리
setLocale(lang):
  activeLocale = lang                 // 활성 로케일 변경
  persist("locale", lang)             // 영속 저장 (재방문 복원용)
  document.root.lang = lang           // <html lang> 갱신 (접근성/SEO)

// 시작 시
activeLocale = persisted("locale") ?? 기본 로케일
```

## 3. Common mistakes
- **Hardcoding text** → embedding natural language directly in components makes translation itself impossible. Reference by key.
- **Using natural language as the key** → if the copy changes, the key breaks. Use meaning-based hierarchical keys.
- **Assembling sentences by string concatenation** → breaks in languages with different word order. Use named interpolation.
- **Handling plurals via code branches** → plural rules differ per language, so it's wrong. Leave it to the plural-rule feature.
- **Assembling dates/numbers/currency by hand or pinning to a single locale** → per-locale formatting breaks. Use locale formatters.
- **Not using key namespaces** → key collisions/duplicate definitions are frequent. Separate with a hierarchical namespace.
- **Not configuring fallback/missing detection** → the key string gets exposed as-is or misses get unnoticed. Turn on fallback + dev warnings.
- **Not persisting the language choice** → the language resets on refresh/return. Persist and restore.
- **Not updating document lang** → screen readers, search engines, and browser features operate in the wrong language. Update `<html lang>` on switch.

## 4. Checklist
- [ ] Does UI text come from a **translation catalog** rather than being hardcoded?
- [ ] Are translations separated into **per-locale resources**, with code referencing only keys?
- [ ] Are keys **meaning-based hierarchical keys** (`<domain>.<screen>.<element>`) rather than natural language?
- [ ] Are dynamic values injected via **named interpolation** (no string concatenation)?
- [ ] Are plurals handled by **per-language plural rules** (no code branches)?
- [ ] Are dates/numbers/currency handled via **locale formatters** (no pinning to a single locale)?
- [ ] Does **fallback** work for missing keys, and are **missing warnings** on in development mode?
- [ ] Is the user's language choice **persisted** and restored on startup?
- [ ] Is the **document root lang attribute** updated on a language switch?

## Appendix: Per-stack examples

> The following are reference implementation examples. Add examples that fit the stack your team uses (e.g., React/react-i18next·FormatJS, Angular i18n, Svelte, etc.) following the same pattern. The principles & rules in sections 1–4 above are the standard; the appendix is merely an application of them. For server-side multilingual support such as error messages, also refer to the backend input-validation standard (validation-bean).

### Vue 3 (vue-i18n)

> A **code example** implementing the principles & rules of sections 1–4 with vue-i18n 9 + the Vuetify locale adapter. For the "why" of key naming (section 2-3), fallback (section 2-6), and language-switch persistence with `<html lang>` updates (section 2-7), see the body. Here we only include `legacy: false` (Composition API mode) initialization and the actual persistence code.

#### Installation and initialization
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

#### Message file structure
- `src/locales/ko.json`, `src/locales/en.json`
- Keys use English domain notation. **Don't use Korean as keys.**

Plurals separate singular/plural forms with `|`. The number of forms differs by language — Korean has no singular/plural inflection, so one form (`"항목 {count}개"`) is enough, while English distinguishes singular/plural, so two forms are needed.

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

#### Vuetify locale adapter integration
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

#### Component usage
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

#### Language switch + persistence (section 2-7 — change locale, persist, and update `<html lang>` in one place)
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

> Key naming (`<domain>.<screen>.<element>`·`common.*`) follows section 2-3, and fallback and `missingWarn` behavior follow section 2-6 — the `fallbackLocale`/`missingWarn` settings in the initialization code above are that implementation.
