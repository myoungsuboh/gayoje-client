---
name: Domain Glossary & Common Types (Harness Project)
description: Single source of truth for the abbreviations (ESD, POL, Deck, IIoT, etc.) and common types (BusinessException, ApiResponse, AuditLog, etc.) referenced across multiple backend skills. Read it like a dictionary when abbreviations or common types from other skills are unclear, or when writing new code. Keywords: glossary, domain, terminology, ApiResponse, BusinessException, AuditLog, POL.
rules:
  - "Use the definitions in this document as the single source of truth for domain abbreviations (ESD, POL, Deck, IIoT)."
  - "Wrap API responses in the common type ApiResponse<T> when returning them."
  - "Use BusinessException with standard error codes for business exceptions."
  - "For changes that require auditing, record the actor and timestamp in the AuditLog entity."
  - "Split packages by domain and separate per-environment profiles (local/dev/prod)."
tags:
  - "glossary"
  - "domain"
  - "terminology"
  - "ApiResponse"
  - "BusinessException"
  - "AuditLog"
  - "POL"
---

# 📖 Domain Glossary & Common Types

> Acts as the single source of truth (dictionary) for abbreviations and common types. Refer to it when creating new code, and come back here whenever an abbreviation from another skill is unclear.

## 1. Core Principles
- Use the definitions in this document as the single source of truth for domain abbreviations (ESD, POL, Deck, IIoT).
- Wrap API responses in the common type `ApiResponse<T>` when returning them.
- Use `BusinessException` with standard error codes for business exceptions.
- For changes that require auditing, record the actor and timestamp in the `AuditLog` entity.
- Split packages by domain and separate per-environment profiles (local/dev/prod).

## 2. Rules

### 2-1. Domain Abbreviations (Industry Glossary)
| Abbreviation | Expansion | Context |
|------|------|----------|
| **IIoT** | Industrial Internet of Things | Industrial Internet of Things. The network of industrial equipment such as sensors/PLC/SCADA. The domain of this project. |
| **ESD** | Emergency Shut-Down | Emergency shut-down. A command that forcibly stops equipment into a safe state when danger is detected. Losing it leads directly to safety incidents, so use Kafka `acks=all` + idempotent processing ([kafka-pattern §8](../kafka-pattern/SKILL.md)). |
| **Deck** | Deck (offshore plant unit) | Sensor data from the same Deck **requires time-ordering guarantees** → used as the Kafka partition key ([kafka-pattern §2](../kafka-pattern/SKILL.md)). |
| **Bypass** | Mode that temporarily disables automatic safety control | Used during maintenance/inspection. While Bypass is active, **all remote control commands are blocked** ([security-backend §4](../../security/security-backend/SKILL.md)). |
| **PLC** | Programmable Logic Controller | On-site control device. Processes sensor input → actuator output. |
| **SCADA** | Supervisory Control And Data Acquisition | Industrial monitoring and control system. Sits above the PLC. |
| **HMI** | Human-Machine Interface | The screen operators look at. Usually provided by SCADA. |
| **SAP PM** | SAP Plant Maintenance | Master for asset information and maintenance history. Integrated via Read-Only OAuth2 ([security-backend §5](../../security/security-backend/SKILL.md)). |

### 2-2. Internal Policy Numbers (Policy IDs)
| Number | Content | Applicable Skill |
|------|------|-----------|
| **POL-06** | External system integration enforces TLS 1.3 + uses OAuth 2.0 Client Credentials | [security-backend §5, §6](../../security/security-backend/SKILL.md) |
| **POL-08** | When Bypass mode is active, block remote control commands **at the system level** | [security-backend §4](../../security/security-backend/SKILL.md) |
| **POL-12** | All control commands are required to be recorded in the audit log (audit_logs) | [security-backend §6](../../security/security-backend/SKILL.md), [logging-observability](../logging-observability/SKILL.md) |

> Whenever a new POL number appears, be sure to add it to this table. Do not leave a POL-XX visible in the code with its meaning unclear.

### 2-3. Common Response Type — `ApiResponse<T>`
All controllers use the same response envelope.

```java
package com.harness.common.api;

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
    public static <T> ApiResponse<T> fail(String errorCode, String message, T data) {
        return new ApiResponse<>(false, data, message, errorCode);   // additional data such as validation field errors
    }
}
```

JSON form:
```json
// success
{ "success": true, "data": { "id": "s1", "name": "Sensor 1" }, "message": null, "errorCode": null }
// failure
{ "success": false, "data": null, "message": "권한이 없습니다.", "errorCode": "FORBIDDEN" }
```

> The frontend api-standard interceptor passes this envelope straight to the caller. 4xx/5xx use the same envelope.

### 2-4. Common Exception — `BusinessException`
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

Global handler (registered in the same file as the [validation-bean](../validation-bean/SKILL.md) handler):
```java
@ExceptionHandler(BusinessException.class)
public ResponseEntity<ApiResponse<Void>> handle(BusinessException e) {
    return ResponseEntity.status(e.getHttpStatus())
        .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
}
```

### 2-5. Standard Error Codes
| errorCode | HTTP | Meaning |
|-----------|------|------|
| `AUTH_REQUIRED` | 401 | No token / expired |
| `AUTH_EXPIRED` | 401 | Access Token expired → client attempts refresh |
| `REFRESH_INVALID` | 401 | Refresh Token forged/expired/stolen → forced logout |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_FAILED` | 400 | Input validation failed — [validation-bean](../validation-bean/SKILL.md) |
| `CONTROL_LOCKED_BYPASS` | 403 | Remote control blocked during Bypass mode (POL-08) |
| `CONFLICT` | 409 | Optimistic lock conflict, etc. (transaction-locking) |
| `RATE_LIMITED` | 429 | API call limit exceeded |
| `INTERNAL_ERROR` | 500 | Internal server error (subject to Sentry capture) |

> When adding a new code, update this table and use only codes agreed upon with the frontend.

### 2-6. Audit Log Entity — `AuditLog`
```java
@Entity                     // or a record/DTO corresponding to a MyBatis Mapper
@Table(name = "audit_logs")
public class AuditLog {
    @Id @GeneratedValue
    private Long id;

    private String userId;          // actor
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

> For the `@Auditable` annotation and AOP handling, see [security-backend §6](../../security/security-backend/SKILL.md). For satisfying the POL-12 policy.

### 2-7. Package Conventions
| Package | Responsibility |
|--------|------|
| `com.harness.<domain>.controller` | REST controllers |
| `com.harness.<domain>.service` | Business logic |
| `com.harness.<domain>.mapper` | MyBatis mapper interfaces |
| `com.harness.<domain>.model` | Domain models (record/entity) |
| `com.harness.<domain>.dto.request` | Request DTOs |
| `com.harness.<domain>.dto.response` | Response DTOs |
| `com.harness.common.exception` | `BusinessException`, global handler |
| `com.harness.common.api` | `ApiResponse` and other common envelopes |
| `com.harness.common.security` | JWT/CORS/Interceptor |
| `com.harness.event.<topic>` | Kafka event DTOs (JsonDeserializer trusted-packages) |

> `<domain>` examples: `sensor`, `asset`, `control`, `auth`. When creating a new domain, carry over these same 7 sub-packages.

### 2-8. Per-Environment Profiles
| Profile | Purpose | Key Differences |
|----------|------|-----------|
| `local` | Developer PC | H2 or docker-compose Postgres, Swagger open, Flyway clean allowed |
| `dev` | Shared dev server | Postgres + Kafka real servers, Swagger open |
| `staging` | QA / UAT | Same topology as prod, Sentry sample-rate 0.5 |
| `prod` | Production | Swagger blocked, Flyway validate enforced, JWT secret as environment variable |

Separate via `application-{profile}.yml`. **Never place secret values in code/git anywhere — use environment variables.**

## 3. Reference — Skills That Cite This File
- [kafka-pattern](../kafka-pattern/SKILL.md) — ESD, Deck
- [security-backend](../../security/security-backend/SKILL.md) — POL-06/08/12, BusinessException, AuditLog
- [spring-boot-rest](../spring-boot-rest/SKILL.md) — ApiResponse, package conventions
- [validation-bean](../validation-bean/SKILL.md) — VALIDATION_FAILED, global handler
- [logging-observability](../logging-observability/SKILL.md) — audit log ingestion
- [api-versioning-swagger](../api-versioning-swagger/SKILL.md) — prod blocking
- [testing-junit-mockito](../testing-junit-mockito/SKILL.md) — Fixture pattern

## 4. Checklist
- [ ] Have you added new abbreviations / POL numbers to the tables?
- [ ] Have you wrapped API responses in the `ApiResponse<T>` envelope?
- [ ] Have you handled exceptions with `BusinessException` + standard error codes?
- [ ] Have you recorded audited changes in `AuditLog`?
- [ ] Have you created the new domain package with the 7 sub-structures?
