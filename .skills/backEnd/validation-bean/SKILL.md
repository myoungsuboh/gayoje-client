---
name: 입력값 검증 표준 (Input Validation)
description: 서버측 입력값 검증의 범용 표준으로, 입력 신뢰 금지·진입점 일괄 검증·선언적 스키마·계층별(진입점·도메인) 방어·일관된 오류 응답을 다룬다(스택 무관). 요청/입력 검증을 추가·정비하거나 검증 오류 응답 포맷을 통일할 때, Create/Update 등 상황별 제약을 나눌 때 읽는다. 키워드: validation, server-side, schema, error response, fail-fast, 검증 그룹, 커스텀 검증.
rules:
  - "입력은 신뢰하지 않는다: 클라이언트·외부 시스템에서 온 모든 값은 잠재적으로 잘못됐거나 악의적이라고 가정한다. 클라이언트측 검증은 UX 보조일 뿐, 보안·정합성의 근거가 아니다."
  - "검증은 서버측에서: 실제 강제는 반드시 서버(신뢰 경계 안쪽)에서 한다. 검증의 책임을 클라이언트에 떠넘기지 않는다."
  - "진입점에서 빠르게 실패(fail-fast): 입력은 시스템에 들어오는 진입점에서 즉시 검증해, 잘못된 값이 도메인 로직 깊숙이 흘러들지 않게 한다."
  - "선언적 스키마로 표현: 제약(필수·길이·범위·형식)을 코드 흐름에 흩뿌리지 말고, 입력 모델에 선언적으로 붙여 한곳에서 읽히게 한다."
  - "계층별 방어: 진입점 검증을 기본으로 하되, 입력이 진입점을 거치지 않을 수 있는 경로(내부 호출·배치·스케줄러)를 위해 도메인 불변식은 도메인 계층에서도 한 번 더 지킨다."
  - "일관된 오류 응답: 검증 실패는 '클라이언트 잘못'임을 분명히 하는 형식(예: 4xx 계열 + 어떤 필드가 왜 틀렸는지)으로, 모든 진입점에서 동일한 포맷으로 돌려준다. 내부 구현 정보는 노출하지 않는다."
  - "다국어·메시지 분리: 오류 메시지는 하드코딩하지 말고 메시지 카탈로그로 분리해 다국어와 문구 변경에 대응한다."
tags:
  - "validation"
  - "server-side"
  - "schema"
  - "error response"
  - "fail-fast"
  - "검증 그룹"
  - "커스텀 검증"
  - "@Valid"
  - "@Validated"
  - "@NotNull"
  - "@NotBlank"
  - "@Size"
  - "@Pattern"
  - "@Email"
  - "@Min"
  - "@Max"
  - "ConstraintValidator"
  - "BindingResult"
---

# ✅ 입력값 검증 표준 (Input Validation)

> 외부에서 들어오는 모든 입력을 신뢰하지 않고, 진입점에서 선언적으로 일괄 검증하며, 실패를 일관된 오류 응답으로 돌려준다. 요청/입력 검증을 추가·정비하거나 검증 실패 응답을 표준화할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.
>
> 이 스킬은 **검증의 일반 설계**(구조·제약·오류 응답)이다. 화이트리스트·Injection/XSS/Path Traversal 같은 공격 방어와 새니타이징은 `input-validation`(입력 검증 & 데이터 새니타이징)을 함께 본다.

## 1. 핵심 원칙
- **입력은 신뢰하지 않는다**: 클라이언트·외부 시스템에서 온 모든 값은 잠재적으로 잘못됐거나 악의적이라고 가정한다. 클라이언트측 검증은 UX 보조일 뿐, 보안·정합성의 근거가 아니다.
- **검증은 서버측에서**: 실제 강제는 반드시 서버(신뢰 경계 안쪽)에서 한다. 검증의 책임을 클라이언트에 떠넘기지 않는다.
- **진입점에서 빠르게 실패(fail-fast)**: 입력은 시스템에 들어오는 진입점에서 즉시 검증해, 잘못된 값이 도메인 로직 깊숙이 흘러들지 않게 한다.
- **선언적 스키마로 표현**: 제약(필수·길이·범위·형식)을 코드 흐름에 흩뿌리지 말고, 입력 모델에 선언적으로 붙여 한곳에서 읽히게 한다.
- **계층별 방어**: 진입점 검증을 기본으로 하되, 입력이 진입점을 거치지 않을 수 있는 경로(내부 호출·배치·스케줄러)를 위해 도메인 불변식은 도메인 계층에서도 한 번 더 지킨다.
- **일관된 오류 응답**: 검증 실패는 "클라이언트 잘못"임을 분명히 하는 형식(예: 4xx 계열 + 어떤 필드가 왜 틀렸는지)으로, 모든 진입점에서 동일한 포맷으로 돌려준다. 내부 구현 정보는 노출하지 않는다.
- **다국어·메시지 분리**: 오류 메시지는 하드코딩하지 말고 메시지 카탈로그로 분리해 다국어와 문구 변경에 대응한다.

## 2. 규칙

### 2-1. 클라이언트 입력을 신뢰하지 않는다
- 화면/클라이언트에서 이미 막았다는 이유로 서버 검증을 생략하지 않는다.
- 검증의 "강제"는 서버에서, 클라이언트 검증은 사용자 경험을 빠르게 돕는 용도로만.

```text
// ❌ 금지 — 클라이언트가 막았으니 서버는 그대로 신뢰
saveOrder(input)          // 검증 없이 바로 저장

// ✅ 권장 — 서버 진입점에서 먼저 검증, 통과한 값만 처리
validate(input) → saveOrder(input)
```

### 2-2. 진입점에서 선언적으로 일괄 검증
- 제약을 입력 모델(요청 객체/스키마)에 선언적으로 정의하고, 진입점에서 한 번에 검증한다.
- 진입점 핸들러 본문에 `if (x == null) throw ...` 식의 즉석 검증을 흩뿌리지 않는다 — 어떤 제약이 걸려 있는지 한곳에서 보이게 한다.

```text
// ❌ 금지 — 핸들러마다 즉석 if-검증이 흩어짐
handler(input):
  if input.name is empty: error
  if input.qty < 1:       error
  ...

// ✅ 권장 — 입력 모델에 제약을 선언, 진입점이 일괄 검증
schema OrderInput:
  name: required, length 2..100
  qty:  required, min 1
handler(validated OrderInput): ...
```

### 2-3. 상황별 제약은 그룹/스키마로 분리 (예: Create vs Update)
- 같은 입력 모델을 생성/수정 등 다른 상황에서 재사용하면서 제약이 달라지면(예: ID는 수정에서만 필수, 이름은 생성에서만 필수), 상황별로 검증 규칙 묶음을 분리한다.
- 한 모델에 모순되는 제약을 무조건 붙이지 말고, 호출 맥락에 맞는 규칙 집합을 적용한다.

```text
// 같은 모델, 다른 상황 → 다른 제약 묶음
OnCreate: id 비어있어야, name 필수
OnUpdate: id 필수,        name 선택
```

### 2-4. 표준 제약 vs 커스텀 검증
- 필수·길이·범위·형식 같은 보편 제약은 표준(선언적) 방식으로 처리한다.
- 표준으로 표현 못 하는 도메인 규칙(예: 특정 형식의 코드, 값들 간 상호 제약)은 **재사용 가능한 커스텀 검증 단위**로 분리한다 — 도메인 로직 안에 검증을 묻어두지 않는다.

```text
// ✅ 권장 — 도메인 규칙을 재사용 가능한 검증으로 분리
@ValidAssetCode  // "ASSET-YYYY-NNNN" 형식 검증을 한 곳에 정의해 재사용
field code
```

### 2-5. 검증 실패는 일관된 오류 응답으로 (전역 처리)
- 검증 실패는 "클라이언트 입력 오류"임을 분명히 하는 응답(예: 4xx + 필드별 사유 목록)으로 변환한다.
- 진입점마다 제각각 응답하지 말고, 전역/공통 지점에서 동일한 포맷으로 변환한다.
- 검증 실패를 서버 오류(5xx)로 흘리거나, 내부 예외·스택트레이스·구현 정보를 응답에 노출하지 않는다.

```text
// ❌ 금지 — 검증 실패가 5xx로 새거나 내부 정보 노출
500 { "error": "NullPointerException at Dao.line 42" }

// ✅ 권장 — 4xx + 어떤 필드가 왜 틀렸는지, 통일된 형식
400 {
  "errorCode": "VALIDATION_FAILED",
  "errors": [ { "field": "qty", "message": "1 이상이어야 합니다" } ]
}
```

### 2-6. 도메인 계층의 방어적 검증
- 진입점 검증을 통과하지 않을 수 있는 경로(내부 서비스 호출·배치·스케줄러·메시지 컨슈머)를 가정한다.
- 핵심 비즈니스 불변식은 진입점에만 의존하지 말고 도메인 계층에서도 한 번 더 지킨다.

```text
// 진입점만 믿으면, 배치/내부호출 경로에서 잘못된 값이 그대로 통과
domainOp(input):
  assert input.qty >= 1     // 진입점을 안 거쳐도 불변식 보장
  ...
```

### 2-7. 오류 메시지 다국어 (i18n)
- 메시지를 코드에 하드코딩하지 말고 메시지 카탈로그(키 → 문구)로 분리한다.
- 언어별 카탈로그를 두어 다국어를 지원하고, 문구 변경이 코드 수정으로 번지지 않게 한다.

```text
messages.ko:  order.qty.min = 수량은 {min} 이상이어야 합니다.
messages.en:  order.qty.min = Quantity must be at least {min}.
schema: qty → min 1, message = "{order.qty.min}"
```

## 3. 흔한 실수
- **클라이언트 검증만 믿음** → 서버 검증 생략으로 잘못된/악의적 입력이 그대로 통과한다.
- **진입점 핸들러에 if-검증을 흩뿌림** → 어떤 제약이 걸려 있는지 한눈에 안 보이고 누락이 잦다. 선언적 스키마로 옮긴다.
- **중첩/컬렉션 내부 검증 누락** → 바깥 객체만 검증하고 안쪽 요소는 검증이 안 돈다. 중첩 구조까지 검증 대상에 포함한다.
- **상황별 제약을 안 나눔** → Create/Update에 같은 모델을 쓰면서 모순된 제약을 한꺼번에 붙여 한쪽이 늘 깨진다.
- **검증 실패를 5xx로 응답** → 클라이언트가 "내 입력이 잘못됐다"는 걸 알 수 없다. 4xx + 사유로.
- **오류에 내부 정보 노출** → 예외 메시지·스택트레이스·구현 세부를 그대로 응답하지 않는다.
- **도메인 검증 완전 생략** → "진입점이 유일한 입구"라 믿었다가 배치/내부 호출 경로에서 깨진다.
- **메시지 하드코딩** → 다국어·문구 변경이 코드 수정으로 번진다. 메시지 카탈로그로 분리한다.

## 4. 체크리스트
- [ ] 외부 입력을 신뢰하지 않고 **서버측**에서 검증하는가 (클라이언트 검증은 보조)
- [ ] 제약을 입력 모델에 **선언적으로** 정의하고 진입점에서 일괄 검증하는가
- [ ] 중첩 객체/컬렉션 요소까지 검증 대상에 포함했는가
- [ ] Create/Update 등 상황별 제약이 다르면 그룹/스키마로 분리했는가
- [ ] 표준으로 표현 못 하는 도메인 규칙을 재사용 가능한 커스텀 검증으로 분리했는가
- [ ] 검증 실패를 전역/공통 지점에서 **일관된 4xx 응답**(필드별 사유)으로 변환하는가
- [ ] 응답에 내부 예외·스택트레이스·구현 정보를 노출하지 않는가
- [ ] 비즈니스 불변식을 도메인 계층에서도 방어적으로 지키는가 (배치·내부 호출 대비)
- [ ] 오류 메시지를 메시지 카탈로그(i18n)로 관리하는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: TypeScript/Zod, Node/class-validator, Python/Pydantic 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Spring Boot (Java, JSR-380)

`@Valid`/`@Validated` 기반으로 Controller 진입점에서 일괄 검증하고, `@RestControllerAdvice` 전역 핸들러로 오류 응답을 통일한다.

#### 의존성

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-validation'
}
```

> Spring Boot 2.3 이후부터는 `spring-boot-starter-web`에 Validation이 자동 포함되지 않는다. 명시적으로 `spring-boot-starter-validation`을 추가해야 한다.

#### 기본 어노테이션

```java
package com.harness.src.asset.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

@Getter
@NoArgsConstructor
public class AssetCreateRequest {

    @NotBlank(message = "{asset.tagId.notBlank}")        // i18n 키
    @Size(max = 50, message = "태그 ID는 50자 이하여야 합니다.")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "태그 ID는 영문 대문자/숫자/하이픈만 허용됩니다.")
    private String tagId;

    @NotBlank
    @Size(min = 2, max = 100)
    private String assetName;

    @NotNull
    @Min(value = 0,   message = "용량은 0 이상이어야 합니다.")
    @Max(value = 9999)
    private Integer capacity;

    @Email(message = "올바른 이메일 형식이 아닙니다.")
    private String contactEmail;

    @Past(message = "설치일은 과거여야 합니다.")
    private LocalDate installedAt;

    // 중첩 객체도 검증하려면 @Valid 필수
    @NotNull
    @Valid
    private AssetLocation location;

    // 컬렉션 안 객체 검증
    @Size(min = 1, max = 10)
    private List<@Valid SensorRef> sensors;
}
```

> `@NotNull`(null만 막음) / `@NotEmpty`(빈 컬렉션/문자열 막음) / `@NotBlank`(공백 문자열 막음). 셋 다 다르다.

#### @Valid vs @Validated

| 어노테이션 | 위치 | 그룹 지원 | 용도 |
|----------|------|---------|------|
| `@Valid` (JSR-380) | 파라미터/필드 | X | `@RequestBody` 검증, 중첩 검증 |
| `@Validated` (Spring) | **클래스 레벨** + 파라미터 | O | `@PathVariable`/`@RequestParam`, 그룹 검증 |

```java
@RestController
@RequestMapping("/api/v1/assets")
@Validated   // ← @PathVariable / @RequestParam 검증을 위해 클래스 레벨에 필요
@RequiredArgsConstructor
public class AssetController {

    // RequestBody: @Valid
    @PostMapping
    public ApiResponse<Void> create(@RequestBody @Valid AssetCreateRequest request) {
        assetService.createAsset(request);
        return ApiResponse.ok(null);
    }

    // PathVariable: @Validated 클래스 + 파라미터에 직접 어노테이션
    @GetMapping("/{tagId}")
    public ApiResponse<AssetResponse> get(
        @PathVariable @NotBlank @Size(max = 50) String tagId
    ) {
        return ApiResponse.ok(assetService.getAsset(tagId));
    }

    // RequestParam
    @GetMapping
    public ApiResponse<List<AssetResponse>> list(
        @RequestParam(defaultValue = "1") @Min(1) int page,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return ApiResponse.ok(assetService.list(page, size));
    }
}
```

#### 그룹 검증 (Create vs Update) — 규칙 2-3 적용

```java
public interface ValidationGroups {
    interface OnCreate {}
    interface OnUpdate {}
}

@Getter
public class AssetRequest {

    @Null  (groups = ValidationGroups.OnCreate.class)
    @NotNull(groups = ValidationGroups.OnUpdate.class)
    private Long assetId;

    @NotBlank(groups = {ValidationGroups.OnCreate.class, ValidationGroups.OnUpdate.class})
    private String tagId;

    @NotBlank(groups = ValidationGroups.OnCreate.class)
    private String assetName;
}

// Controller — @Validated에 그룹 명시
@PostMapping
public ApiResponse<Void> create(
    @RequestBody @Validated(ValidationGroups.OnCreate.class) AssetRequest request
) { ... }

@PutMapping("/{id}")
public ApiResponse<Void> update(
    @PathVariable Long id,
    @RequestBody @Validated(ValidationGroups.OnUpdate.class) AssetRequest request
) { ... }
```

#### 커스텀 Validator — 규칙 2-4 적용

```java
package com.harness.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AssetTagIdValidator.class)
public @interface ValidAssetTagId {
    String message() default "올바른 자산 태그 ID 형식이 아닙니다. (예: ASSET-2026-0001)";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

```java
package com.harness.common.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.regex.Pattern;

public class AssetTagIdValidator implements ConstraintValidator<ValidAssetTagId, String> {

    private static final Pattern FORMAT = Pattern.compile("^ASSET-\\d{4}-\\d{4}$");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) return true;   // null은 @NotBlank가 처리
        return FORMAT.matcher(value).matches();
    }
}

// 사용
public class AssetCreateRequest {
    @NotBlank
    @ValidAssetTagId
    private String tagId;
}
```

#### 전역 예외 핸들러 (검증 오류 응답 표준화) — 규칙 2-5 적용

```java
package com.harness.common.exception;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.stream.Collectors;

@RestControllerAdvice
@Slf4j
public class ValidationExceptionHandler {

    // @RequestBody @Valid 실패
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<List<FieldErrorDto>>> handleBodyValidation(MethodArgumentNotValidException e) {
        List<FieldErrorDto> errors = e.getBindingResult().getFieldErrors().stream()
            .map(FieldErrorDto::from)
            .collect(Collectors.toList());

        log.warn("입력값 검증 실패 errors={}", errors);
        return ResponseEntity.badRequest()
            .body(ApiResponse.fail("VALIDATION_FAILED", "입력값이 올바르지 않습니다.", errors));
    }

    // @PathVariable / @RequestParam (@Validated) 실패
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<?>> handleParamValidation(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .collect(Collectors.joining(", "));
        return ResponseEntity.badRequest()
            .body(ApiResponse.fail("VALIDATION_FAILED", msg));
    }
}
```

```java
@Getter
@AllArgsConstructor
public class FieldErrorDto {
    private String field;
    private Object rejectedValue;
    private String message;

    public static FieldErrorDto from(FieldError e) {
        return new FieldErrorDto(e.getField(), e.getRejectedValue(), e.getDefaultMessage());
    }
}
```

#### 메시지 i18n — 규칙 2-7 적용

`src/main/resources/ValidationMessages.properties`:
```properties
asset.tagId.notBlank=태그 ID는 필수입니다.
asset.tagId.size=태그 ID는 {min}~{max}자 사이여야 합니다.
```

`ValidationMessages_en.properties`:
```properties
asset.tagId.notBlank=Tag ID is required.
asset.tagId.size=Tag ID must be between {min} and {max} characters.
```

```java
@Getter
public class AssetCreateRequest {
    @NotBlank(message = "{asset.tagId.notBlank}")
    @Size(min = 2, max = 50, message = "{asset.tagId.size}")
    private String tagId;
}
```

`application.yml`:
```yaml
spring:
  messages:
    basename: messages,ValidationMessages
    encoding: UTF-8
```

#### 서비스 레이어 검증 (방어적) — 규칙 2-6 적용

```java
@Service
@Validated   // 서비스 메서드 파라미터 검증 활성화
public class AssetServiceImpl implements AssetService {

    @Override
    public AssetResponse getAsset(@NotBlank String tagId) {
        // tagId가 빈값이면 ConstraintViolationException 발생
        // ...
    }
}
```

#### Spring 특유의 흔한 실수
- **`@Valid` 빠뜨림**: `@RequestBody AssetCreateRequest req`만 쓰면 검증이 안 돌아간다. **항상 `@Valid` 같이**.
- **중첩 객체 `@Valid` 누락**: 부모만 `@Valid` 붙이고 안쪽 필드에 `@Valid` 안 붙이면 내부 객체는 검증 안 됨.
- **`@PathVariable` 검증인데 클래스에 `@Validated` 없음**: 어노테이션이 무시되고 통과한다.
- **`@Min(0)`을 `int`가 아닌 `String`에 적용**: 컴파일은 되지만 런타임에 동작 안 함. 타입 매칭 확인.
- `@Valid` 는 어노테이션에 그룹을 선언할 수 있지만 **런타임 그룹 필터링은 불가**합니다 — 그룹별 검증이 필요하면 `@Validated(GroupName.class)` 를 쓰세요. (`@Valid` 적용 예는 위 Controller 예시 참고)
