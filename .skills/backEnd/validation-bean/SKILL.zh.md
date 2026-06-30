---
name: 输入值校验标准 (Input Validation)
description: 服务端输入值校验的通用标准，涵盖不信任输入·在入口处一括校验·声明式 schema·按层（入口·领域）防御·一致的错误响应（与栈无关）。当添加·整顿请求/输入校验，或统一校验错误响应格式，或按 Create/Update 等情况拆分约束时阅读。关键词：validation, server-side, schema, error response, fail-fast, 校验组, 自定义校验。
rules:
  - "不信任输入：假定来自客户端·外部系统的所有值都可能是错误的或恶意的。客户端校验只是 UX 辅助，并非安全·一致性的依据。"
  - "校验在服务端：实际强制必须在服务器（信任边界内侧）进行。不要把校验的责任推给客户端。"
  - "在入口处快速失败(fail-fast)：输入要在进入系统的入口处立即校验，使错误值不会流入领域逻辑深处。"
  - "用声明式 schema 表达：不要把约束（必填·长度·范围·格式）散布在代码流程中，而要声明式地附加到输入模型上，使其在一处可读。"
  - "按层防御：以入口校验为基本，但为了输入可能不经过入口的路径（内部调用·批处理·调度器），领域不变式在领域层也要再守一次。"
  - "一致的错误响应：校验失败要以明确表明「客户端之过」的格式（例如：4xx 系列 + 哪个字段为何出错）返回，在所有入口处用相同的格式返回。不暴露内部实现信息。"
  - "多语言·消息分离：错误消息不要硬编码，而要分离到消息目录中以应对多语言与文案变更。"
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

# ✅ 输入值校验标准 (Input Validation)

> 不信任任何来自外部的输入，在入口处声明式地一括校验，并把失败以一致的错误响应返回。当添加·整顿请求/输入校验，或将校验失败响应标准化时阅读。这是不依赖特定语言/框架的通用标准。
>
> 本技能讲的是**校验的一般设计**（结构·约束·错误响应）。白名单·Injection/XSS/Path Traversal 这类攻击防御与净化，请一并参见 `input-validation`（输入校验 & 数据净化）。

## 1. 核心原则
- **不信任输入**：假定来自客户端·外部系统的所有值都可能是错误的或恶意的。客户端校验只是 UX 辅助，并非安全·一致性的依据。
- **校验在服务端**：实际强制必须在服务器（信任边界内侧）进行。不要把校验的责任推给客户端。
- **在入口处快速失败(fail-fast)**：输入要在进入系统的入口处立即校验，使错误值不会流入领域逻辑深处。
- **用声明式 schema 表达**：不要把约束（必填·长度·范围·格式）散布在代码流程中，而要声明式地附加到输入模型上，使其在一处可读。
- **按层防御**：以入口校验为基本，但为了输入可能不经过入口的路径（内部调用·批处理·调度器），领域不变式在领域层也要再守一次。
- **一致的错误响应**：校验失败要以明确表明「客户端之过」的格式（例如：4xx 系列 + 哪个字段为何出错）返回，在所有入口处用相同的格式返回。不暴露内部实现信息。
- **多语言·消息分离**：错误消息不要硬编码，而要分离到消息目录中以应对多语言与文案变更。

## 2. 规则

### 2-1. 不信任客户端输入
- 不要因为画面/客户端已经拦截过就省略服务端校验。
- 校验的「强制」在服务端，客户端校验只用于快速帮助用户体验。

```text
// ❌ 禁止 — 客户端拦截过了，服务端就照单全收
saveOrder(input)          // 不校验直接保存

// ✅ 推荐 — 在服务端入口处先校验，只处理通过的值
validate(input) → saveOrder(input)
```

### 2-2. 在入口处声明式地一括校验
- 把约束声明式地定义在输入模型（请求对象/schema）上，在入口处一次性校验。
- 不要在入口处理器主体里散布 `if (x == null) throw ...` 式的即兴校验 — 让有哪些约束在一处即可看清。

```text
// ❌ 禁止 — 每个处理器都散落即兴的 if-校验
handler(input):
  if input.name is empty: error
  if input.qty < 1:       error
  ...

// ✅ 推荐 — 在输入模型上声明约束，由入口一括校验
schema OrderInput:
  name: required, length 2..100
  qty:  required, min 1
handler(validated OrderInput): ...
```

### 2-3. 情况相关的约束用组/schema 分离 (例如：Create vs Update)
- 当把同一输入模型在创建/修改等不同情况下复用而约束不同（例如：ID 仅在修改时必填，名称仅在创建时必填）时，按情况分离校验规则集合。
- 不要无条件地把相互矛盾的约束都贴到一个模型上，而要应用符合调用语境的规则集合。

```text
// 同一模型，不同情况 → 不同的约束集合
OnCreate: id 应为空, name 必填
OnUpdate: id 必填,   name 可选
```

### 2-4. 标准约束 vs 自定义校验
- 必填·长度·范围·格式这类普遍约束用标准（声明式）方式处理。
- 标准无法表达的领域规则（例如：特定格式的代码、值之间的相互约束）要分离成**可复用的自定义校验单元** — 不要把校验埋进领域逻辑里。

```text
// ✅ 推荐 — 把领域规则分离成可复用的校验
@ValidAssetCode  // 把 "ASSET-YYYY-NNNN" 格式校验定义在一处并复用
field code
```

### 2-5. 校验失败转为一致的错误响应 (全局处理)
- 把校验失败转换为明确表明「客户端输入错误」的响应（例如：4xx + 按字段的原因列表）。
- 不要每个入口各自响应，而要在全局/公共处转换为相同格式。
- 不要让校验失败漏成服务器错误(5xx)，也不要在响应中暴露内部异常·堆栈跟踪·实现信息。

```text
// ❌ 禁止 — 校验失败漏成 5xx 或暴露内部信息
500 { "error": "NullPointerException at Dao.line 42" }

// ✅ 推荐 — 4xx + 哪个字段为何出错，统一格式
400 {
  "errorCode": "VALIDATION_FAILED",
  "errors": [ { "field": "qty", "message": "必须大于等于 1" } ]
}
```

### 2-6. 领域层的防御性校验
- 假定存在可能不经过入口校验的路径（内部服务调用·批处理·调度器·消息消费者）。
- 核心业务不变式不要只依赖入口，要在领域层也再守一次。

```text
// 只信入口的话，批处理/内部调用路径上错误值会原样通过
domainOp(input):
  assert input.qty >= 1     // 即使不经过入口也保证不变式
  ...
```

### 2-7. 错误消息多语言 (i18n)
- 不要把消息硬编码在代码里，而要分离到消息目录（键 → 文案）。
- 设置按语言的目录以支持多语言，并使文案变更不蔓延为代码修改。

```text
messages.ko:  order.qty.min = 수량은 {min} 이상이어야 합니다.
messages.en:  order.qty.min = Quantity must be at least {min}.
schema: qty → min 1, message = "{order.qty.min}"
```

## 3. 常见错误
- **只信客户端校验** → 省略服务端校验，错误/恶意输入原样通过。
- **在入口处理器中散布 if-校验** → 看不清有哪些约束，遗漏频繁。迁移到声明式 schema。
- **遗漏嵌套/集合内部的校验** → 只校验外层对象，内层元素的校验跑不到。把嵌套结构也纳入校验范围。
- **不分离情况相关的约束** → 在 Create/Update 用同一模型却把矛盾约束一并贴上，导致一侧总是崩。
- **校验失败用 5xx 响应** → 客户端无法得知「是我的输入错了」。用 4xx + 原因。
- **错误中暴露内部信息** → 不要把异常消息·堆栈跟踪·实现细节原样响应。
- **完全省略领域校验** → 误以为「入口是唯一入口」，在批处理/内部调用路径上崩溃。
- **硬编码消息** → 多语言·文案变更蔓延为代码修改。分离到消息目录。

## 4. 检查清单
- [ ] 是否不信任外部输入而在**服务端**校验（客户端校验为辅助）？
- [ ] 是否把约束**声明式地**定义在输入模型上并在入口处一括校验？
- [ ] 是否把嵌套对象/集合元素也纳入校验范围？
- [ ] 若 Create/Update 等情况的约束不同，是否用组/schema 进行了分离？
- [ ] 是否把标准无法表达的领域规则分离成可复用的自定义校验？
- [ ] 是否在全局/公共处把校验失败转换为**一致的 4xx 响应**（按字段原因）？
- [ ] 是否避免在响应中暴露内部异常·堆栈跟踪·实现信息？
- [ ] 是否在领域层也防御性地守住业务不变式（为批处理·内部调用做准备）？
- [ ] 是否用消息目录（i18n）管理错误消息？

## 附录：按栈示例

> 以下是参考用的实现示例。请按相同模式添加符合团队所用栈（例如：TypeScript/Zod, Node/class-validator, Python/Pydantic 等）的示例。上面 1~4 的原则·规则才是标准，附录只是其应用案例。

### Spring Boot (Java, JSR-380)

基于 `@Valid`/`@Validated` 在 Controller 入口处一括校验，并用 `@RestControllerAdvice` 全局处理器统一错误响应。

#### 依赖

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-validation'
}
```

> 自 Spring Boot 2.3 起，Validation 不再自动包含在 `spring-boot-starter-web` 中。必须显式添加 `spring-boot-starter-validation`。

#### 基本注解

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

    @NotBlank(message = "{asset.tagId.notBlank}")        // i18n 键
    @Size(max = 50, message = "标签 ID 必须不超过 50 个字符。")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "标签 ID 只允许英文大写字母/数字/连字符。")
    private String tagId;

    @NotBlank
    @Size(min = 2, max = 100)
    private String assetName;

    @NotNull
    @Min(value = 0,   message = "容量必须大于等于 0。")
    @Max(value = 9999)
    private Integer capacity;

    @Email(message = "不是正确的邮箱格式。")
    private String contactEmail;

    @Past(message = "安装日期必须是过去的日期。")
    private LocalDate installedAt;

    // 要校验嵌套对象必须加 @Valid
    @NotNull
    @Valid
    private AssetLocation location;

    // 校验集合内的对象
    @Size(min = 1, max = 10)
    private List<@Valid SensorRef> sensors;
}
```

> `@NotNull`（只拦截 null） / `@NotEmpty`（拦截空集合/字符串） / `@NotBlank`（拦截空白字符串）。三者各不相同。

#### @Valid vs @Validated

| 注解 | 位置 | 组支持 | 用途 |
|----------|------|---------|------|
| `@Valid` (JSR-380) | 参数/字段 | X | `@RequestBody` 校验、嵌套校验 |
| `@Validated` (Spring) | **类级别** + 参数 | O | `@PathVariable`/`@RequestParam`、组校验 |

```java
@RestController
@RequestMapping("/api/v1/assets")
@Validated   // ← 为校验 @PathVariable / @RequestParam 需在类级别添加
@RequiredArgsConstructor
public class AssetController {

    // RequestBody: @Valid
    @PostMapping
    public ApiResponse<Void> create(@RequestBody @Valid AssetCreateRequest request) {
        assetService.createAsset(request);
        return ApiResponse.ok(null);
    }

    // PathVariable: @Validated 类 + 在参数上直接注解
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

#### 组校验 (Create vs Update) — 应用规则 2-3

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

// Controller — 在 @Validated 中明示组
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

#### 自定义 Validator — 应用规则 2-4

```java
package com.harness.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AssetTagIdValidator.class)
public @interface ValidAssetTagId {
    String message() default "不是正确的资产标签 ID 格式。(例如：ASSET-2026-0001)";
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
        if (value == null || value.isBlank()) return true;   // null 由 @NotBlank 处理
        return FORMAT.matcher(value).matches();
    }
}

// 使用
public class AssetCreateRequest {
    @NotBlank
    @ValidAssetTagId
    private String tagId;
}
```

#### 全局异常处理器 (校验错误响应标准化) — 应用规则 2-5

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

    // @RequestBody @Valid 失败
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<List<FieldErrorDto>>> handleBodyValidation(MethodArgumentNotValidException e) {
        List<FieldErrorDto> errors = e.getBindingResult().getFieldErrors().stream()
            .map(FieldErrorDto::from)
            .collect(Collectors.toList());

        log.warn("输入值校验失败 errors={}", errors);
        return ResponseEntity.badRequest()
            .body(ApiResponse.fail("VALIDATION_FAILED", "输入值不正确。", errors));
    }

    // @PathVariable / @RequestParam (@Validated) 失败
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

#### 消息 i18n — 应用规则 2-7

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

#### 服务层校验 (防御性) — 应用规则 2-6

```java
@Service
@Validated   // 启用服务方法参数校验
public class AssetServiceImpl implements AssetService {

    @Override
    public AssetResponse getAsset(@NotBlank String tagId) {
        // 若 tagId 为空值则抛出 ConstraintViolationException
        // ...
    }
}
```

#### Spring 特有的常见错误
- **漏掉 `@Valid`**：只写 `@RequestBody AssetCreateRequest req` 校验不会运行。**务必同时加 `@Valid`**。
- **嵌套对象漏掉 `@Valid`**：只在父对象上加 `@Valid` 而内层字段不加，则内部对象不被校验。
- **是 `@PathVariable` 校验却没在类上加 `@Validated`**：注解被忽略并直接通过。
- **把 `@Min(0)` 应用到 `String` 而非 `int`**：能编译但运行时不起作用。检查类型匹配。
- `@Valid` 可以在注解上声明组，但**无法在运行时进行组过滤** — 若需要按组校验，请使用 `@Validated(GroupName.class)`。（`@Valid` 的应用示例参见上面的 Controller 示例）
