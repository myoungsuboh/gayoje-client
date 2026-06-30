---
name: 后端安全与认证处理
description: JWT 令牌认证、Spring Security 配置、JwtAuthenticationFilter 实际代码、CORS、Refresh 令牌轮换重新签发、TLS/OAuth2 集成以及审计日志标准。在实现后端认证/授权或制定安全策略（CORS、令牌存储、TLS、远程控制拦截）时阅读。关键词：spring-security, SecurityFilterChain, @PreAuthorize, @PostAuthorize, BCrypt, PasswordEncoder, AuthenticationManager, CORS, JWT, Refresh Token。
rules:
  - "认证采用基于 JWT 令牌的方式，并在 JwtAuthenticationFilter 中验证令牌。"
  - "在 Spring Security 配置中明确指定 CORS 允许来源，并禁止通配符。"
  - "刷新令牌采用轮换（rotation）方式重新签发。"
  - "外部系统集成强制使用 OAuth 2.0 与 TLS 通信。"
  - "权限变更等安全事件记录到审计日志中。"
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

# 🔐 后端安全与认证处理

> 统一基于 JWT 的认证/授权、Spring Security 配置、令牌重新签发、外部集成安全的标准。在实现后端认证或制定安全策略时阅读。
>
> 领域缩写：**ESD**（Emergency Shut-Down，紧急关停） · **POL-06/POL-08**（公司内部安全策略编号 — 外部通信使用 TLS，远程控制以 Bypass 模式拦截）。详情参考 `docs-glossary`。
>
> 相关技能：输入校验为 `validation-bean`，Swagger 暴露控制为 `api-versioning-swagger`，审计日志的采集来源为 `logging-observability`。

## 1. 核心原则
- 认证采用基于 JWT 令牌的方式，并在 `JwtAuthenticationFilter` 中验证令牌。
- 在 Spring Security 配置中明确指定 CORS 允许来源，并禁止通配符。
- 刷新令牌采用轮换（rotation）方式重新签发。
- 外部系统集成强制使用 OAuth 2.0 与 TLS 通信。
- 权限变更等安全事件记录到审计日志中。

## 2. 规则

### 2-1. JWT 令牌结构

本项目使用 Access Token + Refresh Token 方式。

```
Access Token  → 有效期短（30 分钟）。API 请求时包含在 Header 中。
Refresh Token → 有效期长（7 天）。令牌重新签发时使用。存储在 HttpOnly cookie 中。
```

- ❌ 将 JWT 令牌存储在 `localStorage` → 可能被 XSS 攻击窃取。✅ 使用 `HttpOnly Cookie`。
- ❌ 在令牌中包含密码、身份证号等敏感信息（通过 Base64 解码即可看到内容）。✅ 仅放标识符和 role。
- ❌ 将 Secret Key 硬编码在代码中。✅ 通过环境变量管理。

### 2-2. JwtTokenProvider — 令牌签发/验证（实际代码）

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
            @Value("${security.jwt.secret}") String secret,        // 32 字节以上
            @Value("${security.jwt.access-exp-ms:1800000}") long accessExpMs,   // 30 分钟
            @Value("${security.jwt.refresh-exp-ms:604800000}") long refreshExpMs // 7 天
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
            .claim("role", role)                 // 不要放入敏感信息（姓名/邮箱）
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

    /** 无效则 throw。Filter 中用 try-catch 返回 401。 */
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
    secret: ${JWT_SECRET}             # 生产环境务必使用环境变量
    access-exp-ms: 1800000            # 30 分钟
    refresh-exp-ms: 604800000         # 7 天
cors:
  allowed-origins: "https://app.harness.example.com,https://admin.harness.example.com"
```

### 2-3. Spring Security 基本配置（含 CORS）

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

    private final JwtAuthenticationFilter jwtAuthFilter;        // 参见 §2-5
    private final RestAuthenticationEntryPoint authEntryPoint;  // 401 响应器
    private final RestAccessDeniedHandler accessDeniedHandler;  // 403 响应器

    @Value("${cors.allowed-origins}") private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                                  // REST API 是 Stateless，因此不需要 CSRF
            .cors(cors -> cors.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(authEntryPoint)                  // 认证失败 401
                .accessDeniedHandler(accessDeniedHandler))                 // 权限不足 403
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**").permitAll()  // 生产环境中拦截 — 参见 api-versioning-swagger
                .requestMatchers("/api/v1/control/**").hasRole("OPERATOR")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private UrlBasedCorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));   // ❌ 禁止通配符("*") — ✅ 明确指定来源
        cfg.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization","Content-Type","X-Request-Id"));
        cfg.setExposedHeaders(List.of("X-Request-Id"));
        cfg.setAllowCredentials(true);                                     // cookie 认证时必需
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
```

### 2-4. 401/403 响应器（以便 Frontend 能一致地接收）

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

### 2-5. JwtAuthenticationFilter — 实际代码

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
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))    // ROLE_ 前缀必需
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (ExpiredJwtException e) {
                log.debug("[JWT 已过期] {}", e.getMessage());
                // 过期时以未设置认证的状态继续，由 EntryPoint 返回 401
            } catch (JwtException | IllegalArgumentException e) {
                log.warn("[疑似 JWT 篡改] {}", e.getMessage());
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

### 2-6. Refresh Token 重新签发（轮换方式）

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshStore;          // 推荐 Redis（TTL=refresh-exp）
    private final UserService userService;

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(value = "refreshToken", required = false) String refreshToken) {

        if (refreshToken == null) throw new AuthException("REFRESH_MISSING");

        Claims claims;
        try {
            claims = tokenProvider.parse(refreshToken);    // 验证过期/篡改
        } catch (Exception e) {
            throw new AuthException("REFRESH_INVALID");
        }

        String userId = claims.getSubject();

        // 一次性验证 — 必须与 Redis 中存储的令牌相同
        if (!refreshStore.isValid(userId, refreshToken)) {
            refreshStore.revokeAll(userId);                // 疑似盗用 → 全部失效
            throw new AuthException("REFRESH_REUSED");
        }

        String role = userService.getRole(userId);
        String newAccess  = tokenProvider.createAccessToken(userId, role);
        String newRefresh = tokenProvider.createRefreshToken(userId);

        refreshStore.rotate(userId, refreshToken, newRefresh);  // 旧的失效 + 注册新的

        ResponseCookie cookie = ResponseCookie.from("refreshToken", newRefresh)
            .httpOnly(true).secure(true).sameSite("Strict").path("/api/v1/auth").maxAge(Duration.ofDays(7))
            .build();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new TokenResponse(newAccess));
    }
}
```

> ⚠️ **Refresh Token Rotation**：用过一次的 refresh 立即失效并签发新的 refresh。如果旧 refresh 再次进来，则存在盗用可能 → 全部令牌失效。

### 2-7. Bypass 模式控制权拦截（POL-08）

当 Bypass 模式被激活时，必须在系统层面拦截所有远程控制命令。使用 Spring AOP 或 Interceptor，在到达 Controller 之前拦截。

```java
// 在进入控制 API 之前确认 Lock 状态的 Interceptor
@Component
public class ControlLockInterceptor implements HandlerInterceptor {

    private final LockStatusCacheService lockStatusCache;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 仅应用于 /api/v1/control/** 路径
        String lockStatus = lockStatusCache.getCurrentLockMode();

        if ("BYPASS".equals(lockStatus)) {
            // Bypass 模式 → 全面拦截远程控制
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("""
                {"success": false, "message": "Bypass 모드 활성화 중 원격 제어가 차단되었습니다.", "errorCode": "CONTROL_LOCKED_BYPASS"}
            """);
            return false; // 不进入 Controller
        }
        return true;
    }
}
```

```java
// 注册 Interceptor（务必需要 — 不注册则不生效）
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final ControlLockInterceptor controlLockInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(controlLockInterceptor)
                .addPathPatterns("/api/v1/control/**");           // 控制 API 全部路径
    }
}
```

### 2-8. SAP PM 集成 OAuth 2.0（POL-06）

与 SAP PM 集成时，使用 OAuth 2.0 Client Credentials 方式，并仅以 Read-Only 访问。

```java
@Service
public class SapPmIntegrationService {

    private final OAuth2AuthorizedClientManager clientManager;
    private final WebClient webClient;

    public AssetInfoResponse getAssetFromSap(String sapAssetId) {
        // 自动获取并刷新 OAuth2 令牌
        OAuth2AuthorizeRequest request = OAuth2AuthorizeRequest
            .withClientRegistrationId("sap-pm") // application.yml 中注册的名称
            .principal("harness-service")
            .build();

        OAuth2AuthorizedClient client = clientManager.authorize(request);
        String token = client.getAccessToken().getTokenValue();

        // 仅允许 Read-Only GET 请求（禁止 POST/PUT/DELETE）
        return webClient.get()
            .uri("/api/assets/{id}", sapAssetId)
            .header("Authorization", "Bearer " + token)
            .retrieve()
            .bodyToMono(AssetInfoResponse.class)
            .block();
    }
}
```

### 2-9. TLS 通信必备事项（POL-06）

```yaml
# application.yml - 生产环境必须使用 TLS 1.3
server:
  ssl:
    enabled: true
    protocol: TLSv1.3
    key-store: ${SSL_KEYSTORE_PATH}       # 通过环境变量管理
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12

# 调用外部服务时也启用 TLS 验证（在开发环境中绝对不要禁用）
```

### 2-10. 审计日志（Audit Log）

重要行为（登录、控制命令、权限变更等）必须留下审计日志。

```java
// 通过 AOP 在执行控制命令时自动记录审计日志
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

        log.info("[审计日志] userId={}, action={}, result=SUCCESS", userId, action);
        // 也保存到 DB（audit_logs 表）
        auditLogRepository.save(AuditLog.create(userId, action, "SUCCESS"));
    }
}
```

## 3. 常见错误
- 将 JWT 存储在 `localStorage` → 被 XSS 窃取。应存储在 `HttpOnly Cookie` 中。
- 在令牌 payload 中包含密码、身份证号等敏感信息 → 通过 Base64 解码即被暴露。
- 硬编码 Secret Key → 应通过环境变量管理。
- 在 CORS 允许来源中使用通配符（`*`） → 应明确指定来源。
- 不使已用过的 refresh 失效 → 被盗用时无法使全部令牌失效。
- 不注册 `ControlLockInterceptor` → Bypass 拦截不生效。
- 在开发环境中禁用外部调用的 TLS 验证 → 会导致生产事故。

## 4. 检查清单
- [ ] 是否采用基于 JWT 的认证，并在 `JwtAuthenticationFilter` 中验证令牌
- [ ] 是否将令牌存储在 `HttpOnly Cookie` 中，并通过环境变量管理 Secret Key
- [ ] 是否明确指定 CORS 允许来源并禁止通配符
- [ ] 是否以轮换方式重新签发刷新令牌，并在被重用时使全部失效
- [ ] 是否对外部系统集成强制使用 OAuth 2.0 + TLS
- [ ] 是否将权限变更等安全事件记录到审计日志中
