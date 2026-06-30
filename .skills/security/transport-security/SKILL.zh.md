---
name: 传输安全标准 — TLS·HTTPS·安全头
description: 防止传输层窃听·篡改·点击劫持的通用(foundational)标准。涵盖强制HTTPS、TLS最低版本·加密套件、HSTS·CSP·安全头、CORS白名单、敏感响应禁止缓存。在配置·检查服务器·API的头·TLS·CORS,或整顿HTTPS迁移时阅读。
rules:
  - "不信任明文传输: 假定网络路径可能被窃听·篡改。所有流量仅允许HTTPS,HTTP请求以永久重定向(301)切换为HTTPS。"
  - "用HSTS阻断明文重新连接: 强制HSTS,使浏览器在首次请求之后不再退回明文。仅靠重定向会暴露最初的明文请求,因此HSTS是必需的。"
  - "默认拒绝,显式允许(default-deny): CSP·CORS以「全部拦截、仅开放所需来源」为基础。通配符允许会瓦解信任边界。"
  - "TLS仅用安全的版本·加密: 阻止向脆弱协议·加密套件降级。仅允许最低版本及以上。"
  - "敏感响应不留在缓存中: 让含有认证·个人信息的响应不残留在代理·浏览器缓存中。"
  - "头·策略在一处统一应用: 不要把安全头和CORS策略散布到每个端点,而在共同入口(中间件/过滤器/网关)一致地施加。"
  - "配置用环境而非代码: 把允许来源·证书等因环境而异的值分离到环境变量/配置,使开发设置不泄漏到生产。"
tags:
  - "HTTPS"
  - "TLS"
  - "HSTS"
  - "Content-Security-Policy"
  - "X-Frame-Options"
  - "CORS"
  - "Strict-Transport-Security"
  - "helmet"
foundational: true
---

# 🔒 传输安全标准 — TLS·HTTPS·安全头

> 防止传输层的窃听·篡改·点击劫持。让所有流量仅经HTTPS流转,安全地配置TLS,并以标准安全头和CORS白名单防御浏览器。在配置或检查服务器·API的HTTPS·TLS·安全头·CORS时阅读。这是不依赖特定语言/框架/工具的通用标准。(头值·TLS版本·策略本身为业界标准,故在正文中原样保留。)

## 1. 核心原则
- **不信任明文传输**: 假定网络路径可能被窃听·篡改。所有流量仅允许HTTPS,HTTP请求以永久重定向(301)切换为HTTPS。
- **用HSTS阻断明文重新连接**: 强制HSTS,使浏览器在首次请求之后不再退回明文。仅靠重定向会暴露最初的明文请求,因此HSTS是必需的。
- **默认拒绝,显式允许(default-deny)**: CSP·CORS以"全部拦截、仅开放所需来源"为基础。通配符允许会瓦解信任边界。
- **TLS仅用安全的版本·加密**: 阻止向脆弱协议·加密套件降级。仅允许最低版本及以上。
- **敏感响应不留在缓存中**: 让含有认证·个人信息的响应不残留在代理·浏览器缓存中。
- **头·策略在一处统一应用**: 不要把安全头和CORS策略散布到每个端点,而在共同入口(中间件/过滤器/网关)一致地施加。
- **配置用环境而非代码**: 把允许来源·证书等因环境而异的值分离到环境变量/配置,使开发设置不泄漏到生产。

## 2. 规则

### 2-1. 将所有流量强制为HTTPS
- 经HTTP进入的请求,以301重定向到同一路径的HTTPS。不要原样提供HTTP。
- 不止于重定向,要**同时**应用**HSTS**,使之后的重新连接不降为明文。

```text
// ❌ 禁止 — 原样保留HTTP,或仅重定向而遗漏HSTS
http://api → (原样响应)            // 明文暴露
http://api → 301 https://api          // 下一次连接可能再次为明文

// ✅ 推荐 — 强制HTTPS + 用HSTS阻断明文重新连接
http://api → 301 https://api
响应头: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 2-2. 统一施加标准安全头
- 在共同入口对所有响应应用以下头(值为业界标准)。

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{random}';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- HSTS包含`max-age=31536000`(1年)以上 + `includeSubDomains`。
- 作为点击劫持防御,施加`X-Frame-Options: DENY`(或CSP `frame-ancestors 'none'`)。

### 2-3. CSP以default-src 'self'为基准,移除unsafe-inline
- 以`default-src 'self'`为基础,按指令**显式允许**仅必要的来源。
- 允许内联脚本/样式(`unsafe-inline`)会使XSS防御失效 — 用nonce或哈希替代。

```text
// ❌ 禁止 — 全面允许内联 (使XSS防御失效)
Content-Security-Policy: default-src *; script-src 'self' 'unsafe-inline'

// ✅ 推荐 — 基础self,内联仅以nonce允许
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
```

### 2-4. CORS用显式白名单 (禁止通配符)
- 以**按环境的白名单**管理允许来源。生产中不使用`Access-Control-Allow-Origin: *`。
- 对携带凭据的请求(`allow_credentials`)绝不结合通配符来源。
- 允许来源列表不要硬编码到代码,而分离到环境变量/配置。

```text
// 按环境明示允许来源
开发:      允许 localhost:3000 (显式)
预发布:  允许 staging.example.com
生产:  仅允许 app.example.com
```

```text
// ❌ 禁止 — 生产中允许所有来源
Access-Control-Allow-Origin: *

// ✅ 推荐 — 用环境变量(ALLOWED_ORIGINS)管理白名单
allow_origins = ALLOWED_ORIGINS.split(',')
```

### 2-5. 敏感响应禁止缓存
- 对含有认证·个人信息的响应施加`Cache-Control: no-store`,防止代理·浏览器缓存残留。

```text
// ❌ 禁止 — 敏感响应以可缓存状态下发
200 /me  (无 Cache-Control)         // 残留在代理·浏览器

// ✅ 推荐 — 敏感响应禁止缓存
200 /me  Cache-Control: no-store
```

### 2-6. TLS仅允许安全的版本·加密
- 仅允许TLS 1.2及以上(禁用SSLv3、TLS 1.0/1.1) — 阻止向脆弱协议降级。
- 仅允许强加密套件。
- 在外部检查工具(例: SSL Labs `ssllabs.com/ssltest`)上以A级为目标。
- 运营上使证书在到期前**自动续期**(手动续期会招致到期事故)。

```text
// ❌ 禁止 — 允许旧版本协议 → 降级攻击
TLS 1.0 / 1.1 / SSLv3 enabled

// ✅ 推荐 — 最低版本及以上 + 仅强加密
min TLS 1.2,  仅强 cipher suite,  SSL Labs A 级
```

## 3. 常见错误
- **仅重定向而遗漏HSTS** → 即使以301转发,最初的请求仍以明文暴露。务必把重定向 + HSTS一起。
- **CSP中残留`unsafe-inline`** → 头施加了,但允许内联会使XSS防御失效。用nonce/哈希替代。
- **通配符来源 + 凭据的结合** → 对凭据请求使用`*`会被浏览器拦截,或反而更危险。生产CORS用按环境的白名单,仅显式来源。
- **敏感响应未应用`no-store`** → 认证·个人信息响应残留在代理·浏览器缓存。
- **证书手动续期** → 错过续期导致到期故障。用自动续期。
- **头按端点零散应用** → 遗漏频发。在共同入口统一施加。

## 4. 检查清单
- [ ] 是否将HTTP以301重定向到HTTPS并设置了**HSTS**
- [ ] 是否在共同地点统一施加了标准安全头(HSTS·CSP·X-Content-Type-Options·X-Frame-Options·Referrer-Policy·Permissions-Policy)
- [ ] 是否从CSP移除了`unsafe-inline`并明示了来源
- [ ] 是否以按环境的白名单管理CORS来源 (禁止`*`,禁止凭据与通配符结合)
- [ ] 是否对敏感API响应设置了`Cache-Control: no-store`
- [ ] 是否仅允许TLS 1.2及以上并确认了强加密套件 + SSL Labs A级
- [ ] 是否运营上使证书自动续期
- [ ] 是否将允许来源·证书等按环境的值分离到环境变量/配置

## 附录: 按栈的示例

> 以下是供参考的实现示例。按团队所用的栈(例: Node/Helmet、Python/FastAPI、Nginx/Apache、certbot等)以相同模式追加示例。上述1~4的原则·规则为标准,附录只是其应用案例。输入值校验·认证等相邻主题遵循相应技能。

### 按工具的示例

#### 安全头配置 — Node.js (Helmet)

```javascript
import helmet from "helmet";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'nonce-{generated}'"],
      imgSrc: ["'self'", "data:", "https://trusted-cdn.com"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

#### 强制HTTPS · CORS — Python (FastAPI)

```python
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(CORSMiddleware,
  allow_origins=["https://app.example.com"],  # 白名单
  allow_credentials=True,
  allow_methods=["GET", "POST", "PUT", "DELETE"],
  allow_headers=["Authorization", "Content-Type"],
)
```

#### TLS证书自动续期 — Let's Encrypt (certbot)

- 证书自动续期配置 (Let's Encrypt certbot)
