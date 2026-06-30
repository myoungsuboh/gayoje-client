---
name: 프론트엔드 보안 (Security Frontend)
description: Vue 3 + Vuetify 환경의 프론트엔드 보안 표준입니다. XSS/CSRF 방어, 토큰 저장 전략, CSP, 외부 링크, 환경변수 secret, 의존성 감사를 다루며 보안 관련 코드를 작성·점검할 때 읽습니다. 키워드 XSS, CSRF, DOMPurify, CSP, httpOnly, npm audit.
rules:
  - "v-html은 신뢰할 수 없는 입력에 절대 사용 금지. 필요 시 반드시 DOMPurify로 sanitize."
  - "refresh token은 httpOnly+Secure+SameSite=Strict 쿠키, access token은 메모리(Pinia)에만 보관."
  - "CSP 헤더는 서버에서 발급하고 unsafe-inline 스크립트는 절대 허용 금지."
  - "VITE_ 접두사 변수는 모두 클라이언트 번들에 포함되므로 secret 금지."
  - "CI에서 npm audit --audit-level=high를 게이트로 실행."
tags:
  - "DOMPurify"
  - "sanitize"
  - "v-html"
  - "httpOnly"
  - "Secure"
  - "SameSite"
  - "Content-Security-Policy"
  - "noopener"
  - "noreferrer"
  - "XSS"
  - "CSRF"
---

# 🔐 프론트엔드 보안

> Vue 3 + Vuetify 환경에서 XSS/CSRF 방어, 토큰 저장, CSP, 의존성 감사 등 보안 표준을 정의한다. 인증·입력 처리·외부 리소스 로드 등 보안에 영향을 주는 코드를 작성하거나 리뷰할 때 읽는다.

## 1. 핵심 원칙
- `v-html`은 신뢰할 수 없는 입력에 절대 사용 금지. 필요 시 반드시 DOMPurify로 sanitize.
- refresh token은 `httpOnly`+`Secure`+`SameSite=Strict` 쿠키, access token은 메모리(Pinia)에만 보관.
- CSP 헤더는 서버에서 발급하고 `unsafe-inline` 스크립트는 절대 허용 금지.
- `VITE_` 접두사 변수는 모두 클라이언트 번들에 포함되므로 secret 금지.
- CI에서 `npm audit --audit-level=high`를 게이트로 실행.

## 2. 규칙

### 2-1. XSS 방어
- `v-html`은 신뢰할 수 없는 입력에 절대 사용 금지. 사용해야 한다면 반드시 **DOMPurify**로 sanitize.
- Vue의 기본 `{{ }}` 보간은 자동 escape 되므로 안전.

```bash
npm install dompurify
```

```vue
<template>
  <VCard>
    <VCardText v-html="safeHtml" />
  </VCard>
</template>

<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({ rawHtml: String })
const safeHtml = computed(() => DOMPurify.sanitize(props.rawHtml, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  ALLOWED_ATTR: ['href', 'target', 'rel']
}))
</script>
```

### 2-2. 토큰 저장 트레이드오프 매트릭스

| 저장소 | XSS 안전성 | CSRF 안전성 | SSR 접근 | 권장도 |
|---|---|---|---|---|
| **httpOnly Cookie** | 안전 (JS 접근 불가) | CSRF 토큰 필요 | 가능 | **권장** |
| localStorage | 취약 (JS 접근 가능) | 안전 | 불가 | 비권장 |
| sessionStorage | 취약 | 안전 | 불가 | 단기 세션만 |
| 메모리(Pinia) | 보통 | 안전 | 불가 | 짧은 수명 access token |

- **권장 패턴**: refresh token은 `httpOnly`+`Secure`+`SameSite=Strict` 쿠키, access token은 메모리(Pinia)에만 보관.

### 2-3. CSRF (Cookie 인증 시)
- Spring Security CSRF 토큰을 Axios가 자동으로 헤더에 실어 보내도록 설정.

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN'
})

export default api
```

### 2-4. CSP (Content-Security-Policy)
- 서버(Spring Security 또는 Nginx)에서 CSP 헤더를 발급. Vite dev에서는 `vite.config.js`의 `server.headers`로 흉내 가능.
- 기본 권장값:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
```

- `unsafe-inline` 스크립트는 절대 허용 금지. Vuetify는 `style`에 `unsafe-inline` 필요할 수 있으므로 nonce 사용 검토.

### 2-5. 외부 링크
- `target="_blank"` 사용 시 반드시 `rel="noopener noreferrer"` 추가 (tabnabbing 방지).

```vue
<a href="https://external.com" target="_blank" rel="noopener noreferrer">외부 링크</a>
```

### 2-6. 환경변수 Secret 금지
- `VITE_` 접두사 변수는 **모두 클라이언트 번들에 포함**됨. API key/secret 금지.
- 상세는 `env-config` skill 참고.

### 2-7. 의존성 감사
```bash
npm audit
npm audit fix
npm audit --audit-level=high
```
- CI에서 `npm audit --audit-level=high`를 게이트로 실행 권장.

## 3. 흔한 실수
- `v-html`에 사용자 입력 직접 바인딩
- localStorage에 JWT 저장 후 "편의상 1년 유지"
- `target="_blank"` 만 쓰고 `rel` 누락
- `VITE_API_SECRET` 같은 클라이언트 secret 정의
- `// eslint-disable-next-line` 으로 보안 룰 무시
- 외부 CDN 스크립트를 SRI(`integrity`) 없이 로드

## 4. 체크리스트
- [ ] `v-html`에 바인딩되는 모든 값이 DOMPurify로 sanitize 되었는가?
- [ ] access token은 메모리(Pinia), refresh token은 httpOnly 쿠키에 보관하는가?
- [ ] Cookie 인증 시 Axios에 XSRF 헤더 설정이 되어 있는가?
- [ ] CSP 헤더가 서버에서 발급되고 `unsafe-inline` 스크립트를 허용하지 않는가?
- [ ] `target="_blank"` 링크에 `rel="noopener noreferrer"`가 모두 붙어 있는가?
- [ ] `VITE_` 접두사 변수에 secret/API key가 없는가?
- [ ] CI에 `npm audit --audit-level=high` 게이트가 있는가?
