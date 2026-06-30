---
name: Input Validation Standard (Input Validation)
description: A general standard for server-side input validation — covers never trusting input, batch validation at the entry point, declarative schemas, layered (entry-point·domain) defense, and consistent error responses (stack-agnostic). Read this when adding/refining request/input validation, unifying the validation-error response format, or splitting situational constraints such as Create/Update. Keywords: validation, server-side, schema, error response, fail-fast, validation groups, custom validation.
rules:
  - "Do not trust input: assume every value coming from clients or external systems is potentially wrong or malicious. Client-side validation is only a UX aid, not the basis for security or integrity."
  - "Validate on the server side: real enforcement must happen on the server (inside the trust boundary). Do not offload the responsibility of validation to the client."
  - "Fail fast at the entry point: validate input immediately at the entry point where it enters the system, so wrong values do not flow deep into the domain logic."
  - "Express with declarative schemas: do not scatter constraints (required·length·range·format) throughout the code flow; attach them declaratively to the input model so they are read in one place."
  - "Layered defense: make entry-point validation the baseline, but for paths where input may not pass through the entry point (internal calls·batch·scheduler), guard domain invariants once more at the domain layer too."
  - "Consistent error responses: return validation failures in a format that clearly indicates 'the client's fault' (e.g., 4xx family + which field is wrong and why), in the same format at every entry point. Do not expose internal implementation information."
  - "i18n·message separation: do not hardcode error messages; separate them into a message catalog to handle multiple languages and wording changes."
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

# ✅ Input Validation Standard (Input Validation)

> Never trust any input coming from outside; validate it declaratively in batch at the entry point and return failures as a consistent error response. Read this when adding/refining request/input validation or standardizing validation-failure responses. This is a general standard not tied to a specific language/framework.
>
> This skill is about **the general design of validation** (structure·constraints·error responses). For attack defense and sanitizing such as whitelisting·Injection/XSS/Path Traversal, also see `input-validation` (input validation & data sanitizing).

## 1. Core Principles
- **Do not trust input**: assume every value coming from clients or external systems is potentially wrong or malicious. Client-side validation is only a UX aid, not the basis for security or integrity.
- **Validate on the server side**: real enforcement must happen on the server (inside the trust boundary). Do not offload the responsibility of validation to the client.
- **Fail fast at the entry point**: validate input immediately at the entry point where it enters the system, so wrong values do not flow deep into the domain logic.
- **Express with declarative schemas**: do not scatter constraints (required·length·range·format) throughout the code flow; attach them declaratively to the input model so they are read in one place.
- **Layered defense**: make entry-point validation the baseline, but for paths where input may not pass through the entry point (internal calls·batch·scheduler), guard domain invariants once more at the domain layer too.
- **Consistent error responses**: return validation failures in a format that clearly indicates "the client's fault" (e.g., 4xx family + which field is wrong and why), in the same format at every entry point. Do not expose internal implementation information.
- **i18n·message separation**: do not hardcode error messages; separate them into a message catalog to handle multiple languages and wording changes.

## 2. Rules

### 2-1. Do not trust client input
- Do not skip server validation just because the screen/client already blocked it.
- "Enforcement" of validation is on the server; client validation is only for quickly helping the user experience.

```text
// ❌ Forbidden — the client blocked it so the server trusts it as is
saveOrder(input)          // save directly without validation

// ✅ Recommended — validate first at the server entry point, process only passing values
validate(input) → saveOrder(input)
```

### 2-2. Validate declaratively in batch at the entry point
- Define constraints declaratively on the input model (request object/schema) and validate them all at once at the entry point.
- Do not scatter ad-hoc validation like `if (x == null) throw ...` in the entry-point handler body — make it visible in one place which constraints apply.

```text
// ❌ Forbidden — ad-hoc if-validation scattered per handler
handler(input):
  if input.name is empty: error
  if input.qty < 1:       error
  ...

// ✅ Recommended — declare constraints on the input model, the entry point validates in batch
schema OrderInput:
  name: required, length 2..100
  qty:  required, min 1
handler(validated OrderInput): ...
```

### 2-3. Separate situational constraints with groups/schemas (e.g., Create vs Update)
- When reusing the same input model in different situations such as create/update and the constraints differ (e.g., ID is required only on update, name only on create), separate the validation rule sets per situation.
- Do not unconditionally attach contradictory constraints to one model; apply the rule set that fits the calling context.

```text
// same model, different situations → different constraint sets
OnCreate: id must be empty, name required
OnUpdate: id required,      name optional
```

### 2-4. Standard constraints vs custom validation
- Handle universal constraints such as required·length·range·format with the standard (declarative) approach.
- For domain rules that the standard cannot express (e.g., a code of a specific format, mutual constraints between values), separate them into **reusable custom validation units** — do not bury validation inside the domain logic.

```text
// ✅ Recommended — separate a domain rule into reusable validation
@ValidAssetCode  // define the "ASSET-YYYY-NNNN" format validation in one place and reuse it
field code
```

### 2-5. Convert validation failures into consistent error responses (global handling)
- Convert validation failures into a response that clearly indicates "client input error" (e.g., 4xx + a per-field reason list).
- Do not respond differently per entry point; convert into the same format at a global/common point.
- Do not let validation failures leak as server errors (5xx) or expose internal exceptions·stack traces·implementation information in the response.

```text
// ❌ Forbidden — validation failure leaks as 5xx or exposes internal info
500 { "error": "NullPointerException at Dao.line 42" }

// ✅ Recommended — 4xx + which field is wrong and why, a unified format
400 {
  "errorCode": "VALIDATION_FAILED",
  "errors": [ { "field": "qty", "message": "must be at least 1" } ]
}
```

### 2-6. Defensive validation at the domain layer
- Assume paths that may not pass through entry-point validation (internal service calls·batch·scheduler·message consumer).
- Do not rely on the entry point alone for core business invariants; guard them once more at the domain layer too.

```text
// trusting only the entry point lets wrong values pass through on the batch/internal-call path
domainOp(input):
  assert input.qty >= 1     // guarantee the invariant even without going through the entry point
  ...
```

### 2-7. Error message i18n (i18n)
- Do not hardcode messages in the code; separate them into a message catalog (key → wording).
- Provide per-language catalogs to support multiple languages, and keep wording changes from spilling into code modifications.

```text
messages.ko:  order.qty.min = 수량은 {min} 이상이어야 합니다.
messages.en:  order.qty.min = Quantity must be at least {min}.
schema: qty → min 1, message = "{order.qty.min}"
```

## 3. Common Mistakes
- **Trusting only client validation** → skipping server validation lets wrong/malicious input pass through as is.
- **Scattering if-validation in the entry-point handler** → it is not obvious at a glance which constraints apply, and omissions are frequent. Move them to a declarative schema.
- **Omitting validation inside nested/collection elements** → only the outer object is validated and the inner elements are not. Include the nested structure in the validation scope.
- **Not separating situational constraints** → using the same model for Create/Update and attaching contradictory constraints all at once breaks one side every time.
- **Responding to validation failure with 5xx** → the client cannot tell that "my input is wrong". Use 4xx + reason.
- **Exposing internal info in errors** → do not respond with exception messages·stack traces·implementation details as is.
- **Omitting domain validation entirely** → believing "the entry point is the only entrance" breaks on the batch/internal-call path.
- **Hardcoding messages** → multi-language·wording changes spill into code modifications. Separate them into a message catalog.

## 4. Checklist
- [ ] Do you validate on the **server side** without trusting external input (client validation is auxiliary)?
- [ ] Do you define constraints **declaratively** on the input model and validate them in batch at the entry point?
- [ ] Did you include nested objects/collection elements in the validation scope?
- [ ] If constraints differ per situation such as Create/Update, did you separate them with groups/schemas?
- [ ] Did you separate domain rules that the standard cannot express into reusable custom validation?
- [ ] Do you convert validation failures into a **consistent 4xx response** (per-field reasons) at a global/common point?
- [ ] Do you avoid exposing internal exceptions·stack traces·implementation information in the response?
- [ ] Do you also guard business invariants defensively at the domain layer (in preparation for batch·internal calls)?
- [ ] Do you manage error messages with a message catalog (i18n)?

## Appendix: Per-stack examples

> The following is a reference implementation example. Add an example that fits the stack your team uses (e.g., TypeScript/Zod, Node/class-validator, Python/Pydantic) following the same pattern. The principles·rules of 1–4 above are the standard, and the appendix is merely a case of applying them.

### Spring Boot (Java, JSR-380)

Validate in batch at the Controller entry point based on `@Valid`/`@Validated`, and unify error responses with a `@RestControllerAdvice` global handler.

#### Dependencies

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-validation'
}
```

> Since Spring Boot 2.3, Validation is no longer automatically included in `spring-boot-starter-web`. You must explicitly add `spring-boot-starter-validation`.

#### Basic annotations

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

    @NotBlank(message = "{asset.tagId.notBlank}")        // i18n key
    @Size(max = 50, message = "Tag ID must be 50 characters or fewer.")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "Tag ID allows only uppercase letters/digits/hyphens.")
    private String tagId;

    @NotBlank
    @Size(min = 2, max = 100)
    private String assetName;

    @NotNull
    @Min(value = 0,   message = "Capacity must be 0 or greater.")
    @Max(value = 9999)
    private Integer capacity;

    @Email(message = "Not a valid email format.")
    private String contactEmail;

    @Past(message = "The installation date must be in the past.")
    private LocalDate installedAt;

    // @Valid is required to also validate nested objects
    @NotNull
    @Valid
    private AssetLocation location;

    // validate objects inside a collection
    @Size(min = 1, max = 10)
    private List<@Valid SensorRef> sensors;
}
```

> `@NotNull` (blocks only null) / `@NotEmpty` (blocks empty collections/strings) / `@NotBlank` (blocks blank strings). All three are different.

#### @Valid vs @Validated

| Annotation | Location | Group support | Use |
|----------|------|---------|------|
| `@Valid` (JSR-380) | parameter/field | X | `@RequestBody` validation, nested validation |
| `@Validated` (Spring) | **class level** + parameter | O | `@PathVariable`/`@RequestParam`, group validation |

```java
@RestController
@RequestMapping("/api/v1/assets")
@Validated   // ← needed at the class level to validate @PathVariable / @RequestParam
@RequiredArgsConstructor
public class AssetController {

    // RequestBody: @Valid
    @PostMapping
    public ApiResponse<Void> create(@RequestBody @Valid AssetCreateRequest request) {
        assetService.createAsset(request);
        return ApiResponse.ok(null);
    }

    // PathVariable: @Validated class + annotate the parameter directly
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

#### Group validation (Create vs Update) — applying rule 2-3

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

// Controller — specify the group in @Validated
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

#### Custom Validator — applying rule 2-4

```java
package com.harness.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AssetTagIdValidator.class)
public @interface ValidAssetTagId {
    String message() default "Not a valid asset tag ID format. (e.g., ASSET-2026-0001)";
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
        if (value == null || value.isBlank()) return true;   // null is handled by @NotBlank
        return FORMAT.matcher(value).matches();
    }
}

// usage
public class AssetCreateRequest {
    @NotBlank
    @ValidAssetTagId
    private String tagId;
}
```

#### Global exception handler (standardizing validation error responses) — applying rule 2-5

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

    // @RequestBody @Valid failure
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<List<FieldErrorDto>>> handleBodyValidation(MethodArgumentNotValidException e) {
        List<FieldErrorDto> errors = e.getBindingResult().getFieldErrors().stream()
            .map(FieldErrorDto::from)
            .collect(Collectors.toList());

        log.warn("Input validation failed errors={}", errors);
        return ResponseEntity.badRequest()
            .body(ApiResponse.fail("VALIDATION_FAILED", "The input is not valid.", errors));
    }

    // @PathVariable / @RequestParam (@Validated) failure
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

#### Message i18n — applying rule 2-7

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

#### Service layer validation (defensive) — applying rule 2-6

```java
@Service
@Validated   // enable validation of service method parameters
public class AssetServiceImpl implements AssetService {

    @Override
    public AssetResponse getAsset(@NotBlank String tagId) {
        // if tagId is empty, a ConstraintViolationException is thrown
        // ...
    }
}
```

#### Spring-specific common mistakes
- **Forgetting `@Valid`**: writing only `@RequestBody AssetCreateRequest req` means validation does not run. **Always include `@Valid`**.
- **Missing `@Valid` on a nested object**: if you put `@Valid` only on the parent and not on the inner field, the inner object is not validated.
- **`@PathVariable` validation without `@Validated` on the class**: the annotation is ignored and passes through.
- **Applying `@Min(0)` to a `String` instead of an `int`**: it compiles but does not work at runtime. Check type matching.
- `@Valid` can declare groups on the annotation but **runtime group filtering is not possible** — if you need per-group validation, use `@Validated(GroupName.class)`. (For an example of applying `@Valid`, see the Controller example above.)
