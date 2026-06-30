---
name: 前端安全 (Security Frontend)
description: 这是 Vue 3 + Vuetify 环境下的前端安全标准。涵盖 XSS/CSRF 防御、令牌存储策略、CSP、外部链接、环境变量 secret、依赖审计；在编写或检查安全相关代码时阅读。关键词 XSS, CSRF, DOMPurify, CSP, httpOnly, npm audit。
rules:
  - "v-html 绝对禁止用于不可信输入。必要时务必用 DOMPurify 进行 sanitize。"
  - "refresh token 存储在 httpOnly+Secure+SameSite=Strict cookie 中，access token 仅保留在内存（Pinia）中。"
  - "CSP 头由服务器签发，绝对禁止允许 unsafe-inline 脚本。"
  - "VITE_ 前缀的变量都会包含在客户端 bundle 中，因此禁止放 secret。"
  - "在 CI 中以 npm audit --audit-level=high 作为门禁执行。"
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

# 🔐 前端安全

> 在 Vue 3 + Vuetify 环境下定义 XSS/CSRF 防御、令牌存储、CSP、依赖审计等安全标准。在编写或评审认证、输入处理、外部资源加载等影响安全的代码时阅读。

## 1. 核心原则
- `v-html` 绝对禁止用于不可信输入。必要时务必用 DOMPurify 进行 sanitize。
- refresh token 存储在 `httpOnly`+`Secure`+`SameSite=Strict` cookie 中，access token 仅保留在内存（Pinia）中。
- CSP 头由服务器签发，绝对禁止允许 `unsafe-inline` 脚本。
- `VITE_` 前缀的变量都会包含在客户端 bundle 中，因此禁止放 secret。
- 在 CI 中以 `npm audit --audit-level=high` 作为门禁执行。

## 2. 规则

### 2-1. XSS 防御
- `v-html` 绝对禁止用于不可信输入。如果必须使用，务必用 **DOMPurify** 进行 sanitize。
- Vue 默认的 `{{ }}` 插值会自动 escape，因此是安全的。

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

### 2-2. 令牌存储权衡矩阵

| 存储位置 | XSS 安全性 | CSRF 安全性 | SSR 访问 | 推荐度 |
|---|---|---|---|---|
| **httpOnly Cookie** | 安全（JS 无法访问） | 需要 CSRF 令牌 | 可以 | **推荐** |
| localStorage | 脆弱（JS 可访问） | 安全 | 不可 | 不推荐 |
| sessionStorage | 脆弱 | 安全 | 不可 | 仅限短期会话 |
| 内存（Pinia） | 一般 | 安全 | 不可 | 短寿命 access token |

- **推荐模式**：refresh token 存储在 `httpOnly`+`Secure`+`SameSite=Strict` cookie 中，access token 仅保留在内存（Pinia）中。

### 2-3. CSRF（使用 Cookie 认证时）
- 配置 Axios 使其自动将 Spring Security CSRF 令牌附加到头部发送。

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
- 由服务器（Spring Security 或 Nginx）签发 CSP 头。在 Vite dev 中可通过 `vite.config.js` 的 `server.headers` 模拟。
- 默认推荐值：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
```

- 绝对禁止允许 `unsafe-inline` 脚本。Vuetify 的 `style` 可能需要 `unsafe-inline`，因此应考虑使用 nonce。

### 2-5. 外部链接
- 使用 `target="_blank"` 时务必添加 `rel="noopener noreferrer"`（防止 tabnabbing）。

```vue
<a href="https://external.com" target="_blank" rel="noopener noreferrer">外部链接</a>
```

### 2-6. 禁止在环境变量中放 Secret
- `VITE_` 前缀的变量 **都会包含在客户端 bundle 中**。禁止放 API key/secret。
- 详情参考 `env-config` skill。

### 2-7. 依赖审计
```bash
npm audit
npm audit fix
npm audit --audit-level=high
```
- 推荐在 CI 中以 `npm audit --audit-level=high` 作为门禁执行。

## 3. 常见错误
- 将用户输入直接绑定到 `v-html`
- 在 localStorage 中存储 JWT 后“为方便起见保留一年”
- 只用 `target="_blank"` 而遗漏 `rel`
- 定义类似 `VITE_API_SECRET` 的客户端 secret
- 用 `// eslint-disable-next-line` 忽略安全规则
- 不带 SRI（`integrity`）加载外部 CDN 脚本

## 4. 检查清单
- [ ] 绑定到 `v-html` 的所有值是否都用 DOMPurify 进行了 sanitize？
- [ ] access token 是否保留在内存（Pinia），refresh token 是否保存在 httpOnly cookie 中？
- [ ] 使用 Cookie 认证时，Axios 是否设置了 XSRF 头？
- [ ] CSP 头是否由服务器签发，并且不允许 `unsafe-inline` 脚本？
- [ ] `target="_blank"` 链接是否都附带了 `rel="noopener noreferrer"`？
- [ ] `VITE_` 前缀的变量中是否没有 secret/API key？
- [ ] CI 中是否有 `npm audit --audit-level=high` 门禁？
