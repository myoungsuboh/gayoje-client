---
name: 领域术语表 & 通用类型 (Harness 项目)
description: 多个后端技能所引用的缩写(ESD、POL、Deck、IIoT 等)与通用类型(BusinessException、ApiResponse、AuditLog 等)的单一来源定义。当其他技能的缩写·通用类型令人困惑时,或在编写新代码时像字典一样查阅。关键词: glossary, domain, terminology, ApiResponse, BusinessException, AuditLog, POL.
rules:
  - "领域缩写(ESD、POL、Deck、IIoT)以本文档的定义作为单一来源使用。"
  - "API 响应用通用类型 ApiResponse<T> 包裹后返回。"
  - "业务异常使用 BusinessException 与标准错误码。"
  - "需要审计的变更在 AuditLog 实体中记录行为者与时间。"
  - "包按领域单位划分,并分离各环境配置(local/dev/prod)。"
tags:
  - "glossary"
  - "domain"
  - "terminology"
  - "ApiResponse"
  - "BusinessException"
  - "AuditLog"
  - "POL"
---

# 📖 领域术语表 & 通用类型

> 充当缩写与通用类型的单一来源(字典)。编写新代码时参考它,当其他技能的缩写令人困惑时回到这里。

## 1. 核心原则
- 领域缩写(ESD、POL、Deck、IIoT)以本文档的定义作为单一来源使用。
- API 响应用通用类型 `ApiResponse<T>` 包裹后返回。
- 业务异常使用 `BusinessException` 与标准错误码。
- 需要审计的变更在 `AuditLog` 实体中记录行为者与时间。
- 包按领域单位划分,并分离各环境配置(local/dev/prod)。

## 2. 规则

### 2-1. 领域缩写 (Industry Glossary)
| 缩写 | 全称 | 上下文 |
|------|------|----------|
| **IIoT** | Industrial Internet of Things | 工业物联网。传感器/PLC/SCADA 等工业设备的网络。本项目的领域。 |
| **ESD** | Emergency Shut-Down | 紧急停车。检测到危险时将设备强制停止到安全状态的命令。一旦丢失会直接导致安全事故,因此使用 Kafka `acks=all` + 幂等处理 ([kafka-pattern §8](../kafka-pattern/SKILL.md))。 |
| **Deck** | 甲板 (海洋平台单元) | 同一 Deck 的传感器数据**需要保证时间顺序** → 用作 Kafka 分区键 ([kafka-pattern §2](../kafka-pattern/SKILL.md))。 |
| **Bypass** | 临时停用自动安全控制的模式 | 维护/检查时使用。Bypass 激活期间**阻断所有远程控制命令** ([security-backend §4](../../security/security-backend/SKILL.md))。 |
| **PLC** | Programmable Logic Controller | 现场控制装置。处理传感器输入 → 执行器输出。 |
| **SCADA** | Supervisory Control And Data Acquisition | 工业监视·控制系统。位于 PLC 之上。 |
| **HMI** | Human-Machine Interface | 操作员查看的画面。通常由 SCADA 提供。 |
| **SAP PM** | SAP Plant Maintenance | 资产信息·维护历史的主数据。通过 Read-Only OAuth2 集成 ([security-backend §5](../../security/security-backend/SKILL.md))。 |

### 2-2. 内部策略编号 (Policy IDs)
| 编号 | 内容 | 适用技能 |
|------|------|-----------|
| **POL-06** | 外部系统集成强制 TLS 1.3 + 使用 OAuth 2.0 Client Credentials | [security-backend §5, §6](../../security/security-backend/SKILL.md) |
| **POL-08** | Bypass 模式激活时**在系统级别阻断**远程控制命令 | [security-backend §4](../../security/security-backend/SKILL.md) |
| **POL-12** | 所有控制命令必须记录审计日志(audit_logs) | [security-backend §6](../../security/security-backend/SKILL.md), [logging-observability](../logging-observability/SKILL.md) |

> 出现新的 POL 编号时务必添加到此表。不要让代码中只出现 POL-XX 而含义不明。

### 2-3. 通用响应类型 — `ApiResponse<T>`
所有控制器使用相同的响应信封。

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

> 前端 api-standard 拦截器将此信封原样传递给调用方。4xx/5xx 也使用相同信封。

### 2-4. 通用异常 — `BusinessException`
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

全局处理器 (注册在与 [validation-bean](../validation-bean/SKILL.md) 处理器相同的文件中):
```java
@ExceptionHandler(BusinessException.class)
public ResponseEntity<ApiResponse<Void>> handle(BusinessException e) {
    return ResponseEntity.status(e.getHttpStatus())
        .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
}
```

### 2-5. 标准错误码
| errorCode | HTTP | 含义 |
|-----------|------|------|
| `AUTH_REQUIRED` | 401 | 无令牌/已过期 |
| `AUTH_EXPIRED` | 401 | Access Token 过期 → 客户端尝试 refresh |
| `REFRESH_INVALID` | 401 | Refresh Token 伪造/过期/盗用 → 强制登出 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_FAILED` | 400 | 输入校验失败 — [validation-bean](../validation-bean/SKILL.md) |
| `CONTROL_LOCKED_BYPASS` | 403 | Bypass 模式中阻断远程控制 (POL-08) |
| `CONFLICT` | 409 | 乐观锁冲突等 (transaction-locking) |
| `RATE_LIMITED` | 429 | 超出 API 调用限制 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 (Sentry 捕获对象) |

> 新增代码时更新此表,并仅使用与前端达成一致的代码。

### 2-6. 审计日志实体 — `AuditLog`
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

> `@Auditable` 注解与 AOP 处理参见 [security-backend §6](../../security/security-backend/SKILL.md)。用于满足 POL-12 策略。

### 2-7. 包约定
| 包 | 职责 |
|--------|------|
| `com.harness.<domain>.controller` | REST 控制器 |
| `com.harness.<domain>.service` | 业务逻辑 |
| `com.harness.<domain>.mapper` | MyBatis 映射器接口 |
| `com.harness.<domain>.model` | 领域模型 (record/实体) |
| `com.harness.<domain>.dto.request` | 请求 DTO |
| `com.harness.<domain>.dto.response` | 响应 DTO |
| `com.harness.common.exception` | `BusinessException`、全局处理器 |
| `com.harness.common.api` | `ApiResponse` 等通用信封 |
| `com.harness.common.security` | JWT/CORS/Interceptor |
| `com.harness.event.<topic>` | Kafka 事件 DTO (JsonDeserializer trusted-packages) |

> `<domain>` 示例: `sensor`, `asset`, `control`, `auth`。创建新领域时按相同方式带上这 7 个子包。

### 2-8. 各环境配置
| 配置 | 用途 | 主要差异 |
|----------|------|-----------|
| `local` | 开发者 PC | H2 或 docker-compose Postgres、Swagger 开放、允许 Flyway clean |
| `dev` | 共用开发服务器 | Postgres + Kafka 实服务器、Swagger 开放 |
| `staging` | QA / UAT | 与 prod 相同拓扑、Sentry sample-rate 0.5 |
| `prod` | 运营 | Swagger 阻断、强制 Flyway validate、JWT secret 环境变量 |

通过 `application-{profile}.yml` 分离。**secret 值无论在何处都不要放入代码/git,而要放入环境变量。**

## 3. 参考 — 引用本文件的技能
- [kafka-pattern](../kafka-pattern/SKILL.md) — ESD, Deck
- [security-backend](../../security/security-backend/SKILL.md) — POL-06/08/12, BusinessException, AuditLog
- [spring-boot-rest](../spring-boot-rest/SKILL.md) — ApiResponse, 包约定
- [validation-bean](../validation-bean/SKILL.md) — VALIDATION_FAILED, 全局处理器
- [logging-observability](../logging-observability/SKILL.md) — 审计日志写入
- [api-versioning-swagger](../api-versioning-swagger/SKILL.md) — prod 阻断
- [testing-junit-mockito](../testing-junit-mockito/SKILL.md) — Fixture 模式

## 4. 检查清单
- [ ] 是否已将新缩写·POL 编号添加到表中
- [ ] 是否已用 `ApiResponse<T>` 信封包裹 API 响应
- [ ] 是否已用 `BusinessException` + 标准错误码处理异常
- [ ] 是否已将审计对象的变更记录到 `AuditLog`
- [ ] 是否已将新领域包创建为 7 个子结构
