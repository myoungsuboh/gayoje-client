---
name: 백엔드 보안 및 인증 처리
description: JWT 토큰 기반 인증·Spring Security 설정·JwtAuthenticationFilter 실코드·CORS·Refresh 토큰 회전 재발급·TLS/OAuth2 연동·감사 로그 표준. 백엔드 인증/인가를 구현하거나 보안 정책(CORS·토큰 저장·TLS·원격제어 차단)을 정할 때 읽는다. 키워드: spring-security, SecurityFilterChain, @PreAuthorize, @PostAuthorize, BCrypt, PasswordEncoder, AuthenticationManager, CORS, JWT, Refresh Token.
rules:
  - "인증은 JWT 토큰 기반으로 하고 JwtAuthenticationFilter 에서 토큰을 검증한다."
  - "Spring Security 설정에 CORS 허용 출처를 명시하고 와일드카드를 금지한다."
  - "리프레시 토큰은 회전(rotation) 방식으로 재발급한다."
  - "외부 시스템 연동은 OAuth 2.0 과 TLS 통신을 강제한다."
  - "권한 변경 등 보안 이벤트는 감사 로그에 기록한다."
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

# 🔐 백엔드 보안 및 인증 처리

> JWT 기반 인증/인가, Spring Security 설정, 토큰 재발급, 외부 연동 보안의 표준을 통일한다. 백엔드 인증을 구현하거나 보안 정책을 정할 때 읽는다.
>
> 도메인 약어: **ESD**(Emergency Shut-Down, 긴급 차단) · **POL-06/POL-08**(사내 보안 정책 번호 — 외부 통신은 TLS, 원격제어는 Bypass 모드 차단). 자세히는 `docs-glossary` 참고.
>
> 관련 스킬: 입력 유효성은 `validation-bean`, Swagger 노출 제어는 `api-versioning-swagger`, 감사 로그 적재 출처는 `logging-observability`.

## 1. 핵심 원칙
- 인증은 JWT 토큰 기반으로 하고 `JwtAuthenticationFilter` 에서 토큰을 검증한다.
- Spring Security 설정에 CORS 허용 출처를 명시하고 와일드카드를 금지한다.
- 리프레시 토큰은 회전(rotation) 방식으로 재발급한다.
- 외부 시스템 연동은 OAuth 2.0 과 TLS 통신을 강제한다.
- 권한 변경 등 보안 이벤트는 감사 로그에 기록한다.

## 2. 규칙

### 2-1. JWT 토큰 구조

이 프로젝트는 Access Token + Refresh Token 방식을 사용한다.

```
Access Token  → 유효 기간 짧음 (30분). API 요청 시 Header에 포함.
Refresh Token → 유효 기간 길음 (7일). 토큰 재발급 시 사용. HttpOnly 쿠키에 저장.
```

- ❌ JWT 토큰을 `localStorage`에 저장 → XSS 공격으로 탈취 가능. ✅ `HttpOnly Cookie` 사용.
- ❌ 토큰에 비밀번호·주민번호 등 민감 정보 포함 (Base64 디코딩으로 내용이 보임). ✅ 식별자·role만.
- ❌ Secret Key를 코드에 하드코딩. ✅ 환경 변수로 관리.

### 2-2. JwtTokenProvider — 토큰 발급/검증 (실코드)

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
            @Value("${security.jwt.secret}") String secret,        // 32바이트 이상
            @Value("${security.jwt.access-exp-ms:1800000}") long accessExpMs,   // 30분
            @Value("${security.jwt.refresh-exp-ms:604800000}") long refreshExpMs // 7일
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
            .claim("role", role)                 // 민감정보(이름/이메일) 넣지 말 것
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

    /** 유효하지 않으면 throw. Filter에서 try-catch로 401 응답. */
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
    secret: ${JWT_SECRET}             # 운영은 반드시 환경변수
    access-exp-ms: 1800000            # 30분
    refresh-exp-ms: 604800000         # 7일
cors:
  allowed-origins: "https://app.harness.example.com,https://admin.harness.example.com"
```

### 2-3. Spring Security 기본 설정 (CORS 포함)

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

    private final JwtAuthenticationFilter jwtAuthFilter;        // §2-5 참고
    private final RestAuthenticationEntryPoint authEntryPoint;  // 401 응답기
    private final RestAccessDeniedHandler accessDeniedHandler;  // 403 응답기

    @Value("${cors.allowed-origins}") private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                                  // REST API는 Stateless라 CSRF 불필요
            .cors(cors -> cors.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(authEntryPoint)                  // 인증 실패 401
                .accessDeniedHandler(accessDeniedHandler))                 // 권한 부족 403
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**").permitAll()  // prod에서는 차단 — api-versioning-swagger 참고
                .requestMatchers("/api/v1/control/**").hasRole("OPERATOR")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private UrlBasedCorsConfigurationSource corsSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));   // ❌ 와일드카드("*") 금지 — ✅ 출처 명시
        cfg.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization","Content-Type","X-Request-Id"));
        cfg.setExposedHeaders(List.of("X-Request-Id"));
        cfg.setAllowCredentials(true);                                     // 쿠키 인증 시 필수
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
```

### 2-4. 401/403 응답기 (Frontend가 일관되게 받을 수 있도록)

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

### 2-5. JwtAuthenticationFilter — 실코드

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
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))    // ROLE_ 접두사 필수
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (ExpiredJwtException e) {
                log.debug("[JWT 만료] {}", e.getMessage());
                // 만료는 EntryPoint가 401로 응답하도록 인증 미설정 상태로 진행
            } catch (JwtException | IllegalArgumentException e) {
                log.warn("[JWT 위변조 의심] {}", e.getMessage());
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

### 2-6. Refresh Token 재발급 (회전 방식)

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshStore;          // Redis 권장 (TTL=refresh-exp)
    private final UserService userService;

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(value = "refreshToken", required = false) String refreshToken) {

        if (refreshToken == null) throw new AuthException("REFRESH_MISSING");

        Claims claims;
        try {
            claims = tokenProvider.parse(refreshToken);    // 만료/위변조 검증
        } catch (Exception e) {
            throw new AuthException("REFRESH_INVALID");
        }

        String userId = claims.getSubject();

        // 1회용 검증 — Redis에 저장된 토큰과 동일해야 함
        if (!refreshStore.isValid(userId, refreshToken)) {
            refreshStore.revokeAll(userId);                // 도용 의심 → 전체 무효화
            throw new AuthException("REFRESH_REUSED");
        }

        String role = userService.getRole(userId);
        String newAccess  = tokenProvider.createAccessToken(userId, role);
        String newRefresh = tokenProvider.createRefreshToken(userId);

        refreshStore.rotate(userId, refreshToken, newRefresh);  // 옛 것 무효 + 새 것 등록

        ResponseCookie cookie = ResponseCookie.from("refreshToken", newRefresh)
            .httpOnly(true).secure(true).sameSite("Strict").path("/api/v1/auth").maxAge(Duration.ofDays(7))
            .build();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new TokenResponse(newAccess));
    }
}
```

> ⚠️ **Refresh Token Rotation**: 한 번 쓴 refresh는 즉시 무효화하고 새 refresh를 발급. 옛 refresh가 다시 들어오면 도용 가능성 → 전체 토큰 무효.

### 2-7. Bypass 모드 제어권 차단 (POL-08)

Bypass 모드가 활성화되면 모든 원격 제어 명령을 시스템 수준에서 차단해야 한다. Spring AOP 또는 Interceptor를 사용해서 Controller에 도달하기 전에 차단한다.

```java
// 제어 API 진입 전 Lock 상태 확인 Interceptor
@Component
public class ControlLockInterceptor implements HandlerInterceptor {

    private final LockStatusCacheService lockStatusCache;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // /api/v1/control/** 경로에만 적용
        String lockStatus = lockStatusCache.getCurrentLockMode();

        if ("BYPASS".equals(lockStatus)) {
            // Bypass 모드 → 원격 제어 전면 차단
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("""
                {"success": false, "message": "Bypass 모드 활성화 중 원격 제어가 차단되었습니다.", "errorCode": "CONTROL_LOCKED_BYPASS"}
            """);
            return false; // Controller로 진행 안 함
        }
        return true;
    }
}
```

```java
// Interceptor 등록 (반드시 필요 — 안 하면 동작 안 함)
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final ControlLockInterceptor controlLockInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(controlLockInterceptor)
                .addPathPatterns("/api/v1/control/**");           // 제어 API 전 경로
    }
}
```

### 2-8. SAP PM 연동 OAuth 2.0 (POL-06)

SAP PM과 연동할 때는 OAuth 2.0 Client Credentials 방식을 사용하고 Read-Only로만 접근한다.

```java
@Service
public class SapPmIntegrationService {

    private final OAuth2AuthorizedClientManager clientManager;
    private final WebClient webClient;

    public AssetInfoResponse getAssetFromSap(String sapAssetId) {
        // OAuth2 토큰 자동 획득 및 갱신
        OAuth2AuthorizeRequest request = OAuth2AuthorizeRequest
            .withClientRegistrationId("sap-pm") // application.yml에 등록된 이름
            .principal("harness-service")
            .build();

        OAuth2AuthorizedClient client = clientManager.authorize(request);
        String token = client.getAccessToken().getTokenValue();

        // Read-Only GET 요청만 허용 (POST/PUT/DELETE 금지)
        return webClient.get()
            .uri("/api/assets/{id}", sapAssetId)
            .header("Authorization", "Bearer " + token)
            .retrieve()
            .bodyToMono(AssetInfoResponse.class)
            .block();
    }
}
```

### 2-9. TLS 통신 필수 사항 (POL-06)

```yaml
# application.yml - 운영 환경에서 반드시 TLS 1.3 사용
server:
  ssl:
    enabled: true
    protocol: TLSv1.3
    key-store: ${SSL_KEYSTORE_PATH}       # 환경 변수로 관리
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12

# 외부 서비스 호출 시에도 TLS 검증 활성화 (개발 환경에서 절대 비활성화하지 말 것)
```

### 2-10. 감사 로그 (Audit Log)

중요한 행위(로그인, 제어 명령, 권한 변경 등)는 반드시 감사 로그를 남긴다.

```java
// AOP로 제어 명령 실행 시 자동으로 감사 로그 기록
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

        log.info("[감사로그] userId={}, action={}, result=SUCCESS", userId, action);
        // DB에도 저장 (audit_logs 테이블)
        auditLogRepository.save(AuditLog.create(userId, action, "SUCCESS"));
    }
}
```

## 3. 흔한 실수
- JWT를 `localStorage`에 저장 → XSS로 탈취. `HttpOnly Cookie`로 저장한다.
- 토큰 payload에 비밀번호·주민번호 등 민감 정보 포함 → Base64 디코딩으로 노출된다.
- Secret Key 하드코딩 → 환경 변수로 관리한다.
- CORS 허용 출처에 와일드카드(`*`) 사용 → 출처를 명시한다.
- 쓴 refresh를 무효화하지 않음 → 도용 시 전체 토큰을 무효화하지 못한다.
- `ControlLockInterceptor`를 등록하지 않음 → Bypass 차단이 동작하지 않는다.
- 외부 호출 TLS 검증을 개발 환경에서 비활성화 → 운영 사고로 이어진다.

## 4. 체크리스트
- [ ] 인증을 JWT 기반으로 하고 `JwtAuthenticationFilter`에서 토큰을 검증하는가
- [ ] 토큰을 `HttpOnly Cookie`에 저장하고 Secret Key를 환경 변수로 관리하는가
- [ ] CORS 허용 출처를 명시하고 와일드카드를 금지했는가
- [ ] 리프레시 토큰을 회전 방식으로 재발급하고 재사용 시 전체 무효화하는가
- [ ] 외부 시스템 연동에 OAuth 2.0 + TLS를 강제했는가
- [ ] 권한 변경 등 보안 이벤트를 감사 로그에 기록하는가
