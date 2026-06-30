---
name: API 버전 관리 및 API 문서화
description: REST API의 버전 전략(URI/헤더/쿼리), 하위 호환성 기준, Deprecation/Sunset 폐기 고지, 계약(스키마) 우선 문서 자동화, 운영 환경 문서 노출 차단 표준. 스택에 무관한 범용 표준으로, 새 API 버전을 올리거나 구버전을 폐기할 때, API 문서를 자동화하거나 운영 노출을 정할 때 읽는다. 키워드: api versioning, semver, deprecation, sunset, openapi, swagger, contract-first, /v1/, /v2/, RFC 8594.
rules:
  - "명시적 버전: API 버전을 명시적으로 구분한다. 버전 식별자가 없는 공개 API는 두지 않는다."
  - "하위 호환 우선: 가능한 한 하위 호환을 유지한다. 호환이 깨지는 변경에만 새 major 버전을 올리고, 호환되는 추가는 같은 버전을 유지한다."
  - "계약 우선(Contract-first): API 문서는 손으로 쓰지 않고 계약(스키마/타입)에서 자동 생성·검증한다. 코드와 문서가 한 소스에서 나오게 해 표류(drift)를 막는다."
  - "명시적 폐기 고지: 구버전을 끄기 전에 Deprecation·Sunset을 표준 방식(응답 헤더 등)으로 고지하고, 충분한 유예 기간을 둔다."
  - "운영 노출 통제: 운영(prod) 환경에서는 대화형 문서·스키마 엔드포인트를 차단하거나 인증 뒤에 둔다 — 노출은 공격 표면을 넓힌다."
tags:
  - "api versioning"
  - "semver"
  - "deprecation"
  - "sunset"
  - "openapi"
  - "swagger"
  - "contract-first"
  - "/v1/"
  - "/v2/"
  - "RFC 8594"
  - "springdoc"
  - "swagger-ui"
  - "@Operation"
  - "@ApiResponse"
---

# 📚 API 버전 관리 및 API 문서화

> REST API의 버전을 명시적으로 구분하고, 하위 호환이 깨지는 변경만 새 버전으로 분리하며, 구버전은 Deprecation→Sunset→제거로 안전하게 폐기한다. API 문서는 계약(스키마)에서 자동 생성한다. 새 버전을 올리거나, 구버전을 폐기하거나, API 문서·운영 노출 정책을 정할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙

- **명시적 버전**: API 버전을 명시적으로 구분한다. 버전 식별자가 없는 공개 API는 두지 않는다.
- **하위 호환 우선**: 가능한 한 하위 호환을 유지한다. 호환이 깨지는 변경에만 새 major 버전을 올리고, 호환되는 추가는 같은 버전을 유지한다.
- **계약 우선(Contract-first)**: API 문서는 손으로 쓰지 않고 계약(스키마/타입)에서 자동 생성·검증한다. 코드와 문서가 한 소스에서 나오게 해 표류(drift)를 막는다.
- **명시적 폐기 고지**: 구버전을 끄기 전에 Deprecation·Sunset을 표준 방식(응답 헤더 등)으로 고지하고, 충분한 유예 기간을 둔다.
- **운영 노출 통제**: 운영(prod) 환경에서는 대화형 문서·스키마 엔드포인트를 차단하거나 인증 뒤에 둔다 — 노출은 공격 표면을 넓힌다.

## 2. 규칙

### 2-1. 버전 전략 — 하나를 정하고 일관되게

> 어떤 방식이든 **하나를 정하고 전 API에 일관되게** 적용하는 것이 가장 중요하다. 특별한 제약이 없으면 **URI 버전**이 가장 단순하고 라우팅·캐싱·로깅 모두에서 식별이 쉬워 기본 권장이다.

| 방식 | 장점 | 단점 | 사용 시점 |
|------|------|------|----------|
| URI 경로 (`/api/v1/...`) | 명시적, 캐시·라우팅 친화 | 버전업 시 URL이 변경됨 | **기본 권장** |
| 요청 헤더 (`Accept`, 커스텀 헤더) | URL 안정 | 디버깅 어려움, CDN 캐시 키 분리 필요 | 클라이언트를 통제할 수 있을 때 |
| 쿼리 파라미터 (`?v=2`) | 간단 | 캐싱·라우팅 혼란 | 임시 실험 |

```text
# ❌ 금지 — 버전 식별자 없음
GET /api/assets

# ✅ 권장 — 버전을 명시 (예: URI 방식)
GET /api/v1/assets
```

### 2-2. Major / Minor 기준 — 무엇이 "깨지는 변경"인가

> 클라이언트 코드를 깨뜨리는지로 판단한다. 깨뜨리면 major, 안 깨뜨리면 같은 버전 유지.

- **Major 버전 업 (v1 → v2) — 호환이 깨지는 변경**
  - 응답 필드 제거 / 이름 변경 / 타입 변경
  - 필수 요청 파라미터 추가, 기존 파라미터 의미 변경
  - 에러 코드·상태 코드의 의미 변경
- **Minor (= 같은 버전 유지) — 호환되는 변경**
  - 응답 필드 **추가** (기존 필드는 그대로)
  - 새 엔드포인트 추가
  - optional 파라미터 추가

```text
// ❌ 금지 — 같은 버전(v1)에서 응답 필드를 제거/이름 변경 → 기존 클라이언트가 깨짐
v1: { "name": ... }  →  v1: { "title": ... }

// ✅ 권장 — 깨지는 변경은 새 버전으로 분리, v1은 당분간 유지
v1: { "name": ... }  (유지)
v2: { "title": ... } (신규)
```

### 2-3. 버전 분기는 코드 안 if 가 아니라 경로/핸들러로 분리

> 한 핸들러 안에서 `if (version == 1)`로 분기하면 코드가 비대해지고 두 버전의 변경이 서로 얽힌다. 버전별 라우트·핸들러(또는 컨트롤러)를 분리한다.

```text
// ❌ 금지 — 한 핸들러에서 버전 분기
handle(req): if req.version == 1 { ...v1... } else { ...v2... }

// ✅ 권장 — 버전별 핸들러 분리
GET /api/v1/assets → AssetV1Handler
GET /api/v2/assets → AssetV2Handler
```

### 2-4. Deprecation → Sunset → 제거 (충분한 유예)

> 구버전을 갑자기 끄면 클라이언트가 망가진다. 표준 응답 헤더로 폐기를 고지하고 충분한 유예(권장 6개월 이상)를 둔 뒤 제거한다.

- 폐기 예정 응답에 **`Deprecation`** 헤더로 폐기 사실을, **`Sunset`** 헤더(RFC 8594)로 폐기 일자를 명시한다.
- 후속 버전을 가리키는 링크(예: `Link: …; rel="successor-version"`)를 함께 제공한다.
- 제거 시점에는 해당 엔드포인트를 제거하거나 `410 Gone`으로 응답한다.

```text
# ✅ 권장 — 폐기 예정 응답 헤더 (전송 형식은 스택 무관)
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT        # RFC 8594
Link: </api/v2/assets>; rel="successor-version"
```

권장 타임라인:
```
T+0   : v2 출시, v1 응답에 Deprecation 헤더
T+3개월: 클라이언트 마이그레이션 독려, 사용량 모니터링
T+6개월: Sunset 헤더 명시, 공식 공지
T+9개월: v1 제거 (또는 410 Gone)
```

### 2-5. 계약 우선 문서 자동화

> 문서를 손으로 관리하면 코드와 어긋난다. 표준 스키마(OpenAPI 등)를 **단일 소스**로 두고, 거기서 사람이 보는 문서를 생성한다.

- 엔드포인트·요청/응답 모델·에러를 스키마로 기술하고, 모델(DTO/타입)에 설명·예시·필수 여부를 붙인다.
- 버전별로 문서를 그룹/분리해, 클라이언트가 자기 버전 문서만 보게 한다.
- 인증 스킴(예: Bearer 토큰)도 스키마에 명시한다.

```text
# ✅ 권장 — 모델에 설명/예시/필수 여부를 명시 (의사 스키마)
AssetCreateRequest:
  tagId:     { type: string, required: true,  example: "ASSET-2026-0001", description: "자산 태그 ID" }
  assetName: { type: string, required: true,  example: "유압 펌프 01호" }
  deckId:    { type: string, nullable: true,  example: "DECK-A" }
```
(언어별 구현 예시는 맨 끝 `## 부록: 스택별 예시` 참고)

### 2-6. 운영 환경 문서 노출 차단

> 운영에서 대화형 문서나 스키마 원본이 공개되면 내부 구조·공격 표면이 드러난다.

- 운영 프로파일에서는 문서 UI·스키마 엔드포인트를 비활성화하거나 인증/사내망(VPN) 뒤에 둔다.
- 문서 설명에 내부 URL, DB 컬럼명, 상세 에러 메시지 등 시스템 내부 정보를 쓰지 않는다.

## 3. 흔한 실수

- **같은 URL에 major 변경 덮어쓰기**: 같은 버전을 유지한 채 응답 구조를 바꾸면 기존 클라이언트가 깨진다. 깨지는 변경은 반드시 새 버전으로.
- **버전을 코드 안 if 로 분기**: 핸들러가 비대해지고 버전 간 변경이 얽힌다. 버전별로 분리하라.
- **Deprecation 없이 즉시 제거**: 표준 헤더 고지 + 충분한 유예(권장 6개월) 없이 끄지 마라.
- **Minor 변경에서 필드 제거**: 추가는 호환, 제거/이름 변경은 호환이 깨지는 major 변경이다.
- **문서를 손으로 관리**: 코드와 표류한다. 계약(스키마)에서 자동 생성하라.
- **운영에서 문서·스키마 노출**: 비활성화하거나 인증 뒤에 둬라.
- **모델 설명·예시 누락**: 자동 생성 문서가 빈약해 클라이언트가 추측하게 된다.
- **문서에 비밀/내부 정보 노출**: 내부 URL·DB 컬럼명·상세 에러를 쓰지 마라.

## 4. 체크리스트

- [ ] API에 버전 식별자가 명시되어 있는가 (전 API 일관된 한 가지 방식)
- [ ] 깨지는 변경을 새 major 버전으로 분리했는가 (같은 URL 덮어쓰기 금지)
- [ ] 호환되는 추가는 같은 버전을 유지했는가
- [ ] 버전 분기를 코드 안 if 가 아니라 경로/핸들러로 분리했는가
- [ ] 폐기 엔드포인트에 Deprecation·Sunset 헤더와 충분한 유예(권장 6개월)를 적용했는가
- [ ] 문서를 계약(스키마)에서 자동 생성하고, 모델에 설명·예시·필수 여부를 달았는가
- [ ] 운영 환경에서 문서 UI·스키마 엔드포인트를 차단/보호했는가
- [ ] 문서에 내부 URL·DB 컬럼명·상세 에러 등 내부 정보를 노출하지 않았는가

## 부록: 스택별 예시

> 아래는 Spring Boot + springdoc-openapi(Java) 기준 구현 예시다. 위 핵심 원칙·규칙은 스택 무관이며, 다른 스택에서는 동일 개념을 각 생태계의 도구(예: 다른 OpenAPI 생성기, API 게이트웨이의 버전 라우팅)로 구현한다. 인증·에러 응답 규약 등 연계 표준은 해당 스킬 문서를 참조하라.

### Spring Boot + springdoc (Java)

#### 버전 전략 — URI 기반 (컨트롤러 매핑)

```java
// ❌ 금지 — 버전 없음
@GetMapping("/api/assets")
public List<Asset> list() { ... }

// ✅ 권장 — URI 버전 명시
@GetMapping("/api/v1/assets")
public ApiResponse<List<AssetResponse>> list() { ... }
```

#### Deprecation 헤더 + Sunset 정책

```java
@RestController
@RequestMapping("/api/v1/assets")
public class AssetV1Controller {

    @GetMapping
    public ResponseEntity<ApiResponse<List<AssetResponse>>> list() {
        return ResponseEntity.ok()
            .header("Deprecation", "true")
            .header("Sunset", "Wed, 31 Dec 2026 23:59:59 GMT")  // RFC 8594
            .header("Link", "</api/v2/assets>; rel=\"successor-version\"")
            .body(ApiResponse.ok(assetService.list()));
    }
}
```

#### springdoc-openapi 의존성

```groovy
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0'
}
```

> Spring Boot 3.x는 `springdoc-openapi-starter-webmvc-ui` (Swagger UI 포함). 구버전 `springfox`는 더 이상 유지보수되지 않으니 신규 프로젝트에서 절대 쓰지 마라.

기본 URL:
- 문서 UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

#### application.yml 설정 + 운영 차단

```yaml
springdoc:
  api-docs:
    enabled: true
    path: /v3/api-docs
  swagger-ui:
    enabled: true
    path: /swagger-ui.html
    tags-sorter: alpha
    operations-sorter: alpha
    disable-swagger-default-url: true
  packages-to-scan: com.harness.src
  paths-to-match: /api/**

---
spring:
  config:
    activate:
      on-profile: prod
springdoc:
  api-docs:
    enabled: false       # 운영에선 OpenAPI JSON 비공개
  swagger-ui:
    enabled: false       # 운영에선 Swagger UI 비공개
```

> 운영에서 API 스키마가 노출되면 공격 표면이 늘어난다. 사내망에서만 봐야 한다면 별도 사내 도메인/VPN 뒤에 둔다.

#### OpenAPI 전역 설정 빈

```java
package com.harness.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI harnessOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("Harness API")
                .version("v1")
                .description("Harness 플랫폼 REST API 문서")
                .contact(new Contact().name("Backend Team").email("backend@harness.io"))
                .license(new License().name("Proprietary")))
            .servers(List.of(
                new Server().url("https://api.harness.io").description("운영"),
                new Server().url("https://api-dev.harness.io").description("개발")
            ))
            .addSecurityItem(new SecurityRequirement().addList("BearerAuth"))
            .components(new Components()
                .addSecuritySchemes("BearerAuth", new SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
                    .description("Access Token (JWT)")));
    }

    // 버전별 그룹 분리
    @Bean
    public GroupedOpenApi v1Api() {
        return GroupedOpenApi.builder()
            .group("v1")
            .pathsToMatch("/api/v1/**")
            .build();
    }

    @Bean
    public GroupedOpenApi v2Api() {
        return GroupedOpenApi.builder()
            .group("v2")
            .pathsToMatch("/api/v2/**")
            .build();
    }
}
```

> 그룹을 분리하면 Swagger UI 우측 상단에서 `v1`/`v2` 토글이 생긴다. 클라이언트가 자기 버전 문서만 보면 되어 혼란이 줄어든다.

#### Controller 어노테이션

```java
package com.harness.src.asset.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/assets")
@Tag(name = "Asset", description = "자산 관리 API")
@SecurityRequirement(name = "BearerAuth")
public class AssetController {

    @Operation(
        summary = "자산 목록 조회",
        description = "전체 자산 목록을 페이지네이션으로 반환한다."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
            content = @Content(schema = @Schema(implementation = AssetListResponse.class))),
        @ApiResponse(responseCode = "401", description = "인증 실패", content = @Content),
        @ApiResponse(responseCode = "403", description = "권한 없음", content = @Content)
    })
    @GetMapping
    public ApiResponse<AssetListResponse> list(
        @Parameter(description = "페이지 번호 (1부터)", example = "1")
        @RequestParam(defaultValue = "1") int page,

        @Parameter(description = "페이지 크기 (최대 100)", example = "20")
        @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.ok(assetService.list(page, size));
    }

    @Operation(summary = "자산 단건 조회")
    @GetMapping("/{tagId}")
    public ApiResponse<AssetResponse> get(
        @Parameter(description = "태그 ID", required = true, example = "ASSET-2026-0001")
        @PathVariable String tagId
    ) {
        return ApiResponse.ok(assetService.getAsset(tagId));
    }
}
```

#### DTO 스키마 어노테이션

```java
@Schema(description = "자산 등록 요청")
@Getter
@NoArgsConstructor
public class AssetCreateRequest {

    @Schema(description = "자산 태그 ID", example = "ASSET-2026-0001", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank
    private String tagId;

    @Schema(description = "자산명", example = "유압 펌프 01호")
    @NotBlank
    private String assetName;

    @Schema(description = "데크 ID", example = "DECK-A", nullable = true)
    private String deckId;
}
```
