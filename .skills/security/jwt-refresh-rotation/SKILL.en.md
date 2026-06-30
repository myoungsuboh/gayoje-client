---
name: JWT Refresh Token Rotation + Reuse Detection (OAuth 2.1)
description: A stack-agnostic, general-purpose standard for implementing Rotation, Reuse Detection, and Family Revocation — the patterns OAuth 2.1 recommends — in an access+refresh token structure. Read it when designing token issue/refresh/logout for services with mobile apps, SPAs, or OAuth flows, or when deciding token storage locations and TTL policy. Keywords: jwt, JsonWebToken, Bearer, refreshToken, Jwts.builder, Authorization, rotation, reuse detection, family revocation.
rules:
  - "Rotation: replace the refresh token with a new one every time it is used, and revoke the previous one immediately. A token is usable only once."
  - "Reuse Detection: if an already-revoked token comes back in, treat it as a theft signal and block it immediately."
  - "Family Revocation: bind tokens derived from the same login session into the same family, and when reuse is detected, revoke the entire family rather than a single token."
  - "Store as a hash: store only a hash (e.g., SHA-256) on the server, not the plaintext refresh token — even if the DB leaks, the token cannot be used as-is."
  - "Separate storage locations: keep the access token in memory and the refresh token in an HttpOnly cookie or OS secure storage. localStorage is forbidden."
  - "Short TTL: keep the access token short (15–30 min) and the refresh token moderate (7–14 days), and set a separate absolute expiry for unused tokens."
  - "Revoke on the server at logout/password change: client-side deletion alone is not enough. Revoke the relevant family (or all of the user's) immediately on the server."
tags:
  - "jwt"
  - "JsonWebToken"
  - "Bearer"
  - "refreshToken"
  - "Jwts.builder"
  - "Authorization"
  - "rotation"
  - "reuse detection"
  - "family revocation"
  - "refresh-token"
  - "token-rotation"
  - "reuse-detection"
  - "oauth2.1"
---

# 🔐 JWT Refresh Token Rotation + Reuse Detection

> Standardize token rotation, reuse detection, and family revocation in an access+refresh token structure. Read it when designing the login/refresh/logout flow or deciding token storage locations and TTL.
>
> Basic JWT authentication is covered in the `security-backend` skill ([../security-backend/SKILL.md](../security-backend/SKILL.md)). This skill is about how to implement the three security patterns OAuth 2.1 explicitly recommends — **Refresh Token Rotation + Reuse Detection + Family Revocation**.
>
> Applies to: mobile apps, SPAs, and any service with an OAuth flow. The body covers stack-agnostic concepts, and concrete implementation code is in the appendix at the very end.

## 1. Core Principles

- **Rotation:** replace the refresh token with a new one every time it is used, and revoke the previous one immediately. A token is usable only once.
- **Reuse Detection:** if an already-revoked token comes back in, treat it as a theft signal and block it immediately.
- **Family Revocation:** bind tokens derived from the same login session into the same family, and when reuse is detected, revoke the **entire family** rather than a single token.
- **Store as a hash:** store only a hash (e.g., SHA-256) on the server, not the plaintext refresh token — even if the DB leaks, the token cannot be used as-is.
- **Separate storage locations:** keep the access token in memory and the refresh token in an `HttpOnly` cookie or OS secure storage. `localStorage` is forbidden.
- **Short TTL:** keep the access token short (15–30 min) and the refresh token moderate (7–14 days), and set a separate absolute expiry for unused tokens.
- **Revoke on the server at logout/password change:** client-side deletion alone is not enough. Revoke the relevant family (or all of the user's) immediately on the server.

## 2. Rules

### 2-1. Why rotation

Traditional approach: every time the access token expires, use the **same** refresh token to issue a new access token. Once the refresh token leaks, it can issue unlimited access tokens until expiry (usually 7–30 days).

Rotation approach: replace the refresh token with a **new refresh token** every time it is used. The previous token is revoked immediately. A token is usable only once.

**Reuse detection** is combined with this: if an already-revoked token comes back in → it is a signal that **an attacker stole the token** → immediately revoke that user's entire token family + force re-login.

### 2-2. Data model (family, hash, revocation reason)

The key is tracking the **hash, family, and revocation state** rather than the token itself. Choose the store (RDB/Redis, etc.) to suit your stack, but keep the conceptual columns below the same.

```sql
CREATE TABLE refresh_tokens (
    id            UUID PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    token_hash    VARCHAR(64) NOT NULL,  -- SHA-256 hex
    family_id     UUID NOT NULL,         -- 같은 로그인 세션 = 같은 family
    issued_at     TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,           -- 회전 시 NOW() 기록
    revoked_reason VARCHAR(50),          -- 'ROTATED' / 'REUSE_DETECTED' / 'LOGOUT' / 'PASSWORD_CHANGED'
    parent_id     UUID,                  -- 이전 토큰 id (이력 추적)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

**Store only the SHA-256 hash, not the plaintext (plain) token**. If the DB leaks, the token cannot be used as-is.

### 2-3. Issuance (at login)

- At login, generate a new **family id** and issue an access token + refresh token pair.
- For the refresh token, an **opaque string** made from a secure random of 32 bytes or more is recommended. The server stores only the hash and delivers the plaintext to the client.
- The refresh token **does not have to be a JWT** — an opaque random string is safer (verified only on the server, unguessable). Making it a JWT makes server-side revocation hard.

### 2-4. Rotation (at refresh) + reuse detection

When a refresh request arrives, handle it in the following order.

1. Look up the stored token by the hash of the incoming token (reject if none).
2. **Expiry check** — reject if expired.
3. **Reuse detection** — if an already-revoked (`revoked_at`) token comes back in, theft is suspected. **Revoke the entire family** (`REUSE_DETECTED`), leave a security log, and then reject.
4. **Normal rotation** — revoke the current token as `ROTATED` and issue a new token pair in the **same family** (record the previous token id in `parent_id`).

> Key: when reuse is detected, you must revoke the **entire family**, not just that one token, to block the theft.

### 2-5. Client-side flow

- On a 401 response, attempt a refresh **only once**, and on success, retry the original request.
- If the refresh fails (everything revoked due to reuse detection, etc.), clear the local session and force re-login.
- Since multiple requests can receive a 401 at the same time, **share the refresh call as a single in-flight Promise** to prevent duplicate calls.

### 2-6. Token storage location (client)

| Environment | Access token | Refresh token |
|---|---|---|
| **Web SPA** | Memory (state store) | **`HttpOnly` Secure cookie** |
| **Capacitor mobile** | Memory | `@capacitor/preferences` (mapped to EncryptedSharedPreferences on Android) |
| **React Native** | Memory | Keychain(iOS) / Keystore(Android) |

> Never store in `localStorage` — it is stolen as-is on XSS.

### 2-7. Explicit logout · password change

- At logout, **immediately revoke the family** of that token (`LOGOUT`) on the server, and the client removes the access token from memory.
- At password change, it is good practice to **revoke all of that user's families** (`PASSWORD_CHANGED`).

### 2-8. TTL policy

| Value | Recommended |
|---|---|
| Access token expiry | **15–30 min** |
| Refresh token expiry | **7–14 days** (longer for mobile, shorter for security-sensitive services) |
| Unused token absolute expiry | 30 days (expires if not refreshed without activity) |

Too short degrades user experience; too long increases exposure time on theft. 14 days is the mobile standard.

### 2-9. Cleanup job (scheduled)

Cleaning up expired token rows is run periodically by a separate batch/scheduler, not on the service request path (e.g., every dawn, deleting those past 30 days after expiry).

### 2-10. Audit log

Rotation, reuse detection, and family revocation are security events. Record them to a separate audit log topic per the `logging-observability` skill.

```
{event: "REFRESH_TOKEN_ROTATED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_REUSE_DETECTED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_FAMILY_REVOKED", userId, familyId, reason, ts}
```

Stream it to SIEM and alarm when reuse detection occurs.

## 3. Common Mistakes

- ❌ Reusing the same refresh token until expiry without rotation — defenseless on leak.
- ❌ Storing the plaintext (plain) token in the DB — a DB leak is an authentication-key leak.
- ❌ Revoking only that token on reuse detection — you must revoke the **entire family** to block the theft.
- ❌ Storing the access token in `localStorage` — XSS theft.
- ❌ Not rate-limiting the refresh API — you must block brute-force rotation attempts (10/min/IP recommended).
- ❌ Issuing the refresh token as a JWT — hard to revoke. Opaque random is recommended.

## 4. Checklist

- [ ] Is the refresh token replaced with a new one every time it is used (rotation)?
- [ ] On reuse of a revoked token, is the entire same family invalidated?
- [ ] Is only the hash, not the plaintext token, stored on the server?
- [ ] Is the access token in memory and the refresh token in an `HttpOnly` cookie/OS secure storage (no `localStorage`)?
- [ ] Are access TTL 15–30 min, refresh TTL 7–14 days, and an unused absolute expiry set?
- [ ] At logout/password change, is the family (or all of the user's) revoked on the server?
- [ ] Is the refresh API rate-limited?
- [ ] Are rotation, reuse detection, and family revocation recorded to the audit log?

## Appendix: Examples by Stack

The examples below are implementations tied to a specific stack (Java/Spring, TypeScript). Follow the body above for concepts, and borrow the code to suit your environment.

### A. Issuance — Java / Spring (`@Service`)

```java
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository repo;
    private final JwtTokenProvider jwt;

    @Value("${security.jwt.refresh-exp-ms:1209600000}")  // 14일
    private long refreshExpMs;

    public TokenPair issueOnLogin(Long userId) {
        UUID familyId = UUID.randomUUID();
        return issuePair(userId, familyId, null);
    }

    private TokenPair issuePair(Long userId, UUID familyId, UUID parentId) {
        String accessToken = jwt.createAccessToken(userId);
        String refreshTokenPlain = generateOpaqueToken();  // 32바이트 secure random
        String hash = sha256(refreshTokenPlain);

        RefreshToken entity = RefreshToken.builder()
            .id(UUID.randomUUID())
            .userId(userId)
            .tokenHash(hash)
            .familyId(familyId)
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusMillis(refreshExpMs))
            .parentId(parentId)
            .build();
        repo.save(entity);

        return new TokenPair(accessToken, refreshTokenPlain);
    }
}
```

> The refresh token **does not have to be a JWT** — an opaque random string is safer (verified only on the server, unguessable). Making it a JWT makes server-side revocation hard.

### B. Rotation + reuse detection — Java / Spring

```java
public TokenPair rotate(String refreshTokenPlain) {
    String hash = sha256(refreshTokenPlain);
    RefreshToken token = repo.findByTokenHash(hash)
        .orElseThrow(() -> new InvalidTokenException("Unknown refresh token"));

    // 만료 검사
    if (token.getExpiresAt().isBefore(Instant.now())) {
        throw new InvalidTokenException("Expired");
    }

    // === 재사용 탐지 핵심 로직 ===
    if (token.getRevokedAt() != null) {
        // 이미 폐기된 토큰을 다시 사용 → 도난 의심
        revokeFamily(token.getFamilyId(), "REUSE_DETECTED");
        log.warn("Refresh token reuse detected: family={} user={}", token.getFamilyId(), token.getUserId());
        throw new InvalidTokenException("Token reuse detected — all sessions revoked");
    }
    // ============================

    // 정상 회전: 현재 토큰 폐기 + 새 쌍 발급 (같은 family)
    token.revoke("ROTATED");
    repo.save(token);
    return issuePair(token.getUserId(), token.getFamilyId(), token.getId());
}

private void revokeFamily(UUID familyId, String reason) {
    repo.revokeAllByFamilyId(familyId, Instant.now(), reason);
}
```

```java
// RefreshTokenRepository
@Modifying
@Query("UPDATE RefreshToken t SET t.revokedAt = :now, t.revokedReason = :reason " +
       "WHERE t.familyId = :familyId AND t.revokedAt IS NULL")
void revokeAllByFamilyId(UUID familyId, Instant now, String reason);
```

### C. Client-side flow — TypeScript / axios

```typescript
// axios interceptor
axios.interceptors.response.use(
  r => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true
      try {
        const { accessToken } = await refreshTokens()
        err.config.headers.Authorization = `Bearer ${accessToken}`
        return axios(err.config)
      } catch (refreshErr) {
        // 재사용 탐지 → 전체 폐기 → 강제 재로그인
        authStore.logout()
        router.push('/login')
        return Promise.reject(refreshErr)
      }
    }
    return Promise.reject(err)
  }
)

// 동시 다발 401에 대한 동시성 처리 — 한 번만 refresh 호출
let refreshingPromise: Promise<TokenPair> | null = null
async function refreshTokens(): Promise<TokenPair> {
  if (refreshingPromise) return refreshingPromise
  refreshingPromise = axios.post('/auth/refresh', { refreshToken: getRefreshToken() })
    .then(r => r.data.data)
    .finally(() => { refreshingPromise = null })
  return refreshingPromise
}
```

### D. Explicit logout · password change — Java / Spring

```java
public void logout(String refreshTokenPlain) {
    String hash = sha256(refreshTokenPlain);
    repo.findByTokenHash(hash).ifPresent(t -> {
        revokeFamily(t.getFamilyId(), "LOGOUT");
    });
    // 클라이언트는 액세스 토큰도 즉시 폐기 (메모리에서 제거)
}
```

At password change, **revoking all families** is good practice:

```java
public void changePassword(...) {
    // ... 비밀번호 갱신
    repo.revokeAllByUserId(userId, "PASSWORD_CHANGED");
}
```

### E. Cleanup job (scheduled) — Java / Spring

```java
@Scheduled(cron = "0 0 3 * * *")  // 매일 새벽 3시
public void cleanupExpiredTokens() {
    int deleted = repo.deleteByExpiresAtBefore(Instant.now().minus(30, ChronoUnit.DAYS));
    log.info("Cleaned up {} expired refresh tokens", deleted);
}
```

### F. Note (review supplement)

- For refresh tokens, we primarily recommend an **opaque random string + server storage (Redis, etc.)** (immediately revocable). If you must use a JWT, do so on the premise of secret keeping, short expiry, and rotation — the body examples are based on the latter.
