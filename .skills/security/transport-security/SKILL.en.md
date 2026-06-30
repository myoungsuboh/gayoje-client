---
name: Transport Security Standards — TLS, HTTPS, Security Headers
description: A foundational, universal standard for preventing eavesdropping, tampering, and clickjacking at the transport layer. Covers HTTPS enforcement, minimum TLS version and cipher suites, HSTS/CSP/security headers, CORS allowlisting, and no-caching of sensitive responses. Read when configuring or auditing a server/API's headers, TLS, and CORS, or when overhauling an HTTPS migration.
rules:
  - "Do not trust plaintext transport: assume the network path can be eavesdropped on and tampered with. Allow only HTTPS for all traffic, and convert HTTP requests to HTTPS with a permanent redirect (301)."
  - "Block plaintext reconnection with HSTS: enforce HSTS so the browser does not fall back to plaintext after the first request. Redirects alone expose the initial plaintext request, so HSTS is essential."
  - "Default-deny, explicit allow: make CSP and CORS default to 'block everything and open only the origins you need.' Wildcard allows collapse the trust boundary."
  - "TLS with secure versions and ciphers only: prevent downgrades to vulnerable protocols and cipher suites. Allow only the minimum version and above."
  - "Do not leave sensitive responses in caches: keep responses containing authentication or personal data from lingering in proxy or browser caches."
  - "Apply headers and policies in one place: do not scatter security headers and CORS policy across each endpoint; apply them consistently at a common entry point (middleware/filter/gateway)."
  - "Configuration via environment, not code: separate values that differ per environment, such as allowed origins and certificates, into environment variables/configuration so development settings do not leak into production."
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

# 🔒 Transport Security Standards — TLS, HTTPS, Security Headers

> Prevent eavesdropping, tampering, and clickjacking at the transport layer. Route all traffic over HTTPS only, configure TLS securely, and defend the browser with standard security headers and a CORS allowlist. Read when configuring or auditing a server/API's HTTPS, TLS, security headers, and CORS. This is a universal standard not tied to any specific language/framework/tool. (Header values, TLS versions, and the policies themselves are industry standards and are kept verbatim in the body.)

## 1. Core Principles
- **Do not trust plaintext transport**: assume the network path can be eavesdropped on and tampered with. Allow only HTTPS for all traffic, and convert HTTP requests to HTTPS with a permanent redirect (301).
- **Block plaintext reconnection with HSTS**: enforce HSTS so the browser does not fall back to plaintext after the first request. Redirects alone expose the initial plaintext request, so HSTS is essential.
- **Default-deny, explicit allow (default-deny)**: make CSP and CORS default to "block everything and open only the origins you need." Wildcard allows collapse the trust boundary.
- **TLS with secure versions and ciphers only**: prevent downgrades to vulnerable protocols and cipher suites. Allow only the minimum version and above.
- **Do not leave sensitive responses in caches**: keep responses containing authentication or personal data from lingering in proxy or browser caches.
- **Apply headers and policies in one place**: do not scatter security headers and CORS policy across each endpoint; apply them consistently at a common entry point (middleware/filter/gateway).
- **Configuration via environment, not code**: separate values that differ per environment, such as allowed origins and certificates, into environment variables/configuration so development settings do not leak into production.

## 2. Rules

### 2-1. Enforce HTTPS for all traffic
- Requests arriving over HTTP get a 301 redirect to the HTTPS of the same path. Do not serve HTTP as-is.
- Do not stop at redirecting; apply **HSTS together** so subsequent reconnections do not drop to plaintext.

```text
// ❌ Forbidden — leaving HTTP as-is, or only redirecting while omitting HSTS
http://api → (respond as-is)            // plaintext exposure
http://api → 301 https://api          // the next connection may be plaintext again

// ✅ Recommended — enforce HTTPS + block plaintext reconnection with HSTS
http://api → 301 https://api
Response header: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 2-2. Apply standard security headers in bulk
- Apply the headers below to all responses at a common entry point (values are industry standard).

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{random}';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- HSTS includes `max-age=31536000` (1 year) or more + `includeSubDomains`.
- For clickjacking defense, apply `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`).

### 2-3. Base CSP on default-src 'self', remove unsafe-inline
- Default to `default-src 'self'` and **explicitly allow** only the necessary origins per directive.
- Allowing inline scripts/styles (`unsafe-inline`) neutralizes XSS defense — replace it with a nonce or hash.

```text
// ❌ Forbidden — allowing inline across the board (neutralizes XSS defense)
Content-Security-Policy: default-src *; script-src 'self' 'unsafe-inline'

// ✅ Recommended — default self, allow inline only via nonce
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
```

### 2-4. CORS via an explicit allowlist (no wildcards)
- Manage allowed origins as a **per-environment allowlist**. Do not use `Access-Control-Allow-Origin: *` in production.
- Never combine a wildcard origin with requests that carry credentials (`allow_credentials`).
- Do not hardcode the allowed-origin list; separate it into environment variables/configuration.

```text
// Specify allowed origins per environment
Development:  allow localhost:3000 (explicit)
Staging:      allow staging.example.com
Production:   allow app.example.com only
```

```text
// ❌ Forbidden — allowing all origins in production
Access-Control-Allow-Origin: *

// ✅ Recommended — manage an allowlist via environment variable (ALLOWED_ORIGINS)
allow_origins = ALLOWED_ORIGINS.split(',')
```

### 2-5. No caching of sensitive responses
- Apply `Cache-Control: no-store` to responses containing authentication or personal data to prevent lingering in proxy/browser caches.

```text
// ❌ Forbidden — sensitive response goes out in a cacheable state
200 /me  (no Cache-Control)         // lingers in proxy/browser

// ✅ Recommended — no caching of sensitive responses
200 /me  Cache-Control: no-store
```

### 2-6. Allow only secure TLS versions and ciphers
- Allow only TLS 1.2 and above (disable SSLv3, TLS 1.0/1.1) — prevent downgrades to vulnerable protocols.
- Allow only strong cipher suites.
- Target an A grade on external audit tools (e.g., SSL Labs `ssllabs.com/ssltest`).
- Operate so certificates are **auto-renewed** before expiry (manual renewal invites expiry incidents).

```text
// ❌ Forbidden — allowing old protocols → downgrade attack
TLS 1.0 / 1.1 / SSLv3 enabled

// ✅ Recommended — minimum version and above + strong ciphers only
min TLS 1.2,  strong cipher suites only,  SSL Labs grade A
```

## 3. Common Mistakes
- **Only redirecting and omitting HSTS** → even with a 301, the initial request is exposed as plaintext. Always pair redirect + HSTS.
- **`unsafe-inline` lingering in CSP** → the header is set, but allowing inline neutralizes XSS defense. Replace with nonce/hash.
- **Combining wildcard origin + credentials** → using `*` for credentialed requests gets blocked by the browser or becomes even more dangerous. Production CORS should be a per-environment allowlist, explicit origins only.
- **Not applying `no-store` to sensitive responses** → authentication/personal-data responses linger in proxy/browser caches.
- **Manual certificate renewal** → missing a renewal causes an expiry outage. Use auto-renewal.
- **Applying headers sporadically per endpoint** → omissions are frequent. Apply them in bulk at a common entry point.

## 4. Checklist
- [ ] Do you 301-redirect HTTP to HTTPS and set **HSTS**?
- [ ] Did you apply standard security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) in bulk at a common point?
- [ ] Did you remove `unsafe-inline` from CSP and specify origins explicitly?
- [ ] Do you manage CORS origins as a per-environment allowlist (no `*`, no combining credentials with a wildcard)?
- [ ] Did you set `Cache-Control: no-store` on sensitive API responses?
- [ ] Do you allow only TLS 1.2 and above and confirm strong cipher suites + SSL Labs grade A?
- [ ] Do you operate certificates with auto-renewal?
- [ ] Did you separate per-environment values like allowed origins and certificates into environment variables/configuration?

## Appendix: Examples by Stack

> The below are reference implementation examples. Add examples matching the stack your team uses (e.g., Node/Helmet, Python/FastAPI, Nginx/Apache, certbot) following the same pattern. The principles and rules in 1–4 above are the standard; the appendix is merely an application example. For adjacent topics like input validation and authentication, follow the relevant skill.

### Examples by Tool

#### Security header configuration — Node.js (Helmet)

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

#### HTTPS enforcement · CORS — Python (FastAPI)

```python
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(CORSMiddleware,
  allow_origins=["https://app.example.com"],  # allowlist
  allow_credentials=True,
  allow_methods=["GET", "POST", "PUT", "DELETE"],
  allow_headers=["Authorization", "Content-Type"],
)
```

#### TLS certificate auto-renewal — Let's Encrypt (certbot)

- Certificate auto-renewal configuration (Let's Encrypt certbot)
