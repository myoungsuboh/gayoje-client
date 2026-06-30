---
name: 认证(AuthN) & 授权(AuthZ) 模式
description: 基于 JWT、OAuth 2.0、RBAC/ABAC 实现认证与授权的安全最佳实践。在确定令牌存储、刷新策略、权限校验与会话管理，或编写登录/授权代码时阅读。关键词: JWT, httpOnly, refresh_token, access_token, RBAC, Authorization, Bearer, OAuth, PKCE。
rules:
  - "JWT 存储在 httpOnly、Secure、SameSite=Strict 的 cookie 中，不存储在 localStorage/sessionStorage。"
  - "将 Access Token 过期时间设置为 15 分钟以内，并用 Refresh Token 自动刷新。"
  - "权限校验必须在服务端进行，不依赖仅凭客户端条件(v-if)隐藏 UI 的方式。"
  - "使用 OAuth 2.0 Authorization Code Flow + PKCE，不使用 Implicit Flow。"
  - "对失败的登录尝试按账号与按 IP 进行限流(Rate Limit),超过阈值时应用 CAPTCHA 或账号锁定。"
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

# 🔐 认证(AuthN) & 授权(AuthZ) 模式

> 基于 JWT、OAuth 2.0、RBAC 安全地实现认证与授权。在确定令牌存储与刷新策略、权限校验、会话管理，或编写登录/授权代码时阅读。

## 1. 核心原则
- JWT 存储在 httpOnly、Secure、SameSite=Strict 的 cookie 中，不存储在 localStorage/sessionStorage。
- 将 Access Token 过期时间设置为 15 分钟以内，并用 Refresh Token 自动刷新。
- 权限校验必须在服务端进行，不依赖仅凭客户端条件(v-if)隐藏 UI 的方式。
- 使用 OAuth 2.0 Authorization Code Flow + PKCE，不使用 Implicit Flow。
- 对失败的登录尝试按账号与按 IP 进行限流(Rate Limit),超过阈值时应用 CAPTCHA 或账号锁定。

## 2. 规则

### 2-1. 令牌存储策略
localStorage/sessionStorage 会暴露于 XSS，因此禁止作为令牌存储位置。仅存储在 httpOnly cookie 或内存中。

| 存储位置 | XSS 风险 | CSRF 风险 | 推荐 |
|-----------|----------|-----------|------|
| localStorage | 高 | 无 | ❌ 禁止 |
| sessionStorage | 高 | 无 | ❌ 禁止 |
| httpOnly cookie | 无 | 有 | ✅ (追加 SameSite=Strict) |
| Memory (变量) | 无 | 无 | ✅ (刷新时失效) |

### 2-2. JWT 生命周期策略
将 Access Token 保持短时(15 分钟以内),并在失效前用 Refresh Token 自动刷新。

```
Access Token:  15분 만료  → API 요청마다 사용
Refresh Token: 7일 만료   → httpOnly 쿠키에 저장
                            → 만료 2분 전 자동 갱신
```

### 2-3. RBAC 权限校验
在服务端进行权限校验。不要仅靠客户端 UI 隐藏来保护。

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

### 2-4. OAuth 2.0 + PKCE 流程
使用 Authorization Code Flow + PKCE 而非 Implicit Flow。

```
1. 앱 → PKCE code_verifier 생성
2. 앱 → Authorization Server (code_challenge 포함)
3. 사용자 → 로그인 & 동의
4. Authorization Server → 앱 (authorization_code)
5. 앱 → Token Endpoint (code + code_verifier)
6. Authorization Server → 앱 (access_token + refresh_token)
```

### 2-5. 登录失败限制
按账号与按 IP 限制尝试次数，超过阈值时锁定。

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

## 3. 常见错误
- 将令牌存储在 localStorage → 会被 XSS 窃取。
- 将 Access Token 过期时间设置得很长 → 被窃取时损失更大。
- 仅在客户端(v-if)校验权限 → 直接调用 API 即可绕过。
- 使用 Implicit Flow → 令牌暴露在 URL 中。
- 没有登录失败限制 → 易受暴力破解(brute force)攻击。

## 4. 检查清单
- [ ] 是否将 JWT 存储在 httpOnly、Secure、SameSite=Strict 的 cookie 或内存中?
- [ ] 是否将 Access Token 过期时间保持在 15 分钟以内并用 Refresh Token 刷新?
- [ ] 是否在服务端进行权限校验?
- [ ] OAuth 是否使用 Authorization Code Flow + PKCE?
- [ ] 是否按账号与 IP 限制登录失败，并在超过阈值时应用锁定/CAPTCHA?
