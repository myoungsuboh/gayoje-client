---
name: Spring Boot 기동 오류 패턴 및 해결책
description: Spring Boot 기동 시 자주 겪는 Bean 생성 실패, H2↔MySQL/PostgreSQL 문법 호환 오류, MyBatis sqlSessionTemplate 미해결, schema.sql 실행 실패의 원인과 해결법. 앱이 기동에 실패하거나 BeanCreationException·DB 문법 오류를 디버깅할 때 읽는다. 키워드: BeanCreationException, NoSuchBeanDefinitionException, UnsatisfiedDependencyException, sqlSessionTemplate, @Configuration, H2, schema.sql.
rules:
  - "기동 오류는 대부분 연쇄 실패(Cascade Failure) 구조다. 로그의 가장 마지막 Caused by:부터 읽어야 진짜 원인을 찾는다."
  - "H2와 MySQL/PostgreSQL 문법 차이는 H2 MODE 설정으로 호환시킨다."
  - "AUTO_INCREMENT·UPSERT 같은 dialect 문법은 대상 DB에 맞춰 분기한다."
  - "Bean 생성 실패는 의존성 누락과 순환 참조를 먼저 확인한다."
  - "MyBatis sqlSessionTemplate 미해결은 DataSource/schema 초기화와 mapper-locations 경로를 점검한다."
  - "환경별 schema 파일을 분리해 시작 시 충돌을 막는다."
tags:
  - "BeanCreationException"
  - "NoSuchBeanDefinitionException"
  - "UnsatisfiedDependencyException"
  - "sqlSessionTemplate"
  - "@Configuration"
  - "H2"
  - "schema.sql"
  - "ApplicationContext"
  - "@SpringBootApplication"
---

# 🚨 Spring Boot 기동 오류 패턴 및 해결책

> 기동 실패의 진짜 원인을 빠르게 찾고 DB 문법/빈 의존성 오류를 고친다. 앱이 시작되지 않거나 BeanCreationException·DB 문법 오류를 디버깅할 때 읽는다.

## 1. 핵심 원칙
- 기동 오류는 대부분 **연쇄 실패(Cascade Failure)** 구조다. 로그의 가장 마지막 `Caused by:`부터 읽어야 진짜 원인을 찾는다.
- H2와 MySQL/PostgreSQL 문법 차이는 H2 `MODE` 설정으로 호환시킨다.
- `AUTO_INCREMENT`·UPSERT 같은 dialect 문법은 대상 DB에 맞춰 분기한다.
- Bean 생성 실패는 의존성 누락과 순환 참조를 먼저 확인한다.
- MyBatis `sqlSessionTemplate` 미해결은 DataSource/schema 초기화와 `mapper-locations` 경로를 점검한다.
- 환경별 schema 파일을 분리해 시작 시 충돌을 막는다.

연쇄 실패 예시 — 마지막 `Caused by:`가 진짜 원인:
```
Unable to start web server
  └─ UnsatisfiedDependencyException (JwtAuthenticationFilter)
       └─ UnsatisfiedDependencyException (UserDetailsServiceImpl)
            └─ BeanCreationException (userMapper)
                 └─ Cannot resolve 'sqlSessionTemplate'  ← 이게 문제
                      └─ ScriptStatementFailedException  ← 진짜 원인
                           └─ H2 SQL syntax error        ← 여기서 시작됨
```

## 2. 규칙

### 2-1. H2 ↔ MySQL/PostgreSQL SQL 문법 불일치
로컬 테스트용 H2와 실제 DB(MySQL, PostgreSQL)의 DDL 문법이 달라 `schema.sql` 실행 실패. H2 2.x부터 `AUTO_INCREMENT`가 MySQL 호환 모드 없이는 동작하지 않는다.

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"CREATE TABLE ... id BIGINT [*]AUTO_INCREMENT PRIMARY KEY ..."
expected "ARRAY, INVISIBLE, NOT NULL, DEFAULT, GENERATED ..."
```

| 구문 | MySQL/MariaDB | PostgreSQL | H2 기본 모드 |
|------|--------------|------------|-------------|
| 자동 증가 | `BIGINT AUTO_INCREMENT` | `BIGINT GENERATED ALWAYS AS IDENTITY` | `BIGINT AUTO_INCREMENT` ❌ (2.x) |
| 현재 시간 | `NOW()` | `NOW()` | `CURRENT_TIMESTAMP` 권장 |
| 문자열 길이 제한 없음 | `TEXT` | `TEXT` | `VARCHAR` 사용 권장 |

✅ 해결책 1 — H2에 MySQL 호환 모드 활성화 (권장):
```yaml
# application-local.yml (로컬 개발용)
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  h2:
    console:
      enabled: true   # localhost:8080/h2-console 접속 가능
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
```
> `MODE=MySQL` 설정 시 `AUTO_INCREMENT`, `NOW()`, `IF NOT EXISTS` 등 MySQL 문법 대부분 허용됨.

✅ 해결책 2 — H2 전용 schema 파일 분리:
```
src/main/resources/
├── schema-h2.sql       ← H2 전용 (로컬 개발)
├── schema-mysql.sql    ← MySQL/MariaDB 전용
└── schema-pgsql.sql    ← PostgreSQL 전용
```
```sql
-- schema-h2.sql (H2 네이티브 문법)
CREATE TABLE IF NOT EXISTS asset_master (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- AUTO_INCREMENT 대신
    tag_id      VARCHAR(100)  NOT NULL UNIQUE,
    asset_name  VARCHAR(200)  NOT NULL,
    status      VARCHAR(20)   DEFAULT 'ACTIVE',
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,           -- NOW() 대신
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```
```yaml
# application-local.yml
spring:
  sql:
    init:
      schema-locations: classpath:schema-h2.sql  # 환경별 파일 지정
```

### 2-2. `Cannot resolve reference to bean 'sqlSessionTemplate'`
MyBatis 설정 문제가 아니라 **DataSource 또는 schema 초기화 실패의 연쇄 결과**다. `sqlSessionTemplate`은 DataSource가 정상일 때만 생성되므로, DataSource가 실패하면 반드시 이 오류가 따라온다.

```
# 로그에서 이 오류가 보이면 반드시 더 아래 Caused by를 확인
Cannot resolve reference to bean 'sqlSessionTemplate'
                                           ↓
Caused by: ScriptStatementFailedException  ← schema.sql 실행 실패
Caused by: BeanCreationException (dataSourceScriptDatabaseInitializer)
```

✅ 해결책: ① schema.sql SQL 문법 오류 수정(2-1 참고) ② MyBatis 설정 확인(실제 설정 문제인 경우):
```yaml
# application.yml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml   # XML 파일 경로
  configuration:
    map-underscore-to-camel-case: true
```
```java
// HarnessApplication.java — @MapperScan 위치 확인
@SpringBootApplication
@MapperScan("com.harness.src.*.dao")   // DAO 패키지 경로와 정확히 일치해야 함
public class HarnessApplication { ... }
```

### 2-3. `UnsatisfiedDependencyException` — Bean 의존성 미충족
```
Error creating bean 'A': Unsatisfied dependency
  → Error creating bean 'B': Unsatisfied dependency
      → Error creating bean 'C': Cannot resolve bean 'X'
```
읽는 순서: **C → B → A** 순서로 거슬러 올라간다.

| 원인 | 증상 | 해결 |
|------|------|------|
| `@Mapper` 누락 | Mapper 빈 없음 | DAO 인터페이스에 `@Mapper` 추가 |
| `@MapperScan` 경로 오류 | 특정 패키지 Mapper만 안 됨 | 패키지 경로 정확히 입력 |
| schema.sql 실행 실패 | `sqlSessionTemplate` 없음 | SQL 문법 수정 |
| 순환 의존성 | `The dependencies of some beans form a cycle` | `@Lazy` 또는 구조 개선 |
| `@Service`/`@Component` 누락 | 서비스 빈 없음 | 어노테이션 추가 |

### 2-4. H2 `schema.sql` 자동 실행 설정
```yaml
# application-local.yml
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1
    username: sa
    password:

  sql:
    init:
      mode: always                              # always: 항상 실행 / embedded: H2 같은 내장 DB만 실행
      schema-locations: classpath:schema-h2.sql  # DDL 스크립트
      data-locations: classpath:data-h2.sql      # 초기 데이터 (선택)
      encoding: UTF-8

  h2:
    console:
      enabled: true
      path: /h2-console   # 브라우저에서 DB 내용 확인: http://localhost:8080/h2-console
```
> **주의:** `spring.sql.init.mode=always`로 설정하면 운영 DB에서도 실행될 수 있다. 로컬 전용 설정은 반드시 `application-local.yml`에만 넣고 `spring.profiles.active=local`로 격리할 것.

### 2-5. H2에서 지원 안 되는 PostgreSQL 전용 DML 문법
`ON CONFLICT ... DO UPDATE`(UPSERT)는 H2에서 `MODE=PostgreSQL`을 사용해도 동작하지 않는다.

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"INSERT INTO safety_lock ... ON CONFLICT (target_id) DO UPDATE ..."
```
```xml
<!-- ❌ H2에서 실패 (PostgreSQL 전용) -->
<insert id="upsertSafetyLock">
    INSERT INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
    VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
    ON CONFLICT (target_id) DO UPDATE
    SET lock_level = EXCLUDED.lock_level,
        locked_by = EXCLUDED.locked_by,
        reason = EXCLUDED.reason,
        updated_at = NOW()
</insert>
```

✅ 해결책 — MyBatis `<choose>`로 DB별 분기. XML에서 `_databaseId` 변수로 DB 종류를 분기한다.
```xml
<!-- ✅ H2 / PostgreSQL 모두 동작 -->
<insert id="upsertSafetyLock">
    <choose>
        <when test="_databaseId == 'postgresql'">
            INSERT INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
            ON CONFLICT (target_id) DO UPDATE
            SET lock_level = EXCLUDED.lock_level,
                locked_by = EXCLUDED.locked_by,
                reason = EXCLUDED.reason,
                updated_at = NOW()
        </when>
        <otherwise>
            <!-- H2 / MySQL: MERGE INTO 사용 -->
            MERGE INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            KEY (target_id)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
        </otherwise>
    </choose>
</insert>
```
```yaml
# application.yml — _databaseId 활성화 (운영 DB 종류 명시)
mybatis:
  configuration:
    database-id: postgresql   # h2, mysql, postgresql, oracle
```
```yaml
# application-local.yml — 로컬 H2 프로파일
mybatis:
  configuration:
    database-id: h2
```

PostgreSQL → H2 SQL 변환 빠른 참조표:

| PostgreSQL 구문 | H2 대체 구문 | 비고 |
|----------------|------------|------|
| `ON CONFLICT ... DO UPDATE` | `MERGE INTO ... KEY (...)` | H2 UPSERT |
| `INSERT ... RETURNING id` | `<selectKey>` 사용 | MyBatis selectKey |
| `SERIAL` / `BIGSERIAL` | `BIGINT AUTO_INCREMENT` (MODE=MySQL) 또는 `BIGINT GENERATED ALWAYS AS IDENTITY` | |
| `ILIKE` | `LOWER(col) LIKE LOWER(?)` | 대소문자 무시 검색 |
| `::TEXT`, `::INT` (캐스팅) | `CAST(col AS VARCHAR)` | 타입 캐스팅 |
| `NOW()` | `CURRENT_TIMESTAMP` | MODE=MySQL이면 NOW() 가능 |
| `TRUE` / `FALSE` | `TRUE` / `FALSE` | H2 지원 (문제 없음) |

### 2-6. 프로파일별 DataSource 분리 (권장)
로컬은 H2, 운영은 실제 DB를 사용하는 안전한 분리 방법.
```yaml
# application.yml (공통)
spring:
  profiles:
    active: local   # 기본값 local (운영 배포 시 환경변수로 override)
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true

---
# application-local.yml (로컬 H2)
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
  h2:
    console:
      enabled: true

---
# application-prod.yml (운영 PostgreSQL)
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:postgresql://db-host:5432/harness_db
    driver-class-name: org.postgresql.Driver
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
  sql:
    init:
      mode: never   # 운영에서는 schema.sql 자동 실행 금지 (Flyway 사용)
```

## 3. 흔한 실수
- 로그 맨 위 예외만 보고 진짜 원인(맨 아래 `Caused by:`)을 놓친다.
- `spring.sql.init.mode=always`를 공통 설정에 넣어 운영 DB에서도 schema.sql이 실행된다.
- H2로만 테스트해 PostgreSQL 전용 분기(`ON CONFLICT` 등)가 검증되지 않는다 — 로컬도 Testcontainers PostgreSQL로 검증하면 안전하다.
- `_databaseId`를 배포 대상 DB 기준이 아닌 다른 값으로 설정해 분기가 어긋난다.
- DAO에 `@Mapper` 누락 또는 `@MapperScan`/`mapper-locations` 경로 불일치로 빈이 안 만들어진다.

## 4. 체크리스트
- [ ] 로그의 가장 마지막 `Caused by:`(진짜 원인)부터 읽었는가
- [ ] schema.sql/data.sql 문법을 검증했는가 (H2: AUTO_INCREMENT → GENERATED IDENTITY 또는 MODE=MySQL, NOW() → CURRENT_TIMESTAMP)
- [ ] datasource.url에 `MODE=MySQL` 포함 여부를 확인했는가
- [ ] Mapper XML에 PostgreSQL 전용 구문(ON CONFLICT/RETURNING/SERIAL)이 있으면 `_databaseId` 분기 또는 MERGE INTO로 대체했는가
- [ ] `@MapperScan` 경로와 `mybatis.mapper-locations`가 실제 DAO/XML 위치와 일치하는가
- [ ] 모든 DAO에 `@Mapper`, 빈 클래스에 `@Service`/`@Component`/`@Repository`가 있는가
- [ ] 운영 프로파일에서 `spring.sql.init.mode=never`로 격리했는가
