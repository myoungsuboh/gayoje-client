---
name: H2 内嵌 DB 独立使用指南
description: 在没有外部 DB 服务器的情况下，使用 H2 内存/文件 DB 搭建 Spring Boot + MyBatis 环境的模式。在应对未安装 Gradle、Java toolchain 自动下载、H2 保留字与日期函数兼容性、BCrypt 哈希、Spring Security 配置等情况时阅读。关键词: h2-console, jdbc:h2, h2database, in-memory, spring.h2。
rules:
  - "在没有外部 DB 进行开发时，用 H2 内存/文件 DB 快速搭建。"
  - "即使是 PostgreSQL 项目，也用 H2 MODE=MySQL 来对齐兼容模式。"
  - "未安装 Gradle 的环境，通过手动创建 Wrapper 或 Foojay toolchain 自动下载来应对。"
  - "编写 schema-h2.sql 时要确认 H2 保留字与日期函数的兼容性。"
  - "H2 控制台只在 local profile 中启用。"
tags:
  - "h2-console"
  - "jdbc:h2"
  - "h2database"
  - "in-memory"
  - "spring.h2"
---

# 🗄️ H2 内嵌 DB 独立使用指南

> 在没有外部 DB 服务器的情况下，在 Spring Boot 应用内部用 H2 作为 DB。在无需另外安装 DB 而快速搭建开发环境，或解决 H2 保留字、日期函数兼容性问题时阅读。

## 1. 核心原则
- 在没有外部 DB 进行开发时，用 H2 内存/文件 DB 快速搭建。
- 即使是 PostgreSQL 项目，也用 H2 `MODE=MySQL` 来对齐兼容模式。
- 未安装 Gradle 的环境，通过手动创建 Wrapper 或 Foojay toolchain 自动下载来应对。
- 编写 `schema-h2.sql` 时要确认 H2 保留字与日期函数的兼容性。
- H2 控制台只在 local profile 中启用。

## 2. 规则

### 2-1. 在未安装 Gradle/Maven 的环境中开始
若只有 Java 而没有 Gradle，则直接手动创建 Wrapper 文件。

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

> `gradle-wrapper.jar` 可从 Gradle 官方发行版复制，或用 Spring Initializr(https://start.spring.io)生成时会自动包含。推荐使用 Spring Initializr。

若 Java 版本不匹配，可在 `settings.gradle` 中添加 Foojay 插件以自动下载。
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
> 在只安装了 Java 17 的环境中构建 Java 21 项目时，会自动下载 JDK 21。首次执行 `./gradlew bootRun` 时自动处理。

### 2-2. 添加依赖
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

### 2-3. 选择 H2 兼容 MODE — 推荐 `MODE=MySQL`
即使是 PostgreSQL 项目也使用 MySQL 模式。
```yaml
spring:
  datasource:
    url: jdbc:h2:mem:mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
```

| MODE | AUTO_INCREMENT | NOW() | ON CONFLICT | MERGE INTO |
|------|---------------|-------|-------------|-----------|
| 默认 | ❌ | ❌ | ❌ | ✅ |
| MySQL | ✅ | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ (2.x) | ✅ |

> **不要使用 `MODE=PostgreSQL`。** H2 2.x 不支持 `AUTO_INCREMENT`，`FORMATDATETIME` 等日期函数也可能无法工作。即使用 PostgreSQL 作为生产 DB，本地 H2 也始终设为 `MODE=MySQL`。

### 2-4. 推荐的完整 application.yml 配置
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

### 2-5. schema-h2.sql 编写规则
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

### 2-6. H2 保留字 — 注意列名冲突
将保留字用作列名会引发 `JdbcSQLSyntaxErrorException`。

| 冲突列名 | 原因 | 解决 |
|------------|---------|---------|
| `month` | H2 保留字 | `month_val`, `report_month` |
| `year` | H2 保留字 | `target_year`, `fiscal_year` |
| `day` | H2 保留字 | `day_of_week`, `report_day` |
| `value` | H2 保留字 | `metric_value`, `sensor_value` |
| `key` | H2 保留字 | `item_key`, `config_key` |
| `name` | 部分模式下冲突 | `user_name`, `item_name` |
| `comment` | H2 保留字 | `remarks`, `note` |

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
> **根本解决方案:** 在设计 schema 时不要把保留字用作列名。像 `month` → `report_month` 那样加上前缀/后缀。

### 2-7. H2 日期函数兼容性
| PostgreSQL | MySQL | H2 (MODE=MySQL) | 用途 |
|-----------|-------|----------------|------|
| `NOW()` | `NOW()` | `NOW()` ✅ | 当前时刻 |
| `CURRENT_DATE` | `CURDATE()` | `CURRENT_DATE` ✅ | 今天日期 |
| `date_trunc('month', col)` | `DATE_FORMAT(col,'%Y-%m-01')` | `FORMATDATETIME(col,'yyyy-MM-01')` | 月初 |
| `EXTRACT(MONTH FROM col)` | `MONTH(col)` | `MONTH(col)` ✅ | 提取月份 |
| `col + INTERVAL '1 day'` | `DATE_ADD(col, INTERVAL 1 DAY)` | `DATEADD('DAY', 1, col)` | 日期加 |
| `col - INTERVAL '30 days'` | `DATE_SUB(col, INTERVAL 30 DAY)` | `DATEADD('DAY', -30, col)` | 日期减 |
| `TO_CHAR(col, 'YYYY-MM')` | `DATE_FORMAT(col,'%Y-%m')` | `FORMATDATETIME(col,'yyyy-MM')` | 日期格式化 |

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

### 2-8. UPSERT: 用于 H2 的 MERGE INTO 模式
H2 不支持 `ON CONFLICT ... DO UPDATE`。改用 `MERGE INTO`。
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

### 2-9. BCrypt 哈希 — data-h2.sql 测试账号
明文密码在 Spring Security BCrypt 校验中会失败。务必填入哈希值。

| 明文 | BCrypt 哈希 (strength=10, 示例值) |
|------|------------|
| `admin123` | `$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iAt6Z5EH` |
| `password` | `$2a$10$EblZqNptyYvcLm/VwDCVAuBjzZOI7khzdyGPBr08PpIi0na624b8.` |
| `test1234` | `$2a$10$slYQmyNdgTY79B7/9fBVUeIMX5nOELSZ1AUblLBVQ0H/nAknROoJ2` |

> ⚠️ 上面的哈希为示例值。在实际项目中请使用自己生成的哈希。

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

### 2-10. H2 控制台 — 与 Spring Security 一起使用
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

### 2-11. 文件模式 — 重启后保留数据
```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;AUTO_SERVER=TRUE
  sql:
    init:
      mode: embedded   # 파일이 이미 있으면 schema 재실행 안 함
```
- `AUTO_SERVER=TRUE`: 可同时从 IntelliJ DB 标签页和应用连接

```gitignore
# .gitignore
data/
*.mv.db
*.trace.db
```

## 3. 常见错误
| 错误 | 原因 | 解决 |
|------|------|------|
| `Syntax error ... ON CONFLICT` | PostgreSQL UPSERT 语法 | 改为 `MERGE INTO ... KEY(...)` |
| `Syntax error ... month` | 把保留字用作列名 | 修改列名(`report_month`)或用反引号 |
| `Function "FORMATDATETIME" not found` | MODE=PostgreSQL 不支持 | 改为 `MODE=MySQL` |
| `Function "DATE_TRUNC" not found` | H2 不支持的函数 | 用 `FORMATDATETIME(col, 'yyyy-MM-01')` 代替 |
| `AUTO_INCREMENT not supported` | MODE=PostgreSQL 不支持 | 改为 `MODE=MySQL` |
| 登录失败 (401) | data.sql 密码为明文 | 替换为 BCrypt 哈希 |
| 无法访问 H2 控制台 (403) | 被 Spring Security 拦截 | 添加 `/h2-console/**` permitAll |
| H2 控制台页面错乱 (白屏) | 被 X-Frame-Options 拦截 | 添加 `frameOptions(frame -> frame.sameOrigin())` |

## 4. 检查清单
- [ ] H2 URL 是否使用了 `MODE=MySQL`(未使用 PostgreSQL 模式)
- [ ] 列名是否与 H2 保留字(month、year、value 等)不冲突
- [ ] 日期函数是否用 H2 兼容函数或 `_databaseId` 分支编写
- [ ] UPSERT 是否用 `MERGE INTO ... KEY(...)` 处理
- [ ] data-h2.sql 的密码是否为 BCrypt 哈希值
- [ ] H2 控制台是否只在 local profile 中启用并配置了 Security 例外

### 选择标准摘要
| 场景 | 推荐模式 |
|------|---------|
| 单元测试、快速原型 | 内存 (`jdbc:h2:mem:mydb;MODE=MySQL`) |
| 本地开发、重启后保留数据 | 文件 (`jdbc:h2:file:./data/mydb;MODE=MySQL`) |
| 生产环境 | PostgreSQL / MySQL (外部 DB) |
