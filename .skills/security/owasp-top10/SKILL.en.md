---
name: OWASP Top 10 Security Guide
description: Defensive coding standards for preventing major vulnerabilities based on the OWASP Top 10 (2021) — covering Injection, XSS, authentication failures, vulnerable dependencies, and more. Read it when designing/implementing new features, handling external input/authentication/authorization/data exposure, or during security reviews and code reviews. Keywords: sanitize, escape, parameterized, IDOR, XSS, injection, npm audit, Content-Security-Policy.
rules:
  - "Treat all external input (user, API, file) as untrusted and use whitelist validation or parameterized queries."
  - "Always escape user input when rendering HTML, and never insert unvalidated data into innerHTML."
  - "To prevent IDOR, re-verify ownership and permissions on the server when accessing resources."
  - "Never expose sensitive data (passwords, tokens, PII) in response bodies, URLs, or logs."
  - "Scan dependencies for vulnerabilities regularly (npm audit / pip-audit) and patch CRITICAL vulnerabilities immediately."
tags:
  - "sanitize"
  - "escape"
  - "parameterized"
  - "IDOR"
  - "XSS"
  - "injection"
  - "npm audit"
  - "Content-Security-Policy"
foundational: true
---

# 🔒 OWASP Top 10 Security Guide

> Standardizes defensive coding to prevent major vulnerabilities based on the OWASP Top 10 (2021). Read it when designing/implementing new features, handling external input/authentication/authorization/sensitive data, or during security reviews and code reviews.

## 1. Core Principles

- Treat all external input (user, API, file) as untrusted and use whitelist validation or parameterized queries.
- Always escape user input when rendering HTML, and never insert unvalidated data into `innerHTML`.
- To prevent IDOR, re-verify ownership and permissions on the server when accessing resources.
- Never expose sensitive data (passwords, tokens, PII) in response bodies, URLs, or logs.
- Scan dependencies for vulnerabilities regularly (`npm audit` / `pip-audit`) and patch CRITICAL vulnerabilities immediately.

## 2. Rules

### 2-1. OWASP Top 10 (2021) Overview

| Rank | Vulnerability | Key Prevention |
|------|--------|-------------|
| A01 | Broken Access Control | Server-side authorization checks, block IDOR |
| A02 | Cryptographic Failures | Enforce HTTPS, encrypt sensitive data at rest |
| A03 | Injection | Parameterized queries, input validation |
| A04 | Insecure Design | Threat modeling, secure design patterns |
| A05 | Security Misconfiguration | Change defaults, disable unneeded features |
| A06 | Vulnerable and Outdated Components | SCA scanning, automatic updates |
| A07 | Identification and Authentication Failures | MFA, session expiry, secure token storage |
| A08 | Software and Data Integrity Failures | Signature verification, CI/CD security |
| A09 | Security Logging and Monitoring Failures | Audit logs, anomaly detection alerts |
| A10 | SSRF | Whitelist outbound URL requests |

### 2-2. Preventing SQL Injection (A03)

```python
# ❌ 금지 — 문자열 조합 쿼리 (입력이 SQL로 해석됨)
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ 권장 — 파라미터화 쿼리
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

### 2-3. Preventing XSS (A03)

```javascript
// ❌ 금지 — 미검증 입력을 innerHTML에 삽입 (스크립트 실행 위험)
element.innerHTML = userInput;

// ✅ 권장
element.textContent = userInput;       // DOM API
DOMPurify.sanitize(htmlContent);       // HTML 허용 시 sanitize
```

### 2-4. Preventing IDOR (Insecure Direct Object Reference) (A01)

```python
# ✅ 권장 — 서버에서 소유권 항상 재검증
def get_order(order_id: str, current_user: User):
    order = db.get(order_id)
    if order.user_id != current_user.id:
        raise ForbiddenError("접근 권한이 없습니다")
    return order
```

## 3. Common Mistakes

- Checking permissions only on the client without re-verifying on the server → access control bypass.
- Leaving sensitive data in logs or URL query strings → creating a leakage path.
- Not adding dependency vulnerability scanning to CI, letting outdated components accumulate.

## 4. Checklist

- [ ] Did you handle all external input with whitelist validation or parameterized queries?
- [ ] Did you escape HTML output and avoid putting unvalidated data into `innerHTML`?
- [ ] Did you re-verify ownership and permissions on the server when accessing resources?
- [ ] Did you avoid exposing sensitive data in response bodies, URLs, or logs?
- [ ] Did you scan dependencies for vulnerabilities and patch CRITICAL ones?

---

- For the **concrete implementation** of input validation (e.g., declarative validation with Pydantic/Zod), refer to the `input-validation` skill — this skill covers the Top 10 overview and prioritization.
