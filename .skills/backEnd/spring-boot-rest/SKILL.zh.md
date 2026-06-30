---
name: Spring Boot REST API 开发标准 (MyBatis MVC)
description: 基于 Java Spring Boot + MyBatis 的 MVC 实现标准 — Controller → Service → DAO → Mapper(XML) 分层、按功能(域)划分目录、通用 ApiResponse 格式、全局异常处理、常见类型错误的解决方案。在新建 REST API 或处理分层/包结构、响应格式、类型转换错误时阅读。关键词: @RestController, @GetMapping, @PostMapping, ResponseEntity, ApiResponse, Controller, Service, DAO, Mapper, MyBatis.
rules:
  - "分层按 Controller → Service → DAO → Mapper(XML) 顺序分离，每层只调用其正下方一层(禁止跳过)。"
  - "Controller 只负责请求校验与响应转换，不放业务逻辑。"
  - "在 Service 中放置事务边界(@Transactional)与业务规则。"
  - "DB 访问分离到 MyBatis Mapper XML 并使用动态查询。"
  - "响应用通用格式 ApiResponse 包装后返回。"
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

# 🌐 Spring Boot REST API 开发标准 (MyBatis MVC)

> 统一 Controller → Service → DAO → Mapper(XML) 分层与响应格式。在新建 REST API 或处理包结构、响应格式、类型错误时阅读。

## 1. 核心原则
- 分层按 Controller → Service → DAO → Mapper(XML) 顺序分离，每层只调用其正下方一层(禁止跳过)。
- Controller 只负责请求校验与响应转换，不放业务逻辑。
- 在 Service 中放置事务边界(`@Transactional`)与业务规则。
- DB 访问分离到 MyBatis Mapper XML 并使用动态查询。
- 响应用通用格式 `ApiResponse` 包装后返回。

## 2. 规则

### 2-1. 分层结构
```
Controller → Service → DAO → Mapper(XML) → DB
```
- **Controller**: HTTP 请求/响应。不直接编写业务逻辑。
- **Service**: 实际的业务逻辑。`@Transactional` 加在这里。
- **DAO**: DB 访问方法接口。与 MyBatis Mapper 1:1。
- **Mapper XML**: 编写实际 SQL 的 XML 文件。
- **DTO**: 层间的数据对象。Request/Response 分离。

### 2-2. 目录结构(功能优先)
不按层(controller/, service/)划分。先创建**按功能(域)的文件夹**，并在其中细分各层。

```
src/main/java/com/harness/
├── src/                               ← 功能集合根
│   ├── asset/                         ← 功能名(域)
│   │   ├── controller/
│   │   │   └── AssetController.java
│   │   ├── service/
│   │   │   ├── AssetService.java      (接口)
│   │   │   └── impl/
│   │   │       └── AssetServiceImpl.java
│   │   ├── dao/
│   │   │   └── AssetDao.java          (@Mapper 接口)
│   │   └── dto/
│   │       ├── request/
│   │       │   └── AssetCreateRequest.java
│   │       └── response/
│   │           └── AssetResponse.java
│   │
│   └── {功能名}/                      ← 添加功能时重复相同结构
│       ├── controller/
│       ├── service/ └── impl/
│       ├── dao/
│       └── dto/ ├── request/ └── response/
│
├── config/                            ← 全局配置(Security, MyBatis 等)
│   ├── SecurityConfig.java
│   └── MyBatisConfig.java
└── HarnessApplication.java            ← 应用入口

src/main/resources/
├── mapper/
│   ├── AssetMapper.xml               ← 与功能名对应命名
│   └── UserMapper.xml
└── application.yml
```

包命名规则:
```
com.harness.src.asset.controller   → AssetController
com.harness.src.asset.service      → AssetService (接口)
com.harness.src.asset.service.impl → AssetServiceImpl
com.harness.src.asset.dao          → AssetDao
com.harness.src.asset.dto.request  → AssetCreateRequest
com.harness.src.asset.dto.response → AssetResponse
com.harness.config                 → SecurityConfig, MyBatisConfig 等
```

功能文件夹命名: 名词形单数(`asset`, `user`, `sensor`, `alarm`, `report`)，复合域不用连字符直接拼写(`assetGroup`, `sensorLog`)。

### 2-3. 编写 Controller
```java
package com.harness.src.asset.controller;   // 按功能划分的包

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

### 2-4. 编写 Service(接口 + impl 分离)
```java
// 接口 — com.harness.src.asset.service
public interface AssetService {
    List<AssetResponse> getAssets();
    AssetResponse getAsset(String tagId);
    void createAsset(AssetCreateRequest request);
    void updateAsset(String tagId, AssetUpdateRequest request);
    void deleteAsset(String tagId);
}

// 实现 — com.harness.src.asset.service.impl
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    private final AssetDao assetDao;

    @Override
    public AssetResponse getAsset(String tagId) {
        AssetResponse asset = assetDao.findByTagId(tagId);
        if (asset == null) {
            throw new BusinessException("NOT_FOUND", "找不到对应的资产。");
        }
        return asset;
    }

    @Override
    @Transactional  // 仅加在有 DB 变更的方法上
    public void createAsset(AssetCreateRequest request) {
        log.info("[资产登记] tagId={}", request.getTagId());
        assetDao.insert(request);
    }

    @Override
    @Transactional
    public void deleteAsset(String tagId) {
        assetDao.softDelete(tagId); // 用填充 deleted_at 代替实际删除(逻辑删除)
    }
}
```

### 2-5. 编写 DAO(`@Mapper` 必需)
```java
// com.harness.src.asset.dao
@Mapper
public interface AssetDao {
    List<AssetResponse> findAll();
    AssetResponse findByTagId(String tagId);
    int insert(AssetCreateRequest request);
    int update(AssetUpdateRequest request);
    int softDelete(String tagId);  // 填充 deleted_at(逻辑删除)
}
```

### 2-6. 编写 Mapper XML(namespace = DAO 完整路径)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<!-- namespace 必须与 DAO 接口的完整路径一致 -->
<mapper namespace="com.harness.src.asset.dao.AssetDao">

    <!-- ResultMap: DB 列名(snake_case) → Java 字段名(camelCase) 映射 -->
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

    <!-- 动态查询示例: 仅在有条件时追加 WHERE 子句 -->
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

### 2-7. 编写 DTO(Request/Response 分离)
```java
// 请求 DTO - 使用输入值校验注解
@Getter
@NoArgsConstructor
public class AssetCreateRequest {
    @NotBlank(message = "标签 ID 为必填。")
    @Size(max = 50, message = "标签 ID 须为 50 个字符以内。")
    private String tagId;

    @NotBlank(message = "资产名为必填。")
    private String assetName;

    private String deckId;
}

// 响应 DTO - 承载 DB 查询结果的对象
@Getter
@Setter  // MyBatis 需要 Setter 或 @Alias 才能注入值
@NoArgsConstructor
public class AssetResponse {
    private Long assetId;
    private String tagId;
    private String assetName;
    private String deckId;
    private LocalDateTime createdAt;
}
```

### 2-8. 通用响应格式
所有 API 都用通用信封 `ApiResponse<T>` 包装。**定义(字段顺序、工厂名、标准错误码)的单一事实来源是 `docs-glossary`** — 以下完全遵循该定义。

```java
// 定义、字段顺序、工厂以 docs-glossary 为单一事实来源 (success, data, message, errorCode)
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode   // 成功时为 null
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

### 2-9. 全局异常处理
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusinessException(BusinessException e) {
        log.warn("[业务异常] message={}, code={}", e.getMessage(), e.getErrorCode());
        return ResponseEntity.status(e.getHttpStatus())
            .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .findFirst()
            .orElse("输入值不正确。");
        return ResponseEntity.badRequest().body(ApiResponse.fail("VALIDATION_FAILED", message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e) {
        log.error("[服务器错误]", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.fail("INTERNAL_ERROR", "发生了服务器错误。"));
    }
}
```

## 3. 常见错误(频发的类型错误)

### 3-1. `Map<String, ?>` + getOrDefault 组合 — 编译错误
```java
// ❌ 错误: Map<String, ?> 的 getOrDefault 返回类型为捕获通配符 CAP#1 → 拒绝具体类型
Map<String, ?> dataMap = getDataMap();
double value = ((Number) dataMap.getOrDefault("value", 0.0)).doubleValue();   // ERROR
String level = (String)  dataMap.getOrDefault("alarmLevel", "NORMAL");        // ERROR

// ✅ 解决 1 (推荐): 声明为 Map<String, Object>
Map<String, Object> dataMap2 = getDataMap();
double v = ((Number) dataMap2.getOrDefault("value", 0.0)).doubleValue();

// ✅ 解决 2: 不可避免时只在本地强制转换一次
@SuppressWarnings("unchecked")
Map<String, Object> safeMap = (Map<String, Object>) dataMap;

// ✅ 解决 3 (最具防御性): 用 null-safe 工具方法提取
private double getDouble(Map<String, Object> map, String key, double d) {
    Object x = map.get(key);
    return (x instanceof Number) ? ((Number) x).doubleValue() : d;
}
private String getString(Map<String, Object> map, String key, String d) {
    Object x = map.get(key);
    return (x instanceof String) ? (String) x : d;
}
```

### 3-2. MyBatis 返回 Map 时的数值类型不匹配
MyBatis 将 DB 值以 Map 返回时，有时 `INTEGER` → `Long`、`NUMERIC` → `BigDecimal`。
```java
Map<String, Object> row = assetDao.findRawData(tagId);
// ❌ ClassCastException 风险
int count = (int) row.get("count");
// ✅ 以 Number 接收后转换
int    count2 = ((Number) row.get("count")).intValue();
long   total  = ((Number) row.get("total")).longValue();
double ratio  = ((Number) row.get("ratio")).doubleValue();
```

### 3-3. 缺少 `LocalDateTime` ↔ `String` 转换
```yaml
# ❌ 未配置时会序列化为 [2024,1,15,10,30,0] 数组
# application.yml
spring:
  jackson:
    serialization:
      write-dates-as-timestamps: false   # ✅ LocalDateTime → ISO 8601 字符串
    time-zone: Asia/Seoul
```

### 3-4. `@RequestParam`/`@PathVariable` 类型转换失败
```java
// ❌ 传入 "abc" 时转换失败 → 没有处理器时表现为 500
@GetMapping("/{assetId}")
public ApiResponse<AssetResponse> getAsset(@PathVariable Long assetId) { ... }

// ✅ 在 GlobalExceptionHandler 中添加 MethodArgumentTypeMismatchException
@ExceptionHandler(MethodArgumentTypeMismatchException.class)
public ResponseEntity<ApiResponse<?>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    return ResponseEntity.badRequest()
        .body(ApiResponse.fail("INVALID_PARAM_TYPE", "错误的参数类型: " + e.getName()));
}
```

### 3-5. `NullPointerException` — 未处理 null
```java
// ❌ DB 中没有则 NPE
AssetResponse asset = assetDao.findByTagId(tagId);
return asset.getAssetName();

// ✅ null 检查后进行异常处理
AssetResponse asset2 = assetDao.findByTagId(tagId);
if (asset2 == null) throw new BusinessException("NOT_FOUND", "找不到资产。");
return asset2.getAssetName();
```

## 4. 检查清单
- [ ] 是否按 Controller → Service → DAO → Mapper 顺序分层且未跳过
- [ ] 是否遵循按功能(域)的文件夹结构与包命名
- [ ] Controller 中是否没有业务逻辑，`@Transactional` 是否放在 Service
- [ ] Mapper XML 的 namespace 是否与 DAO 完整路径一致
- [ ] 是否分离了 Request/Response DTO 并加了输入校验注解
- [ ] 是否将所有 API 用 `ApiResponse` 包装并应用了全局异常处理
- [ ] 是否对 Map/数值/日期类型转换做了防御性处理
