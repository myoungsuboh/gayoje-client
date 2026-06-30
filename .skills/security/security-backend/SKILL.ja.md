---
name: バックエンドセキュリティおよび認証処理
description: JWTトークンベース認証・Spring Security設定・JwtAuthenticationFilter実コード・CORS・Refreshトークンのローテーション再発行・TLS/OAuth2連携・監査ログの標準。バックエンドの認証/認可を実装したり、セキュリティポリシー（CORS・トークン保存・TLS・リモート制御の遮断）を定めたりするときに読む。キーワード: spring-security, SecurityFilterChain, @PreAuthorize, @PostAuthorize, BCrypt, PasswordEncoder, AuthenticationManager, CORS, JWT, Refresh Token。
rules:
  - "認証はJWTトークンベースとし、JwtAuthenticationFilterでトークンを検証する。"
  - "Spring Security設定にCORS許可オリジンを明示し、ワイルドカードを禁止する。"
  - "リフレッシュトークンはローテーション（rotation）方式で再発行する。"
  - "外部システム連携はOAuth 2.0とTLS通信を強制する。"
  - "権限変更などのセキュリティイベントは監査ログに記録する。"
tags:
  - "spring-security"
  - "SecurityFilterChain"
  - "@PreAuthorize"
  - "@PostAuthorize"
  - "BCrypt"
  - "PasswordEncoder"
  - "AuthenticationManager"
  - "CORS"
  - "JWT"
  - "Refresh Token"
---

# 🔐 バックエンドセキュリティおよび認証処理

> JWTベースの認証/認可、Spring Security設定、トークン再発行、外部連携セキュリティの標準を統一する。バックエンド認証を実装したり、セキュリティポリシーを定めたりするときに読む。
>
> ドメイン略語: **ESD**（Emergency Shut-Down、緊急遮断） · **POL-06/POL-08**（社内セキュリティポリシー番号 — 外部通信はTLS、リモート制御はBypassモードで遮断）。詳細は `docs-glossary` を参照。
>
> 関連スキル: 入力検証は `validation-bean`、Swagger露出制御は `api-versioning-swagger`、監査ログの取り込み元は `logging-observability`。

## 1. 中核原則
- 認証はJWTトークンベースとし、`JwtAuthenticationFilter` でトークンを検証する。
- Spring Security設定にCORS許可オリジンを明示し、ワイルドカードを禁止する。
- リフレッシュトークンはローテーション（rotation）方式で再発行する。
- 外部システム連携はOAuth 2.0とTLS通信を強制する。
- 権限変更などのセキュリティイベントは監査ログに記録する。

## 2. ルール

### 2-1. JWTトークン構造

このプロジェクトはAccess Token + Refresh Token方式を使用する。

```
Access Token  → 有効期間が短い（30分）。API要求時にHeaderに含める。
Refresh Token → 有効期間が長い（7日）。トークン再発行時に使用。HttpOnlyクッキーに保存。
```

- ❌ JWTトークンを `localStorage` に保存 → XSS攻撃で窃取され得る。✅ `HttpOnly Cookie` を使用。
- ❌ トークンにパスワード・住民番号などの機微情報を含める（Base64デコードで内容が見える）。✅ 識別子・roleのみ。
- ❌ Secret Keyをコードにハードコーディング。✅ 環境変数で管理。

### 2-2. JwtTokenProvider — トークン発行/検証（実コード）

```java
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long accessExpMs;
    private final long refreshExpMs;

    public JwtTokenProvider(
            @Value("${security.jwt.secret}") String secret,        // 32バイト以上
            @Value("${security.jwt.access-exp-ms:1800000}") long accessExpMs,   // 30分
            @Value("${security.jwt.refresh-exp-ms:604800000}") long refreshExpMs // 7日
    ) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("security.jwt.secret must be >= 32 bytes (HS256)");
        }
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessExpMs = accessExpMs;
        this.refreshExpMs = refreshExpMs;
    }

    public String createAccessToken(String userId, String role) {
        Date now = new Date();
        return Jwts.builder()
            .setSubject(userId)
            .claim("role", role)                 // 機微情報（名前/メール）を入れないこと
            .setIssuedAt(now)
            .setExpiration(new Date(now.getTime() + accessExpMs))
            .signWith(secretKey, SignatureAlgorithm.HS256)
            .compact();
    }

    public String createRefreshToken(String userId) {
        Date now = new Date();
        return Jwts.builder()
            .setSubject(userId)
            .setIssuedAt(now)
            .setExpiration(new Date(now.getTime() + refreshExpMs))
            .signWith(secretKey, SignatureAlgorithm.HS256)
            .compact();
    }

    /** 無効ならthrow。Filterでtry-catchして401応答。 */
    public Claims parse(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(secretKey)
            .build()
            .parseClaimsJws(token)
            .getBody();
    }
}
```

```yaml
# application.yml
security:
  jwt:
    secret: ${JWT_SECRET}             # 本番は必ず環境変数
    access-exp-ms: 1800000            # 30分
    refresh-exp-ms: 604800000         # 7日
cors:
  allowed-origins: "https://app.harness.example.com,https://admin.harness.example.com"
```

### 2-3. Spring Security基本設定（CORS含む）

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;        // §2-5参照
    private final RestAuthenticationEntryPoint authEntryPoint;  // 401応答器
    private final RestAccessDeniedHandler accessDeniedHandler;  // 403応答器

    @Value("${cors.allowed-origins}") private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                                  // REST APIはStatelessなのでCSRF不要
            .cors(cors -> cors.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(authEntryPoint)                  // 認証失敗 401
                .accessDeniedHandler(accessDeniedHandler))                 // 権限不足 403
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**").permitAll()  // prodでは遮断 — api-versioning-swagger参照
                .requestMatchers("/api/v1/control/**").hasRole("OPERATOR")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private UrlBasedCorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));   // ❌ ワイルドカード("*")禁止 — ✅ オリジン明示
        cfg.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization","Content-Type","X-Request-Id"));
        cfg.setExposedHeaders(List.of("X-Request-Id"));
        cfg.setAllowCredentials(true);                                     // クッキー認証時に必須
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
```

### 2-4. 401/403応答器（Frontendが一貫して受け取れるように）

```java
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Override
    public void commence(HttpServletRequest req, HttpServletResponse res,
                         AuthenticationException ex) throws IOException {
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("""
            {"success":false,"errorCode":"AUTH_REQUIRED","message":"로그인이 필요합니다."}
        """);
    }
}

@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {
    @Override
    public void handle(HttpServletRequest req, HttpServletResponse res,
                       AccessDeniedException ex) throws IOException {
        res.setStatus(HttpServletResponse.SC_FORBIDDEN);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("""
            {"success":false,"errorCode":"FORBIDDEN","message":"권한이 없습니다."}
        """);
    }
}
```

### 2-5. JwtAuthenticationFilter — 実コード

```java
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String token = extractToken(req);
        if (token != null) {
            try {
                Claims claims = tokenProvider.parse(token);
                String userId = claims.getSubject();
                String role   = claims.get("role", String.class);
                var auth = new UsernamePasswordAuthenticationToken(
                    userId, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))    // ROLE_接頭辞必須
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (ExpiredJwtException e) {
                log.debug("[JWT期限切れ] {}", e.getMessage());
                // 期限切れはEntryPointが401で応答するよう認証未設定の状態で進む
            } catch (JwtException | IllegalArgumentException e) {
                log.warn("[JWT改ざん疑い] {}", e.getMessage());
            }
        }
        chain.doFilter(req, res);
    }

    private String extractToken(HttpServletRequest req) {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
```

### 2-6. Refresh Token再発行（ローテーション方式）

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshStore;          // Redis推奨（TTL=refresh-exp）
    private final UserService userService;

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(value = "refreshToken", required = false) String refreshToken) {

        if (refreshToken == null) throw new AuthException("REFRESH_MISSING");

        Claims claims;
        try {
            claims = tokenProvider.parse(refreshToken);    // 期限切れ/改ざん検証
        } catch (Exception e) {
            throw new AuthException("REFRESH_INVALID");
        }

        String userId = claims.getSubject();

        // 一回限り検証 — Redisに保存されたトークンと同一でなければならない
        if (!refreshStore.isValid(userId, refreshToken)) {
            refreshStore.revokeAll(userId);                // 盗用疑い → 全体無効化
            throw new AuthException("REFRESH_REUSED");
        }

        String role = userService.getRole(userId);
        String newAccess  = tokenProvider.createAccessToken(userId, role);
        String newRefresh = tokenProvider.createRefreshToken(userId);

        refreshStore.rotate(userId, refreshToken, newRefresh);  // 旧を無効 + 新を登録

        ResponseCookie cookie = ResponseCookie.from("refreshToken", newRefresh)
            .httpOnly(true).secure(true).sameSite("Strict").path("/api/v1/auth").maxAge(Duration.ofDays(7))
            .build();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new TokenResponse(newAccess));
    }
}
```

> ⚠️ **Refresh Token Rotation**: 一度使ったrefreshは即座に無効化し、新しいrefreshを発行する。旧refreshが再び入ってきたら盗用の可能性 → 全トークン無効。

### 2-7. Bypassモードの制御権遮断（POL-08）

Bypassモードが有効になると、すべてのリモート制御コマンドをシステムレベルで遮断しなければならない。Spring AOPまたはInterceptorを使ってControllerに到達する前に遮断する。

```java
// 制御API進入前にLock状態を確認するInterceptor
@Component
public class ControlLockInterceptor implements HandlerInterceptor {

    private final LockStatusCacheService lockStatusCache;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // /api/v1/control/** パスにのみ適用
        String lockStatus = lockStatusCache.getCurrentLockMode();

        if ("BYPASS".equals(lockStatus)) {
            // Bypassモード → リモート制御を全面遮断
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("""
                {"success": false, "message": "Bypass 모드 활성화 중 원격 제어가 차단되었습니다.", "errorCode": "CONTROL_LOCKED_BYPASS"}
            """);
            return false; // Controllerへ進まない
        }
        return true;
    }
}
```

```java
// Interceptor登録（必ず必要 — しないと動作しない）
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final ControlLockInterceptor controlLockInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(controlLockInterceptor)
                .addPathPatterns("/api/v1/control/**");           // 制御API全パス
    }
}
```

### 2-8. SAP PM連携 OAuth 2.0（POL-06）

SAP PMと連携するときはOAuth 2.0 Client Credentials方式を使い、Read-Onlyのみでアクセスする。

```java
@Service
public class SapPmIntegrationService {

    private final OAuth2AuthorizedClientManager clientManager;
    private final WebClient webClient;

    public AssetInfoResponse getAssetFromSap(String sapAssetId) {
        // OAuth2トークンの自動取得および更新
        OAuth2AuthorizeRequest request = OAuth2AuthorizeRequest
            .withClientRegistrationId("sap-pm") // application.ymlに登録された名前
            .principal("harness-service")
            .build();

        OAuth2AuthorizedClient client = clientManager.authorize(request);
        String token = client.getAccessToken().getTokenValue();

        // Read-Only GET要求のみ許可（POST/PUT/DELETE禁止）
        return webClient.get()
            .uri("/api/assets/{id}", sapAssetId)
            .header("Authorization", "Bearer " + token)
            .retrieve()
            .bodyToMono(AssetInfoResponse.class)
            .block();
    }
}
```

### 2-9. TLS通信の必須事項（POL-06）

```yaml
# application.yml - 本番環境では必ずTLS 1.3を使用
server:
  ssl:
    enabled: true
    protocol: TLSv1.3
    key-store: ${SSL_KEYSTORE_PATH}       # 環境変数で管理
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12

# 外部サービス呼び出し時にもTLS検証を有効化（開発環境で絶対に無効化しないこと）
```

### 2-10. 監査ログ（Audit Log）

重要な行為（ログイン、制御コマンド、権限変更など）は必ず監査ログを残す。

```java
// AOPで制御コマンド実行時に自動的に監査ログを記録
@Aspect
@Component
@Slf4j
public class AuditLogAspect {

    @AfterReturning(
        pointcut = "@annotation(Auditable)",
        returning = "result"
    )
    public void logAudit(JoinPoint joinPoint, Object result) {
        String userId = SecurityContextHolder.getContext().getAuthentication().getName();
        String action = joinPoint.getSignature().getName();

        log.info("[監査ログ] userId={}, action={}, result=SUCCESS", userId, action);
        // DBにも保存（audit_logsテーブル）
        auditLogRepository.save(AuditLog.create(userId, action, "SUCCESS"));
    }
}
```

## 3. よくある間違い
- JWTを `localStorage` に保存 → XSSで窃取。`HttpOnly Cookie` に保存する。
- トークンpayloadにパスワード・住民番号などの機微情報を含める → Base64デコードで露出する。
- Secret Keyのハードコーディング → 環境変数で管理する。
- CORS許可オリジンにワイルドカード（`*`）を使用 → オリジンを明示する。
- 使ったrefreshを無効化しない → 盗用時に全トークンを無効化できない。
- `ControlLockInterceptor` を登録しない → Bypass遮断が動作しない。
- 外部呼び出しのTLS検証を開発環境で無効化 → 本番事故につながる。

## 4. チェックリスト
- [ ] 認証をJWTベースにし、`JwtAuthenticationFilter` でトークンを検証しているか
- [ ] トークンを `HttpOnly Cookie` に保存し、Secret Keyを環境変数で管理しているか
- [ ] CORS許可オリジンを明示し、ワイルドカードを禁止したか
- [ ] リフレッシュトークンをローテーション方式で再発行し、再使用時に全体無効化するか
- [ ] 外部システム連携にOAuth 2.0 + TLSを強制したか
- [ ] 権限変更などのセキュリティイベントを監査ログに記録するか
