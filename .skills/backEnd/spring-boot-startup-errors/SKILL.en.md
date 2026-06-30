---
name: Spring Boot Startup Error Patterns and Solutions
description: Causes and fixes for common Spring Boot startup issues — Bean creation failures, H2↔MySQL/PostgreSQL syntax compatibility errors, unresolved MyBatis sqlSessionTemplate, and schema.sql execution failures. Read this when the app fails to start or when debugging BeanCreationException or DB syntax errors. Keywords: BeanCreationException, NoSuchBeanDefinitionException, UnsatisfiedDependencyException, sqlSessionTemplate, @Configuration, H2, schema.sql.
rules:
  - "Startup errors are mostly a Cascade Failure structure. You must read from the very last Caused by: in the log to find the true cause."
  - "Reconcile H2 vs MySQL/PostgreSQL syntax differences with the H2 MODE setting."
  - "Branch dialect syntax such as AUTO_INCREMENT and UPSERT according to the target DB."
  - "For Bean creation failures, check for missing dependencies and circular references first."
  - "For unresolved MyBatis sqlSessionTemplate, inspect DataSource/schema initialization and the mapper-locations path."
  - "Separate schema files per environment to prevent conflicts at startup."
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

# 🚨 Spring Boot Startup Error Patterns and Solutions

> Quickly find the true cause of a startup failure and fix DB syntax / bean dependency errors. Read this when the app won't start or when debugging BeanCreationException or DB syntax errors.

## 1. Core Principles
- Startup errors are mostly a **Cascade Failure** structure. You must read from the very last `Caused by:` in the log to find the true cause.
- Reconcile H2 vs MySQL/PostgreSQL syntax differences with the H2 `MODE` setting.
- Branch dialect syntax such as `AUTO_INCREMENT` and UPSERT according to the target DB.
- For Bean creation failures, check for missing dependencies and circular references first.
- For unresolved MyBatis `sqlSessionTemplate`, inspect DataSource/schema initialization and the `mapper-locations` path.
- Separate schema files per environment to prevent conflicts at startup.

Cascade failure example — the last `Caused by:` is the true cause:
```
Unable to start web server
  └─ UnsatisfiedDependencyException (JwtAuthenticationFilter)
       └─ UnsatisfiedDependencyException (UserDetailsServiceImpl)
            └─ BeanCreationException (userMapper)
                 └─ Cannot resolve 'sqlSessionTemplate'  ← this is the problem
                      └─ ScriptStatementFailedException  ← the true cause
                           └─ H2 SQL syntax error        ← it starts here
```

## 2. Rules

### 2-1. H2 ↔ MySQL/PostgreSQL SQL syntax mismatch
The DDL syntax of local-test H2 differs from the real DB (MySQL, PostgreSQL), causing `schema.sql` execution to fail. From H2 2.x onward, `AUTO_INCREMENT` does not work without MySQL compatibility mode.

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"CREATE TABLE ... id BIGINT [*]AUTO_INCREMENT PRIMARY KEY ..."
expected "ARRAY, INVISIBLE, NOT NULL, DEFAULT, GENERATED ..."
```

| Syntax | MySQL/MariaDB | PostgreSQL | H2 default mode |
|------|--------------|------------|-------------|
| Auto increment | `BIGINT AUTO_INCREMENT` | `BIGINT GENERATED ALWAYS AS IDENTITY` | `BIGINT AUTO_INCREMENT` ❌ (2.x) |
| Current time | `NOW()` | `NOW()` | `CURRENT_TIMESTAMP` recommended |
| Unlimited string length | `TEXT` | `TEXT` | `VARCHAR` recommended |

✅ Solution 1 — Enable MySQL compatibility mode in H2 (recommended):
```yaml
# application-local.yml (for local development)
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  h2:
    console:
      enabled: true   # accessible at localhost:8080/h2-console
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
```
> With `MODE=MySQL` set, most MySQL syntax such as `AUTO_INCREMENT`, `NOW()`, and `IF NOT EXISTS` is allowed.

✅ Solution 2 — Separate H2-specific schema files:
```
src/main/resources/
├── schema-h2.sql       ← H2 only (local development)
├── schema-mysql.sql    ← MySQL/MariaDB only
└── schema-pgsql.sql    ← PostgreSQL only
```
```sql
-- schema-h2.sql (H2 native syntax)
CREATE TABLE IF NOT EXISTS asset_master (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- instead of AUTO_INCREMENT
    tag_id      VARCHAR(100)  NOT NULL UNIQUE,
    asset_name  VARCHAR(200)  NOT NULL,
    status      VARCHAR(20)   DEFAULT 'ACTIVE',
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,           -- instead of NOW()
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```
```yaml
# application-local.yml
spring:
  sql:
    init:
      schema-locations: classpath:schema-h2.sql  # specify the per-environment file
```

### 2-2. `Cannot resolve reference to bean 'sqlSessionTemplate'`
This is not a MyBatis configuration problem but **a cascading result of DataSource or schema initialization failure**. `sqlSessionTemplate` is created only when the DataSource is healthy, so if the DataSource fails this error always follows.

```
# When you see this error in the log, always check the Caused by further down
Cannot resolve reference to bean 'sqlSessionTemplate'
                                           ↓
Caused by: ScriptStatementFailedException  ← schema.sql execution failed
Caused by: BeanCreationException (dataSourceScriptDatabaseInitializer)
```

✅ Solution: ① Fix the schema.sql SQL syntax error (see 2-1) ② Check the MyBatis configuration (if it really is a configuration problem):
```yaml
# application.yml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml   # XML file path
  configuration:
    map-underscore-to-camel-case: true
```
```java
// HarnessApplication.java — check the @MapperScan location
@SpringBootApplication
@MapperScan("com.harness.src.*.dao")   // must exactly match the DAO package path
public class HarnessApplication { ... }
```

### 2-3. `UnsatisfiedDependencyException` — unsatisfied Bean dependency
```
Error creating bean 'A': Unsatisfied dependency
  → Error creating bean 'B': Unsatisfied dependency
      → Error creating bean 'C': Cannot resolve bean 'X'
```
Reading order: trace back in the order **C → B → A**.

| Cause | Symptom | Fix |
|------|------|------|
| Missing `@Mapper` | No Mapper bean | Add `@Mapper` to the DAO interface |
| Wrong `@MapperScan` path | Only certain package Mappers fail | Enter the package path exactly |
| schema.sql execution failure | No `sqlSessionTemplate` | Fix the SQL syntax |
| Circular dependency | `The dependencies of some beans form a cycle` | `@Lazy` or restructure |
| Missing `@Service`/`@Component` | No service bean | Add the annotation |

### 2-4. H2 `schema.sql` auto-execution setting
```yaml
# application-local.yml
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1
    username: sa
    password:

  sql:
    init:
      mode: always                              # always: always run / embedded: run only for embedded DBs like H2
      schema-locations: classpath:schema-h2.sql  # DDL script
      data-locations: classpath:data-h2.sql      # initial data (optional)
      encoding: UTF-8

  h2:
    console:
      enabled: true
      path: /h2-console   # inspect DB contents in the browser: http://localhost:8080/h2-console
```
> **Caution:** Setting `spring.sql.init.mode=always` may also run it on the production DB. Always put local-only settings in `application-local.yml` only and isolate them with `spring.profiles.active=local`.

### 2-5. PostgreSQL-only DML syntax not supported by H2
`ON CONFLICT ... DO UPDATE` (UPSERT) does not work in H2 even with `MODE=PostgreSQL`.

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"INSERT INTO safety_lock ... ON CONFLICT (target_id) DO UPDATE ..."
```
```xml
<!-- ❌ Fails in H2 (PostgreSQL only) -->
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

✅ Solution — branch per DB with MyBatis `<choose>`. Branch by DB type using the `_databaseId` variable in XML.
```xml
<!-- ✅ Works on both H2 / PostgreSQL -->
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
            <!-- H2 / MySQL: use MERGE INTO -->
            MERGE INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            KEY (target_id)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
        </otherwise>
    </choose>
</insert>
```
```yaml
# application.yml — enable _databaseId (specify the production DB type)
mybatis:
  configuration:
    database-id: postgresql   # h2, mysql, postgresql, oracle
```
```yaml
# application-local.yml — local H2 profile
mybatis:
  configuration:
    database-id: h2
```

PostgreSQL → H2 SQL conversion quick reference:

| PostgreSQL syntax | H2 replacement | Note |
|----------------|------------|------|
| `ON CONFLICT ... DO UPDATE` | `MERGE INTO ... KEY (...)` | H2 UPSERT |
| `INSERT ... RETURNING id` | use `<selectKey>` | MyBatis selectKey |
| `SERIAL` / `BIGSERIAL` | `BIGINT AUTO_INCREMENT` (MODE=MySQL) or `BIGINT GENERATED ALWAYS AS IDENTITY` | |
| `ILIKE` | `LOWER(col) LIKE LOWER(?)` | case-insensitive search |
| `::TEXT`, `::INT` (cast) | `CAST(col AS VARCHAR)` | type casting |
| `NOW()` | `CURRENT_TIMESTAMP` | NOW() is possible with MODE=MySQL |
| `TRUE` / `FALSE` | `TRUE` / `FALSE` | supported by H2 (no problem) |

### 2-6. Separate DataSource per profile (recommended)
A safe way to use H2 locally and the real DB in production.
```yaml
# application.yml (common)
spring:
  profiles:
    active: local   # default local (override with env var on production deployment)
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true

---
# application-local.yml (local H2)
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
# application-prod.yml (production PostgreSQL)
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
      mode: never   # do not auto-run schema.sql in production (use Flyway)
```

## 3. Common Mistakes
- Looking only at the exception at the top of the log and missing the true cause (the bottom `Caused by:`).
- Putting `spring.sql.init.mode=always` in the common config so schema.sql also runs on the production DB.
- Testing only with H2 so the PostgreSQL-only branches (`ON CONFLICT`, etc.) go unverified — verifying locally with Testcontainers PostgreSQL too is safe.
- Setting `_databaseId` to a value other than the deployment target DB so the branching goes wrong.
- The bean is not created because of a missing `@Mapper` on the DAO or a mismatch in the `@MapperScan`/`mapper-locations` path.

## 4. Checklist
- [ ] Did you read from the very last `Caused by:` (the true cause) in the log?
- [ ] Did you verify the schema.sql/data.sql syntax (H2: AUTO_INCREMENT → GENERATED IDENTITY or MODE=MySQL, NOW() → CURRENT_TIMESTAMP)?
- [ ] Did you check whether datasource.url includes `MODE=MySQL`?
- [ ] If the Mapper XML has PostgreSQL-only syntax (ON CONFLICT/RETURNING/SERIAL), did you replace it with a `_databaseId` branch or MERGE INTO?
- [ ] Do the `@MapperScan` path and `mybatis.mapper-locations` match the actual DAO/XML locations?
- [ ] Do all DAOs have `@Mapper`, and do bean classes have `@Service`/`@Component`/`@Repository`?
- [ ] Did you isolate the production profile with `spring.sql.init.mode=never`?
