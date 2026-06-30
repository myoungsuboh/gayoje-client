---
name: H2 Embedded DB Standalone Guide
description: A pattern for setting up a Spring Boot + MyBatis environment with an H2 in-memory/file DB without an external DB server. Read it when handling a missing Gradle install, Java toolchain auto-download, H2 reserved-word/date-function compatibility, BCrypt hashing, or Spring Security configuration. Keywords: h2-console, jdbc:h2, h2database, in-memory, spring.h2.
rules:
  - "When developing without an external DB, quickly set up with an H2 in-memory/file DB."
  - "Even a PostgreSQL project aligns compatibility mode with H2 MODE=MySQL."
  - "For environments without Gradle installed, handle it via manual Wrapper creation or Foojay toolchain auto-download."
  - "Write schema-h2.sql after checking H2 reserved words and date-function compatibility."
  - "Enable the H2 console only in the local profile."
tags:
  - "h2-console"
  - "jdbc:h2"
  - "h2database"
  - "in-memory"
  - "spring.h2"
---

# 🗄️ H2 Embedded DB Standalone Guide

> Use H2 as the DB inside the Spring Boot application without an external DB server. Read it when quickly setting up a development environment with no separate DB install or when solving H2 reserved-word/date-function compatibility issues.

## 1. Core Principles
- When developing without an external DB, quickly set up with an H2 in-memory/file DB.
- Even a PostgreSQL project aligns compatibility mode with H2 `MODE=MySQL`.
- For environments without Gradle installed, handle it via manual Wrapper creation or Foojay toolchain auto-download.
- Write `schema-h2.sql` after checking H2 reserved words and date-function compatibility.
- Enable the H2 console only in the local profile.

## 2. Rules

### 2-1. Getting Started in an Environment Without Gradle/Maven
If you have only Java and no Gradle, create the Wrapper files directly.

**gradle/wrapper/gradle-wrapper.properties:**
```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.8-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

**gradlew.bat (Windows):**
```bat
@rem Gradle start-up script for Windows
@if "%DEBUG%"=="" @echo off
set DIRNAME=%~dp0
set APP_BASE_NAME=%~n0
set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"
set CLASSPATH=%DIRNAME%gradle\wrapper\gradle-wrapper.jar

"%JAVA_HOME%\bin\java" %DEFAULT_JVM_OPTS% -cp "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
```

> `gradle-wrapper.jar` is auto-included if you copy it from the official Gradle distribution or generate it with Spring Initializr (https://start.spring.io). Using Spring Initializr is recommended.

If the Java version does not match, add the Foojay plugin to `settings.gradle` to auto-download it.
```groovy
// settings.gradle
plugins {
    id 'org.gradle.toolchains.foojay-resolver-convention' version '0.8.0'
}
rootProject.name = 'my-app'
```
```groovy
// build.gradle
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)  // auto-download if absent
    }
}
```
> When building a Java 21 project in an environment with only Java 17 installed, it auto-downloads JDK 21. It is handled automatically on the first run of `./gradlew bootRun`.

### 2-2. Adding the Dependency
```groovy
// build.gradle
dependencies {
    runtimeOnly 'com.h2database:h2'
}
```
```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.h2database</groupId>
    <artifactId>h2</artifactId>
    <scope>runtime</scope>
</dependency>
```

### 2-3. Choosing the H2 Compatibility MODE — `MODE=MySQL` Recommended
Even a PostgreSQL project uses MySQL mode.
```yaml
spring:
  datasource:
    url: jdbc:h2:mem:mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
```

| MODE | AUTO_INCREMENT | NOW() | ON CONFLICT | MERGE INTO |
|------|---------------|-------|-------------|-----------|
| default | ❌ | ❌ | ❌ | ✅ |
| MySQL | ✅ | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ (2.x) | ✅ |

> **Do not use `MODE=PostgreSQL`.** H2 2.x does not support `AUTO_INCREMENT`, and date functions like `FORMATDATETIME` may not work either. Even if you use PostgreSQL as the production DB, always set local H2 to `MODE=MySQL`.

### 2-4. Recommended Full application.yml Configuration
```yaml
spring:
  datasource:
    url: jdbc:h2:mem:mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
      data-locations: classpath:data-h2.sql
      encoding: UTF-8
  h2:
    console:
      enabled: true
      path: /h2-console
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true
    database-id: h2      # for Mapper XML _databaseId branching
```

### 2-5. schema-h2.sql Authoring Rules
```sql
-- schema-h2.sql (based on MODE=MySQL)
CREATE TABLE IF NOT EXISTS users (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(50)  NOT NULL UNIQUE,
    user_name     VARCHAR(100) NOT NULL,
    password    VARCHAR(200) NOT NULL,
    email       VARCHAR(200),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safety_lock (
    target_id   VARCHAR(100) NOT NULL,
    lock_level  VARCHAR(20)  NOT NULL,
    locked_by   VARCHAR(100),
    reason      VARCHAR(500),
    locked_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_safety_lock PRIMARY KEY (target_id)
);
```

### 2-6. H2 Reserved Words — Beware of Column-Name Collisions
Using a reserved word as a column name raises `JdbcSQLSyntaxErrorException`.

| Conflicting column name | Cause | Resolution |
|------------|---------|---------|
| `month` | H2 reserved word | `month_val`, `report_month` |
| `year` | H2 reserved word | `target_year`, `fiscal_year` |
| `day` | H2 reserved word | `day_of_week`, `report_day` |
| `value` | H2 reserved word | `metric_value`, `sensor_value` |
| `key` | H2 reserved word | `item_key`, `config_key` |
| `name` | conflicts in some modes | `user_name`, `item_name` |
| `comment` | H2 reserved word | `remarks`, `note` |

```xml
<!-- ❌ Fails in H2 -->
<select id="getMonthlyTrend" resultType="map">
    SELECT month, count FROM kpi_metric
</select>

<!-- ✅ Work around with backticks (MySQL mode) or an alias -->
<select id="getMonthlyTrend" resultType="map">
    SELECT `month`, count FROM kpi_metric
</select>
<select id="getMonthlyTrend" resultType="map">
    SELECT report_month AS month, cnt FROM kpi_metric
</select>
```
> **Fundamental fix:** do not use reserved words as column names when designing the schema. Add a prefix/suffix like `month` → `report_month`.

### 2-7. H2 Date-Function Compatibility
| PostgreSQL | MySQL | H2 (MODE=MySQL) | Purpose |
|-----------|-------|----------------|------|
| `NOW()` | `NOW()` | `NOW()` ✅ | current time |
| `CURRENT_DATE` | `CURDATE()` | `CURRENT_DATE` ✅ | today's date |
| `date_trunc('month', col)` | `DATE_FORMAT(col,'%Y-%m-01')` | `FORMATDATETIME(col,'yyyy-MM-01')` | start of month |
| `EXTRACT(MONTH FROM col)` | `MONTH(col)` | `MONTH(col)` ✅ | extract month |
| `col + INTERVAL '1 day'` | `DATE_ADD(col, INTERVAL 1 DAY)` | `DATEADD('DAY', 1, col)` | add days |
| `col - INTERVAL '30 days'` | `DATE_SUB(col, INTERVAL 30 DAY)` | `DATEADD('DAY', -30, col)` | subtract days |
| `TO_CHAR(col, 'YYYY-MM')` | `DATE_FORMAT(col,'%Y-%m')` | `FORMATDATETIME(col,'yyyy-MM')` | format date |

```xml
<!-- ✅ Branch date functions with _databaseId -->
<select id="getMonthlyTrend" resultType="map">
    SELECT
        <choose>
            <when test="_databaseId == 'postgresql'">
                TO_CHAR(created_at, 'YYYY-MM') AS report_month
            </when>
            <when test="_databaseId == 'mysql'">
                DATE_FORMAT(created_at, '%Y-%m') AS report_month
            </when>
            <otherwise>
                FORMATDATETIME(created_at, 'yyyy-MM') AS report_month
            </otherwise>
        </choose>,
        COUNT(*) AS cnt
    FROM kpi_metric
    WHERE
        <choose>
            <when test="_databaseId == 'postgresql'">
                created_at >= NOW() - INTERVAL '6 months'
            </when>
            <otherwise>
                created_at >= DATEADD('MONTH', -6, NOW())
            </otherwise>
        </choose>
    GROUP BY report_month
    ORDER BY report_month
</select>
```

### 2-8. UPSERT: MERGE INTO Pattern for H2
`ON CONFLICT ... DO UPDATE` is not supported by H2. Use `MERGE INTO`.
```xml
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
            MERGE INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            KEY (target_id)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
        </otherwise>
    </choose>
</insert>
```

### 2-9. BCrypt Hash — data-h2.sql Test Accounts
A plaintext password fails Spring Security BCrypt verification. Always put in a hash value.

| Plaintext | BCrypt hash (strength=10, example value) |
|------|------------|
| `admin123` | `$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iAt6Z5EH` |
| `password` | `$2a$10$EblZqNptyYvcLm/VwDCVAuBjzZOI7khzdyGPBr08PpIi0na624b8.` |
| `test1234` | `$2a$10$slYQmyNdgTY79B7/9fBVUeIMX5nOELSZ1AUblLBVQ0H/nAknROoJ2` |

> ⚠️ The hashes above are example values. In a real project, use hashes you generate yourself.

```java
// Method 1 — generate with Java code (most reliable)
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class HashGen {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        System.out.println(encoder.encode("admin123"));
    }
}
// Method 2 — IntelliJ debug Evaluate Expression window
new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("admin123")
// Method 3 — temporary dev controller (must remove before production deployment)
@GetMapping("/dev/hash")
public String hash(@RequestParam String pw) {
    return new BCryptPasswordEncoder().encode(pw);
}
```
```sql
-- data-h2.sql (BCrypt hash: put in a value you generated yourself with the methods above)
INSERT INTO users (user_id, user_name, password, email) VALUES
    ('admin', '관리자', '$2a$10$...actual generated hash value...', 'admin@example.com'),
    ('user01', '홍길동', '$2a$10$...actual generated hash value...', 'hong@example.com');
```

### 2-10. H2 Console — Using It with Spring Security
```java
// SecurityConfig.java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/h2-console/**").permitAll()
            .anyRequest().authenticated())
        .csrf(csrf -> csrf.ignoringRequestMatchers("/h2-console/**"))
        .headers(headers -> headers
            .frameOptions(frame -> frame.sameOrigin()));  // the H2 console uses an iframe
    return http.build();
}
```
```
Access: http://localhost:8080/h2-console
JDBC URL: jdbc:h2:mem:mydb  (same as application.yml)
User: sa / Password: (blank)
```

### 2-11. File Mode — Retain Data After Restart
```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;AUTO_SERVER=TRUE
  sql:
    init:
      mode: embedded   # do not re-run schema if the file already exists
```
- `AUTO_SERVER=TRUE`: allows simultaneous access from the IntelliJ DB tab + the app

```gitignore
# .gitignore
data/
*.mv.db
*.trace.db
```

## 3. Common Mistakes
| Error | Cause | Resolution |
|------|------|------|
| `Syntax error ... ON CONFLICT` | PostgreSQL UPSERT syntax | change to `MERGE INTO ... KEY(...)` |
| `Syntax error ... month` | reserved word used as a column name | rename the column (`report_month`) or use backticks |
| `Function "FORMATDATETIME" not found` | not supported in MODE=PostgreSQL | change to `MODE=MySQL` |
| `Function "DATE_TRUNC" not found` | function not supported by H2 | replace with `FORMATDATETIME(col, 'yyyy-MM-01')` |
| `AUTO_INCREMENT not supported` | not supported in MODE=PostgreSQL | change to `MODE=MySQL` |
| Login failure (401) | the data.sql password is plaintext | replace with a BCrypt hash |
| Cannot access H2 console (403) | blocked by Spring Security | add `/h2-console/**` permitAll |
| H2 console screen broken (white screen) | blocked by X-Frame-Options | add `frameOptions(frame -> frame.sameOrigin())` |

## 4. Checklist
- [ ] Did you use `MODE=MySQL` in the H2 URL (no PostgreSQL mode)?
- [ ] Do column names not collide with H2 reserved words (month·year·value etc.)?
- [ ] Did you write date functions with H2-compatible functions or `_databaseId` branching?
- [ ] Did you handle UPSERT with `MERGE INTO ... KEY(...)`?
- [ ] Is the data-h2.sql password a BCrypt hash value?
- [ ] Is the H2 console enabled only in the local profile, with a Security exception configured?

### Selection Criteria Summary
| Situation | Recommended mode |
|------|---------|
| unit tests, quick prototype | in-memory (`jdbc:h2:mem:mydb;MODE=MySQL`) |
| local development, retain data after restart | file (`jdbc:h2:file:./data/mydb;MODE=MySQL`) |
| production environment | PostgreSQL / MySQL (external DB) |
