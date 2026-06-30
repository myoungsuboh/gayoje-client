---
name: API 版本管理与 API 文档化
description: REST API 的版本策略（URI/请求头/查询）、向后兼容标准、Deprecation/Sunset 废弃告知、契约（模式）优先的文档自动化、生产环境文档暴露阻断的标准。这是与技术栈无关的通用标准，在升级新 API 版本或废弃旧版本时、自动化 API 文档或确定生产暴露时阅读。关键词: api versioning, semver, deprecation, sunset, openapi, swagger, contract-first, /v1/, /v2/, RFC 8594。
rules:
  - "显式版本: 显式区分 API 版本。不保留没有版本标识符的公开 API。"
  - "向后兼容优先: 尽可能保持向后兼容。只对破坏兼容的变更升级新的 major 版本，兼容的新增保持同一版本。"
  - "契约优先（Contract-first）: API 文档不手写，而从契约（模式/类型）自动生成·校验。让代码与文档源自单一来源，防止漂移（drift）。"
  - "显式废弃告知: 在关闭旧版本前，用标准方式（响应头等）告知 Deprecation·Sunset，并留出充分的宽限期。"
  - "控制生产暴露: 在生产（prod）环境阻断交互式文档·模式端点，或置于认证之后 — 暴露会扩大攻击面。"
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

# 📚 API 版本管理与 API 文档化

> 显式区分 REST API 的版本，只把破坏向后兼容的变更分离到新版本，旧版本通过 Deprecation→Sunset→移除安全废弃。API 文档从契约（模式）自动生成。在升级新版本、废弃旧版本、或确定 API 文档·生产暴露策略时阅读。这是不依赖特定语言/框架的通用标准。

## 1. 核心原则

- **显式版本**: 显式区分 API 版本。不保留没有版本标识符的公开 API。
- **向后兼容优先**: 尽可能保持向后兼容。只对破坏兼容的变更升级新的 major 版本，兼容的新增保持同一版本。
- **契约优先（Contract-first）**: API 文档不手写，而从契约（模式/类型）自动生成·校验。让代码与文档源自单一来源，防止漂移（drift）。
- **显式废弃告知**: 在关闭旧版本前，用标准方式（响应头等）告知 Deprecation·Sunset，并留出充分的宽限期。
- **控制生产暴露**: 在生产（prod）环境阻断交互式文档·模式端点，或置于认证之后 — 暴露会扩大攻击面。

## 2. 规则

### 2-1. 版本策略 — 定一种并一致地用

> 无论哪种方式，最重要的是**定一种并在整个 API 一致地**应用。若无特殊约束，**URI 版本**最简单，在路由·缓存·日志中都易于识别，是默认推荐。

| 方式 | 优点 | 缺点 | 使用时机 |
|------|------|------|----------|
| URI 路径（`/api/v1/...`） | 显式，缓存·路由友好 | 升级版本时 URL 改变 | **默认推荐** |
| 请求头（`Accept`、自定义头） | URL 稳定 | 调试困难，需要分离 CDN 缓存键 | 能控制客户端时 |
| 查询参数（`?v=2`） | 简单 | 缓存·路由混乱 | 临时实验 |

```text
# ❌ 禁止 — 没有版本标识符
GET /api/assets

# ✅ 推荐 — 显式标明版本（例: URI 方式）
GET /api/v1/assets
```

### 2-2. Major / Minor 标准 — 什么是"破坏性变更"

> 以是否破坏客户端代码来判断。破坏则 major，不破坏则保持同一版本。

- **Major 版本升级（v1 → v2）— 破坏兼容的变更**
  - 移除 / 重命名 / 改类型 响应字段
  - 新增必需请求参数，更改既有参数的含义
  - 更改错误码·状态码的含义
- **Minor（= 保持同一版本）— 兼容的变更**
  - **新增**响应字段（既有字段不变）
  - 新增端点
  - 新增 optional 参数

```text
// ❌ 禁止 — 在同一版本（v1）移除/重命名响应字段 → 破坏既有客户端
v1: { "name": ... }  →  v1: { "title": ... }

// ✅ 推荐 — 破坏性变更分离到新版本，v1 暂时保留
v1: { "name": ... }  (保留)
v2: { "title": ... } (新增)
```

### 2-3. 版本分支用路由/处理器分离，而非代码内 if

> 在一个处理器内用 `if (version == 1)` 分支会使代码膨胀，并让两个版本的变更互相缠绕。按版本分离路由·处理器（或控制器）。

```text
// ❌ 禁止 — 在一个处理器里做版本分支
handle(req): if req.version == 1 { ...v1... } else { ...v2... }

// ✅ 推荐 — 按版本分离处理器
GET /api/v1/assets → AssetV1Handler
GET /api/v2/assets → AssetV2Handler
```

### 2-4. Deprecation → Sunset → 移除（充分宽限）

> 突然关闭旧版本会让客户端崩溃。用标准响应头告知废弃，留出充分宽限（推荐 6 个月以上）后再移除。

- 在即将废弃的响应上用 **`Deprecation`** 头表明废弃事实，用 **`Sunset`** 头（RFC 8594）标明废弃日期。
- 一并提供指向后继版本的链接（例: `Link: …; rel="successor-version"`）。
- 移除时点移除该端点，或用 `410 Gone` 响应。

```text
# ✅ 推荐 — 即将废弃的响应头（传输格式与技术栈无关）
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT        # RFC 8594
Link: </api/v2/assets>; rel="successor-version"
```

推荐时间线:
```
T+0     : 发布 v2，v1 响应加 Deprecation 头
T+3个月: 推动客户端迁移，监控用量
T+6个月: 标明 Sunset 头，正式公告
T+9个月: 移除 v1（或 410 Gone）
```

### 2-5. 契约优先的文档自动化

> 手工管理文档会与代码不符。把标准模式（OpenAPI 等）作为**单一来源**，从中生成给人看的文档。

- 用模式描述端点·请求/响应模型·错误，并在模型（DTO/类型）上附说明·示例·是否必需。
- 按版本对文档分组/分离，让客户端只看自己版本的文档。
- 认证方案（例: Bearer 令牌）也在模式中标明。

```text
# ✅ 推荐 — 在模型上标明说明/示例/是否必需（伪模式）
AssetCreateRequest:
  tagId:     { type: string, required: true,  example: "ASSET-2026-0001", description: "자산 태그 ID" }
  assetName: { type: string, required: true,  example: "유압 펌프 01호" }
  deckId:    { type: string, nullable: true,  example: "DECK-A" }
```
（按语言的实现示例见末尾 `## 附录: 按技术栈示例`）

### 2-6. 生产环境文档暴露阻断

> 若交互式文档或模式原文在生产中公开，会暴露内部结构·攻击面。

- 在生产 profile 中禁用文档 UI·模式端点，或置于认证/内网（VPN）之后。
- 不要在文档说明中写内部 URL、DB 列名、详细错误消息等系统内部信息。

## 3. 常见错误

- **在同一 URL 覆盖 major 变更**: 保持同一版本却改变响应结构会破坏既有客户端。破坏性变更必须进新版本。
- **用代码内 if 分支版本**: 处理器膨胀，版本间变更缠绕。按版本分离。
- **不做 Deprecation 立即移除**: 不要在没有标准头告知 + 充分宽限（推荐 6 个月）的情况下关闭。
- **在 minor 变更里移除字段**: 新增兼容，移除/重命名是破坏兼容的 major 变更。
- **手工管理文档**: 与代码漂移。从契约（模式）自动生成。
- **在生产暴露文档·模式**: 禁用或置于认证之后。
- **缺失模型说明·示例**: 自动生成文档贫乏，客户端只能猜。
- **在文档暴露机密/内部信息**: 不要写内部 URL·DB 列名·详细错误。

## 4. 检查清单

- [ ] API 上是否标明版本标识符（整个 API 一致的一种方式）
- [ ] 是否把破坏性变更分离到新的 major 版本（禁止覆盖同一 URL）
- [ ] 兼容的新增是否保持同一版本
- [ ] 是否用路由/处理器而非代码内 if 来分支版本
- [ ] 是否对废弃端点应用了 Deprecation·Sunset 头与充分宽限（推荐 6 个月）
- [ ] 是否从契约（模式）自动生成文档，并在模型上附说明·示例·是否必需
- [ ] 是否在生产环境阻断/保护文档 UI·模式端点
- [ ] 是否避免在文档暴露内部 URL·DB 列名·详细错误等内部信息

## 附录: 按技术栈示例

> 以下是基于 Spring Boot + springdoc-openapi（Java）的实现示例。上述核心原则·规则与技术栈无关；在其他技术栈上，用各生态的工具（例: 别的 OpenAPI 生成器、API 网关的版本路由）实现相同概念。认证·错误响应约定等关联标准请参考相应技能文档。

### Spring Boot + springdoc (Java)

#### 版本策略 — 基于 URI（控制器映射）

```java
// ❌ 금지 — 버전 없음
@GetMapping("/api/assets")
public List<Asset> list() { ... }

// ✅ 권장 — URI 버전 명시
@GetMapping("/api/v1/assets")
public ApiResponse<List<AssetResponse>> list() { ... }
```

#### Deprecation 头 + Sunset 策略

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

#### springdoc-openapi 依赖

```groovy
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0'
}
```

> Spring Boot 3.x 使用 `springdoc-openapi-starter-webmvc-ui`（含 Swagger UI）。旧的 `springfox` 已不再维护，新项目绝不要用。

默认 URL:
- 文档 UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

#### application.yml 配置 + 生产阻断

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

> 若 API 模式在生产暴露，攻击面会增大。若只应在内网查看，请置于单独的内网域名/VPN 之后。

#### OpenAPI 全局配置 Bean

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

> 分离分组后，Swagger UI 右上角会出现 `v1`/`v2` 切换。客户端只看自己版本的文档即可，减少混乱。

#### Controller 注解

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

#### DTO 模式注解

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
