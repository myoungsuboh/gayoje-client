---
name: ドメイン用語集 & 共通型 (Harness プロジェクト)
description: 複数のバックエンドスキルから参照される略語(ESD、POL、Deck、IIoT など)と共通型(BusinessException、ApiResponse、AuditLog など)の単一の出典となる定義。他スキルの略語・共通型が紛らわしいとき、新しいコードを書くときに辞書のように読む。キーワード: glossary, domain, terminology, ApiResponse, BusinessException, AuditLog, POL.
rules:
  - "ドメイン略語(ESD、POL、Deck、IIoT)はこのドキュメントの定義を単一の出典として使用する。"
  - "API レスポンスは共通型 ApiResponse<T> で包んで返す。"
  - "ビジネス例外は BusinessException と標準エラーコードを使用する。"
  - "監査が必要な変更は AuditLog エンティティに行為者と時刻を記録する。"
  - "パッケージはドメイン単位で分け、環境別プロファイル(local/dev/prod)を分離する。"
tags:
  - "glossary"
  - "domain"
  - "terminology"
  - "ApiResponse"
  - "BusinessException"
  - "AuditLog"
  - "POL"
---

# 📖 ドメイン用語集 & 共通型

> 略語と共通型の単一の出典(辞書)の役割を果たす。新しいコードを作るときに参照し、他スキルの略語が紛らわしいときはここに戻る。

## 1. 中核原則
- ドメイン略語(ESD、POL、Deck、IIoT)はこのドキュメントの定義を単一の出典として使用する。
- API レスポンスは共通型 `ApiResponse<T>` で包んで返す。
- ビジネス例外は `BusinessException` と標準エラーコードを使用する。
- 監査が必要な変更は `AuditLog` エンティティに行為者と時刻を記録する。
- パッケージはドメイン単位で分け、環境別プロファイル(local/dev/prod)を分離する。

## 2. ルール

### 2-1. ドメイン略語 (Industry Glossary)
| 略語 | 展開 | コンテキスト |
|------|------|----------|
| **IIoT** | Industrial Internet of Things | 産業用モノのインターネット。センサー/PLC/SCADA など産業設備のネットワーク。このプロジェクトのドメイン。 |
| **ESD** | Emergency Shut-Down | 緊急遮断。危険検知時に設備を安全状態へ強制停止するコマンド。喪失すると安全事故に直結するため Kafka `acks=all` + 冪等処理 ([kafka-pattern §8](../kafka-pattern/SKILL.md))。 |
| **Deck** | 甲板 (海洋プラント単位) | 同じ Deck のセンサーデータは**時間順序の保証が必要** → Kafka パーティションキーとして使用 ([kafka-pattern §2](../kafka-pattern/SKILL.md))。 |
| **Bypass** | 自動安全制御を一時的に無効化するモード | 整備/点検時に使用。Bypass 有効中は**すべての遠隔制御コマンドを遮断** ([security-backend §4](../../security/security-backend/SKILL.md))。 |
| **PLC** | Programmable Logic Controller | 現場制御装置。センサー入力 → アクチュエータ出力を処理。 |
| **SCADA** | Supervisory Control And Data Acquisition | 産業監視・制御システム。PLC の上位に位置する。 |
| **HMI** | Human-Machine Interface | オペレーターが見る画面。通常は SCADA が提供する。 |
| **SAP PM** | SAP Plant Maintenance | 資産情報・整備履歴のマスター。Read-Only OAuth2 で連携 ([security-backend §5](../../security/security-backend/SKILL.md))。 |

### 2-2. 社内ポリシー番号 (Policy IDs)
| 番号 | 内容 | 適用スキル |
|------|------|-----------|
| **POL-06** | 外部システム連携は TLS 1.3 強制 + OAuth 2.0 Client Credentials 使用 | [security-backend §5, §6](../../security/security-backend/SKILL.md) |
| **POL-08** | Bypass モード有効時に遠隔制御コマンドを**システムレベルで遮断** | [security-backend §4](../../security/security-backend/SKILL.md) |
| **POL-12** | すべての制御コマンドは監査ログ(audit_logs)記録の義務 | [security-backend §6](../../security/security-backend/SKILL.md), [logging-observability](../logging-observability/SKILL.md) |

> 新しい POL 番号が登場したら必ずこの表に追加する。コード内に POL-XX だけが見えて意味不明な状態にしておかないこと。

### 2-3. 共通レスポンス型 — `ApiResponse<T>`
全コントローラは同一のレスポンスエンベロープを使用する。

```java
package com.harness.common.api;

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
    public static <T> ApiResponse<T> fail(String errorCode, String message, T data) {
        return new ApiResponse<>(false, data, message, errorCode);   // 검증 필드 오류 등 부가 데이터
    }
}
```

JSON 形式:
```json
// 성공
{ "success": true, "data": { "id": "s1", "name": "Sensor 1" }, "message": null, "errorCode": null }
// 실패
{ "success": false, "data": null, "message": "권한이 없습니다.", "errorCode": "FORBIDDEN" }
```

> フロントエンドの api-standard インターセプターはこのエンベロープをそのまま呼び出し元へ渡す。4xx/5xx も同じエンベロープ。

### 2-4. 共通例外 — `BusinessException`
```java
package com.harness.common.exception;

public class BusinessException extends RuntimeException {
    private final String errorCode;
    private final HttpStatus httpStatus;

    public BusinessException(String errorCode, String message) {
        this(errorCode, message, HttpStatus.BAD_REQUEST);
    }

    public BusinessException(String errorCode, String message, HttpStatus httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public String getErrorCode() { return errorCode; }
    public HttpStatus getHttpStatus() { return httpStatus; }
}
```

グローバルハンドラ ([validation-bean](../validation-bean/SKILL.md) のハンドラと同じファイルに登録):
```java
@ExceptionHandler(BusinessException.class)
public ResponseEntity<ApiResponse<Void>> handle(BusinessException e) {
    return ResponseEntity.status(e.getHttpStatus())
        .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
}
```

### 2-5. 標準エラーコード
| errorCode | HTTP | 意味 |
|-----------|------|------|
| `AUTH_REQUIRED` | 401 | トークンなし/失効 |
| `AUTH_EXPIRED` | 401 | Access Token 失効 → クライアントが refresh を試みる |
| `REFRESH_INVALID` | 401 | Refresh Token 改ざん/失効/盗用 → 強制ログアウト |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースなし |
| `VALIDATION_FAILED` | 400 | 入力検証失敗 — [validation-bean](../validation-bean/SKILL.md) |
| `CONTROL_LOCKED_BYPASS` | 403 | Bypass モード中の遠隔制御遮断 (POL-08) |
| `CONFLICT` | 409 | 楽観ロック競合など (transaction-locking) |
| `RATE_LIMITED` | 429 | API 呼び出し制限超過 |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー (Sentry キャプチャ対象) |

> 新規コード追加時はこの表を更新し、フロントエンドと合意したコードのみ使用する。

### 2-6. 監査ログエンティティ — `AuditLog`
```java
@Entity                     // 또는 MyBatis Mapper 대응 record/DTO
@Table(name = "audit_logs")
public class AuditLog {
    @Id @GeneratedValue
    private Long id;

    private String userId;          // 행위자
    private String action;           // ex) "CONTROL_ESD_TRIGGER"
    private String result;           // SUCCESS / FAIL
    private String targetType;       // ex) "DECK", "USER"
    private String targetId;
    private String clientIp;
    private Instant createdAt;

    public static AuditLog create(String userId, String action, String result) {
        return create(userId, action, result, null, null, null);
    }
    public static AuditLog create(String userId, String action, String result,
                                  String targetType, String targetId, String clientIp) {
        AuditLog log = new AuditLog();
        log.userId = userId; log.action = action; log.result = result;
        log.targetType = targetType; log.targetId = targetId; log.clientIp = clientIp;
        log.createdAt = Instant.now();
        return log;
    }
}
```

> `@Auditable` アノテーションと AOP 処理は [security-backend §6](../../security/security-backend/SKILL.md) を参照。POL-12 ポリシー充足用。

### 2-7. パッケージ規約
| パッケージ | 責務 |
|--------|------|
| `com.harness.<domain>.controller` | REST コントローラ |
| `com.harness.<domain>.service` | ビジネスロジック |
| `com.harness.<domain>.mapper` | MyBatis マッパーインターフェース |
| `com.harness.<domain>.model` | ドメインモデル (record/エンティティ) |
| `com.harness.<domain>.dto.request` | リクエスト DTO |
| `com.harness.<domain>.dto.response` | レスポンス DTO |
| `com.harness.common.exception` | `BusinessException`、グローバルハンドラ |
| `com.harness.common.api` | `ApiResponse` などの共通エンベロープ |
| `com.harness.common.security` | JWT/CORS/Interceptor |
| `com.harness.event.<topic>` | Kafka イベント DTO (JsonDeserializer trusted-packages) |

> `<domain>` 例: `sensor`, `asset`, `control`, `auth`。新しいドメインを作るときはこの 7 つのサブパッケージを同じように持たせること。

### 2-8. 環境別プロファイル
| プロファイル | 用途 | 主な違い |
|----------|------|-----------|
| `local` | 開発者 PC | H2 または docker-compose Postgres、Swagger 開放、Flyway clean 許可 |
| `dev` | 共用開発サーバー | Postgres + Kafka 実サーバー、Swagger 開放 |
| `staging` | QA / UAT | prod と同一トポロジー、Sentry sample-rate 0.5 |
| `prod` | 運用 | Swagger 遮断、Flyway validate 強制、JWT secret 環境変数 |

`application-{profile}.yml` で分離。**secret 値はどこであれコード/git に置かず環境変数にする。**

## 3. 参考 — このファイルを引用するスキル
- [kafka-pattern](../kafka-pattern/SKILL.md) — ESD, Deck
- [security-backend](../../security/security-backend/SKILL.md) — POL-06/08/12, BusinessException, AuditLog
- [spring-boot-rest](../spring-boot-rest/SKILL.md) — ApiResponse, パッケージ規約
- [validation-bean](../validation-bean/SKILL.md) — VALIDATION_FAILED, グローバルハンドラ
- [logging-observability](../logging-observability/SKILL.md) — 監査ログ取り込み
- [api-versioning-swagger](../api-versioning-swagger/SKILL.md) — prod 遮断
- [testing-junit-mockito](../testing-junit-mockito/SKILL.md) — Fixture パターン

## 4. チェックリスト
- [ ] 新しい略語・POL 番号を表に追加したか
- [ ] API レスポンスを `ApiResponse<T>` エンベロープで包んだか
- [ ] 例外を `BusinessException` + 標準エラーコードで処理したか
- [ ] 監査対象の変更を `AuditLog` に記録したか
- [ ] 新しいドメインパッケージを 7 つのサブ構造で作ったか
