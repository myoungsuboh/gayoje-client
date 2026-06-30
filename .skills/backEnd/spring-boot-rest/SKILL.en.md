---
name: Spring Boot REST API Development Standard (MyBatis MVC)
description: Standard for Java Spring Boot + MyBatis-based MVC implementation — the Controller → Service → DAO → Mapper(XML) layers, feature(domain)-based directories, a common ApiResponse format, global exception handling, and fixes for frequently occurring type errors. Read this when building a new REST API or dealing with layer/package structure, response format, or type-casting errors. Keywords: @RestController, @GetMapping, @PostMapping, ResponseEntity, ApiResponse, Controller, Service, DAO, Mapper, MyBatis.
rules:
  - "Separate the layers in the order Controller → Service → DAO → Mapper(XML), and each layer calls only the one directly below it (no skipping)."
  - "The Controller handles only request validation and response conversion, and holds no business logic."
  - "Put the transaction boundary (@Transactional) and business rules in the Service."
  - "Separate DB access into MyBatis Mapper XML and use dynamic queries."
  - "Wrap responses in the common ApiResponse format before returning."
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

# 🌐 Spring Boot REST API Development Standard (MyBatis MVC)

> Unify the Controller → Service → DAO → Mapper(XML) layers and the response format. Read this when building a new REST API or dealing with package structure, response format, or type errors.

## 1. Core Principles
- Separate the layers in the order Controller → Service → DAO → Mapper(XML), and each layer calls only the one directly below it (no skipping).
- The Controller handles only request validation and response conversion, and holds no business logic.
- Put the transaction boundary (`@Transactional`) and business rules in the Service.
- Separate DB access into MyBatis Mapper XML and use dynamic queries.
- Wrap responses in the common `ApiResponse` format before returning.

## 2. Rules

### 2-1. Layer Structure
```
Controller → Service → DAO → Mapper(XML) → DB
```
- **Controller**: HTTP request/response. Does not write business logic directly.
- **Service**: the actual business logic. Attach `@Transactional` here.
- **DAO**: the DB access method interface. 1:1 with the MyBatis Mapper.
- **Mapper XML**: the XML file where the actual SQL is written.
- **DTO**: data objects between layers. Request/Response are separated.

### 2-2. Directory Structure (feature-first)
Do not split by layer (controller/, service/). First create a **feature(domain) folder** and subdivide layers within it.

```
src/main/java/com/harness/
├── src/                               ← feature collection root
│   ├── asset/                         ← feature name (domain)
│   │   ├── controller/
│   │   │   └── AssetController.java
│   │   ├── service/
│   │   │   ├── AssetService.java      (interface)
│   │   │   └── impl/
│   │   │       └── AssetServiceImpl.java
│   │   ├── dao/
│   │   │   └── AssetDao.java          (@Mapper interface)
│   │   └── dto/
│   │       ├── request/
│   │       │   └── AssetCreateRequest.java
│   │       └── response/
│   │           └── AssetResponse.java
│   │
│   └── {featureName}/                 ← repeat the same structure when adding a feature
│       ├── controller/
│       ├── service/ └── impl/
│       ├── dao/
│       └── dto/ ├── request/ └── response/
│
├── config/                            ← global config (Security, MyBatis, etc.)
│   ├── SecurityConfig.java
│   └── MyBatisConfig.java
└── HarnessApplication.java            ← app entry point

src/main/resources/
├── mapper/
│   ├── AssetMapper.xml               ← name it to match the feature name
│   └── UserMapper.xml
└── application.yml
```

Package naming rules:
```
com.harness.src.asset.controller   → AssetController
com.harness.src.asset.service      → AssetService (interface)
com.harness.src.asset.service.impl → AssetServiceImpl
com.harness.src.asset.dao          → AssetDao
com.harness.src.asset.dto.request  → AssetCreateRequest
com.harness.src.asset.dto.response → AssetResponse
com.harness.config                 → SecurityConfig, MyBatisConfig, etc.
```

Feature folder naming: noun-form singular (`asset`, `user`, `sensor`, `alarm`, `report`); compound domains are written joined without hyphens (`assetGroup`, `sensorLog`).

### 2-3. Writing a Controller
```java
package com.harness.src.asset.controller;   // feature-based package

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

### 2-4. Writing a Service (interface + impl separation)
```java
// interface — com.harness.src.asset.service
public interface AssetService {
    List<AssetResponse> getAssets();
    AssetResponse getAsset(String tagId);
    void createAsset(AssetCreateRequest request);
    void updateAsset(String tagId, AssetUpdateRequest request);
    void deleteAsset(String tagId);
}

// implementation — com.harness.src.asset.service.impl
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    private final AssetDao assetDao;

    @Override
    public AssetResponse getAsset(String tagId) {
        AssetResponse asset = assetDao.findByTagId(tagId);
        if (asset == null) {
            throw new BusinessException("NOT_FOUND", "The asset could not be found.");
        }
        return asset;
    }

    @Override
    @Transactional  // attach only to methods that change the DB
    public void createAsset(AssetCreateRequest request) {
        log.info("[asset registration] tagId={}", request.getTagId());
        assetDao.insert(request);
    }

    @Override
    @Transactional
    public void deleteAsset(String tagId) {
        assetDao.softDelete(tagId); // fill deleted_at instead of actual deletion (logical delete)
    }
}
```

### 2-5. Writing a DAO (`@Mapper` required)
```java
// com.harness.src.asset.dao
@Mapper
public interface AssetDao {
    List<AssetResponse> findAll();
    AssetResponse findByTagId(String tagId);
    int insert(AssetCreateRequest request);
    int update(AssetUpdateRequest request);
    int softDelete(String tagId);  // fill deleted_at (logical delete)
}
```

### 2-6. Writing the Mapper XML (namespace = full DAO path)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<!-- namespace must exactly match the full path of the DAO interface -->
<mapper namespace="com.harness.src.asset.dao.AssetDao">

    <!-- ResultMap: maps DB column names (snake_case) → Java field names (camelCase) -->
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

    <!-- Dynamic query example: add the WHERE clause only when a condition exists -->
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

### 2-7. Writing DTOs (Request/Response separation)
```java
// Request DTO - uses input validation annotations
@Getter
@NoArgsConstructor
public class AssetCreateRequest {
    @NotBlank(message = "Tag ID is required.")
    @Size(max = 50, message = "Tag ID must be 50 characters or fewer.")
    private String tagId;

    @NotBlank(message = "Asset name is required.")
    private String assetName;

    private String deckId;
}

// Response DTO - an object holding the DB query result
@Getter
@Setter  // MyBatis needs a Setter or @Alias so it can inject values
@NoArgsConstructor
public class AssetResponse {
    private Long assetId;
    private String tagId;
    private String assetName;
    private String deckId;
    private LocalDateTime createdAt;
}
```

### 2-8. Common Response Format
Wrap every API in the common envelope `ApiResponse<T>`. **The single source of truth for the definition (field order, factory names, standard error codes) is `docs-glossary`** — the below follows that definition as-is.

```java
// The definition, field order, and factories have docs-glossary as the single source of truth (success, data, message, errorCode)
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode   // null on success
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

### 2-9. Global Exception Handling
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusinessException(BusinessException e) {
        log.warn("[business exception] message={}, code={}", e.getMessage(), e.getErrorCode());
        return ResponseEntity.status(e.getHttpStatus())
            .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .findFirst()
            .orElse("The input value is invalid.");
        return ResponseEntity.badRequest().body(ApiResponse.fail("VALIDATION_FAILED", message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e) {
        log.error("[server error]", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.fail("INTERNAL_ERROR", "A server error occurred."));
    }
}
```

## 3. Common Mistakes (frequently occurring type errors)

### 3-1. `Map<String, ?>` + getOrDefault combination — compile error
```java
// ❌ Error: getOrDefault of Map<String, ?> returns the capture wildcard CAP#1 → rejects a concrete type
Map<String, ?> dataMap = getDataMap();
double value = ((Number) dataMap.getOrDefault("value", 0.0)).doubleValue();   // ERROR
String level = (String)  dataMap.getOrDefault("alarmLevel", "NORMAL");        // ERROR

// ✅ Fix 1 (recommended): declare as Map<String, Object>
Map<String, Object> dataMap2 = getDataMap();
double v = ((Number) dataMap2.getOrDefault("value", 0.0)).doubleValue();

// ✅ Fix 2: if unavoidable, cast locally just once
@SuppressWarnings("unchecked")
Map<String, Object> safeMap = (Map<String, Object>) dataMap;

// ✅ Fix 3 (most defensive): extract with a null-safe utility method
private double getDouble(Map<String, Object> map, String key, double d) {
    Object x = map.get(key);
    return (x instanceof Number) ? ((Number) x).doubleValue() : d;
}
private String getString(Map<String, Object> map, String key, String d) {
    Object x = map.get(key);
    return (x instanceof String) ? (String) x : d;
}
```

### 3-2. Numeric type mismatch when MyBatis returns a Map
When MyBatis returns DB values as a Map, sometimes `INTEGER` comes back as `Long` and `NUMERIC` as `BigDecimal`.
```java
Map<String, Object> row = assetDao.findRawData(tagId);
// ❌ ClassCastException risk
int count = (int) row.get("count");
// ✅ Receive as Number and convert
int    count2 = ((Number) row.get("count")).intValue();
long   total  = ((Number) row.get("total")).longValue();
double ratio  = ((Number) row.get("ratio")).doubleValue();
```

### 3-3. Missing `LocalDateTime` ↔ `String` conversion
```yaml
# ❌ If not configured, it serializes as the array [2024,1,15,10,30,0]
# application.yml
spring:
  jackson:
    serialization:
      write-dates-as-timestamps: false   # ✅ LocalDateTime → ISO 8601 string
    time-zone: Asia/Seoul
```

### 3-4. `@RequestParam`/`@PathVariable` type conversion failure
```java
// ❌ If "abc" comes in, conversion fails → appears as 500 without a handler
@GetMapping("/{assetId}")
public ApiResponse<AssetResponse> getAsset(@PathVariable Long assetId) { ... }

// ✅ Add MethodArgumentTypeMismatchException to GlobalExceptionHandler
@ExceptionHandler(MethodArgumentTypeMismatchException.class)
public ResponseEntity<ApiResponse<?>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    return ResponseEntity.badRequest()
        .body(ApiResponse.fail("INVALID_PARAM_TYPE", "Invalid parameter type: " + e.getName()));
}
```

### 3-5. `NullPointerException` — unhandled null
```java
// ❌ NPE if not in the DB
AssetResponse asset = assetDao.findByTagId(tagId);
return asset.getAssetName();

// ✅ Handle the exception after a null check
AssetResponse asset2 = assetDao.findByTagId(tagId);
if (asset2 == null) throw new BusinessException("NOT_FOUND", "Asset not found.");
return asset2.getAssetName();
```

## 4. Checklist
- [ ] Did you separate the layers in the order Controller → Service → DAO → Mapper without skipping?
- [ ] Did you follow the feature(domain)-based folder structure and package naming?
- [ ] Is there no business logic in the Controller, and is `@Transactional` placed in the Service?
- [ ] Does the Mapper XML namespace match the full DAO path?
- [ ] Did you separate the Request/Response DTOs and attach input validation annotations?
- [ ] Did you wrap every API in `ApiResponse` and apply global exception handling?
- [ ] Did you handle Map/numeric/date type casting defensively?
