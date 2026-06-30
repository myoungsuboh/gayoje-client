---
name: JWT Refresh Token 轮换 + 重用检测 (OAuth 2.1)
description: 在访问+刷新令牌结构中,实现 OAuth 2.1 推荐模式——轮换(Rotation)·重用检测(Reuse Detection)·家族吊销(Family Revocation)的与技术栈无关的通用标准。在为拥有移动应用·SPA·OAuth 流程的服务设计令牌的签发/刷新/登出,或决定令牌存储位置·TTL 策略时阅读。关键词:jwt, JsonWebToken, Bearer, refreshToken, Jwts.builder, Authorization, rotation, reuse detection, family revocation。
rules:
  - "轮换(Rotation):刷新令牌每次使用时都换成新令牌,旧令牌立即作废。一个令牌仅可使用 1 次。"
  - "重用检测(Reuse Detection):已作废的令牌再次到来时视为被盗信号,立即拦截。"
  - "家族吊销(Family Revocation):同一登录会话派生的令牌归入同一家族(family),检测到重用时吊销的不是单个令牌而是整个家族。"
  - "以哈希存储:服务器只存刷新令牌的哈希(例如 SHA-256)而非明文 —— 即便 DB 泄露也无法照样使用令牌。"
  - "分离存储位置:访问令牌放内存,刷新令牌放 HttpOnly cookie 或 OS 安全存储。禁止 localStorage。"
  - "短 TTL:访问令牌短(15~30 分钟)、刷新令牌适中(7~14 天),并为未使用令牌另设绝对过期时刻。"
  - "登出·改密时在服务器作废:仅客户端删除不够。在服务器立即作废相应家族(或该用户全部)。"
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

# 🔐 JWT Refresh Token 轮换 + 重用检测

> 在访问+刷新令牌结构中将令牌轮换·重用检测·家族吊销标准化。在设计登录/刷新/登出流程或决定令牌存储位置·TTL 时阅读。
>
> 基础的 JWT 认证在 `security-backend` 技能([../security-backend/SKILL.md](../security-backend/SKILL.md))中讲解。本技能讲的是如何实现 OAuth 2.1 明确推荐的 **Refresh Token Rotation + Reuse Detection + Family Revocation** 三种安全模式。
>
> 适用对象:移动应用、SPA、所有具有 OAuth 流程的服务。正文讲与技术栈无关的概念,具体实现代码放在末尾附录。

## 1. 核心原则

- **轮换(Rotation):** 刷新令牌每次使用时都换成新令牌,旧令牌立即作废。一个令牌仅可使用 1 次。
- **重用检测(Reuse Detection):** 已作废的令牌再次到来时视为被盗信号,立即拦截。
- **家族吊销(Family Revocation):** 同一登录会话派生的令牌归入同一家族(family),检测到重用时吊销的不是单个令牌而是**整个家族**。
- **以哈希存储:** 服务器只存刷新令牌的哈希(例如 SHA-256)而非明文 —— 即便 DB 泄露也无法照样使用令牌。
- **分离存储位置:** 访问令牌放内存,刷新令牌放 `HttpOnly` cookie 或 OS 安全存储。禁止 `localStorage`。
- **短 TTL:** 访问令牌短(15~30 分钟)、刷新令牌适中(7~14 天),并为未使用令牌另设绝对过期时刻。
- **登出·改密时在服务器作废:** 仅客户端删除不够。在服务器立即作废相应家族(或该用户全部)。

## 2. 规则

### 2-1. 为什么要轮换

传统方式:每次访问令牌过期就用**相同**的刷新令牌签发新的访问令牌。刷新令牌一旦泄露,在过期前(通常 7~30 天)可无限签发访问令牌。

轮换方式:刷新令牌每次使用时都换成**新的刷新令牌**。旧令牌立即作废。一个令牌仅可使用 1 次。

在此结合**重用检测**:已作废的令牌再次到来时 → **攻击者偷了令牌**的信号 → 立即吊销该用户的整个令牌家族 + 强制重新登录。

### 2-2. 数据模型 (家族·哈希·吊销原因)

关键在于追踪**哈希·家族·吊销状态**而非令牌本身。存储(RDB/Redis 等)按技术栈选择,但下面的概念列保持一致。

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

**只存 SHA-256 哈希而非明文(plain)令牌**。DB 泄露时令牌无法照样使用。

### 2-3. 签发 (登录时)

- 登录时生成新的**家族 id**,并签发访问令牌 + 刷新令牌对。
- 刷新令牌推荐用 32 字节以上 secure random 生成的**opaque 字符串**。服务器只存哈希,把明文交给客户端。
- 刷新令牌**不必是 JWT** —— opaque random string 更安全(只在服务器验证、不可猜测)。做成 JWT 会使服务端吊销变难。

### 2-4. 轮换 (刷新时) + 重用检测

收到刷新请求时按以下顺序处理。

1. 用进来令牌的哈希查询已存令牌(没有则拒绝)。
2. **过期检查** —— 过期则拒绝。
3. **重用检测** —— 已作废(`revoked_at`)的令牌再次进来则疑似被盗。**吊销整个家族**(`REUSE_DETECTED`),留下安全日志后拒绝。
4. **正常轮换** —— 把当前令牌以 `ROTATED` 作废,并在**同一家族**签发新令牌对(在 `parent_id` 记录旧令牌 id)。

> 关键:检测到重用时,必须吊销**整个 family** 而非那一个令牌,才能阻断盗用。

### 2-5. 客户端流程

- 收到 401 响应时**只尝试一次**刷新,成功则重试原请求。
- 刷新失败时(因重用检测等导致全部吊销)清空本地会话,强制重新登录。
- 由于多个请求可能同时收到 401,刷新调用要**以单个 in-flight Promise 共享**以防重复调用。

### 2-6. 令牌存储位置 (客户端)

| 环境 | 访问令牌 | 刷新令牌 |
|---|---|---|
| **Web SPA** | 内存(状态存储) | **`HttpOnly` Secure cookie** |
| **Capacitor 移动端** | 内存 | `@capacitor/preferences` (Android 映射为 EncryptedSharedPreferences) |
| **React Native** | 内存 | Keychain(iOS) / Keystore(Android) |

> 绝对禁止存到 `localStorage` —— XSS 时会被照样窃取。

### 2-7. 显式登出 · 改密

- 登出时在服务器**立即吊销**该令牌的**家族**(`LOGOUT`),客户端把访问令牌从内存移除。
- 改密时**吊销该用户的所有家族**(`PASSWORD_CHANGED`)是良好实践。

### 2-8. TTL 策略

| 值 | 推荐 |
|---|---|
| 访问令牌过期 | **15~30 分钟** |
| 刷新令牌过期 | **7~14 天** (移动端长些,安全敏感服务短些) |
| 未使用令牌绝对过期 | 30 天 (无活动不刷新则过期) |

太短会降低用户体验,太长会增加被盗时的暴露时间。14 天为移动端标准。

### 2-9. 清理作业 (计划)

过期令牌行的清理由独立的批处理/调度器周期运行,而非走在服务请求路径上(例如每天凌晨,删除过期后超 30 天的)。

### 2-10. 审计日志

轮换·重用检测·family 吊销是安全事件。按 `logging-observability` 技能将其载入独立的审计日志主题。

```
{event: "REFRESH_TOKEN_ROTATED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_REUSE_DETECTED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_FAMILY_REVOKED", userId, familyId, reason, ts}
```

流向 SIEM 并在发生重用检测时告警。

## 3. 常见错误

- ❌ 不轮换而把同一刷新令牌一直用到过期 —— 泄露时毫无防备。
- ❌ 把明文(plain)令牌存进 DB —— DB 泄露即认证密钥泄露。
- ❌ 检测到重用时只吊销该令牌 —— 必须吊销**整个 family** 才能阻断盗用。
- ❌ 把访问令牌存到 `localStorage` —— XSS 窃取。
- ❌ 不给刷新 API 加 Rate Limiting —— 必须挡住暴力轮换尝试 (推荐 10/分/IP)。
- ❌ 用 JWT 签发刷新令牌 —— 难以吊销。推荐 opaque random。

## 4. 检查清单

- [ ] 刷新令牌是否每次使用时换成新令牌(轮换)
- [ ] 重用已作废令牌时是否吊销同一家族全部
- [ ] 是否只在服务器存哈希而非明文令牌
- [ ] 访问令牌是否放内存、刷新令牌是否放 `HttpOnly` cookie/OS 安全存储 (不使用 `localStorage`)
- [ ] 是否设置了访问 TTL 15~30 分钟、刷新 TTL 7~14 天、未使用绝对过期
- [ ] 登出·改密时是否在服务器吊销家族(或该用户全部)
- [ ] 是否给刷新 API 加了 Rate Limiting
- [ ] 是否把轮换·重用检测·家族吊销记入审计日志

## 附录:按技术栈的示例

下面的示例是绑定特定技术栈(Java/Spring, TypeScript)的实现。概念遵循上面正文,代码按环境借用。

### A. 签发 — Java / Spring (`@Service`)

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

> 刷新令牌**不必是 JWT** —— opaque random string 更安全(只在服务器验证、不可猜测)。做成 JWT 会使服务端吊销变难。

### B. 轮换 + 重用检测 — Java / Spring

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

### C. 客户端流程 — TypeScript / axios

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

### D. 显式登出 · 改密 — Java / Spring

```java
public void logout(String refreshTokenPlain) {
    String hash = sha256(refreshTokenPlain);
    repo.findByTokenHash(hash).ifPresent(t -> {
        revokeFamily(t.getFamilyId(), "LOGOUT");
    });
    // 클라이언트는 액세스 토큰도 즉시 폐기 (메모리에서 제거)
}
```

改密时**吊销所有 family** 是良好实践:

```java
public void changePassword(...) {
    // ... 비밀번호 갱신
    repo.revokeAllByUserId(userId, "PASSWORD_CHANGED");
}
```

### E. 清理作业 (计划) — Java / Spring

```java
@Scheduled(cron = "0 0 3 * * *")  // 매일 새벽 3시
public void cleanupExpiredTokens() {
    int deleted = repo.deleteByExpiresAtBefore(Instant.now().minus(30, ChronoUnit.DAYS));
    log.info("Cleaned up {} expired refresh tokens", deleted);
}
```

### F. 参考 (检收补充)

- 刷新令牌优先推荐 **opaque random 字符串 + 服务器存储(Redis 等)**(可立即吊销)。不得已用 JWT 时,以密钥保管·短过期·轮换为前提 —— 正文示例以后者为准。
