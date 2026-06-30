---
name: 入力値検証標準 (Input Validation)
description: サーバ側入力値検証の汎用標準で、入力の信頼禁止・入口での一括検証・宣言的スキーマ・レイヤーごと（入口・ドメイン）の防御・一貫したエラーレスポンスを扱う（スタック非依存）。リクエスト/入力検証を追加・整備する、検証エラーレスポンスのフォーマットを統一する、Create/Update など状況別の制約を分けるときに読む。キーワード: validation, server-side, schema, error response, fail-fast, 検証グループ, カスタム検証。
rules:
  - "入力は信頼しない: クライアント・外部システムから来たすべての値は潜在的に誤っているか悪意があると想定する。クライアント側検証は UX 補助にすぎず、セキュリティ・整合性の根拠ではない。"
  - "検証はサーバ側で: 実際の強制は必ずサーバ（信頼境界の内側）で行う。検証の責任をクライアントに押し付けない。"
  - "入口で速やかに失敗(fail-fast): 入力はシステムに入る入口で即座に検証し、誤った値がドメインロジックの奥深くに流れ込まないようにする。"
  - "宣言的スキーマで表現: 制約（必須・長さ・範囲・形式）をコードフローに散りばめず、入力モデルに宣言的に付けて一箇所で読めるようにする。"
  - "レイヤーごとの防御: 入口検証を基本とするが、入力が入口を通らない可能性のある経路（内部呼び出し・バッチ・スケジューラ）のために、ドメイン不変条件はドメイン層でももう一度守る。"
  - "一貫したエラーレスポンス: 検証失敗は「クライアントの誤り」であることを明確にする形式（例: 4xx 系 + どのフィールドがなぜ誤っているか）で、すべての入口で同一フォーマットで返す。内部実装情報は露出しない。"
  - "多言語・メッセージ分離: エラーメッセージはハードコードせず、メッセージカタログに分離して多言語と文言変更に対応する。"
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

# ✅ 入力値検証標準 (Input Validation)

> 外部から来るすべての入力を信頼せず、入口で宣言的に一括検証し、失敗を一貫したエラーレスポンスで返す。リクエスト/入力検証を追加・整備する、検証失敗レスポンスを標準化するときに読む。特定の言語/フレームワークに依存しない汎用標準だ。
>
> このスキルは**検証の一般設計**（構造・制約・エラーレスポンス）だ。ホワイトリスト・Injection/XSS/Path Traversal のような攻撃防御とサニタイジングは `input-validation`（入力検証 & データサニタイジング）もあわせて見る。

## 1. 核心原則
- **入力は信頼しない**: クライアント・外部システムから来たすべての値は潜在的に誤っているか悪意があると想定する。クライアント側検証は UX 補助にすぎず、セキュリティ・整合性の根拠ではない。
- **検証はサーバ側で**: 実際の強制は必ずサーバ（信頼境界の内側）で行う。検証の責任をクライアントに押し付けない。
- **入口で速やかに失敗(fail-fast)**: 入力はシステムに入る入口で即座に検証し、誤った値がドメインロジックの奥深くに流れ込まないようにする。
- **宣言的スキーマで表現**: 制約（必須・長さ・範囲・形式）をコードフローに散りばめず、入力モデルに宣言的に付けて一箇所で読めるようにする。
- **レイヤーごとの防御**: 入口検証を基本とするが、入力が入口を通らない可能性のある経路（内部呼び出し・バッチ・スケジューラ）のために、ドメイン不変条件はドメイン層でももう一度守る。
- **一貫したエラーレスポンス**: 検証失敗は「クライアントの誤り」であることを明確にする形式（例: 4xx 系 + どのフィールドがなぜ誤っているか）で、すべての入口で同一フォーマットで返す。内部実装情報は露出しない。
- **多言語・メッセージ分離**: エラーメッセージはハードコードせず、メッセージカタログに分離して多言語と文言変更に対応する。

## 2. ルール

### 2-1. クライアント入力を信頼しない
- 画面/クライアントですでに防いだという理由でサーバ検証を省略しない。
- 検証の「強制」はサーバで、クライアント検証はユーザー体験を素早く助ける用途のみ。

```text
// ❌ 禁止 — クライアントが防いだからサーバはそのまま信頼
saveOrder(input)          // 検証なしで即保存

// ✅ 推奨 — サーバ入口でまず検証し、通った値だけを処理
validate(input) → saveOrder(input)
```

### 2-2. 入口で宣言的に一括検証
- 制約を入力モデル（リクエストオブジェクト/スキーマ）に宣言的に定義し、入口で一度に検証する。
- 入口ハンドラ本体に `if (x == null) throw ...` 式の即席検証を散りばめない — どの制約がかかっているか一箇所で見えるようにする。

```text
// ❌ 禁止 — ハンドラごとに即席 if-検証が散らばる
handler(input):
  if input.name is empty: error
  if input.qty < 1:       error
  ...

// ✅ 推奨 — 入力モデルに制約を宣言、入口が一括検証
schema OrderInput:
  name: required, length 2..100
  qty:  required, min 1
handler(validated OrderInput): ...
```

### 2-3. 状況別の制約はグループ/スキーマで分離 (例: Create vs Update)
- 同じ入力モデルを生成/修正など異なる状況で再利用しながら制約が変わる場合（例: ID は修正でのみ必須、名前は生成でのみ必須）、状況別に検証ルールの束を分離する。
- 一つのモデルに矛盾する制約を無条件で付けず、呼び出しの文脈に合うルール集合を適用する。

```text
// 同じモデル、異なる状況 → 異なる制約の束
OnCreate: id は空であるべき, name 必須
OnUpdate: id 必須,           name 任意
```

### 2-4. 標準制約 vs カスタム検証
- 必須・長さ・範囲・形式のような普遍的な制約は標準（宣言的）方式で処理する。
- 標準で表現できないドメインルール（例: 特定形式のコード、値同士の相互制約）は**再利用可能なカスタム検証単位**に分離する — ドメインロジック内に検証を埋め込まない。

```text
// ✅ 推奨 — ドメインルールを再利用可能な検証に分離
@ValidAssetCode  // "ASSET-YYYY-NNNN" 形式検証を一箇所に定義して再利用
field code
```

### 2-5. 検証失敗は一貫したエラーレスポンスで (グローバル処理)
- 検証失敗は「クライアント入力エラー」であることを明確にするレスポンス（例: 4xx + フィールド別理由リスト）に変換する。
- 入口ごとにバラバラに応答せず、グローバル/共通地点で同一フォーマットに変換する。
- 検証失敗をサーバエラー(5xx)に流したり、内部例外・スタックトレース・実装情報をレスポンスに露出しない。

```text
// ❌ 禁止 — 検証失敗が 5xx に漏れる、または内部情報露出
500 { "error": "NullPointerException at Dao.line 42" }

// ✅ 推奨 — 4xx + どのフィールドがなぜ誤っているか、統一形式
400 {
  "errorCode": "VALIDATION_FAILED",
  "errors": [ { "field": "qty", "message": "1 以上でなければなりません" } ]
}
```

### 2-6. ドメイン層の防御的検証
- 入口検証を通らない可能性のある経路（内部サービス呼び出し・バッチ・スケジューラ・メッセージコンシューマ）を想定する。
- 核心となるビジネス不変条件は入口だけに依存せず、ドメイン層でももう一度守る。

```text
// 入口だけを信じると、バッチ/内部呼び出し経路で誤った値がそのまま通る
domainOp(input):
  assert input.qty >= 1     // 入口を通らなくても不変条件を保証
  ...
```

### 2-7. エラーメッセージ多言語 (i18n)
- メッセージをコードにハードコードせず、メッセージカタログ（キー → 文言）に分離する。
- 言語別カタログを置いて多言語をサポートし、文言変更がコード修正に波及しないようにする。

```text
messages.ko:  order.qty.min = 수량은 {min} 이상이어야 합니다.
messages.en:  order.qty.min = Quantity must be at least {min}.
schema: qty → min 1, message = "{order.qty.min}"
```

## 3. よくあるミス
- **クライアント検証だけを信じる** → サーバ検証の省略で誤った/悪意ある入力がそのまま通る。
- **入口ハンドラに if-検証を散りばめる** → どの制約がかかっているか一目で見えず、漏れが多い。宣言的スキーマに移す。
- **ネスト/コレクション内部の検証漏れ** → 外側のオブジェクトだけ検証し、内側の要素は検証が回らない。ネスト構造まで検証対象に含める。
- **状況別の制約を分けない** → Create/Update に同じモデルを使いながら矛盾する制約をまとめて付け、片方が常に壊れる。
- **検証失敗を 5xx で応答** → クライアントが「自分の入力が誤っている」と分からない。4xx + 理由で。
- **エラーに内部情報を露出** → 例外メッセージ・スタックトレース・実装の詳細をそのまま応答しない。
- **ドメイン検証を完全に省略** → 「入口が唯一の入口」と信じて、バッチ/内部呼び出し経路で壊れる。
- **メッセージのハードコード** → 多言語・文言変更がコード修正に波及する。メッセージカタログに分離する。

## 4. チェックリスト
- [ ] 外部入力を信頼せず**サーバ側**で検証するか（クライアント検証は補助）
- [ ] 制約を入力モデルに**宣言的に**定義し、入口で一括検証するか
- [ ] ネストオブジェクト/コレクション要素まで検証対象に含めたか
- [ ] Create/Update など状況別の制約が異なるなら、グループ/スキーマで分離したか
- [ ] 標準で表現できないドメインルールを再利用可能なカスタム検証に分離したか
- [ ] 検証失敗をグローバル/共通地点で**一貫した 4xx レスポンス**（フィールド別理由）に変換するか
- [ ] レスポンスに内部例外・スタックトレース・実装情報を露出しないか
- [ ] ビジネス不変条件をドメイン層でも防御的に守るか（バッチ・内部呼び出しに備え）
- [ ] エラーメッセージをメッセージカタログ（i18n）で管理するか

## 付録: スタックごとの例

> 以下は参考用の実装例だ。チームが使うスタック（例: TypeScript/Zod, Node/class-validator, Python/Pydantic など）に合う例を同じパターンで追加する。上記 1〜4 の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Spring Boot (Java, JSR-380)

`@Valid`/`@Validated` ベースで Controller 入口で一括検証し、`@RestControllerAdvice` グローバルハンドラでエラーレスポンスを統一する。

#### 依存関係

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-validation'
}
```

> Spring Boot 2.3 以降は `spring-boot-starter-web` に Validation が自動で含まれない。明示的に `spring-boot-starter-validation` を追加しなければならない。

#### 基本アノテーション

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

    @NotBlank(message = "{asset.tagId.notBlank}")        // i18n キー
    @Size(max = 50, message = "タグ ID は 50 文字以下でなければなりません。")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "タグ ID は英大文字/数字/ハイフンのみ許可されます。")
    private String tagId;

    @NotBlank
    @Size(min = 2, max = 100)
    private String assetName;

    @NotNull
    @Min(value = 0,   message = "容量は 0 以上でなければなりません。")
    @Max(value = 9999)
    private Integer capacity;

    @Email(message = "正しいメール形式ではありません。")
    private String contactEmail;

    @Past(message = "設置日は過去でなければなりません。")
    private LocalDate installedAt;

    // ネストオブジェクトも検証するには @Valid 必須
    @NotNull
    @Valid
    private AssetLocation location;

    // コレクション内オブジェクトの検証
    @Size(min = 1, max = 10)
    private List<@Valid SensorRef> sensors;
}
```

> `@NotNull`（null のみ防ぐ） / `@NotEmpty`（空コレクション/文字列を防ぐ） / `@NotBlank`（空白文字列を防ぐ）。三つとも異なる。

#### @Valid vs @Validated

| アノテーション | 位置 | グループサポート | 用途 |
|----------|------|---------|------|
| `@Valid` (JSR-380) | パラメータ/フィールド | X | `@RequestBody` 検証、ネスト検証 |
| `@Validated` (Spring) | **クラスレベル** + パラメータ | O | `@PathVariable`/`@RequestParam`、グループ検証 |

```java
@RestController
@RequestMapping("/api/v1/assets")
@Validated   // ← @PathVariable / @RequestParam 検証のためクラスレベルに必要
@RequiredArgsConstructor
public class AssetController {

    // RequestBody: @Valid
    @PostMapping
    public ApiResponse<Void> create(@RequestBody @Valid AssetCreateRequest request) {
        assetService.createAsset(request);
        return ApiResponse.ok(null);
    }

    // PathVariable: @Validated クラス + パラメータに直接アノテーション
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

#### グループ検証 (Create vs Update) — ルール 2-3 適用

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

// Controller — @Validated にグループを明示
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

#### カスタム Validator — ルール 2-4 適用

```java
package com.harness.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AssetTagIdValidator.class)
public @interface ValidAssetTagId {
    String message() default "正しい資産タグ ID 形式ではありません。(例: ASSET-2026-0001)";
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
        if (value == null || value.isBlank()) return true;   // null は @NotBlank が処理
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

#### グローバル例外ハンドラ (検証エラーレスポンスの標準化) — ルール 2-5 適用

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

    // @RequestBody @Valid 失敗
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<List<FieldErrorDto>>> handleBodyValidation(MethodArgumentNotValidException e) {
        List<FieldErrorDto> errors = e.getBindingResult().getFieldErrors().stream()
            .map(FieldErrorDto::from)
            .collect(Collectors.toList());

        log.warn("入力値検証失敗 errors={}", errors);
        return ResponseEntity.badRequest()
            .body(ApiResponse.fail("VALIDATION_FAILED", "入力値が正しくありません。", errors));
    }

    // @PathVariable / @RequestParam (@Validated) 失敗
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

#### メッセージ i18n — ルール 2-7 適用

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

#### サービスレイヤー検証 (防御的) — ルール 2-6 適用

```java
@Service
@Validated   // サービスメソッドのパラメータ検証を有効化
public class AssetServiceImpl implements AssetService {

    @Override
    public AssetResponse getAsset(@NotBlank String tagId) {
        // tagId が空値なら ConstraintViolationException が発生
        // ...
    }
}
```

#### Spring 特有のよくあるミス
- **`@Valid` の付け忘れ**: `@RequestBody AssetCreateRequest req` だけでは検証が回らない。**常に `@Valid` を一緒に**。
- **ネストオブジェクトの `@Valid` 漏れ**: 親にだけ `@Valid` を付け、内側のフィールドに `@Valid` を付けないと内部オブジェクトは検証されない。
- **`@PathVariable` 検証なのにクラスに `@Validated` がない**: アノテーションが無視されて通過する。
- **`@Min(0)` を `int` でなく `String` に適用**: コンパイルは通るが実行時に動作しない。型マッチングを確認。
- `@Valid` はアノテーションにグループを宣言できるが**実行時のグループフィルタリングは不可**です — グループ別検証が必要なら `@Validated(GroupName.class)` を使ってください。(`@Valid` 適用例は上の Controller 例を参照)
