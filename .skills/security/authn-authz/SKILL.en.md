---
name: Authentication (AuthN) & Authorization (AuthZ) Patterns
description: Security best practices for implementing authentication and authorization based on JWT, OAuth 2.0, and RBAC/ABAC. Read it when deciding on token storage, refresh strategy, permission verification, and session management, or when writing login/authorization code. Keywords: JWT, httpOnly, refresh_token, access_token, RBAC, Authorization, Bearer, OAuth, PKCE.
rules:
  - "Store JWTs in httpOnly, Secure, SameSite=Strict cookies, and never in localStorage/sessionStorage."
  - "Set the Access Token expiry to 15 minutes or less and auto-refresh it with a Refresh Token."
  - "Always perform permission verification on the server side, and do not rely on hiding the UI by client-side conditions (v-if) alone."
  - "Use the OAuth 2.0 Authorization Code Flow + PKCE, and do not use the Implicit Flow."
  - "Rate Limit failed login attempts per account and per IP, and apply CAPTCHA or account lockout when the threshold is exceeded."
tags:
  - "JWT"
  - "httpOnly"
  - "refresh_token"
  - "access_token"
  - "RBAC"
  - "Authorization"
  - "Bearer"
  - "OAuth"
  - "PKCE"
foundational: true
---

# 🔐 Authentication (AuthN) & Authorization (AuthZ) Patterns

> Implement authentication and authorization securely based on JWT, OAuth 2.0, and RBAC. Read it when deciding on token storage and refresh strategy, permission verification, and session management, or when writing login/authorization code.

## 1. Core Principles
- Store JWTs in httpOnly, Secure, SameSite=Strict cookies, and never in localStorage/sessionStorage.
- Set the Access Token expiry to 15 minutes or less and auto-refresh it with a Refresh Token.
- Always perform permission verification on the server side, and do not rely on hiding the UI by client-side conditions (v-if) alone.
- Use the OAuth 2.0 Authorization Code Flow + PKCE, and do not use the Implicit Flow.
- Rate Limit failed login attempts per account and per IP, and apply CAPTCHA or account lockout when the threshold is exceeded.

## 2. Rules

### 2-1. Token Storage Strategy
localStorage/sessionStorage are exposed to XSS, so they are forbidden as token storage locations. Store tokens only in httpOnly cookies or in memory.

| Storage location | XSS risk | CSRF risk | Recommended |
|-----------|----------|-----------|------|
| localStorage | High | None | ❌ Forbidden |
| sessionStorage | High | None | ❌ Forbidden |
| httpOnly cookie | None | Yes | ✅ (add SameSite=Strict) |
| Memory (variable) | None | None | ✅ (expires on refresh) |

### 2-2. JWT Lifetime Strategy
Keep the Access Token short (15 minutes or less) and auto-refresh it with the Refresh Token just before expiry.

```
Access Token:  15분 만료  → API 요청마다 사용
Refresh Token: 7일 만료   → httpOnly 쿠키에 저장
                            → 만료 2분 전 자동 갱신
```

### 2-3. RBAC Permission Verification
Perform permission verification on the server. Do not protect by client UI hiding alone.

```python
# ❌ 금지 — 클라이언트 조건으로만 권한 제어 (우회 가능)
// <button v-if="user.role === 'admin'">삭제</button>

# ✅ 권장 — 서버 측 권한 검증 데코레이터
def require_role(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if user.role not in roles:
                raise ForbiddenError()
            return func(*args, **kwargs)
        return wrapper
    return decorator

@require_role("admin", "manager")
def delete_user(user_id: str): ...
```

### 2-4. OAuth 2.0 + PKCE Flow
Use the Authorization Code Flow + PKCE instead of the Implicit Flow.

```
1. 앱 → PKCE code_verifier 생성
2. 앱 → Authorization Server (code_challenge 포함)
3. 사용자 → 로그인 & 동의
4. Authorization Server → 앱 (authorization_code)
5. 앱 → Token Endpoint (code + code_verifier)
6. Authorization Server → 앱 (access_token + refresh_token)
```

### 2-5. Login Failure Limiting
Limit the number of attempts per account and per IP, and lock when the threshold is exceeded.

```python
MAX_ATTEMPTS = 5
LOCKOUT_DURATION = 15  # minutes

def check_login_attempts(email: str, ip: str):
    key = f"login_attempts:{email}"
    attempts = redis.incr(key)
    if attempts == 1:
        redis.expire(key, LOCKOUT_DURATION * 60)
    if attempts > MAX_ATTEMPTS:
        raise TooManyRequestsError("잠시 후 다시 시도해 주세요.")
```

## 3. Common Mistakes
- Storing tokens in localStorage → they get stolen via XSS.
- Setting a long Access Token expiry → the damage grows if it is stolen.
- Verifying permissions only on the client (v-if) → bypassed by calling the API directly.
- Using the Implicit Flow → the token is exposed in the URL.
- No login failure limit → vulnerable to brute force.

## 4. Checklist
- [ ] Are JWTs stored in httpOnly, Secure, SameSite=Strict cookies or in memory?
- [ ] Is the Access Token expiry kept at 15 minutes or less and refreshed with a Refresh Token?
- [ ] Is permission verification performed on the server side?
- [ ] Does OAuth use the Authorization Code Flow + PKCE?
- [ ] Are login failures limited per account and per IP, with lockout/CAPTCHA applied when the threshold is exceeded?
