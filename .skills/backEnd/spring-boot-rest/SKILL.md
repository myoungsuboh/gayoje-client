---
name: Spring Boot REST API 개발 표준 (MyBatis MVC)
description: Java Spring Boot + MyBatis 기반 MVC 구현 표준 — Controller → Service → DAO → Mapper(XML) 레이어, 기능(도메인)별 디렉토리, 공통 ApiResponse 포맷, 전역 예외 처리, 자주 발생하는 타입 오류 해결책. REST API를 새로 만들거나 레이어·패키지 구조·응답 포맷·타입 캐스팅 오류를 다룰 때 읽는다. 키워드: @RestController, @GetMapping, @PostMapping, ResponseEntity, ApiResponse, Controller, Service, DAO, Mapper, MyBatis.
rules:
  - "레이어는 Controller → Service → DAO → Mapper(XML) 순서로 분리하고, 각 레이어는 바로 아래만 호출한다(건너뛰기 금지)."
  - "Controller는 요청 검증과 응답 변환만 담당하고 비즈니스 로직을 두지 않는다."
  - "Service에 트랜잭션 경계(@Transactional)와 비즈니스 규칙을 둔다."
  - "DB 접근은 MyBatis Mapper XML로 분리하고 동적 쿼리를 사용한다."
  - "응답은 공통 포맷 ApiResponse로 감싸 반환한다."
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

# 🌐 Spring Boot REST API 개발 표준 (MyBatis MVC)

> Controller → Service → DAO → Mapper(XML) 레이어와 응답 포맷을 통일한다. REST API를 새로 만들거나 패키지 구조·응답 포맷·타입 오류를 다룰 때 읽는다.

## 1. 핵심 원칙
- 레이어는 Controller → Service → DAO → Mapper(XML) 순서로 분리하고, 각 레이어는 바로 아래만 호출한다(건너뛰기 금지).
- Controller는 요청 검증과 응답 변환만 담당하고 비즈니스 로직을 두지 않는다.
- Service에 트랜잭션 경계(`@Transactional`)와 비즈니스 규칙을 둔다.
- DB 접근은 MyBatis Mapper XML로 분리하고 동적 쿼리를 사용한다.
- 응답은 공통 포맷 `ApiResponse`로 감싸 반환한다.

## 2. 규칙

### 2-1. 레이어 구조
```
Controller → Service → DAO → Mapper(XML) → DB
```
- **Controller**: HTTP 요청/응답. 비즈니스 로직을 직접 쓰지 않는다.
- **Service**: 실제 비즈니스 로직. `@Transactional`을 여기에 붙인다.
- **DAO**: DB 접근 메서드 인터페이스. MyBatis Mapper와 1:1.
- **Mapper XML**: 실제 SQL이 작성되는 XML 파일.
- **DTO**: 레이어 간 데이터 객체. Request/Response 분리.

### 2-2. 디렉토리 구조 (기능별 우선)
레이어별(controller/, service/)로 나누지 않는다. **기능(도메인)별 폴더**를 먼저 만들고 그 안에서 레이어를 세분화한다.

```
src/main/java/com/harness/
├── src/                               ← 기능 모음 루트
│   ├── asset/                         ← 기능명 (도메인)
│   │   ├── controller/
│   │   │   └── AssetController.java
│   │   ├── service/
│   │   │   ├── AssetService.java      (인터페이스)
│   │   │   └── impl/
│   │   │       └── AssetServiceImpl.java
│   │   ├── dao/
│   │   │   └── AssetDao.java          (@Mapper 인터페이스)
│   │   └── dto/
│   │       ├── request/
│   │       │   └── AssetCreateRequest.java
│   │       └── response/
│   │           └── AssetResponse.java
│   │
│   └── {기능명}/                      ← 기능 추가 시 동일 구조 반복
│       ├── controller/
│       ├── service/ └── impl/
│       ├── dao/
│       └── dto/ ├── request/ └── response/
│
├── config/                            ← 전역 설정 (Security, MyBatis 등)
│   ├── SecurityConfig.java
│   └── MyBatisConfig.java
└── HarnessApplication.java            ← 앱 진입점

src/main/resources/
├── mapper/
│   ├── AssetMapper.xml               ← 기능명과 맞춰서 네이밍
│   └── UserMapper.xml
└── application.yml
```

패키지 네이밍 규칙:
```
com.harness.src.asset.controller   → AssetController
com.harness.src.asset.service      → AssetService (인터페이스)
com.harness.src.asset.service.impl → AssetServiceImpl
com.harness.src.asset.dao          → AssetDao
com.harness.src.asset.dto.request  → AssetCreateRequest
com.harness.src.asset.dto.response → AssetResponse
com.harness.config                 → SecurityConfig, MyBatisConfig 등
```

기능 폴더 네이밍: 명사형 단수(`asset`, `user`, `sensor`, `alarm`, `report`), 복합 도메인은 하이픈 없이 붙여쓰기(`assetGroup`, `sensorLog`).

### 2-3. Controller 작성
```java
package com.harness.src.asset.controller;   // 기능별 패키지

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

### 2-4. Service 작성 (인터페이스 + impl 분리)
```java
// 인터페이스 — com.harness.src.asset.service
public interface AssetService {
    List<AssetResponse> getAssets();
    AssetResponse getAsset(String tagId);
    void createAsset(AssetCreateRequest request);
    void updateAsset(String tagId, AssetUpdateRequest request);
    void deleteAsset(String tagId);
}

// 구현체 — com.harness.src.asset.service.impl
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetServiceImpl implements AssetService {

    private final AssetDao assetDao;

    @Override
    public AssetResponse getAsset(String tagId) {
        AssetResponse asset = assetDao.findByTagId(tagId);
        if (asset == null) {
            throw new BusinessException("NOT_FOUND", "해당 자산을 찾을 수 없습니다.");
        }
        return asset;
    }

    @Override
    @Transactional  // DB 변경이 있는 메서드에만 붙임
    public void createAsset(AssetCreateRequest request) {
        log.info("[자산 등록] tagId={}", request.getTagId());
        assetDao.insert(request);
    }

    @Override
    @Transactional
    public void deleteAsset(String tagId) {
        assetDao.softDelete(tagId); // 실제 삭제 대신 deleted_at 채움 (논리 삭제)
    }
}
```

### 2-5. DAO 작성 (`@Mapper` 필수)
```java
// com.harness.src.asset.dao
@Mapper
public interface AssetDao {
    List<AssetResponse> findAll();
    AssetResponse findByTagId(String tagId);
    int insert(AssetCreateRequest request);
    int update(AssetUpdateRequest request);
    int softDelete(String tagId);  // deleted_at 채움 (논리 삭제)
}
```

### 2-6. Mapper XML 작성 (namespace = DAO 전체 경로)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<!-- namespace는 DAO 인터페이스의 전체 경로와 반드시 일치해야 함 -->
<mapper namespace="com.harness.src.asset.dao.AssetDao">

    <!-- ResultMap: DB 컬럼명(snake_case) → Java 필드명(camelCase) 매핑 -->
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

    <!-- 동적 쿼리 예시: 조건이 있을 때만 WHERE 절 추가 -->
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

### 2-7. DTO 작성 (Request/Response 분리)
```java
// 요청 DTO - 입력값 검증 어노테이션 사용
@Getter
@NoArgsConstructor
public class AssetCreateRequest {
    @NotBlank(message = "태그 ID는 필수입니다.")
    @Size(max = 50, message = "태그 ID는 50자 이하여야 합니다.")
    private String tagId;

    @NotBlank(message = "자산명은 필수입니다.")
    private String assetName;

    private String deckId;
}

// 응답 DTO - DB 조회 결과를 담는 객체
@Getter
@Setter  // MyBatis가 값을 주입할 수 있도록 Setter 또는 @Alias 필요
@NoArgsConstructor
public class AssetResponse {
    private Long assetId;
    private String tagId;
    private String assetName;
    private String deckId;
    private LocalDateTime createdAt;
}
```

### 2-8. 공통 응답 포맷
모든 API는 공통 봉투 `ApiResponse<T>`로 감싼다. **정의(필드 순서·팩토리명·표준 에러코드)의 단일 출처는 `docs-glossary`다** — 아래는 그 정의를 그대로 따른다.

```java
// 정의·필드 순서·팩토리는 docs-glossary가 단일 출처 (success, data, message, errorCode)
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode   // 성공 시 null
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

### 2-9. 전역 예외 처리
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusinessException(BusinessException e) {
        log.warn("[비즈니스 예외] message={}, code={}", e.getMessage(), e.getErrorCode());
        return ResponseEntity.status(e.getHttpStatus())
            .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .findFirst()
            .orElse("입력값이 올바르지 않습니다.");
        return ResponseEntity.badRequest().body(ApiResponse.fail("VALIDATION_FAILED", message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e) {
        log.error("[서버 오류]", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.fail("INTERNAL_ERROR", "서버 오류가 발생했습니다."));
    }
}
```

## 3. 흔한 실수 (자주 발생하는 타입 오류)

### 3-1. `Map<String, ?>` + getOrDefault 조합 — 컴파일 에러
```java
// ❌ 에러: Map<String, ?>의 getOrDefault 반환 타입이 캡처 와일드카드 CAP#1 → 구체 타입 거부
Map<String, ?> dataMap = getDataMap();
double value = ((Number) dataMap.getOrDefault("value", 0.0)).doubleValue();   // ERROR
String level = (String)  dataMap.getOrDefault("alarmLevel", "NORMAL");        // ERROR

// ✅ 해결 1 (권장): Map<String, Object>로 선언
Map<String, Object> dataMap2 = getDataMap();
double v = ((Number) dataMap2.getOrDefault("value", 0.0)).doubleValue();

// ✅ 해결 2: 불가피하면 한 번만 로컬 캐스팅
@SuppressWarnings("unchecked")
Map<String, Object> safeMap = (Map<String, Object>) dataMap;

// ✅ 해결 3 (가장 방어적): null-safe 유틸 메서드로 추출
private double getDouble(Map<String, Object> map, String key, double d) {
    Object x = map.get(key);
    return (x instanceof Number) ? ((Number) x).doubleValue() : d;
}
private String getString(Map<String, Object> map, String key, String d) {
    Object x = map.get(key);
    return (x instanceof String) ? (String) x : d;
}
```

### 3-2. MyBatis Map 반환 시 숫자 타입 불일치
MyBatis가 DB 값을 Map으로 반환할 때 `INTEGER` → `Long`, `NUMERIC` → `BigDecimal`로 오는 경우가 있다.
```java
Map<String, Object> row = assetDao.findRawData(tagId);
// ❌ ClassCastException 위험
int count = (int) row.get("count");
// ✅ Number로 받아서 변환
int    count2 = ((Number) row.get("count")).intValue();
long   total  = ((Number) row.get("total")).longValue();
double ratio  = ((Number) row.get("ratio")).doubleValue();
```

### 3-3. `LocalDateTime` ↔ `String` 변환 누락
```yaml
# ❌ 미설정 시 [2024,1,15,10,30,0] 배열로 직렬화됨
# application.yml
spring:
  jackson:
    serialization:
      write-dates-as-timestamps: false   # ✅ LocalDateTime → ISO 8601 문자열
    time-zone: Asia/Seoul
```

### 3-4. `@RequestParam`/`@PathVariable` 타입 변환 실패
```java
// ❌ "abc"가 들어오면 변환 실패 → 핸들러 없으면 500으로 보임
@GetMapping("/{assetId}")
public ApiResponse<AssetResponse> getAsset(@PathVariable Long assetId) { ... }

// ✅ GlobalExceptionHandler에 MethodArgumentTypeMismatchException 추가
@ExceptionHandler(MethodArgumentTypeMismatchException.class)
public ResponseEntity<ApiResponse<?>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    return ResponseEntity.badRequest()
        .body(ApiResponse.fail("INVALID_PARAM_TYPE", "잘못된 파라미터 타입: " + e.getName()));
}
```

### 3-5. `NullPointerException` — null 미처리
```java
// ❌ DB에 없으면 NPE
AssetResponse asset = assetDao.findByTagId(tagId);
return asset.getAssetName();

// ✅ null 체크 후 예외 처리
AssetResponse asset2 = assetDao.findByTagId(tagId);
if (asset2 == null) throw new BusinessException("NOT_FOUND", "자산을 찾을 수 없습니다.");
return asset2.getAssetName();
```

## 4. 체크리스트
- [ ] 레이어를 Controller → Service → DAO → Mapper 순으로 분리하고 건너뛰지 않았는가
- [ ] 기능(도메인)별 폴더 구조와 패키지 네이밍을 따랐는가
- [ ] Controller에 비즈니스 로직 없이, `@Transactional`은 Service에 두었는가
- [ ] Mapper XML namespace가 DAO 전체 경로와 일치하는가
- [ ] Request/Response DTO를 분리하고 입력 검증 어노테이션을 붙였는가
- [ ] 모든 API를 `ApiResponse`로 감싸고 전역 예외 처리를 적용했는가
- [ ] Map/숫자/날짜 타입 캐스팅을 방어적으로 처리했는가
