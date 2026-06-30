---
name: Spring Boot REST API 開発標準 (MyBatis MVC)
description: Java Spring Boot + MyBatis ベースの MVC 実装標準 — Controller → Service → DAO → Mapper(XML) のレイヤー、機能(ドメイン)別ディレクトリ、共通 ApiResponse フォーマット、グローバル例外処理、頻発する型エラーの解決策。REST API を新規作成したり、レイヤー・パッケージ構造・レスポンスフォーマット・型キャストエラーを扱うときに読む。キーワード: @RestController, @GetMapping, @PostMapping, ResponseEntity, ApiResponse, Controller, Service, DAO, Mapper, MyBatis.
rules:
  - "レイヤーは Controller → Service → DAO → Mapper(XML) の順で分離し、各レイヤーは直下のみを呼び出す(スキップ禁止)。"
  - "Controller はリクエスト検証とレスポンス変換のみを担当し、ビジネスロジックを置かない。"
  - "Service にトランザクション境界(@Transactional)とビジネスルールを置く。"
  - "DB アクセスは MyBatis Mapper XML に分離し、動的クエリを使う。"
  - "レスポンスは共通フォーマット ApiResponse で包んで返す。"
tags:
  - "@RestController"
  - "@GetMapping"
  - "@PostMapping"
  - "ResponseEntity"
  - "ApiResponse"
  - "Controller"
  - "Service"
  - "DAO"
  - "Mapper"
  - "MyBatis"
  - "@PutMapping"
  - "@DeleteMapping"
  - "Repository"
---

# 🌐 Spring Boot REST API 開発標準 (MyBatis MVC)

> Controller → Service → DAO → Mapper(XML) のレイヤーとレスポンスフォーマットを統一する。REST API を新規作成したり、パッケージ構造・レスポンスフォーマット・型エラーを扱うときに読む。

## 1. 基本原則
- レイヤーは Controller → Service → DAO → Mapper(XML) の順で分離し、各レイヤーは直下のみを呼び出す(スキップ禁止)。
- Controller はリクエスト検証とレスポンス変換のみを担当し、ビジネスロジックを置かない。
- Service にトランザクション境界(`@Transactional`)とビジネスルールを置く。
- DB アクセスは MyBatis Mapper XML に分離し、動的クエリを使う。
- レスポンスは共通フォーマット `ApiResponse` で包んで返す。

## 2. ルール

### 2-1. レイヤー構造
```
Controller → Service → DAO → Mapper(XML) → DB
```
- **Controller**: HTTP リクエスト/レスポンス。ビジネスロジックを直接書かない。
- **Service**: 実際のビジネスロジック。`@Transactional` をここに付ける。
- **DAO**: DB アクセスメソッドのインターフェース。MyBatis Mapper と 1:1。
- **Mapper XML**: 実際の SQL を記述する XML ファイル。
- **DTO**: レイヤー間のデータオブジェクト。Request/Response を分離。

### 2-2. ディレクトリ構造(機能別優先)
レイヤー別(controller/, service/)に分けない。**機能(ドメイン)別フォルダ**を先に作り、その中でレイヤーを細分化する。

```
src/main/java/com/harness/
├── src/                               ← 機能群のルート
│   ├── asset/                         ← 機能名(ドメイン)
│   │   ├── controller/
│   │   │   └── AssetController.java
│   │   ├── service/
│   │   │   ├── AssetService.java      (インターフェース)
│   │   │   └── impl/
│   │   │       └── AssetServiceImpl.java
│   │   ├── dao/
│   │   │   └── AssetDao.java          (@Mapper インターフェース)
│   │   └── dto/
│   │       ├── request/
│   │       │   └── AssetCreateRequest.java
│   │       └── response/
│   │           └── AssetResponse.java
│   │
│   └── {機能名}/                      ← 機能追加時に同じ構造を繰り返す
│       ├── controller/
│       ├── service/ └── impl/
│       ├── dao/
│       └── dto/ ├── request/ └── response/
│
├── config/                            ← グローバル設定(Security, MyBatis など)
│   ├── SecurityConfig.java
│   └── MyBatisConfig.java
└── HarnessApplication.java            ← アプリのエントリーポイント

src/main/resources/
├── mapper/
│   ├── AssetMapper.xml               ← 機能名に合わせて命名
│   └── UserMapper.xml
└── application.yml
```

パッケージ命名規則:
```
com.harness.src.asset.controller   → AssetController
com.harness.src.asset.service      → AssetService (インターフェース)
com.harness.src.asset.service.impl → AssetServiceImpl
com.harness.src.asset.dao          → AssetDao
com.harness.src.asset.dto.request  → AssetCreateRequest
com.harness.src.asset.dto.response → AssetResponse
com.harness.config                 → SecurityConfig, MyBatisConfig など
```

機能フォルダの命名: 名詞形の単数(`asset`, `user`, `sensor`, `alarm`, `report`)、複合ドメインはハイフンなしで連結(`assetGroup`, `sensorLog`)。

### 2-3. Controller の作成
```java
package com.harness.src.asset.controller;   // 機能別パッケージ

@RestController
@RequestMapping("/api/v1/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;

    @GetMapping
    public ApiResponse<List<AssetResponse>> getAssets() {
        return ApiResponse.ok(assetService.getAssets());
    }

    @GetMapping("/{tagId}")
    public ApiResponse<AssetResponse> getAsset(@PathVariable String tagId) {
        return ApiResponse.ok(assetService.getAsset(tagId));
    }

    @PostMapping
    public ApiResponse<Void> createAsset(@RequestBody @Valid AssetCreateRequest request) {
        assetService.createAsset(request);
        return ApiResponse.ok(null);
    }

    @PutMapping("/{tagId}")
    public ApiResponse<Void> updateAsset(@PathVariable String tagId,
                                          @RequestBody @Valid AssetUpdateRequest request) {
        assetService.updateAsset(tagId, request);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{tagId}")
    public ApiResponse<Void> deleteAsset(@PathVariable String tagId) {
        assetService.deleteAsset(tagId);
        return ApiResponse.ok(null);
    }
}
```

### 2-4. Service の作成(インターフェース + impl 分離)
```java
// インターフェース — com.harness.src.asset.service
public interface AssetService {
    List<AssetResponse> getAssets();
    AssetResponse getAsset(String tagId);
    void createAsset(AssetCreateRequest request);
    void updateAsset(String tagId, AssetUpdateRequest request);
    void deleteAsset(String tagId);
}

// 実装 — com.harness.src.asset.service.impl
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    private final AssetDao assetDao;

    @Override
    public AssetResponse getAsset(String tagId) {
        AssetResponse asset = assetDao.findByTagId(tagId);
        if (asset == null) {
            throw new BusinessException("NOT_FOUND", "該当する資産が見つかりません。");
        }
        return asset;
    }

    @Override
    @Transactional  // DB 変更があるメソッドにのみ付ける
    public void createAsset(AssetCreateRequest request) {
        log.info("[資産登録] tagId={}", request.getTagId());
        assetDao.insert(request);
    }

    @Override
    @Transactional
    public void deleteAsset(String tagId) {
        assetDao.softDelete(tagId); // 実削除の代わりに deleted_at を埋める(論理削除)
    }
}
```

### 2-5. DAO の作成(`@Mapper` 必須)
```java
// com.harness.src.asset.dao
@Mapper
public interface AssetDao {
    List<AssetResponse> findAll();
    AssetResponse findByTagId(String tagId);
    int insert(AssetCreateRequest request);
    int update(AssetUpdateRequest request);
    int softDelete(String tagId);  // deleted_at を埋める(論理削除)
}
```

### 2-6. Mapper XML の作成(namespace = DAO の完全パス)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<!-- namespace は DAO インターフェースの完全パスと必ず一致させること -->
<mapper namespace="com.harness.src.asset.dao.AssetDao">

    <!-- ResultMap: DB カラム名(snake_case) → Java フィールド名(camelCase) のマッピング -->
    <resultMap id="assetResultMap" type="com.harness.src.asset.dto.response.AssetResponse">
        <id     property="assetId"   column="asset_master_id" />
        <result property="tagId"     column="tag_id" />
        <result property="assetName" column="asset_name" />
        <result property="deckId"    column="deck_id" />
        <result property="createdAt" column="created_at" />
    </resultMap>

    <select id="findByTagId" parameterType="String" resultMap="assetResultMap">
        SELECT asset_master_id, tag_id, asset_name, deck_id, created_at
          FROM asset_masters
         WHERE tag_id = #{tagId}
           AND deleted_at IS NULL
    </select>

    <insert id="insert" parameterType="com.harness.src.asset.dto.request.AssetCreateRequest">
        INSERT INTO asset_masters (
            tag_id, asset_name, deck_id, created_at, updated_at
        ) VALUES (
            #{tagId}, #{assetName}, #{deckId}, NOW(), NOW()
        )
    </insert>

    <update id="softDelete" parameterType="String">
        UPDATE asset_masters
           SET deleted_at = NOW(), updated_at = NOW()
         WHERE tag_id = #{tagId}
    </update>

    <!-- 動的クエリの例: 条件があるときのみ WHERE 句を追加 -->
    <select id="findByCondition" parameterType="com.harness.src.asset.dto.request.AssetSearchRequest" resultMap="assetResultMap">
        SELECT asset_master_id, tag_id, asset_name, deck_id
          FROM asset_masters
         WHERE deleted_at IS NULL
        <if test="deckId != null and deckId != ''">
           AND deck_id = #{deckId}
        </if>
        <if test="keyword != null and keyword != ''">
           AND asset_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
         ORDER BY created_at DESC
    </select>

</mapper>
```

### 2-7. DTO の作成(Request/Response 分離)
```java
// リクエスト DTO - 入力値検証アノテーションを使用
@Getter
@NoArgsConstructor
public class AssetCreateRequest {
    @NotBlank(message = "タグ ID は必須です。")
    @Size(max = 50, message = "タグ ID は 50 文字以下である必要があります。")
    private String tagId;

    @NotBlank(message = "資産名は必須です。")
    private String assetName;

    private String deckId;
}

// レスポンス DTO - DB 参照結果を格納するオブジェクト
@Getter
@Setter  // MyBatis が値を注入できるよう Setter または @Alias が必要
@NoArgsConstructor
public class AssetResponse {
    private Long assetId;
    private String tagId;
    private String assetName;
    private String deckId;
    private LocalDateTime createdAt;
}
```

### 2-8. 共通レスポンスフォーマット
すべての API は共通エンベロープ `ApiResponse<T>` で包む。**定義(フィールド順・ファクトリ名・標準エラーコード)の単一の情報源は `docs-glossary` である** — 以下はその定義をそのまま踏襲する。

```java
// 定義・フィールド順・ファクトリは docs-glossary が単一の情報源 (success, data, message, errorCode)
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode   // 成功時は null
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, null);
    }
    public static ApiResponse<Void> ok() {
        return new ApiResponse<>(true, null, null, null);
    }
    public static <T> ApiResponse<T> fail(String errorCode, String message) {
        return new ApiResponse<>(false, null, message, errorCode);
    }
}
```

### 2-9. グローバル例外処理
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusinessException(BusinessException e) {
        log.warn("[ビジネス例外] message={}, code={}", e.getMessage(), e.getErrorCode());
        return ResponseEntity.status(e.getHttpStatus())
            .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .findFirst()
            .orElse("入力値が正しくありません。");
        return ResponseEntity.badRequest().body(ApiResponse.fail("VALIDATION_FAILED", message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e) {
        log.error("[サーバーエラー]", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.fail("INTERNAL_ERROR", "サーバーエラーが発生しました。"));
    }
}
```

## 3. よくあるミス(頻発する型エラー)

### 3-1. `Map<String, ?>` + getOrDefault の組み合わせ — コンパイルエラー
```java
// ❌ エラー: Map<String, ?> の getOrDefault の戻り値型がキャプチャワイルドカード CAP#1 → 具体型を拒否
Map<String, ?> dataMap = getDataMap();
double value = ((Number) dataMap.getOrDefault("value", 0.0)).doubleValue();   // ERROR
String level = (String)  dataMap.getOrDefault("alarmLevel", "NORMAL");        // ERROR

// ✅ 解決 1 (推奨): Map<String, Object> で宣言
Map<String, Object> dataMap2 = getDataMap();
double v = ((Number) dataMap2.getOrDefault("value", 0.0)).doubleValue();

// ✅ 解決 2: やむを得ない場合は一度だけローカルでキャスト
@SuppressWarnings("unchecked")
Map<String, Object> safeMap = (Map<String, Object>) dataMap;

// ✅ 解決 3 (最も防御的): null-safe ユーティリティメソッドで抽出
private double getDouble(Map<String, Object> map, String key, double d) {
    Object x = map.get(key);
    return (x instanceof Number) ? ((Number) x).doubleValue() : d;
}
private String getString(Map<String, Object> map, String key, String d) {
    Object x = map.get(key);
    return (x instanceof String) ? (String) x : d;
}
```

### 3-2. MyBatis が Map を返すときの数値型不一致
MyBatis が DB 値を Map で返すとき、`INTEGER` → `Long`、`NUMERIC` → `BigDecimal` で来る場合がある。
```java
Map<String, Object> row = assetDao.findRawData(tagId);
// ❌ ClassCastException のリスク
int count = (int) row.get("count");
// ✅ Number で受けて変換
int    count2 = ((Number) row.get("count")).intValue();
long   total  = ((Number) row.get("total")).longValue();
double ratio  = ((Number) row.get("ratio")).doubleValue();
```

### 3-3. `LocalDateTime` ↔ `String` 変換の漏れ
```yaml
# ❌ 未設定だと [2024,1,15,10,30,0] 配列にシリアライズされる
# application.yml
spring:
  jackson:
    serialization:
      write-dates-as-timestamps: false   # ✅ LocalDateTime → ISO 8601 文字列
    time-zone: Asia/Seoul
```

### 3-4. `@RequestParam`/`@PathVariable` の型変換失敗
```java
// ❌ "abc" が入ると変換失敗 → ハンドラがなければ 500 に見える
@GetMapping("/{assetId}")
public ApiResponse<AssetResponse> getAsset(@PathVariable Long assetId) { ... }

// ✅ GlobalExceptionHandler に MethodArgumentTypeMismatchException を追加
@ExceptionHandler(MethodArgumentTypeMismatchException.class)
public ResponseEntity<ApiResponse<?>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    return ResponseEntity.badRequest()
        .body(ApiResponse.fail("INVALID_PARAM_TYPE", "不正なパラメータ型: " + e.getName()));
}
```

### 3-5. `NullPointerException` — null 未処理
```java
// ❌ DB になければ NPE
AssetResponse asset = assetDao.findByTagId(tagId);
return asset.getAssetName();

// ✅ null チェック後に例外処理
AssetResponse asset2 = assetDao.findByTagId(tagId);
if (asset2 == null) throw new BusinessException("NOT_FOUND", "資産が見つかりません。");
return asset2.getAssetName();
```

## 4. チェックリスト
- [ ] レイヤーを Controller → Service → DAO → Mapper の順で分離し、スキップしていないか
- [ ] 機能(ドメイン)別フォルダ構造とパッケージ命名に従ったか
- [ ] Controller にビジネスロジックがなく、`@Transactional` を Service に置いたか
- [ ] Mapper XML の namespace が DAO の完全パスと一致するか
- [ ] Request/Response DTO を分離し、入力検証アノテーションを付けたか
- [ ] すべての API を `ApiResponse` で包み、グローバル例外処理を適用したか
- [ ] Map/数値/日付の型キャストを防御的に処理したか
