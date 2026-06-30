---
name: Backend Security and Authentication Handling
description: JWT token-based authentication, Spring Security configuration, JwtAuthenticationFilter real code, CORS, Refresh token rotation reissuance, TLS/OAuth2 integration, and audit log standards. Read this when implementing backend authentication/authorization or defining security policies (CORS, token storage, TLS, remote-control blocking). Keywords: spring-security, SecurityFilterChain, @PreAuthorize, @PostAuthorize, BCrypt, PasswordEncoder, AuthenticationManager, CORS, JWT, Refresh Token.
rules:
  - "Authentication is JWT token-based, and tokens are verified in JwtAuthenticationFilter."
  - "Specify the allowed CORS origins in the Spring Security configuration and prohibit wildcards."
  - "Refresh tokens are reissued using a rotation scheme."
  - "External system integrations enforce OAuth 2.0 and TLS communication."
  - "Security events such as permission changes are recorded in the audit log."
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

# 🔐 Backend Security and Authentication Handling

> Unify the standards for JWT-based authentication/authorization, Spring Security configuration, token reissuance, and external integration security. Read this when implementing backend authentication or defining security policies.
>
> Domain abbreviations: **ESD** (Emergency Shut-Down) · **POL-06/POL-08** (internal security policy numbers — external communication uses TLS, remote control blocks Bypass mode). For details, see `docs-glossary`.
>
> Related skills: input validation is `validation-bean`, Swagger exposure control is `api-versioning-swagger`, and the audit log ingestion source is `logging-observability`.

## 1. Core Principles
- Authentication is JWT token-based, and tokens are verified in `JwtAuthenticationFilter`.
- Specify the allowed CORS origins in the Spring Security configuration and prohibit wildcards.
- Refresh tokens are reissued using a rotation scheme.
- External system integrations enforce OAuth 2.0 and TLS communication.
- Security events such as permission changes are recorded in the audit log.

## 2. Rules

### 2-1. JWT Token Structure

This project uses an Access Token + Refresh Token scheme.

```
Access Token  → Short validity period (30 minutes). Included in the Header on API requests.
Refresh Token → Long validity period (7 days). Used when reissuing tokens. Stored in an HttpOnly cookie.
```

- ❌ Storing the JWT token in `localStorage` → can be stolen via an XSS attack. ✅ Use an `HttpOnly Cookie`.
- ❌ Including sensitive information such as passwords or national ID numbers in the token (the contents are visible via Base64 decoding). ✅ Only the identifier and role.
- ❌ Hardcoding the Secret Key in the code. ✅ Manage it via environment variables.

### 2-2. JwtTokenProvider — Token Issuance/Verification (Real Code)

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
            @Value("${security.jwt.secret}") String secret,        // 32 bytes or more
            @Value("${security.jwt.access-exp-ms:1800000}") long accessExpMs,   // 30 minutes
            @Value("${security.jwt.refresh-exp-ms:604800000}") long refreshExpMs // 7 days
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
            .claim("role", role)                 // Do not include sensitive info (name/email)
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

    /** Throws if invalid. The Filter responds with 401 via try-catch. */
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
    secret: ${JWT_SECRET}             # Always use an environment variable in production
    access-exp-ms: 1800000            # 30 minutes
    refresh-exp-ms: 604800000         # 7 days
cors:
  allowed-origins: "https://app.harness.example.com,https://admin.harness.example.com"
```

### 2-3. Basic Spring Security Configuration (Including CORS)

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

    private final JwtAuthenticationFilter jwtAuthFilter;        // See §2-5
    private final RestAuthenticationEntryPoint authEntryPoint;  // 401 responder
    private final RestAccessDeniedHandler accessDeniedHandler;  // 403 responder

    @Value("${cors.allowed-origins}") private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                                  // REST APIs are Stateless, so CSRF is not needed
            .cors(cors -> cors.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(authEntryPoint)                  // Authentication failure 401
                .accessDeniedHandler(accessDeniedHandler))                 // Insufficient permission 403
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**").permitAll()  // Block in prod — see api-versioning-swagger
                .requestMatchers("/api/v1/control/**").hasRole("OPERATOR")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private UrlBasedCorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));   // ❌ Prohibit wildcard ("*") — ✅ Specify origins
        cfg.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization","Content-Type","X-Request-Id"));
        cfg.setExposedHeaders(List.of("X-Request-Id"));
        cfg.setAllowCredentials(true);                                     // Required for cookie authentication
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
```

### 2-4. 401/403 Responders (So the Frontend Receives Them Consistently)

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

### 2-5. JwtAuthenticationFilter — Real Code

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
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))    // ROLE_ prefix required
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (ExpiredJwtException e) {
                log.debug("[JWT expired] {}", e.getMessage());
                // For expiration, proceed without authentication set so the EntryPoint responds with 401
            } catch (JwtException | IllegalArgumentException e) {
                log.warn("[Suspected JWT tampering] {}", e.getMessage());
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

### 2-6. Refresh Token Reissuance (Rotation Scheme)

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshStore;          // Redis recommended (TTL=refresh-exp)
    private final UserService userService;

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(value = "refreshToken", required = false) String refreshToken) {

        if (refreshToken == null) throw new AuthException("REFRESH_MISSING");

        Claims claims;
        try {
            claims = tokenProvider.parse(refreshToken);    // Verify expiration/tampering
        } catch (Exception e) {
            throw new AuthException("REFRESH_INVALID");
        }

        String userId = claims.getSubject();

        // One-time-use verification — must match the token stored in Redis
        if (!refreshStore.isValid(userId, refreshToken)) {
            refreshStore.revokeAll(userId);                // Suspected theft → invalidate all
            throw new AuthException("REFRESH_REUSED");
        }

        String role = userService.getRole(userId);
        String newAccess  = tokenProvider.createAccessToken(userId, role);
        String newRefresh = tokenProvider.createRefreshToken(userId);

        refreshStore.rotate(userId, refreshToken, newRefresh);  // Invalidate old + register new

        ResponseCookie cookie = ResponseCookie.from("refreshToken", newRefresh)
            .httpOnly(true).secure(true).sameSite("Strict").path("/api/v1/auth").maxAge(Duration.ofDays(7))
            .build();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new TokenResponse(newAccess));
    }
}
```

> ⚠️ **Refresh Token Rotation**: A refresh token, once used, is invalidated immediately and a new refresh token is issued. If an old refresh token comes in again, theft is possible → invalidate all tokens.

### 2-7. Blocking Control Authority in Bypass Mode (POL-08)

When Bypass mode is activated, all remote control commands must be blocked at the system level. Use Spring AOP or an Interceptor to block them before they reach the Controller.

```java
// Interceptor that checks Lock status before entering the control API
@Component
public class ControlLockInterceptor implements HandlerInterceptor {

    private final LockStatusCacheService lockStatusCache;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Applied only to the /api/v1/control/** path
        String lockStatus = lockStatusCache.getCurrentLockMode();

        if ("BYPASS".equals(lockStatus)) {
            // Bypass mode → block remote control entirely
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("""
                {"success": false, "message": "Bypass 모드 활성화 중 원격 제어가 차단되었습니다.", "errorCode": "CONTROL_LOCKED_BYPASS"}
            """);
            return false; // Do not proceed to the Controller
        }
        return true;
    }
}
```

```java
// Register the Interceptor (absolutely required — it won't work otherwise)
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final ControlLockInterceptor controlLockInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(controlLockInterceptor)
                .addPathPatterns("/api/v1/control/**");           // All control API paths
    }
}
```

### 2-8. SAP PM Integration OAuth 2.0 (POL-06)

When integrating with SAP PM, use the OAuth 2.0 Client Credentials scheme and access in Read-Only mode only.

```java
@Service
public class SapPmIntegrationService {

    private final OAuth2AuthorizedClientManager clientManager;
    private final WebClient webClient;

    public AssetInfoResponse getAssetFromSap(String sapAssetId) {
        // Automatic OAuth2 token acquisition and renewal
        OAuth2AuthorizeRequest request = OAuth2AuthorizeRequest
            .withClientRegistrationId("sap-pm") // Name registered in application.yml
            .principal("harness-service")
            .build();

        OAuth2AuthorizedClient client = clientManager.authorize(request);
        String token = client.getAccessToken().getTokenValue();

        // Allow only Read-Only GET requests (POST/PUT/DELETE prohibited)
        return webClient.get()
            .uri("/api/assets/{id}", sapAssetId)
            .header("Authorization", "Bearer " + token)
            .retrieve()
            .bodyToMono(AssetInfoResponse.class)
            .block();
    }
}
```

### 2-9. TLS Communication Requirements (POL-06)

```yaml
# application.yml - Always use TLS 1.3 in production environments
server:
  ssl:
    enabled: true
    protocol: TLSv1.3
    key-store: ${SSL_KEYSTORE_PATH}       # Manage via environment variable
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12

# Enable TLS verification for external service calls as well (never disable it in the development environment)
```

### 2-10. Audit Log

Important actions (login, control commands, permission changes, etc.) must always leave an audit log.

```java
// Automatically record an audit log when a control command runs, via AOP
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

        log.info("[Audit Log] userId={}, action={}, result=SUCCESS", userId, action);
        // Also save to DB (audit_logs table)
        auditLogRepository.save(AuditLog.create(userId, action, "SUCCESS"));
    }
}
```

## 3. Common Mistakes
- Storing the JWT in `localStorage` → stolen via XSS. Store it in an `HttpOnly Cookie`.
- Including sensitive information such as passwords or national ID numbers in the token payload → exposed via Base64 decoding.
- Hardcoding the Secret Key → manage it via environment variables.
- Using a wildcard (`*`) for the allowed CORS origins → specify the origins.
- Not invalidating a used refresh token → unable to invalidate all tokens upon theft.
- Not registering `ControlLockInterceptor` → Bypass blocking does not work.
- Disabling TLS verification for external calls in the development environment → leads to a production incident.

## 4. Checklist
- [ ] Is authentication JWT-based, with tokens verified in `JwtAuthenticationFilter`?
- [ ] Are tokens stored in an `HttpOnly Cookie` and the Secret Key managed via environment variables?
- [ ] Are the allowed CORS origins specified and wildcards prohibited?
- [ ] Are refresh tokens reissued using rotation and all tokens invalidated upon reuse?
- [ ] Is OAuth 2.0 + TLS enforced for external system integrations?
- [ ] Are security events such as permission changes recorded in the audit log?
