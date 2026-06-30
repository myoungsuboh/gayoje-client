---
name: JWT Refresh Token 回転 + 再利用検知 (OAuth 2.1)
description: アクセス+リフレッシュトークン構造で、OAuth 2.1 が推奨するパターンである回転(Rotation)・再利用検知(Reuse Detection)・ファミリー無効化(Family Revocation)を実装するスタック非依存の汎用標準。モバイルアプリ・SPA・OAuthフローを持つサービスのトークン発行/更新/ログアウトを設計する、またはトークン保存場所・TTLポリシーを決めるときに読む。キーワード: jwt, JsonWebToken, Bearer, refreshToken, Jwts.builder, Authorization, rotation, reuse detection, family revocation。
rules:
  - "回転(Rotation): リフレッシュトークンは使うたびに新しいトークンへ交換し、前のトークンは即座に破棄する。一つのトークンはただ1回だけ使用可能。"
  - "再利用検知(Reuse Detection): すでに破棄されたトークンが再び入ってきたら盗難の合図とみなし、即座に遮断する。"
  - "ファミリー無効化(Family Revocation): 同じログインセッションから派生したトークンは同じファミリー(family)に束ね、再利用が検知されたらトークン一つではなくファミリー全体を無効化する。"
  - "保存はハッシュで: リフレッシュトークンの平文ではなくハッシュ(例: SHA-256)だけをサーバーに保存する — DBが漏洩してもトークンをそのまま使えない。"
  - "保存場所を分離: アクセストークンはメモリに、リフレッシュトークンは HttpOnly クッキーまたはOSセキュアストレージに置く。localStorage は禁止する。"
  - "短いTTL: アクセストークンは短く(15〜30分)、リフレッシュトークンは適度に(7〜14日)置き、未使用トークンは絶対満了時刻を別に設ける。"
  - "ログアウト・パスワード変更時はサーバーで破棄: クライアント削除だけでは不十分だ。サーバーで該当ファミリー(またはユーザー全体)を即座に破棄する。"
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

# 🔐 JWT Refresh Token 回転 + 再利用検知

> アクセス+リフレッシュトークン構造でトークン回転・再利用検知・ファミリー無効化を標準化する。ログイン/更新/ログアウトのフローを設計する、またはトークン保存場所・TTLを決めるときに読む。
>
> 基本的なJWT認証は `security-backend` スキル([../security-backend/SKILL.md](../security-backend/SKILL.md))で扱う。このスキルは OAuth 2.1 が明示的に推奨する **Refresh Token Rotation + Reuse Detection + Family Revocation** の3種セキュリティパターンを実装する方法だ。
>
> 適用対象: モバイルアプリ、SPA、OAuthフローを持つすべてのサービス。スタック非依存の概念を本文で扱い、具体的な実装コードは末尾の付録に置く。

## 1. 基本原則

- **回転(Rotation):** リフレッシュトークンは使うたびに新しいトークンへ交換し、前のトークンは即座に破棄する。一つのトークンはただ1回だけ使用可能。
- **再利用検知(Reuse Detection):** すでに破棄されたトークンが再び入ってきたら盗難の合図とみなし、即座に遮断する。
- **ファミリー無効化(Family Revocation):** 同じログインセッションから派生したトークンは同じファミリー(family)に束ね、再利用が検知されたらトークン一つではなく**ファミリー全体**を無効化する。
- **保存はハッシュで:** リフレッシュトークンの平文ではなくハッシュ(例: SHA-256)だけをサーバーに保存する — DBが漏洩してもトークンをそのまま使えない。
- **保存場所を分離:** アクセストークンはメモリに、リフレッシュトークンは `HttpOnly` クッキーまたはOSセキュアストレージに置く。`localStorage` は禁止する。
- **短いTTL:** アクセストークンは短く(15〜30分)、リフレッシュトークンは適度に(7〜14日)置き、未使用トークンは絶対満了時刻を別に設ける。
- **ログアウト・パスワード変更時はサーバーで破棄:** クライアント削除だけでは不十分だ。サーバーで該当ファミリー(またはユーザー全体)を即座に破棄する。

## 2. ルール

### 2-1. なぜ回転か

伝統的な方式: アクセスが満了するたびに**同じ**リフレッシュトークンを使って新しいアクセスを発行。リフレッシュトークンが一度漏洩すると満了前まで(通常7〜30日)無制限にアクセス発行が可能。

回転方式: リフレッシュトークンを使うたびに**新しいリフレッシュトークン**へ交換。前のトークンは即座に破棄。一つのトークンはただ1回だけ使用可能。

ここに**再利用検知**が結合される: すでに破棄されたトークンが再び入ってきたら → **攻撃者がトークンを盗んだ**という合図 → 該当ユーザーの全トークンファミリーを即座に無効化 + 強制再ログイン。

### 2-2. データモデル (ファミリー・ハッシュ・破棄理由)

トークン自体ではなく**ハッシュ・ファミリー・破棄状態**を追跡することが肝心だ。ストレージ(RDB/Redis など)はスタックに合わせて選ぶが、下の概念カラムは同じに保つ。

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

**トークンの平文(plain)ではなくSHA-256ハッシュだけを保存**する。DB漏洩時にトークンをそのまま使用不可。

### 2-3. 発行 (ログイン時)

- ログイン時に新しい**ファミリーid**を生成し、アクセストークン + リフレッシュトークンのペアを発行する。
- リフレッシュトークンは32バイト以上のsecure randomで作った**opaque文字列**を推奨する。サーバーはハッシュだけを保存し、クライアントには平文を渡す。
- リフレッシュトークンは**JWTでなくてよい** — opaque random string の方が安全だ(サーバーでのみ検証、推測不可)。JWTで作るとサーバーサイドの破棄が難しくなる。

### 2-4. 回転 (更新時) + 再利用検知

リフレッシュ要求が来たら次の順序で処理する。

1. 入ってきたトークンのハッシュで保存されたトークンを照会する(なければ拒否)。
2. **満了検査** — 満了していれば拒否する。
3. **再利用検知** — すでに破棄(`revoked_at`)されたトークンが再び入ってきたら盗難の疑いだ。該当**ファミリー全体を無効化**(`REUSE_DETECTED`)し、セキュリティログを残してから拒否する。
4. **正常回転** — 現在のトークンを `ROTATED` で破棄し、**同じファミリー**で新しいトークンペアを発行する(`parent_id` に前のトークンidを記録)。

> 肝心: 再利用が検知されたら、そのトークン一つだけではなく**family全体**を破棄してこそ盗難を遮断する。

### 2-5. クライアント側のフロー

- 401応答を受けたら**一度だけ**リフレッシュを試み、成功したら元の要求を再試行する。
- リフレッシュが失敗したら(再利用検知などで全体が破棄された)ローカルセッションを空にし、強制再ログインさせる。
- 同時に複数の要求が401を受けうるので、リフレッシュ呼び出しは**単一のin-flight Promiseで共有**して重複呼び出しを防ぐ。

### 2-6. トークン保存場所 (クライアント)

| 環境 | アクセストークン | リフレッシュトークン |
|---|---|---|
| **Web SPA** | メモリ(状態ストア) | **`HttpOnly` Secure クッキー** |
| **Capacitor モバイル** | メモリ | `@capacitor/preferences` (Android は EncryptedSharedPreferences にマッピング) |
| **React Native** | メモリ | Keychain(iOS) / Keystore(Android) |

> 絶対に `localStorage` に保存禁止 — XSS時にそのまま窃取される。

### 2-7. 明示的ログアウト · パスワード変更

- ログアウト時にサーバーで該当トークンの**ファミリーを即座に破棄**(`LOGOUT`)し、クライアントはアクセストークンをメモリから除去する。
- パスワード変更時には該当ユーザーの**すべてのファミリーを破棄**(`PASSWORD_CHANGED`)するのが良い慣行だ。

### 2-8. TTLポリシー

| 値 | 推奨 |
|---|---|
| アクセストークン満了 | **15〜30分** |
| リフレッシュトークン満了 | **7〜14日** (モバイルは長く、セキュリティ敏感なサービスは短く) |
| 未使用トークン絶対満了 | 30日 (活動なく更新されなければ満了) |

短すぎるとユーザー体験の低下、長すぎると盗難時の露出時間が増加。14日がモバイル標準。

### 2-9. 整理ジョブ (スケジュール)

満了したトークンのrow整理はサービス要求経路ではなく別のバッチ/スケジューラで周期実行する(例: 毎日未明、満了後30日経過分を削除)。

### 2-10. 監査ログ

回転・再利用検知・family破棄はセキュリティイベントだ。`logging-observability` スキルに従って別の監査ログトピックに積載する。

```
{event: "REFRESH_TOKEN_ROTATED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_REUSE_DETECTED", userId, familyId, ip, userAgent, ts}
{event: "REFRESH_TOKEN_FAMILY_REVOKED", userId, familyId, reason, ts}
```

SIEMへ流し、再利用検知発生時にアラーム。

## 3. よくある間違い

- ❌ 回転なしに同じリフレッシュトークンを満了まで再利用 — 漏洩時に無防備。
- ❌ トークンの平文(plain)をDBに保存 — DB漏洩がすなわち認証キーの漏洩。
- ❌ 再利用検知時に該当トークンだけ破棄 — **family全体**を破棄してこそ盗難遮断。
- ❌ アクセストークンを `localStorage` に保存 — XSS窃取。
- ❌ リフレッシュAPIに Rate Limiting をかけない — 無差別な回転試行を止めねばならない (10/分/IP 推奨)。
- ❌ JWTでリフレッシュトークン発行 — 破棄が難しい。opaque random 推奨。

## 4. チェックリスト

- [ ] リフレッシュトークンを使うたびに新しいトークンへ交換(回転)するか
- [ ] 破棄されたトークンの再利用時に同じファミリーを全部無効化するか
- [ ] トークンの平文ではなくハッシュだけをサーバーに保存するか
- [ ] アクセストークンはメモリ、リフレッシュトークンは `HttpOnly` クッキー/OSセキュアストレージに置くか (`localStorage` 不使用)
- [ ] アクセスTTL 15〜30分、リフレッシュTTL 7〜14日、未使用絶対満了を設定したか
- [ ] ログアウト・パスワード変更時にサーバーでファミリー(またはユーザー全体)を破棄するか
- [ ] リフレッシュAPIに Rate Limiting をかけたか
- [ ] 回転・再利用検知・ファミリー破棄を監査ログに残すか

## 付録: スタック別の例

以下の例は特定のスタック(Java/Spring, TypeScript)に依存した実装だ。概念は上記の本文に従い、コードは環境に合わせて借用する。

### A. 発行 — Java / Spring (`@Service`)

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

> リフレッシュトークンは **JWT でなくてよい** — opaque random string の方が安全(サーバーでのみ検証、推測不可)。JWTで作るとサーバーサイドの破棄が難しくなる。

### B. 回転 + 再利用検知 — Java / Spring

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

### C. クライアント側のフロー — TypeScript / axios

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

### D. 明示的ログアウト · パスワード変更 — Java / Spring

```java
public void logout(String refreshTokenPlain) {
    String hash = sha256(refreshTokenPlain);
    repo.findByTokenHash(hash).ifPresent(t -> {
        revokeFamily(t.getFamilyId(), "LOGOUT");
    });
    // 클라이언트는 액세스 토큰도 즉시 폐기 (메모리에서 제거)
}
```

パスワード変更時も**すべてのfamily破棄**が良い慣行:

```java
public void changePassword(...) {
    // ... 비밀번호 갱신
    repo.revokeAllByUserId(userId, "PASSWORD_CHANGED");
}
```

### E. 整理ジョブ (スケジュール) — Java / Spring

```java
@Scheduled(cron = "0 0 3 * * *")  // 매일 새벽 3시
public void cleanupExpiredTokens() {
    int deleted = repo.deleteByExpiresAtBefore(Instant.now().minus(30, ChronoUnit.DAYS));
    log.info("Cleaned up {} expired refresh tokens", deleted);
}
```

### F. 参考 (検収補完)

- リフレッシュトークンは **opaque random 文字列 + サーバー保存(Redis など)** を優先的に推奨します(即座に破棄可能)。やむを得ず JWT で置く場合はシークレット保管・短い満了・回転を前提とします — 本文の例は後者を基準としています。
