---
name: Spring Boot 启动错误模式及解决方案
description: Spring Boot 启动时常见的 Bean 创建失败、H2↔MySQL/PostgreSQL 语法兼容错误、MyBatis sqlSessionTemplate 未解析、schema.sql 执行失败的原因与解决方法。当应用启动失败，或调试 BeanCreationException、DB 语法错误时阅读。关键词：BeanCreationException, NoSuchBeanDefinitionException, UnsatisfiedDependencyException, sqlSessionTemplate, @Configuration, H2, schema.sql。
rules:
  - "启动错误大多是连锁失败（Cascade Failure）结构。必须从日志最末尾的 Caused by: 开始读，才能找到真正的原因。"
  - "用 H2 的 MODE 设置来兼容 H2 与 MySQL/PostgreSQL 的语法差异。"
  - "AUTO_INCREMENT、UPSERT 这类 dialect 语法要按目标 DB 进行分支。"
  - "Bean 创建失败时，先确认依赖缺失和循环引用。"
  - "MyBatis sqlSessionTemplate 未解析时，检查 DataSource/schema 初始化和 mapper-locations 路径。"
  - "按环境分离 schema 文件，防止启动时冲突。"
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

# 🚨 Spring Boot 启动错误模式及解决方案

> 快速找到启动失败的真正原因，并修复 DB 语法/Bean 依赖错误。当应用无法启动，或调试 BeanCreationException、DB 语法错误时阅读。

## 1. 核心原则
- 启动错误大多是**连锁失败（Cascade Failure）**结构。必须从日志最末尾的 `Caused by:` 开始读，才能找到真正的原因。
- 用 H2 的 `MODE` 设置来兼容 H2 与 MySQL/PostgreSQL 的语法差异。
- `AUTO_INCREMENT`、UPSERT 这类 dialect 语法要按目标 DB 进行分支。
- Bean 创建失败时，先确认依赖缺失和循环引用。
- MyBatis `sqlSessionTemplate` 未解析时，检查 DataSource/schema 初始化和 `mapper-locations` 路径。
- 按环境分离 schema 文件，防止启动时冲突。

连锁失败示例 — 最后的 `Caused by:` 才是真正的原因：
```
Unable to start web server
  └─ UnsatisfiedDependencyException (JwtAuthenticationFilter)
       └─ UnsatisfiedDependencyException (UserDetailsServiceImpl)
            └─ BeanCreationException (userMapper)
                 └─ Cannot resolve 'sqlSessionTemplate'  ← 这是问题所在
                      └─ ScriptStatementFailedException  ← 真正的原因
                           └─ H2 SQL syntax error        ← 从这里开始
```

## 2. 规则

### 2-1. H2 ↔ MySQL/PostgreSQL SQL 语法不一致
本地测试用的 H2 与实际 DB（MySQL, PostgreSQL）的 DDL 语法不同，导致 `schema.sql` 执行失败。从 H2 2.x 开始，`AUTO_INCREMENT` 在没有 MySQL 兼容模式时无法工作。

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"CREATE TABLE ... id BIGINT [*]AUTO_INCREMENT PRIMARY KEY ..."
expected "ARRAY, INVISIBLE, NOT NULL, DEFAULT, GENERATED ..."
```

| 语法 | MySQL/MariaDB | PostgreSQL | H2 默认模式 |
|------|--------------|------------|-------------|
| 自动递增 | `BIGINT AUTO_INCREMENT` | `BIGINT GENERATED ALWAYS AS IDENTITY` | `BIGINT AUTO_INCREMENT` ❌ (2.x) |
| 当前时间 | `NOW()` | `NOW()` | 推荐 `CURRENT_TIMESTAMP` |
| 不限长度的字符串 | `TEXT` | `TEXT` | 推荐使用 `VARCHAR` |

✅ 解决方案 1 — 在 H2 中启用 MySQL 兼容模式（推荐）：
```yaml
# application-local.yml (本地开发用)
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  h2:
    console:
      enabled: true   # 可访问 localhost:8080/h2-console
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
```
> 设置 `MODE=MySQL` 后，`AUTO_INCREMENT`、`NOW()`、`IF NOT EXISTS` 等大部分 MySQL 语法都会被允许。

✅ 解决方案 2 — 分离 H2 专用 schema 文件：
```
src/main/resources/
├── schema-h2.sql       ← H2 专用 (本地开发)
├── schema-mysql.sql    ← MySQL/MariaDB 专用
└── schema-pgsql.sql    ← PostgreSQL 专用
```
```sql
-- schema-h2.sql (H2 原生语法)
CREATE TABLE IF NOT EXISTS asset_master (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 代替 AUTO_INCREMENT
    tag_id      VARCHAR(100)  NOT NULL UNIQUE,
    asset_name  VARCHAR(200)  NOT NULL,
    status      VARCHAR(20)   DEFAULT 'ACTIVE',
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,           -- 代替 NOW()
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```
```yaml
# application-local.yml
spring:
  sql:
    init:
      schema-locations: classpath:schema-h2.sql  # 指定按环境的文件
```

### 2-2. `Cannot resolve reference to bean 'sqlSessionTemplate'`
这不是 MyBatis 配置问题，而是 **DataSource 或 schema 初始化失败的连锁结果**。`sqlSessionTemplate` 只有在 DataSource 正常时才会创建，所以一旦 DataSource 失败，必然伴随此错误。

```
# 在日志中看到此错误时，务必查看更下方的 Caused by
Cannot resolve reference to bean 'sqlSessionTemplate'
                                           ↓
Caused by: ScriptStatementFailedException  ← schema.sql 执行失败
Caused by: BeanCreationException (dataSourceScriptDatabaseInitializer)
```

✅ 解决方案：① 修正 schema.sql 的 SQL 语法错误（参见 2-1） ② 检查 MyBatis 配置（确实是配置问题时）：
```yaml
# application.yml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml   # XML 文件路径
  configuration:
    map-underscore-to-camel-case: true
```
```java
// HarnessApplication.java — 确认 @MapperScan 的位置
@SpringBootApplication
@MapperScan("com.harness.src.*.dao")   // 必须与 DAO 包路径精确一致
public class HarnessApplication { ... }
```

### 2-3. `UnsatisfiedDependencyException` — Bean 依赖未满足
```
Error creating bean 'A': Unsatisfied dependency
  → Error creating bean 'B': Unsatisfied dependency
      → Error creating bean 'C': Cannot resolve bean 'X'
```
阅读顺序：按 **C → B → A** 的顺序往回追溯。

| 原因 | 症状 | 解决 |
|------|------|------|
| 缺少 `@Mapper` | 没有 Mapper bean | 在 DAO 接口上添加 `@Mapper` |
| `@MapperScan` 路径错误 | 仅特定包的 Mapper 不行 | 准确填写包路径 |
| schema.sql 执行失败 | 没有 `sqlSessionTemplate` | 修正 SQL 语法 |
| 循环依赖 | `The dependencies of some beans form a cycle` | 使用 `@Lazy` 或改进结构 |
| 缺少 `@Service`/`@Component` | 没有服务 bean | 添加注解 |

### 2-4. H2 `schema.sql` 自动执行设置
```yaml
# application-local.yml
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1
    username: sa
    password:

  sql:
    init:
      mode: always                              # always: 总是执行 / embedded: 仅对 H2 这类内嵌 DB 执行
      schema-locations: classpath:schema-h2.sql  # DDL 脚本
      data-locations: classpath:data-h2.sql      # 初始数据 (可选)
      encoding: UTF-8

  h2:
    console:
      enabled: true
      path: /h2-console   # 在浏览器中查看 DB 内容: http://localhost:8080/h2-console
```
> **注意：** 设置 `spring.sql.init.mode=always` 可能也会在生产 DB 上执行。本地专用设置务必只放在 `application-local.yml` 中，并用 `spring.profiles.active=local` 隔离。

### 2-5. H2 不支持的 PostgreSQL 专用 DML 语法
`ON CONFLICT ... DO UPDATE`（UPSERT）即使在 H2 中使用 `MODE=PostgreSQL` 也无法工作。

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"INSERT INTO safety_lock ... ON CONFLICT (target_id) DO UPDATE ..."
```
```xml
<!-- ❌ 在 H2 中失败 (PostgreSQL 专用) -->
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

✅ 解决方案 — 用 MyBatis `<choose>` 按 DB 分支。在 XML 中用 `_databaseId` 变量按 DB 种类分支。
```xml
<!-- ✅ H2 / PostgreSQL 均可工作 -->
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
            <!-- H2 / MySQL: 使用 MERGE INTO -->
            MERGE INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            KEY (target_id)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
        </otherwise>
    </choose>
</insert>
```
```yaml
# application.yml — 启用 _databaseId (明确生产 DB 种类)
mybatis:
  configuration:
    database-id: postgresql   # h2, mysql, postgresql, oracle
```
```yaml
# application-local.yml — 本地 H2 profile
mybatis:
  configuration:
    database-id: h2
```

PostgreSQL → H2 SQL 转换速查表：

| PostgreSQL 语法 | H2 替代语法 | 备注 |
|----------------|------------|------|
| `ON CONFLICT ... DO UPDATE` | `MERGE INTO ... KEY (...)` | H2 UPSERT |
| `INSERT ... RETURNING id` | 使用 `<selectKey>` | MyBatis selectKey |
| `SERIAL` / `BIGSERIAL` | `BIGINT AUTO_INCREMENT` (MODE=MySQL) 或 `BIGINT GENERATED ALWAYS AS IDENTITY` | |
| `ILIKE` | `LOWER(col) LIKE LOWER(?)` | 忽略大小写的搜索 |
| `::TEXT`, `::INT` (转型) | `CAST(col AS VARCHAR)` | 类型转换 |
| `NOW()` | `CURRENT_TIMESTAMP` | MODE=MySQL 时可用 NOW() |
| `TRUE` / `FALSE` | `TRUE` / `FALSE` | H2 支持 (无问题) |

### 2-6. 按 profile 分离 DataSource (推荐)
本地用 H2、生产用实际 DB 的安全分离方法。
```yaml
# application.yml (公共)
spring:
  profiles:
    active: local   # 默认 local (生产部署时用环境变量 override)
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true

---
# application-local.yml (本地 H2)
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
# application-prod.yml (生产 PostgreSQL)
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
      mode: never   # 生产环境禁止自动执行 schema.sql (使用 Flyway)
```

## 3. 常见错误
- 只看日志最上方的异常，错过了真正的原因（最下方的 `Caused by:`）。
- 把 `spring.sql.init.mode=always` 放进公共配置，导致 schema.sql 在生产 DB 上也执行。
- 仅用 H2 测试，导致 PostgreSQL 专用分支（`ON CONFLICT` 等）未被验证 — 本地也用 Testcontainers PostgreSQL 验证更安全。
- 把 `_databaseId` 设成部署目标 DB 以外的值，导致分支错位。
- DAO 上缺少 `@Mapper`，或 `@MapperScan`/`mapper-locations` 路径不一致，导致 bean 没被创建。

## 4. 检查清单
- [ ] 是否从日志最末尾的 `Caused by:`（真正的原因）开始读？
- [ ] 是否验证了 schema.sql/data.sql 的语法 (H2: AUTO_INCREMENT → GENERATED IDENTITY 或 MODE=MySQL, NOW() → CURRENT_TIMESTAMP)？
- [ ] 是否确认了 datasource.url 中是否包含 `MODE=MySQL`？
- [ ] 如果 Mapper XML 中有 PostgreSQL 专用语法 (ON CONFLICT/RETURNING/SERIAL)，是否用 `_databaseId` 分支或 MERGE INTO 进行了替换？
- [ ] `@MapperScan` 路径和 `mybatis.mapper-locations` 是否与实际的 DAO/XML 位置一致？
- [ ] 所有 DAO 是否都有 `@Mapper`，bean 类是否有 `@Service`/`@Component`/`@Repository`？
- [ ] 是否在生产 profile 中用 `spring.sql.init.mode=never` 进行了隔离？
