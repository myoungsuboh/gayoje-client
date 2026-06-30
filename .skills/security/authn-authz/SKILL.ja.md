---
name: 認証(AuthN) & 認可(AuthZ) パターン
description: JWT・OAuth 2.0・RBAC/ABACに基づく認証・認可実装のセキュリティのベストプラクティス。トークンの保存・更新戦略・権限検証・セッション管理を決めるとき、またはログイン/認可コードを作るときに読む。キーワード: JWT, httpOnly, refresh_token, access_token, RBAC, Authorization, Bearer, OAuth, PKCE。
rules:
  - "JWTはhttpOnly・Secure・SameSite=Strictクッキーに保存し、localStorage/sessionStorageには保存しない。"
  - "Access Tokenの有効期限は15分以下に設定し、Refresh Tokenで自動更新する。"
  - "権限検証は必ずサーバー側で行い、クライアント条件(v-if)だけでUIを隠す方式に依存しない。"
  - "OAuth 2.0 Authorization Code Flow + PKCEを使用し、Implicit Flowは使用しない。"
  - "失敗したログイン試行をアカウント別・IP別に制限(Rate Limit)し、閾値超過時にCAPTCHAまたはアカウントロックを適用する。"
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

# 🔐 認証(AuthN) & 認可(AuthZ) パターン

> JWT・OAuth 2.0・RBACに基づき認証・認可を安全に実装する。トークンの保存・更新戦略、権限検証、セッション管理を決めるとき、またはログイン/認可コードを作るときに読む。

## 1. 中核となる原則
- JWTはhttpOnly・Secure・SameSite=Strictクッキーに保存し、localStorage/sessionStorageには保存しない。
- Access Tokenの有効期限は15分以下に設定し、Refresh Tokenで自動更新する。
- 権限検証は必ずサーバー側で行い、クライアント条件(v-if)だけでUIを隠す方式に依存しない。
- OAuth 2.0 Authorization Code Flow + PKCEを使用し、Implicit Flowは使用しない。
- 失敗したログイン試行をアカウント別・IP別に制限(Rate Limit)し、閾値超過時にCAPTCHAまたはアカウントロックを適用する。

## 2. ルール

### 2-1. トークン保存戦略
localStorage/sessionStorageはXSSに露出するため、トークン保存場所として禁止する。httpOnlyクッキーまたはメモリにのみ保存する。

| 保存場所 | XSSリスク | CSRFリスク | 推奨 |
|-----------|----------|-----------|------|
| localStorage | 高 | なし | ❌ 禁止 |
| sessionStorage | 高 | なし | ❌ 禁止 |
| httpOnlyクッキー | なし | あり | ✅ (SameSite=Strict追加) |
| Memory (変数) | なし | なし | ✅ (リロード時に失効) |

### 2-2. JWT寿命戦略
Access Tokenは短く(15分以下)し、Refresh Tokenで失効直前に自動更新する。

```
Access Token:  15분 만료  → API 요청마다 사용
Refresh Token: 7일 만료   → httpOnly 쿠키에 저장
                            → 만료 2분 전 자동 갱신
```

### 2-3. RBAC権限検証
権限検証はサーバーで行う。クライアントUIの非表示だけで保護しない。

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

### 2-4. OAuth 2.0 + PKCE フロー
Implicit Flowの代わりにAuthorization Code Flow + PKCEを使用する。

```
1. 앱 → PKCE code_verifier 생성
2. 앱 → Authorization Server (code_challenge 포함)
3. 사용자 → 로그인 & 동의
4. Authorization Server → 앱 (authorization_code)
5. 앱 → Token Endpoint (code + code_verifier)
6. Authorization Server → 앱 (access_token + refresh_token)
```

### 2-5. ログイン失敗制限
アカウント別・IP別に試行回数を制限し、閾値超過時にロックする。

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

## 3. よくある間違い
- トークンをlocalStorageに保存 → XSSで奪取される。
- Access Tokenの有効期限を長く設定 → 奪取時の被害が大きくなる。
- 権限をクライアント(v-if)だけで検証 → APIの直接呼び出しで回避される。
- Implicit Flowを使用 → トークンがURLに露出する。
- ログイン失敗制限なし → ブルートフォース(brute force)に脆弱である。

## 4. チェックリスト
- [ ] JWTをhttpOnly・Secure・SameSite=Strictクッキーまたはメモリに保存したか
- [ ] Access Tokenの有効期限を15分以下に置き、Refresh Tokenで更新するか
- [ ] 権限検証をサーバー側で行うか
- [ ] OAuthはAuthorization Code Flow + PKCEを使用するか
- [ ] ログイン失敗をアカウント・IP別に制限し、閾値超過時にロック/CAPTCHAを適用するか
