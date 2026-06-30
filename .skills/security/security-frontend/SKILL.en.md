---
name: Frontend Security (Security Frontend)
description: This is the frontend security standard for a Vue 3 + Vuetify environment. It covers XSS/CSRF defense, token storage strategy, CSP, external links, environment-variable secrets, and dependency auditing; read it when writing or reviewing security-related code. Keywords XSS, CSRF, DOMPurify, CSP, httpOnly, npm audit.
rules:
  - "Never use v-html on untrusted input. When necessary, always sanitize with DOMPurify."
  - "Store the refresh token in an httpOnly+Secure+SameSite=Strict cookie, and keep the access token only in memory (Pinia)."
  - "The CSP header is issued by the server, and unsafe-inline scripts are never allowed."
  - "All VITE_-prefixed variables are included in the client bundle, so no secrets."
  - "Run npm audit --audit-level=high as a gate in CI."
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

# 🔐 Frontend Security

> Defines security standards in a Vue 3 + Vuetify environment, such as XSS/CSRF defense, token storage, CSP, and dependency auditing. Read it when writing or reviewing code that affects security, such as authentication, input handling, and external resource loading.

## 1. Core Principles
- Never use `v-html` on untrusted input. When necessary, always sanitize with DOMPurify.
- Store the refresh token in an `httpOnly`+`Secure`+`SameSite=Strict` cookie, and keep the access token only in memory (Pinia).
- The CSP header is issued by the server, and `unsafe-inline` scripts are never allowed.
- All `VITE_`-prefixed variables are included in the client bundle, so no secrets.
- Run `npm audit --audit-level=high` as a gate in CI.

## 2. Rules

### 2-1. XSS Defense
- Never use `v-html` on untrusted input. If you must use it, always sanitize with **DOMPurify**.
- Vue's default `{{ }}` interpolation is auto-escaped, so it is safe.

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

### 2-2. Token Storage Trade-off Matrix

| Storage | XSS Safety | CSRF Safety | SSR Access | Recommendation |
|---|---|---|---|---|
| **httpOnly Cookie** | Safe (no JS access) | CSRF token needed | Possible | **Recommended** |
| localStorage | Vulnerable (JS access possible) | Safe | Not possible | Not recommended |
| sessionStorage | Vulnerable | Safe | Not possible | Short sessions only |
| Memory (Pinia) | Moderate | Safe | Not possible | Short-lived access token |

- **Recommended pattern**: Store the refresh token in an `httpOnly`+`Secure`+`SameSite=Strict` cookie, and keep the access token only in memory (Pinia).

### 2-3. CSRF (When Using Cookie Authentication)
- Configure Axios to automatically attach the Spring Security CSRF token to the header.

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
- Issue the CSP header from the server (Spring Security or Nginx). In Vite dev, it can be mimicked with `server.headers` in `vite.config.js`.
- Default recommended values:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
```

- Never allow `unsafe-inline` scripts. Vuetify may require `unsafe-inline` for `style`, so consider using a nonce.

### 2-5. External Links
- When using `target="_blank"`, always add `rel="noopener noreferrer"` (to prevent tabnabbing).

```vue
<a href="https://external.com" target="_blank" rel="noopener noreferrer">External Link</a>
```

### 2-6. No Secrets in Environment Variables
- All `VITE_`-prefixed variables are **included in the client bundle**. No API keys/secrets.
- For details, see the `env-config` skill.

### 2-7. Dependency Audit
```bash
npm audit
npm audit fix
npm audit --audit-level=high
```
- It is recommended to run `npm audit --audit-level=high` as a gate in CI.

## 3. Common Mistakes
- Binding user input directly to `v-html`
- Storing a JWT in localStorage and then "keeping it for a year for convenience"
- Using only `target="_blank"` and omitting `rel`
- Defining a client secret such as `VITE_API_SECRET`
- Ignoring security rules with `// eslint-disable-next-line`
- Loading an external CDN script without SRI (`integrity`)

## 4. Checklist
- [ ] Are all values bound to `v-html` sanitized with DOMPurify?
- [ ] Is the access token kept in memory (Pinia) and the refresh token in an httpOnly cookie?
- [ ] Is the XSRF header configured in Axios when using cookie authentication?
- [ ] Is the CSP header issued from the server and does it disallow `unsafe-inline` scripts?
- [ ] Do all `target="_blank"` links have `rel="noopener noreferrer"`?
- [ ] Are there no secrets/API keys in `VITE_`-prefixed variables?
- [ ] Is there an `npm audit --audit-level=high` gate in CI?
