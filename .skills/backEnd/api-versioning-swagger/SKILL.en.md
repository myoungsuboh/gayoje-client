---
name: API Versioning and API Documentation
description: Standards for REST API versioning strategy (URI/header/query), backward-compatibility criteria, Deprecation/Sunset retirement notices, contract (schema)-first documentation automation, and blocking documentation exposure in production. A universal, stack-independent standard to read when bumping a new API version, retiring an old one, automating API docs, or deciding production exposure. Keywords: api versioning, semver, deprecation, sunset, openapi, swagger, contract-first, /v1/, /v2/, RFC 8594.
rules:
  - "Explicit versions: distinguish API versions explicitly. Never leave a public API without a version identifier."
  - "Backward compatibility first: keep backward compatibility wherever possible. Bump a new major version only for breaking changes, and keep the same version for compatible additions."
  - "Contract-first: do not hand-write API docs; generate and validate them from the contract (schema/types). Keep code and docs coming from a single source to prevent drift."
  - "Explicit retirement notice: before turning off an old version, announce Deprecation and Sunset by a standard means (response headers, etc.) and allow a sufficient grace period."
  - "Control production exposure: in the production (prod) environment, block interactive docs and schema endpoints or put them behind authentication — exposure widens the attack surface."
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

# 📚 API Versioning and API Documentation

> Distinguish REST API versions explicitly, separate only backward-incompatible changes into a new version, and retire old versions safely via Deprecation→Sunset→removal. Generate API docs from the contract (schema). Read when bumping a new version, retiring an old one, or deciding API documentation/production exposure policy. It is a universal standard not tied to any specific language/framework.

## 1. Core Principles

- **Explicit versions**: distinguish API versions explicitly. Never leave a public API without a version identifier.
- **Backward compatibility first**: keep backward compatibility wherever possible. Bump a new major version only for breaking changes, and keep the same version for compatible additions.
- **Contract-first**: do not hand-write API docs; generate and validate them from the contract (schema/types). Keep code and docs coming from a single source to prevent drift.
- **Explicit retirement notice**: before turning off an old version, announce Deprecation and Sunset by a standard means (response headers, etc.) and allow a sufficient grace period.
- **Control production exposure**: in the production (prod) environment, block interactive docs and schema endpoints or put them behind authentication — exposure widens the attack surface.

## 2. Rules

### 2-1. Versioning Strategy — Pick One and Apply It Consistently

> Whatever the approach, the most important thing is to **pick one and apply it consistently across the entire API**. Absent special constraints, **URI versioning** is the simplest and easiest to identify across routing, caching, and logging, so it is the default recommendation.

| Approach | Pros | Cons | When to use |
|------|------|------|----------|
| URI path (`/api/v1/...`) | Explicit, cache/routing-friendly | URL changes on version bump | **Default recommendation** |
| Request header (`Accept`, custom header) | Stable URL | Hard to debug, needs CDN cache key separation | When you control the client |
| Query parameter (`?v=2`) | Simple | Caching/routing confusion | Temporary experiments |

```text
# ❌ Forbidden — no version identifier
GET /api/assets

# ✅ Recommended — version made explicit (e.g. URI approach)
GET /api/v1/assets
```

### 2-2. Major / Minor Criteria — What Is a "Breaking Change"

> Judge by whether it breaks client code. If it breaks, major; if not, keep the same version.

- **Major version bump (v1 → v2) — breaking changes**
  - Removing / renaming / retyping a response field
  - Adding a required request parameter, changing the meaning of an existing parameter
  - Changing the meaning of error codes / status codes
- **Minor (= keep the same version) — compatible changes**
  - **Adding** a response field (existing fields unchanged)
  - Adding a new endpoint
  - Adding an optional parameter

```text
// ❌ Forbidden — removing/renaming a response field in the same version (v1) → breaks existing clients
v1: { "name": ... }  →  v1: { "title": ... }

// ✅ Recommended — separate breaking changes into a new version, keep v1 for the time being
v1: { "name": ... }  (kept)
v2: { "title": ... } (new)
```

### 2-3. Branch Versions by Route/Handler, Not by `if` Inside Code

> Branching with `if (version == 1)` inside one handler bloats the code and entangles the two versions' changes. Separate the routes/handlers (or controllers) per version.

```text
// ❌ Forbidden — version branching in one handler
handle(req): if req.version == 1 { ...v1... } else { ...v2... }

// ✅ Recommended — separate handlers per version
GET /api/v1/assets → AssetV1Handler
GET /api/v2/assets → AssetV2Handler
```

### 2-4. Deprecation → Sunset → Removal (Sufficient Grace)

> Turning off an old version abruptly breaks clients. Announce retirement with standard response headers, allow a sufficient grace period (6+ months recommended), then remove.

- On responses about to be retired, state the fact with the **`Deprecation`** header and the retirement date with the **`Sunset`** header (RFC 8594).
- Also provide a link pointing to the successor version (e.g. `Link: …; rel="successor-version"`).
- At removal time, remove the endpoint or respond with `410 Gone`.

```text
# ✅ Recommended — response headers for impending retirement (transport format is stack-neutral)
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT        # RFC 8594
Link: </api/v2/assets>; rel="successor-version"
```

Recommended timeline:
```
T+0      : v2 released, Deprecation header on v1 responses
T+3 months: encourage client migration, monitor usage
T+6 months: state Sunset header, official announcement
T+9 months: remove v1 (or 410 Gone)
```

### 2-5. Contract-First Documentation Automation

> Managing docs by hand diverges from the code. Keep a standard schema (OpenAPI, etc.) as the **single source** and generate human-facing docs from it.

- Describe endpoints, request/response models, and errors in the schema, and attach descriptions, examples, and required flags to the models (DTO/types).
- Group/separate docs by version so clients see only their own version's docs.
- Specify the auth scheme (e.g. Bearer token) in the schema too.

```text
# ✅ Recommended — specify description/example/required on the model (pseudo-schema)
AssetCreateRequest:
  tagId:     { type: string, required: true,  example: "ASSET-2026-0001", description: "자산 태그 ID" }
  assetName: { type: string, required: true,  example: "유압 펌프 01호" }
  deckId:    { type: string, nullable: true,  example: "DECK-A" }
```
(For per-language implementation examples, see `## Appendix: Per-Stack Examples` at the very end.)

### 2-6. Blocking Documentation Exposure in Production

> If interactive docs or the raw schema are public in production, internal structure and attack surface are revealed.

- In the production profile, disable the docs UI/schema endpoints or put them behind authentication/intranet (VPN).
- Do not write system internals such as internal URLs, DB column names, or detailed error messages in the doc descriptions.

## 3. Common Mistakes

- **Overwriting a major change at the same URL**: changing the response structure while keeping the same version breaks existing clients. Breaking changes must always go to a new version.
- **Branching versions with `if` inside code**: handlers bloat and changes across versions entangle. Separate per version.
- **Removing immediately without Deprecation**: do not turn it off without a standard-header notice + sufficient grace (6 months recommended).
- **Removing a field in a minor change**: additions are compatible; removal/rename is a breaking major change.
- **Managing docs by hand**: they drift from the code. Generate from the contract (schema).
- **Exposing docs/schema in production**: disable them or put them behind authentication.
- **Missing model descriptions/examples**: auto-generated docs become thin and clients have to guess.
- **Exposing secrets/internals in docs**: do not write internal URLs, DB column names, or detailed errors.

## 4. Checklist

- [ ] Is a version identifier specified on the API (one consistent approach across the entire API)?
- [ ] Did you separate breaking changes into a new major version (no overwriting the same URL)?
- [ ] Did you keep the same version for compatible additions?
- [ ] Did you branch versions by route/handler rather than `if` inside code?
- [ ] Did you apply Deprecation·Sunset headers and a sufficient grace (6 months recommended) to retired endpoints?
- [ ] Do you auto-generate docs from the contract (schema) and attach description·example·required flags to models?
- [ ] Did you block/protect the docs UI/schema endpoints in production?
- [ ] Did you avoid exposing internals like internal URLs·DB column names·detailed errors in the docs?

## Appendix: Per-Stack Examples

> Below is an implementation example based on Spring Boot + springdoc-openapi (Java). The core principles/rules above are stack-neutral; on other stacks, implement the same concepts with that ecosystem's tools (e.g. a different OpenAPI generator, an API gateway's version routing). For linked standards such as auth and error-response conventions, refer to the respective skill docs.

### Spring Boot + springdoc (Java)

#### Versioning Strategy — URI-based (controller mapping)

```java
// ❌ 금지 — 버전 없음
@GetMapping("/api/assets")
public List<Asset> list() { ... }

// ✅ 권장 — URI 버전 명시
@GetMapping("/api/v1/assets")
public ApiResponse<List<AssetResponse>> list() { ... }
```

#### Deprecation Header + Sunset Policy

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

#### springdoc-openapi Dependency

```groovy
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0'
}
```

> Spring Boot 3.x uses `springdoc-openapi-starter-webmvc-ui` (includes Swagger UI). The old `springfox` is no longer maintained, so never use it in new projects.

Default URLs:
- Docs UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

#### application.yml Config + Production Blocking

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

> If the API schema is exposed in production, the attack surface grows. If it must be visible only on the intranet, put it behind a separate intranet domain/VPN.

#### OpenAPI Global Configuration Bean

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

> Separating groups gives a `v1`/`v2` toggle in the top-right of Swagger UI. Clients only need to see their own version's docs, reducing confusion.

#### Controller Annotations

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

#### DTO Schema Annotations

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
