---
name: 도메인 용어집 & 공통 타입 (Harness 프로젝트)
description: 여러 백엔드 스킬에서 인용되는 약어(ESD, POL, Deck, IIoT 등)와 공통 타입(BusinessException, ApiResponse, AuditLog 등)의 단일 출처 정의. 다른 스킬의 약어·공통 타입이 헷갈릴 때, 새 코드를 작성할 때 사전처럼 읽는다. 키워드: glossary, domain, terminology, ApiResponse, BusinessException, AuditLog, POL.
rules:
  - "도메인 약어(ESD, POL, Deck, IIoT)는 이 문서의 정의를 단일 출처로 사용한다."
  - "API 응답은 공통 타입 ApiResponse<T> 로 감싸 반환한다."
  - "비즈니스 예외는 BusinessException 과 표준 에러 코드를 사용한다."
  - "감사가 필요한 변경은 AuditLog 엔티티에 행위자와 시각을 기록한다."
  - "패키지는 도메인 단위로 나누고 환경별 프로파일(local/dev/prod)을 분리한다."
tags:
  - "glossary"
  - "domain"
  - "terminology"
  - "ApiResponse"
  - "BusinessException"
  - "AuditLog"
  - "POL"
---

# 📖 도메인 용어집 & 공통 타입

> 약어와 공통 타입의 단일 출처(사전) 역할을 한다. 새 코드를 만들 때 참고하고, 다른 스킬의 약어가 헷갈리면 여기로 돌아온다.

## 1. 핵심 원칙
- 도메인 약어(ESD, POL, Deck, IIoT)는 이 문서의 정의를 단일 출처로 사용한다.
- API 응답은 공통 타입 `ApiResponse<T>` 로 감싸 반환한다.
- 비즈니스 예외는 `BusinessException` 과 표준 에러 코드를 사용한다.
- 감사가 필요한 변경은 `AuditLog` 엔티티에 행위자와 시각을 기록한다.
- 패키지는 도메인 단위로 나누고 환경별 프로파일(local/dev/prod)을 분리한다.

## 2. 규칙

### 2-1. 도메인 약어 (Industry Glossary)
| 약어 | 풀이 | 컨텍스트 |
|------|------|----------|
| **IIoT** | Industrial Internet of Things | 산업용 사물인터넷. 센서/PLC/SCADA 등 산업 설비의 네트워크. 이 프로젝트의 도메인. |
| **ESD** | Emergency Shut-Down | 긴급 차단. 위험 감지 시 설비를 안전 상태로 강제 정지하는 명령. 유실되면 안전사고로 직결되므로 Kafka `acks=all` + 멱등 처리 ([kafka-pattern §8](../kafka-pattern/SKILL.md)). |
| **Deck** | 갑판 (해양 플랜트 단위) | 같은 Deck 의 센서 데이터는 **시간 순서 보장 필요** → Kafka 파티션 키로 사용 ([kafka-pattern §2](../kafka-pattern/SKILL.md)). |
| **Bypass** | 자동 안전제어 일시 비활성화 모드 | 정비/점검 시 사용. Bypass 활성 중에는 **모든 원격 제어 명령 차단** ([security-backend §4](../../security/security-backend/SKILL.md)). |
| **PLC** | Programmable Logic Controller | 현장 제어 장치. 센서 입력 → 액추에이터 출력 처리. |
| **SCADA** | Supervisory Control And Data Acquisition | 산업 감시·제어 시스템. PLC 상위에 위치. |
| **HMI** | Human-Machine Interface | 운영자가 보는 화면. 보통 SCADA가 제공. |
| **SAP PM** | SAP Plant Maintenance | 자산 정보·정비이력 마스터. Read-Only OAuth2로 연동 ([security-backend §5](../../security/security-backend/SKILL.md)). |

### 2-2. 사내 정책 번호 (Policy IDs)
| 번호 | 내용 | 적용 스킬 |
|------|------|-----------|
| **POL-06** | 외부 시스템 연동은 TLS 1.3 강제 + OAuth 2.0 Client Credentials 사용 | [security-backend §5, §6](../../security/security-backend/SKILL.md) |
| **POL-08** | Bypass 모드 활성 시 원격 제어 명령을 **시스템 수준에서 차단** | [security-backend §4](../../security/security-backend/SKILL.md) |
| **POL-12** | 모든 제어 명령은 감사 로그(audit_logs) 기록 의무 | [security-backend §6](../../security/security-backend/SKILL.md), [logging-observability](../logging-observability/SKILL.md) |

> 새 POL 번호가 등장하면 반드시 이 표에 추가. 코드 안에 POL-XX 만 보이고 의미 불명인 상태로 두지 말 것.

### 2-3. 공통 응답 타입 — `ApiResponse<T>`
전 컨트롤러는 동일한 응답 봉투를 사용한다.

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

JSON 형태:
```json
// 성공
{ "success": true, "data": { "id": "s1", "name": "Sensor 1" }, "message": null, "errorCode": null }
// 실패
{ "success": false, "data": null, "message": "권한이 없습니다.", "errorCode": "FORBIDDEN" }
```

> 프론트엔드 api-standard 인터셉터는 이 봉투를 그대로 호출자에게 전달. 4xx/5xx 도 같은 봉투.

### 2-4. 공통 예외 — `BusinessException`
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

전역 핸들러 ([validation-bean](../validation-bean/SKILL.md) 의 핸들러와 동일 파일에 등록):
```java
@ExceptionHandler(BusinessException.class)
public ResponseEntity<ApiResponse<Void>> handle(BusinessException e) {
    return ResponseEntity.status(e.getHttpStatus())
        .body(ApiResponse.fail(e.getErrorCode(), e.getMessage()));
}
```

### 2-5. 표준 에러 코드
| errorCode | HTTP | 의미 |
|-----------|------|------|
| `AUTH_REQUIRED` | 401 | 토큰 없음/만료 |
| `AUTH_EXPIRED` | 401 | Access Token 만료 → 클라이언트가 refresh 시도 |
| `REFRESH_INVALID` | 401 | Refresh Token 위변조/만료/도용 → 강제 로그아웃 |
| `FORBIDDEN` | 403 | 권한 부족 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `VALIDATION_FAILED` | 400 | 입력 검증 실패 — [validation-bean](../validation-bean/SKILL.md) |
| `CONTROL_LOCKED_BYPASS` | 403 | Bypass 모드 중 원격 제어 차단 (POL-08) |
| `CONFLICT` | 409 | 낙관 락 충돌 등 (transaction-locking) |
| `RATE_LIMITED` | 429 | API 호출 제한 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 (Sentry 캡처 대상) |

> 신규 코드 추가 시 이 표를 갱신하고, 프론트엔드와도 합의된 코드만 사용.

### 2-6. 감사 로그 엔티티 — `AuditLog`
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

> `@Auditable` 어노테이션과 AOP 처리는 [security-backend §6](../../security/security-backend/SKILL.md) 참고. POL-12 정책 충족용.

### 2-7. 패키지 컨벤션
| 패키지 | 책임 |
|--------|------|
| `com.harness.<domain>.controller` | REST 컨트롤러 |
| `com.harness.<domain>.service` | 비즈니스 로직 |
| `com.harness.<domain>.mapper` | MyBatis 매퍼 인터페이스 |
| `com.harness.<domain>.model` | 도메인 모델 (record/엔티티) |
| `com.harness.<domain>.dto.request` | 요청 DTO |
| `com.harness.<domain>.dto.response` | 응답 DTO |
| `com.harness.common.exception` | `BusinessException`, 전역 핸들러 |
| `com.harness.common.api` | `ApiResponse` 등 공통 봉투 |
| `com.harness.common.security` | JWT/CORS/Interceptor |
| `com.harness.event.<topic>` | Kafka 이벤트 DTO (JsonDeserializer trusted-packages) |

> `<domain>` 예: `sensor`, `asset`, `control`, `auth`. 새 도메인을 만들 때 이 7개 하위 패키지를 동일하게 가져갈 것.

### 2-8. 환경별 프로파일
| 프로파일 | 용도 | 주요 차이 |
|----------|------|-----------|
| `local` | 개발자 PC | H2 또는 docker-compose Postgres, Swagger 열림, Flyway clean 허용 |
| `dev` | 공용 개발 서버 | Postgres + Kafka 실서버, Swagger 열림 |
| `staging` | QA / UAT | prod와 동일 토폴로지, Sentry sample-rate 0.5 |
| `prod` | 운영 | Swagger 차단, Flyway validate 강제, JWT secret 환경변수 |

`application-{profile}.yml` 분리. **secret 값은 어디서도 코드/git에 두지 말고 환경변수**.

## 3. 참고 — 이 파일을 인용하는 스킬
- [kafka-pattern](../kafka-pattern/SKILL.md) — ESD, Deck
- [security-backend](../../security/security-backend/SKILL.md) — POL-06/08/12, BusinessException, AuditLog
- [spring-boot-rest](../spring-boot-rest/SKILL.md) — ApiResponse, 패키지 컨벤션
- [validation-bean](../validation-bean/SKILL.md) — VALIDATION_FAILED, 전역 핸들러
- [logging-observability](../logging-observability/SKILL.md) — 감사 로그 적재
- [api-versioning-swagger](../api-versioning-swagger/SKILL.md) — prod 차단
- [testing-junit-mockito](../testing-junit-mockito/SKILL.md) — Fixture 패턴

## 4. 체크리스트
- [ ] 새 약어·POL 번호를 표에 추가했는가
- [ ] API 응답을 `ApiResponse<T>` 봉투로 감쌌는가
- [ ] 예외를 `BusinessException` + 표준 에러 코드로 처리했는가
- [ ] 감사 대상 변경을 `AuditLog`에 기록했는가
- [ ] 새 도메인 패키지를 7개 하위 구조로 만들었는가
