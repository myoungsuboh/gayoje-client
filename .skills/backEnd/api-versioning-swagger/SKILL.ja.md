---
name: API バージョン管理および API ドキュメント化
description: REST API のバージョン戦略（URI/ヘッダ/クエリ）、後方互換性の基準、Deprecation/Sunset 廃止告知、契約（スキーマ）優先のドキュメント自動化、運用環境でのドキュメント露出遮断の標準。スタックに依存しない汎用標準であり、新しい API バージョンを上げるときや旧バージョンを廃止するとき、API ドキュメントを自動化したり運用露出を決めるときに読む。キーワード: api versioning, semver, deprecation, sunset, openapi, swagger, contract-first, /v1/, /v2/, RFC 8594。
rules:
  - "明示的なバージョン: API バージョンを明示的に区別する。バージョン識別子のない公開 API を置かない。"
  - "後方互換優先: 可能な限り後方互換を維持する。互換が壊れる変更にのみ新しい major バージョンを上げ、互換のある追加は同じバージョンを維持する。"
  - "契約優先（Contract-first）: API ドキュメントは手で書かず、契約（スキーマ/型）から自動生成・検証する。コードとドキュメントを単一ソースから出して乖離（drift）を防ぐ。"
  - "明示的な廃止告知: 旧バージョンを止める前に Deprecation・Sunset を標準的な方法（応答ヘッダ等）で告知し、十分な猶予期間を置く。"
  - "運用露出の統制: 運用（prod）環境では対話的ドキュメント・スキーマエンドポイントを遮断するか認証の後ろに置く — 露出は攻撃表面を広げる。"
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

# 📚 API バージョン管理および API ドキュメント化

> REST API のバージョンを明示的に区別し、後方互換が壊れる変更だけを新しいバージョンに分離し、旧バージョンは Deprecation→Sunset→削除で安全に廃止する。API ドキュメントは契約（スキーマ）から自動生成する。新しいバージョンを上げるとき、旧バージョンを廃止するとき、API ドキュメント・運用露出ポリシーを決めるときに読む。特定の言語/フレームワークに依存しない汎用標準である。

## 1. 中核原則

- **明示的なバージョン**: API バージョンを明示的に区別する。バージョン識別子のない公開 API を置かない。
- **後方互換優先**: 可能な限り後方互換を維持する。互換が壊れる変更にのみ新しい major バージョンを上げ、互換のある追加は同じバージョンを維持する。
- **契約優先（Contract-first）**: API ドキュメントは手で書かず、契約（スキーマ/型）から自動生成・検証する。コードとドキュメントを単一ソースから出して乖離（drift）を防ぐ。
- **明示的な廃止告知**: 旧バージョンを止める前に Deprecation・Sunset を標準的な方法（応答ヘッダ等）で告知し、十分な猶予期間を置く。
- **運用露出の統制**: 運用（prod）環境では対話的ドキュメント・スキーマエンドポイントを遮断するか認証の後ろに置く — 露出は攻撃表面を広げる。

## 2. 規則

### 2-1. バージョン戦略 — 一つを定め一貫して

> どの方式であれ、**一つを定め全 API に一貫して**適用することが最も重要だ。特別な制約がなければ、**URI バージョン**が最も単純でルーティング・キャッシュ・ロギングのいずれでも識別しやすく、デフォルト推奨である。

| 方式 | 利点 | 欠点 | 使用時点 |
|------|------|------|----------|
| URI パス（`/api/v1/...`） | 明示的、キャッシュ・ルーティング親和 | バージョンアップ時に URL が変わる | **デフォルト推奨** |
| リクエストヘッダ（`Accept`、カスタムヘッダ） | URL 安定 | デバッグ困難、CDN キャッシュキー分離が必要 | クライアントを統制できるとき |
| クエリパラメータ（`?v=2`） | 簡単 | キャッシュ・ルーティング混乱 | 一時的な実験 |

```text
# ❌ 禁止 — バージョン識別子なし
GET /api/assets

# ✅ 推奨 — バージョンを明示（例: URI 方式）
GET /api/v1/assets
```

### 2-2. Major / Minor の基準 — 何が「壊れる変更」か

> クライアントコードを壊すかどうかで判断する。壊せば major、壊さなければ同じバージョンを維持。

- **Major バージョンアップ（v1 → v2）— 互換が壊れる変更**
  - 応答フィールドの削除 / 名前変更 / 型変更
  - 必須リクエストパラメータの追加、既存パラメータの意味変更
  - エラーコード・ステータスコードの意味変更
- **Minor（= 同じバージョンを維持）— 互換のある変更**
  - 応答フィールドの**追加**（既存フィールドはそのまま）
  - 新しいエンドポイントの追加
  - optional パラメータの追加

```text
// ❌ 禁止 — 同じバージョン（v1）で応答フィールドを削除/名前変更 → 既存クライアントが壊れる
v1: { "name": ... }  →  v1: { "title": ... }

// ✅ 推奨 — 壊れる変更は新しいバージョンに分離、v1 は当面維持
v1: { "name": ... }  (維持)
v2: { "title": ... } (新規)
```

### 2-3. バージョン分岐はコード内 if ではなく経路/ハンドラで分離

> 一つのハンドラ内で `if (version == 1)` で分岐するとコードが肥大化し、二つのバージョンの変更が互いに絡む。バージョン別のルート・ハンドラ（またはコントローラ）を分離する。

```text
// ❌ 禁止 — 一つのハンドラでバージョン分岐
handle(req): if req.version == 1 { ...v1... } else { ...v2... }

// ✅ 推奨 — バージョン別ハンドラ分離
GET /api/v1/assets → AssetV1Handler
GET /api/v2/assets → AssetV2Handler
```

### 2-4. Deprecation → Sunset → 削除（十分な猶予）

> 旧バージョンを突然止めるとクライアントが壊れる。標準応答ヘッダで廃止を告知し、十分な猶予（推奨 6 か月以上）を置いた後に削除する。

- 廃止予定の応答に **`Deprecation`** ヘッダで廃止の事実を、**`Sunset`** ヘッダ（RFC 8594）で廃止日を明示する。
- 後続バージョンを指すリンク（例: `Link: …; rel="successor-version"`）も併せて提供する。
- 削除時点では該当エンドポイントを削除するか `410 Gone` で応答する。

```text
# ✅ 推奨 — 廃止予定の応答ヘッダ（伝送形式はスタック無関）
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT        # RFC 8594
Link: </api/v2/assets>; rel="successor-version"
```

推奨タイムライン:
```
T+0    : v2 リリース、v1 応答に Deprecation ヘッダ
T+3か月: クライアント移行を促進、使用量モニタリング
T+6か月: Sunset ヘッダ明示、公式告知
T+9か月: v1 削除（または 410 Gone）
```

### 2-5. 契約優先のドキュメント自動化

> ドキュメントを手で管理するとコードと食い違う。標準スキーマ（OpenAPI 等）を**単一ソース**に置き、そこから人が見るドキュメントを生成する。

- エンドポイント・リクエスト/応答モデル・エラーをスキーマで記述し、モデル（DTO/型）に説明・例・必須可否を付ける。
- バージョン別にドキュメントをグループ/分離し、クライアントが自分のバージョンのドキュメントだけ見るようにする。
- 認証スキーム（例: Bearer トークン）もスキーマに明示する。

```text
# ✅ 推奨 — モデルに説明/例/必須可否を明示（疑似スキーマ）
AssetCreateRequest:
  tagId:     { type: string, required: true,  example: "ASSET-2026-0001", description: "자산 태그 ID" }
  assetName: { type: string, required: true,  example: "유압 펌프 01호" }
  deckId:    { type: string, nullable: true,  example: "DECK-A" }
```
（言語別の実装例は末尾の `## 付録: スタック別の例` を参照）

### 2-6. 運用環境でのドキュメント露出遮断

> 運用で対話的ドキュメントやスキーマ原本が公開されると、内部構造・攻撃表面が露わになる。

- 運用プロファイルではドキュメント UI・スキーマエンドポイントを無効化するか、認証/社内網（VPN）の後ろに置く。
- ドキュメントの説明に内部 URL、DB カラム名、詳細なエラーメッセージなどシステム内部情報を書かない。

## 3. よくある誤り

- **同じ URL に major 変更を上書き**: 同じバージョンを維持したまま応答構造を変えると既存クライアントが壊れる。壊れる変更は必ず新しいバージョンへ。
- **バージョンをコード内 if で分岐**: ハンドラが肥大化しバージョン間の変更が絡む。バージョン別に分離せよ。
- **Deprecation なしで即時削除**: 標準ヘッダ告知 + 十分な猶予（推奨 6 か月）なしに止めるな。
- **Minor 変更でフィールド削除**: 追加は互換、削除/名前変更は互換が壊れる major 変更だ。
- **ドキュメントを手で管理**: コードと乖離する。契約（スキーマ）から自動生成せよ。
- **運用でドキュメント・スキーマ露出**: 無効化するか認証の後ろに置け。
- **モデルの説明・例の欠落**: 自動生成ドキュメントが貧弱でクライアントが推測する羽目になる。
- **ドキュメントに秘密/内部情報露出**: 内部 URL・DB カラム名・詳細エラーを書くな。

## 4. チェックリスト

- [ ] API にバージョン識別子が明示されているか（全 API 一貫した一つの方式）
- [ ] 壊れる変更を新しい major バージョンに分離したか（同じ URL 上書き禁止）
- [ ] 互換のある追加は同じバージョンを維持したか
- [ ] バージョン分岐をコード内 if ではなく経路/ハンドラで分離したか
- [ ] 廃止エンドポイントに Deprecation・Sunset ヘッダと十分な猶予（推奨 6 か月）を適用したか
- [ ] ドキュメントを契約（スキーマ）から自動生成し、モデルに説明・例・必須可否を付けたか
- [ ] 運用環境でドキュメント UI・スキーマエンドポイントを遮断/保護したか
- [ ] ドキュメントに内部 URL・DB カラム名・詳細エラーなど内部情報を露出していないか

## 付録: スタック別の例

> 以下は Spring Boot + springdoc-openapi（Java）に基づく実装例だ。上記の中核原則・規則はスタック無関であり、他のスタックでは同じ概念を各エコシステムのツール（例: 別の OpenAPI 生成器、API ゲートウェイのバージョンルーティング）で実装する。認証・エラー応答規約などの連携標準は該当スキル文書を参照せよ。

### Spring Boot + springdoc (Java)

#### バージョン戦略 — URI ベース（コントローラマッピング）

```java
// ❌ 금지 — 버전 없음
@GetMapping("/api/assets")
public List<Asset> list() { ... }

// ✅ 권장 — URI 버전 명시
@GetMapping("/api/v1/assets")
public ApiResponse<List<AssetResponse>> list() { ... }
```

#### Deprecation ヘッダ + Sunset ポリシー

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

#### springdoc-openapi 依存

```groovy
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0'
}
```

> Spring Boot 3.x は `springdoc-openapi-starter-webmvc-ui`（Swagger UI 同梱）。旧 `springfox` はもはや保守されていないので、新規プロジェクトで絶対に使うな。

デフォルト URL:
- ドキュメント UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

#### application.yml 設定 + 運用遮断

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

> 運用で API スキーマが露出すると攻撃表面が増える。社内網でのみ見るべきなら、別の社内ドメイン/VPN の後ろに置く。

#### OpenAPI 全域設定 Bean

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

> グループを分離すると Swagger UI 右上に `v1`/`v2` トグルができる。クライアントが自分のバージョンのドキュメントだけ見ればよく、混乱が減る。

#### Controller アノテーション

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

#### DTO スキーマアノテーション

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
