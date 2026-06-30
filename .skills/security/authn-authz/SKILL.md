---
name: 인증(AuthN) & 인가(AuthZ) 패턴
description: JWT·OAuth 2.0·RBAC/ABAC 기반 인증·인가 구현의 보안 모범 사례. 토큰 저장·갱신 전략·권한 검증·세션 관리를 정하거나 로그인/인가 코드를 만들 때 읽는다. 키워드: JWT, httpOnly, refresh_token, access_token, RBAC, Authorization, Bearer, OAuth, PKCE.
rules:
  - "JWT는 httpOnly·Secure·SameSite=Strict 쿠키에 저장하고, localStorage/sessionStorage에 저장하지 않는다."
  - "Access Token 만료 시간은 15분 이하로 설정하고, Refresh Token으로 자동 갱신한다."
  - "권한 검증은 반드시 서버 측에서 수행하고, 클라이언트 조건(v-if)으로만 UI를 숨기는 방식에 의존하지 않는다."
  - "OAuth 2.0 Authorization Code Flow + PKCE를 사용하고, Implicit Flow를 사용하지 않는다."
  - "실패한 로그인 시도를 계정별·IP별로 제한(Rate Limit)하고, 임계치 초과 시 CAPTCHA 또는 계정 잠금을 적용한다."
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

# 🔐 인증(AuthN) & 인가(AuthZ) 패턴

> JWT·OAuth 2.0·RBAC 기반으로 인증·인가를 안전하게 구현한다. 토큰 저장·갱신 전략, 권한 검증, 세션 관리를 정하거나 로그인/인가 코드를 만들 때 읽는다.

## 1. 핵심 원칙
- JWT는 httpOnly·Secure·SameSite=Strict 쿠키에 저장하고, localStorage/sessionStorage에 저장하지 않는다.
- Access Token 만료 시간은 15분 이하로 설정하고, Refresh Token으로 자동 갱신한다.
- 권한 검증은 반드시 서버 측에서 수행하고, 클라이언트 조건(v-if)으로만 UI를 숨기는 방식에 의존하지 않는다.
- OAuth 2.0 Authorization Code Flow + PKCE를 사용하고, Implicit Flow를 사용하지 않는다.
- 실패한 로그인 시도를 계정별·IP별로 제한(Rate Limit)하고, 임계치 초과 시 CAPTCHA 또는 계정 잠금을 적용한다.

## 2. 규칙

### 2-1. 토큰 저장 전략
localStorage/sessionStorage는 XSS에 노출되므로 토큰 저장 위치로 금지한다. httpOnly 쿠키 또는 메모리에만 저장한다.

| 저장 위치 | XSS 위험 | CSRF 위험 | 권장 |
|-----------|----------|-----------|------|
| localStorage | 높음 | 없음 | ❌ 금지 |
| sessionStorage | 높음 | 없음 | ❌ 금지 |
| httpOnly 쿠키 | 없음 | 있음 | ✅ (SameSite=Strict 추가) |
| Memory (변수) | 없음 | 없음 | ✅ (새로고침 시 만료) |

### 2-2. JWT 수명 전략
Access Token은 짧게(15분 이하) 두고, Refresh Token으로 만료 직전 자동 갱신한다.

```
Access Token:  15분 만료  → API 요청마다 사용
Refresh Token: 7일 만료   → httpOnly 쿠키에 저장
                            → 만료 2분 전 자동 갱신
```

### 2-3. RBAC 권한 검증
권한 검증은 서버에서 수행한다. 클라이언트 UI 숨김만으로 보호하지 않는다.

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

### 2-4. OAuth 2.0 + PKCE 흐름
Implicit Flow 대신 Authorization Code Flow + PKCE를 사용한다.

```
1. 앱 → PKCE code_verifier 생성
2. 앱 → Authorization Server (code_challenge 포함)
3. 사용자 → 로그인 & 동의
4. Authorization Server → 앱 (authorization_code)
5. 앱 → Token Endpoint (code + code_verifier)
6. Authorization Server → 앱 (access_token + refresh_token)
```

### 2-5. 로그인 실패 제한
계정별·IP별로 시도 횟수를 제한하고, 임계치 초과 시 잠금한다.

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

## 3. 흔한 실수
- 토큰을 localStorage에 저장 → XSS로 탈취된다.
- Access Token 만료를 길게 설정 → 탈취 시 피해가 커진다.
- 권한을 클라이언트(v-if)에서만 검증 → API 직접 호출로 우회된다.
- Implicit Flow 사용 → 토큰이 URL에 노출된다.
- 로그인 실패 제한 없음 → 무차별 대입(brute force)에 취약하다.

## 4. 체크리스트
- [ ] JWT를 httpOnly·Secure·SameSite=Strict 쿠키 또는 메모리에 저장했는가
- [ ] Access Token 만료를 15분 이하로 두고 Refresh Token으로 갱신하는가
- [ ] 권한 검증을 서버 측에서 수행하는가
- [ ] OAuth는 Authorization Code Flow + PKCE를 사용하는가
- [ ] 로그인 실패를 계정·IP별로 제한하고 임계치 초과 시 잠금/CAPTCHA를 적용하는가
