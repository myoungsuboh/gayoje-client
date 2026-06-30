---
name: JWT Refresh Token 회전 + 재사용 탐지 (OAuth 2.1)
description: 액세스+리프레시 토큰 구조에서 OAuth 2.1 권장 패턴인 회전(Rotation)·재사용 탐지(Reuse Detection)·패밀리 무효화(Family Revocation)를 구현하는 스택 무관 범용 표준. 모바일 앱·SPA·OAuth 흐름을 가진 서비스의 토큰 발급/갱신/로그아웃을 설계하거나, 토큰 저장 위치·TTL 정책을 정할 때 읽는다. 키워드: jwt, JsonWebToken, Bearer, refreshToken, Jwts.builder, Authorization, rotation, reuse detection, family revocation.
rules:
  - "회전(Rotation): 리프레시 토큰은 사용할 때마다 새 토큰으로 교체하고, 이전 토큰은 즉시 폐기한다. 한 토큰은 단 1회만 사용 가능하다."
  - "재사용 탐지(Reuse Detection): 이미 폐기된 토큰이 다시 들어오면 도난 신호로 보고 즉시 차단한다."
  - "패밀리 무효화(Family Revocation): 같은 로그인 세션에서 파생된 토큰은 같은 패밀리(family)로 묶고, 재사용이 탐지되면 토큰 하나가 아니라 패밀리 전체를 무효화한다."
  - "저장은 해시로: 리프레시 토큰 원문이 아니라 해시(예: SHA-256)만 서버에 저장한다 — DB가 유출돼도 토큰을 그대로 쓸 수 없다."
  - "저장 위치 분리: 액세스 토큰은 메모리에, 리프레시 토큰은 HttpOnly 쿠키 또는 OS 보안 저장소에 둔다. localStorage는 금지한다."
  - "짧은 TTL: 액세스 토큰은 짧게(15~30분), 리프레시 토큰은 적당히(7~14일) 두고, 미사용 토큰은 절대 만료 시각을 따로 둔다."
  - "로그아웃·비밀번호 변경 시 서버에서 폐기: 클라이언트 삭제만으로는 부족하다. 서버에서 해당 패밀리(또는 사용자 전체)를 즉시 폐기한다."
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

# 🔐 JWT Refresh Token 회전 + 재사용 탐지

> 액세스+리프레시 토큰 구조에서 토큰 회전·재사용 탐지·패밀리 무효화를 표준화한다. 로그인/갱신/로그아웃 흐름을 설계하거나 토큰 저장 위치·TTL을 정할 때 읽는다.
>
> 기본 JWT 인증은 `security-backend` 스킬([../security-backend/SKILL.md](../security-backend/SKILL.md))에서 다룬다. 이 스킬은 OAuth 2.1이 명시적으로 권고하는 **Refresh Token Rotation + Reuse Detection + Family Revocation** 3종 보안 패턴을 구현하는 방법이다.
>
> 적용 대상: 모바일 앱, SPA, OAuth 흐름을 가지는 모든 서비스. 스택 무관 개념을 본문에서 다루고, 구체 구현 코드는 맨 끝 부록에 둔다.

## 1. 핵심 원칙

- **회전(Rotation):** 리프레시 토큰은 사용할 때마다 새 토큰으로 교체하고, 이전 토큰은 즉시 폐기한다. 한 토큰은 단 1회만 사용 가능하다.
- **재사용 탐지(Reuse Detection):** 이미 폐기된 토큰이 다시 들어오면 도난 신호로 보고 즉시 차단한다.
- **패밀리 무효화(Family Revocation):** 같은 로그인 세션에서 파생된 토큰은 같은 패밀리(family)로 묶고, 재사용이 탐지되면 토큰 하나가 아니라 **패밀리 전체**를 무효화한다.
- **저장은 해시로:** 리프레시 토큰 원문이 아니라 해시(예: SHA-256)만 서버에 저장한다 — DB가 유출돼도 토큰을 그대로 쓸 수 없다.
- **저장 위치 분리:** 액세스 토큰은 메모리에, 리프레시 토큰은 `HttpOnly` 쿠키 또는 OS 보안 저장소에 둔다. `localStorage`는 금지한다.
- **짧은 TTL:** 액세스 토큰은 짧게(15~30분), 리프레시 토큰은 적당히(7~14일) 두고, 미사용 토큰은 절대 만료 시각을 따로 둔다.
- **로그아웃·비밀번호 변경 시 서버에서 폐기:** 클라이언트 삭제만으로는 부족하다. 서버에서 해당 패밀리(또는 사용자 전체)를 즉시 폐기한다.

## 2. 규칙

### 2-1. 왜 회전인가

전통적 방식: 액세스 만료 시마다 **같은** 리프레시 토큰을 사용해 새 액세스 발급. 리프레시 토큰이 한 번 유출되면 만료 전까지(보통 7~30일) 무제한 액세스 발급 가능.

회전 방식: 리프레시 토큰을 사용할 때마다 **새 리프레시 토큰**으로 교체. 이전 토큰은 즉시 폐기. 한 토큰은 단 1회만 사용 가능.

여기에 **재사용 탐지**가 결합된다: 이미 폐기된 토큰이 다시 들어오면 → **공격자가 토큰을 훔쳤다**는 신호 → 해당 사용자의 전체 토큰 패밀리 즉시 무효화 + 강제 재로그인.

### 2-2. 데이터 모델 (패밀리·해시·폐기 사유)

토큰 자체가 아니라 **해시·패밀리·폐기 상태**를 추적하는 것이 핵심이다. 저장소(RDB/Redis 등)는 스택에 맞게 고르되, 아래 개념 컬럼은 동일하게 유지한다.

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

**토큰 원문(plain)이 아니라 SHA-256 해시만 저장**한다. DB 유출 시 토큰 그대로 사용 불가.

### 2-3. 발급 (로그인 시)

- 로그인 시 새 **패밀리 id**를 생성하고, 액세스 토큰 + 리프레시 토큰 쌍을 발급한다.
- 리프레시 토큰은 32바이트 이상 secure random으로 만든 **opaque 문자열**을 권장한다. 서버는 해시만 저장하고, 클라이언트에는 원문을 전달한다.
- 리프레시 토큰은 **JWT가 아니어도 된다** — opaque random string이 더 안전하다(서버에서만 검증, 추측 불가). JWT로 만들면 서버 사이드 폐기가 어려워진다.

### 2-4. 회전 (리프레시 시) + 재사용 탐지

리프레시 요청이 오면 다음 순서로 처리한다.

1. 들어온 토큰의 해시로 저장된 토큰을 조회한다(없으면 거부).
2. **만료 검사** — 만료됐으면 거부한다.
3. **재사용 탐지** — 이미 폐기(`revoked_at`)된 토큰이 다시 들어왔다면 도난 의심이다. 해당 **패밀리 전체를 무효화**(`REUSE_DETECTED`)하고 보안 로그를 남긴 뒤 거부한다.
4. **정상 회전** — 현재 토큰을 `ROTATED`로 폐기하고, **같은 패밀리**로 새 토큰 쌍을 발급한다(`parent_id`에 이전 토큰 id 기록).

> 핵심: 재사용이 탐지되면 그 토큰 하나만이 아니라 **family 전체**를 폐기해야 도난을 차단한다.

### 2-5. 클라이언트 측 흐름

- 401 응답을 받으면 **한 번만** 리프레시를 시도하고, 성공하면 원 요청을 재시도한다.
- 리프레시가 실패하면(재사용 탐지 등으로 전체 폐기됨) 로컬 세션을 비우고 강제 재로그인시킨다.
- 동시에 여러 요청이 401을 받을 수 있으므로, 리프레시 호출은 **단일 in-flight Promise로 공유**해 중복 호출을 막는다.

### 2-6. 토큰 저장 위치 (클라이언트)

| 환경 | 액세스 토큰 | 리프레시 토큰 |
|---|---|---|
| **Web SPA** | 메모리(상태 저장소) | **`HttpOnly` Secure 쿠키** |
| **Capacitor 모바일** | 메모리 | `@capacitor/preferences` (Android는 EncryptedSharedPreferences로 매핑) |
| **React Native** | 메모리 | Keychain(iOS) / Keystore(Android) |

> 절대 `localStorage`에 저장 금지 — XSS 시 그대로 탈취됨.

### 2-7. 명시적 로그아웃 · 비밀번호 변경

- 로그아웃 시 서버에서 해당 토큰의 **패밀리를 즉시 폐기**(`LOGOUT`)하고, 클라이언트는 액세스 토큰을 메모리에서 제거한다.
- 비밀번호 변경 시에는 해당 사용자의 **모든 패밀리를 폐기**(`PASSWORD_CHANGED`)하는 것이 좋은 관례다.

### 2-8. TTL 정책

| 값 | 권장 |
|---|---|
| 액세스 토큰 만료 | **15~30분** |
| 리프레시 토큰 만료 | **7~14일** (모바일은 길게, 보안 민감 서비스는 짧게) |
| 미사용 토큰 절대 만료 | 30일 (활동 없이 갱신 안 되면 만료) |

너무 짧으면 사용자 경험 저하, 너무 길면 도난 시 노출 시간 증가. 14일이 모바일 표준.

### 2-9. 정리 잡 (스케줄)

만료된 토큰 row 정리는 서비스 요청 경로가 아니라 별도 배치/스케줄러로 주기 실행한다(예: 매일 새벽, 만료 후 30일 경과분 삭제).

### 2-10. 감사 로그

회전·재사용 탐지·family 폐기는 보안 이벤트다. `logging-observability` 스킬에 따라 별도 감사 로그 토픽으로 적재한다.

```
{event: "REFRESH_TOKEN_ROTATED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_REUSE_DETECTED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_FAMILY_REVOKED", userId, familyId, reason, ts}
```

SIEM에 흘려보내고 재사용 탐지 발생 시 알람.

## 3. 흔한 실수

- ❌ 회전 없이 같은 리프레시 토큰을 만료까지 재사용 — 유출 시 무방비.
- ❌ 토큰 원문(plain)을 DB에 저장 — DB 유출이 곧 인증 키 유출.
- ❌ 재사용 탐지 시 해당 토큰만 폐기 — **family 전체** 폐기해야 도난 차단.
- ❌ 액세스 토큰을 `localStorage`에 저장 — XSS 탈취.
- ❌ 리프레시 API에 Rate Limiting 안 걸기 — 무차별 회전 시도 막아야 함 (10/분/IP 권장).
- ❌ JWT로 리프레시 토큰 발급 — 폐기 어려움. opaque random 권장.

## 4. 체크리스트

- [ ] 리프레시 토큰을 사용 시마다 새 토큰으로 교체(회전)하는가
- [ ] 폐기된 토큰 재사용 시 같은 패밀리를 전부 무효화하는가
- [ ] 토큰 원문이 아니라 해시만 서버에 저장하는가
- [ ] 액세스 토큰은 메모리, 리프레시 토큰은 `HttpOnly` 쿠키/OS 보안 저장소에 두는가 (`localStorage` 미사용)
- [ ] 액세스 TTL 15~30분, 리프레시 TTL 7~14일, 미사용 절대 만료를 설정했는가
- [ ] 로그아웃·비밀번호 변경 시 서버에서 패밀리(또는 사용자 전체)를 폐기하는가
- [ ] 리프레시 API에 Rate Limiting을 걸었는가
- [ ] 회전·재사용 탐지·패밀리 폐기를 감사 로그로 남기는가

## 부록: 스택별 예시

아래 예시는 특정 스택(Java/Spring, TypeScript)에 종속된 구현이다. 개념은 위 본문을 따르고, 코드는 환경에 맞게 차용한다.

### A. 발급 — Java / Spring (`@Service`)

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

> 리프레시 토큰은 **JWT 아니어도 된다** — opaque random string이 더 안전(서버에서만 검증, 추측 불가). JWT로 만들면 서버 사이드 폐기가 어려워진다.

### B. 회전 + 재사용 탐지 — Java / Spring

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

### C. 클라이언트 측 흐름 — TypeScript / axios

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

### D. 명시적 로그아웃 · 비밀번호 변경 — Java / Spring

```java
public void logout(String refreshTokenPlain) {
    String hash = sha256(refreshTokenPlain);
    repo.findByTokenHash(hash).ifPresent(t -> {
        revokeFamily(t.getFamilyId(), "LOGOUT");
    });
    // 클라이언트는 액세스 토큰도 즉시 폐기 (메모리에서 제거)
}
```

비밀번호 변경 시도 **모든 family 폐기**가 좋은 관례:

```java
public void changePassword(...) {
    // ... 비밀번호 갱신
    repo.revokeAllByUserId(userId, "PASSWORD_CHANGED");
}
```

### E. 정리 잡 (스케줄) — Java / Spring

```java
@Scheduled(cron = "0 0 3 * * *")  // 매일 새벽 3시
public void cleanupExpiredTokens() {
    int deleted = repo.deleteByExpiresAtBefore(Instant.now().minus(30, ChronoUnit.DAYS));
    log.info("Cleaned up {} expired refresh tokens", deleted);
}
```

### F. 참고 (검수 보완)

- 리프레시 토큰은 **opaque random 문자열 + 서버 저장(Redis 등)** 을 우선 권장합니다(즉시 폐기 가능). 부득이 JWT 로 둘 경우 시크릿 보관·짧은 만료·회전을 전제로 합니다 — 본문 예시는 후자 기준입니다.
