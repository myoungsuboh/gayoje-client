---
name: H2 내장 DB 단독 사용 가이드
description: 외부 DB 서버 없이 H2 인메모리/파일 DB로 Spring Boot + MyBatis 환경을 구성하는 패턴. Gradle 미설치 대응, Java toolchain 자동 다운로드, H2 예약어·날짜함수 호환성, BCrypt 해시, Spring Security 설정을 정할 때 읽는다. 키워드: h2-console, jdbc:h2, h2database, in-memory, spring.h2.
rules:
  - "외부 DB 없이 개발할 때 H2 인메모리/파일 DB로 빠르게 구성한다."
  - "PostgreSQL 프로젝트도 H2 MODE=MySQL로 호환 모드를 맞춘다."
  - "Gradle 미설치 환경은 Wrapper 수동 생성이나 Foojay toolchain 자동 다운로드로 대응한다."
  - "schema-h2.sql은 H2 예약어와 날짜 함수 호환성을 확인해 작성한다."
  - "H2 콘솔은 local 프로파일에서만 활성화한다."
tags:
  - "h2-console"
  - "jdbc:h2"
  - "h2database"
  - "in-memory"
  - "spring.h2"
---

# 🗄️ H2 내장 DB 단독 사용 가이드

> 외부 DB 서버 없이 Spring Boot 애플리케이션 내부에서 H2를 DB로 쓴다. 별도 DB 설치 없이 빠르게 개발 환경을 구성하거나 H2 예약어·날짜 함수 호환성 문제를 해결할 때 읽는다.

## 1. 핵심 원칙
- 외부 DB 없이 개발할 때 H2 인메모리/파일 DB로 빠르게 구성한다.
- PostgreSQL 프로젝트도 H2 `MODE=MySQL`로 호환 모드를 맞춘다.
- Gradle 미설치 환경은 Wrapper 수동 생성이나 Foojay toolchain 자동 다운로드로 대응한다.
- `schema-h2.sql`은 H2 예약어와 날짜 함수 호환성을 확인해 작성한다.
- H2 콘솔은 local 프로파일에서만 활성화한다.

## 2. 규칙

### 2-1. Gradle/Maven 미설치 환경에서 시작하기
Java만 있고 Gradle이 없으면 Wrapper 파일을 직접 만든다.

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

> `gradle-wrapper.jar`는 Gradle 공식 배포판에서 복사하거나 Spring Initializr(https://start.spring.io)로 생성하면 자동 포함된다. Spring Initializr 사용을 권장한다.

Java 버전이 맞지 않으면 `settings.gradle`에 Foojay 플러그인을 추가해 자동 다운로드한다.
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
        languageVersion = JavaLanguageVersion.of(21)  // 없으면 자동 다운로드
    }
}
```
> Java 17만 설치된 환경에서 Java 21 프로젝트를 빌드할 때 자동으로 JDK 21을 다운로드한다. `./gradlew bootRun` 첫 실행 시 자동 처리된다.

### 2-2. 의존성 추가
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

### 2-3. H2 호환 MODE 선택 — `MODE=MySQL` 권장
PostgreSQL 프로젝트도 MySQL 모드를 사용한다.
```yaml
spring:
  datasource:
    url: jdbc:h2:mem:mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
```

| MODE | AUTO_INCREMENT | NOW() | ON CONFLICT | MERGE INTO |
|------|---------------|-------|-------------|-----------|
| 기본 | ❌ | ❌ | ❌ | ✅ |
| MySQL | ✅ | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ (2.x) | ✅ |

> **`MODE=PostgreSQL`은 사용하지 않는다.** H2 2.x에서 `AUTO_INCREMENT`를 지원하지 않고, `FORMATDATETIME` 같은 날짜 함수도 동작하지 않을 수 있다. PostgreSQL을 운영 DB로 쓰더라도 로컬 H2는 항상 `MODE=MySQL`로 설정한다.

### 2-4. 권장 application.yml 전체 구성
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
    database-id: h2      # Mapper XML _databaseId 분기용
```

### 2-5. schema-h2.sql 작성 규칙
```sql
-- schema-h2.sql (MODE=MySQL 기준)
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

### 2-6. H2 예약어 — 컬럼명 충돌 주의
예약어를 컬럼명으로 쓰면 `JdbcSQLSyntaxErrorException`이 발생한다.

| 충돌 컬럼명 | 원인 | 해결 |
|------------|---------|---------|
| `month` | H2 예약어 | `month_val`, `report_month` |
| `year` | H2 예약어 | `target_year`, `fiscal_year` |
| `day` | H2 예약어 | `day_of_week`, `report_day` |
| `value` | H2 예약어 | `metric_value`, `sensor_value` |
| `key` | H2 예약어 | `item_key`, `config_key` |
| `name` | 일부 모드 충돌 | `user_name`, `item_name` |
| `comment` | H2 예약어 | `remarks`, `note` |

```xml
<!-- ❌ H2에서 실패 -->
<select id="getMonthlyTrend" resultType="map">
    SELECT month, count FROM kpi_metric
</select>

<!-- ✅ 백틱(MySQL 모드) 또는 alias로 우회 -->
<select id="getMonthlyTrend" resultType="map">
    SELECT `month`, count FROM kpi_metric
</select>
<select id="getMonthlyTrend" resultType="map">
    SELECT report_month AS month, cnt FROM kpi_metric
</select>
```
> **근본 해결책:** schema 설계 시 예약어를 컬럼명으로 쓰지 않는다. `month` → `report_month`처럼 접두/접미어를 붙인다.

### 2-7. H2 날짜 함수 호환성
| PostgreSQL | MySQL | H2 (MODE=MySQL) | 용도 |
|-----------|-------|----------------|------|
| `NOW()` | `NOW()` | `NOW()` ✅ | 현재 시각 |
| `CURRENT_DATE` | `CURDATE()` | `CURRENT_DATE` ✅ | 오늘 날짜 |
| `date_trunc('month', col)` | `DATE_FORMAT(col,'%Y-%m-01')` | `FORMATDATETIME(col,'yyyy-MM-01')` | 월 시작일 |
| `EXTRACT(MONTH FROM col)` | `MONTH(col)` | `MONTH(col)` ✅ | 월 추출 |
| `col + INTERVAL '1 day'` | `DATE_ADD(col, INTERVAL 1 DAY)` | `DATEADD('DAY', 1, col)` | 날짜 더하기 |
| `col - INTERVAL '30 days'` | `DATE_SUB(col, INTERVAL 30 DAY)` | `DATEADD('DAY', -30, col)` | 날짜 빼기 |
| `TO_CHAR(col, 'YYYY-MM')` | `DATE_FORMAT(col,'%Y-%m')` | `FORMATDATETIME(col,'yyyy-MM')` | 날짜 포맷 |

```xml
<!-- ✅ _databaseId로 날짜 함수 분기 -->
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

### 2-8. UPSERT: H2용 MERGE INTO 패턴
`ON CONFLICT ... DO UPDATE`는 H2 미지원. `MERGE INTO`를 사용한다.
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

### 2-9. BCrypt 해시 — data-h2.sql 테스트 계정
평문 비밀번호는 Spring Security BCrypt 검증에서 실패한다. 반드시 해시값을 넣는다.

| 평문 | BCrypt 해시 (strength=10, 예시값) |
|------|------------|
| `admin123` | `$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iAt6Z5EH` |
| `password` | `$2a$10$EblZqNptyYvcLm/VwDCVAuBjzZOI7khzdyGPBr08PpIi0na624b8.` |
| `test1234` | `$2a$10$slYQmyNdgTY79B7/9fBVUeIMX5nOELSZ1AUblLBVQ0H/nAknROoJ2` |

> ⚠️ 위 해시는 예시값이다. 실제 프로젝트에서는 직접 생성한 해시를 사용한다.

```java
// 방법 1 — Java 코드로 생성 (가장 확실)
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class HashGen {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        System.out.println(encoder.encode("admin123"));
    }
}
// 방법 2 — IntelliJ 디버그 Evaluate Expression 창
new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("admin123")
// 방법 3 — 개발용 임시 컨트롤러 (운영 배포 전 반드시 제거)
@GetMapping("/dev/hash")
public String hash(@RequestParam String pw) {
    return new BCryptPasswordEncoder().encode(pw);
}
```
```sql
-- data-h2.sql (BCrypt 해시: 위 방법으로 직접 생성한 값을 넣을 것)
INSERT INTO users (user_id, user_name, password, email) VALUES
    ('admin', '관리자', '$2a$10$...실제생성한해시값...', 'admin@example.com'),
    ('user01', '홍길동', '$2a$10$...실제생성한해시값...', 'hong@example.com');
```

### 2-10. H2 콘솔 — Spring Security와 함께 사용
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
            .frameOptions(frame -> frame.sameOrigin()));  // H2 콘솔은 iframe 사용
    return http.build();
}
```
```
접속: http://localhost:8080/h2-console
JDBC URL: jdbc:h2:mem:mydb  (application.yml과 동일하게)
User: sa / Password: (빈칸)
```

### 2-11. 파일 모드 — 재기동 후 데이터 유지
```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;AUTO_SERVER=TRUE
  sql:
    init:
      mode: embedded   # 파일이 이미 있으면 schema 재실행 안 함
```
- `AUTO_SERVER=TRUE`: IntelliJ DB 탭 + 앱 동시 접속 가능

```gitignore
# .gitignore
data/
*.mv.db
*.trace.db
```

## 3. 흔한 실수
| 오류 | 원인 | 해결 |
|------|------|------|
| `Syntax error ... ON CONFLICT` | PostgreSQL UPSERT 구문 | `MERGE INTO ... KEY(...)` 로 변경 |
| `Syntax error ... month` | 예약어를 컬럼명으로 사용 | 컬럼명 변경(`report_month`) 또는 백틱 |
| `Function "FORMATDATETIME" not found` | MODE=PostgreSQL 미지원 | `MODE=MySQL`로 변경 |
| `Function "DATE_TRUNC" not found` | H2 미지원 함수 | `FORMATDATETIME(col, 'yyyy-MM-01')` 로 대체 |
| `AUTO_INCREMENT not supported` | MODE=PostgreSQL 미지원 | `MODE=MySQL`로 변경 |
| 로그인 실패 (401) | data.sql 비밀번호가 평문 | BCrypt 해시로 교체 |
| H2 콘솔 접속 불가 (403) | Spring Security 차단 | `/h2-console/**` permitAll 추가 |
| H2 콘솔 화면 깨짐 (흰 화면) | X-Frame-Options 차단 | `frameOptions(frame -> frame.sameOrigin())` 추가 |

## 4. 체크리스트
- [ ] H2 URL에 `MODE=MySQL`을 사용했는가 (PostgreSQL 모드 미사용)
- [ ] 컬럼명이 H2 예약어(month·year·value 등)와 충돌하지 않는가
- [ ] 날짜 함수를 H2 호환 함수 또는 `_databaseId` 분기로 작성했는가
- [ ] UPSERT를 `MERGE INTO ... KEY(...)`로 처리했는가
- [ ] data-h2.sql 비밀번호가 BCrypt 해시값인가
- [ ] H2 콘솔이 local 프로파일에서만 활성화되고 Security 예외가 설정됐는가

### 선택 기준 요약
| 상황 | 권장 모드 |
|------|---------|
| 단위 테스트, 빠른 프로토타입 | 인메모리 (`jdbc:h2:mem:mydb;MODE=MySQL`) |
| 로컬 개발, 재기동 후 데이터 유지 | 파일 (`jdbc:h2:file:./data/mydb;MODE=MySQL`) |
| 운영 환경 | PostgreSQL / MySQL (외부 DB) |
