---
name: Spring Boot 起動エラーのパターンと解決策
description: Spring Boot 起動時によく遭遇する Bean 生成失敗、H2↔MySQL/PostgreSQL の構文互換エラー、MyBatis sqlSessionTemplate の未解決、schema.sql 実行失敗の原因と解決法。アプリが起動に失敗する、または BeanCreationException・DB 構文エラーをデバッグするときに読む。キーワード: BeanCreationException, NoSuchBeanDefinitionException, UnsatisfiedDependencyException, sqlSessionTemplate, @Configuration, H2, schema.sql。
rules:
  - "起動エラーは大半が連鎖失敗（Cascade Failure）の構造だ。ログの一番最後の Caused by: から読まなければ本当の原因にたどり着けない。"
  - "H2 と MySQL/PostgreSQL の構文差は H2 の MODE 設定で互換させる。"
  - "AUTO_INCREMENT・UPSERT のような dialect 構文は対象 DB に合わせて分岐する。"
  - "Bean 生成失敗は、依存の欠落と循環参照をまず確認する。"
  - "MyBatis sqlSessionTemplate の未解決は、DataSource/schema の初期化と mapper-locations のパスを点検する。"
  - "環境ごとに schema ファイルを分離し、起動時の衝突を防ぐ。"
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

# 🚨 Spring Boot 起動エラーのパターンと解決策

> 起動失敗の本当の原因を素早く見つけ、DB 構文・Bean 依存のエラーを直す。アプリが起動しない、または BeanCreationException・DB 構文エラーをデバッグするときに読む。

## 1. 核心原則
- 起動エラーは大半が**連鎖失敗（Cascade Failure）**の構造だ。ログの一番最後の `Caused by:` から読まなければ本当の原因にたどり着けない。
- H2 と MySQL/PostgreSQL の構文差は H2 の `MODE` 設定で互換させる。
- `AUTO_INCREMENT`・UPSERT のような dialect 構文は対象 DB に合わせて分岐する。
- Bean 生成失敗は、依存の欠落と循環参照をまず確認する。
- MyBatis `sqlSessionTemplate` の未解決は、DataSource/schema の初期化と `mapper-locations` のパスを点検する。
- 環境ごとに schema ファイルを分離し、起動時の衝突を防ぐ。

連鎖失敗の例 — 最後の `Caused by:` が本当の原因:
```
Unable to start web server
  └─ UnsatisfiedDependencyException (JwtAuthenticationFilter)
       └─ UnsatisfiedDependencyException (UserDetailsServiceImpl)
            └─ BeanCreationException (userMapper)
                 └─ Cannot resolve 'sqlSessionTemplate'  ← これが問題
                      └─ ScriptStatementFailedException  ← 本当の原因
                           └─ H2 SQL syntax error        ← ここから始まる
```

## 2. ルール

### 2-1. H2 ↔ MySQL/PostgreSQL の SQL 構文不一致
ローカルテスト用の H2 と実 DB（MySQL, PostgreSQL）の DDL 構文が異なり、`schema.sql` の実行が失敗する。H2 2.x からは `AUTO_INCREMENT` が MySQL 互換モードなしには動作しない。

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"CREATE TABLE ... id BIGINT [*]AUTO_INCREMENT PRIMARY KEY ..."
expected "ARRAY, INVISIBLE, NOT NULL, DEFAULT, GENERATED ..."
```

| 構文 | MySQL/MariaDB | PostgreSQL | H2 デフォルトモード |
|------|--------------|------------|-------------|
| 自動採番 | `BIGINT AUTO_INCREMENT` | `BIGINT GENERATED ALWAYS AS IDENTITY` | `BIGINT AUTO_INCREMENT` ❌ (2.x) |
| 現在時刻 | `NOW()` | `NOW()` | `CURRENT_TIMESTAMP` 推奨 |
| 文字列長の制限なし | `TEXT` | `TEXT` | `VARCHAR` 使用を推奨 |

✅ 解決策 1 — H2 に MySQL 互換モードを有効化（推奨）:
```yaml
# application-local.yml (ローカル開発用)
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  h2:
    console:
      enabled: true   # localhost:8080/h2-console に接続可能
  sql:
    init:
      mode: always
      schema-locations: classpath:schema-h2.sql
```
> `MODE=MySQL` を設定すると `AUTO_INCREMENT`, `NOW()`, `IF NOT EXISTS` など MySQL 構文の大半が許容される。

✅ 解決策 2 — H2 専用 schema ファイルの分離:
```
src/main/resources/
├── schema-h2.sql       ← H2 専用 (ローカル開発)
├── schema-mysql.sql    ← MySQL/MariaDB 専用
└── schema-pgsql.sql    ← PostgreSQL 専用
```
```sql
-- schema-h2.sql (H2 ネイティブ構文)
CREATE TABLE IF NOT EXISTS asset_master (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- AUTO_INCREMENT の代わり
    tag_id      VARCHAR(100)  NOT NULL UNIQUE,
    asset_name  VARCHAR(200)  NOT NULL,
    status      VARCHAR(20)   DEFAULT 'ACTIVE',
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,           -- NOW() の代わり
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```
```yaml
# application-local.yml
spring:
  sql:
    init:
      schema-locations: classpath:schema-h2.sql  # 環境ごとのファイルを指定
```

### 2-2. `Cannot resolve reference to bean 'sqlSessionTemplate'`
MyBatis 設定の問題ではなく、**DataSource または schema 初期化失敗の連鎖結果**だ。`sqlSessionTemplate` は DataSource が正常なときだけ生成されるため、DataSource が失敗すると必ずこのエラーが続く。

```
# ログでこのエラーが見えたら必ずさらに下の Caused by を確認する
Cannot resolve reference to bean 'sqlSessionTemplate'
                                           ↓
Caused by: ScriptStatementFailedException  ← schema.sql の実行失敗
Caused by: BeanCreationException (dataSourceScriptDatabaseInitializer)
```

✅ 解決策: ① schema.sql の SQL 構文エラーを修正（2-1 参照） ② MyBatis 設定の確認（実際に設定の問題である場合）:
```yaml
# application.yml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml   # XML ファイルのパス
  configuration:
    map-underscore-to-camel-case: true
```
```java
// HarnessApplication.java — @MapperScan の位置を確認
@SpringBootApplication
@MapperScan("com.harness.src.*.dao")   // DAO パッケージのパスと正確に一致する必要がある
public class HarnessApplication { ... }
```

### 2-3. `UnsatisfiedDependencyException` — Bean 依存の未充足
```
Error creating bean 'A': Unsatisfied dependency
  → Error creating bean 'B': Unsatisfied dependency
      → Error creating bean 'C': Cannot resolve bean 'X'
```
読む順序: **C → B → A** の順にさかのぼる。

| 原因 | 症状 | 解決 |
|------|------|------|
| `@Mapper` 欠落 | Mapper Bean がない | DAO インターフェースに `@Mapper` を追加 |
| `@MapperScan` パス誤り | 特定パッケージの Mapper だけ動かない | パッケージパスを正確に入力 |
| schema.sql 実行失敗 | `sqlSessionTemplate` がない | SQL 構文を修正 |
| 循環依存 | `The dependencies of some beans form a cycle` | `@Lazy` または構造改善 |
| `@Service`/`@Component` 欠落 | サービス Bean がない | アノテーション追加 |

### 2-4. H2 `schema.sql` 自動実行の設定
```yaml
# application-local.yml
spring:
  datasource:
    url: jdbc:h2:mem:harness_db;MODE=MySQL;DB_CLOSE_DELAY=-1
    username: sa
    password:

  sql:
    init:
      mode: always                              # always: 常に実行 / embedded: H2 のような組み込み DB のみ実行
      schema-locations: classpath:schema-h2.sql  # DDL スクリプト
      data-locations: classpath:data-h2.sql      # 初期データ (任意)
      encoding: UTF-8

  h2:
    console:
      enabled: true
      path: /h2-console   # ブラウザで DB 内容を確認: http://localhost:8080/h2-console
```
> **注意:** `spring.sql.init.mode=always` に設定すると本番 DB でも実行されうる。ローカル専用設定は必ず `application-local.yml` だけに入れ、`spring.profiles.active=local` で隔離すること。

### 2-5. H2 でサポートされない PostgreSQL 専用 DML 構文
`ON CONFLICT ... DO UPDATE`（UPSERT）は H2 で `MODE=PostgreSQL` を使っても動作しない。

```
JdbcSQLSyntaxErrorException: Syntax error in SQL statement
"INSERT INTO safety_lock ... ON CONFLICT (target_id) DO UPDATE ..."
```
```xml
<!-- ❌ H2 では失敗 (PostgreSQL 専用) -->
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

✅ 解決策 — MyBatis `<choose>` で DB ごとに分岐。XML で `_databaseId` 変数により DB 種別を分岐する。
```xml
<!-- ✅ H2 / PostgreSQL どちらでも動作 -->
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
            <!-- H2 / MySQL: MERGE INTO を使用 -->
            MERGE INTO safety_lock (target_id, lock_level, locked_by, reason, locked_at, updated_at)
            KEY (target_id)
            VALUES (#{targetId}, #{lockLevel}, #{lockedBy}, #{reason}, NOW(), NOW())
        </otherwise>
    </choose>
</insert>
```
```yaml
# application.yml — _databaseId を有効化 (本番 DB 種別を明示)
mybatis:
  configuration:
    database-id: postgresql   # h2, mysql, postgresql, oracle
```
```yaml
# application-local.yml — ローカル H2 プロファイル
mybatis:
  configuration:
    database-id: h2
```

PostgreSQL → H2 SQL 変換クイックリファレンス:

| PostgreSQL 構文 | H2 代替構文 | 備考 |
|----------------|------------|------|
| `ON CONFLICT ... DO UPDATE` | `MERGE INTO ... KEY (...)` | H2 UPSERT |
| `INSERT ... RETURNING id` | `<selectKey>` を使用 | MyBatis selectKey |
| `SERIAL` / `BIGSERIAL` | `BIGINT AUTO_INCREMENT` (MODE=MySQL) または `BIGINT GENERATED ALWAYS AS IDENTITY` | |
| `ILIKE` | `LOWER(col) LIKE LOWER(?)` | 大文字小文字を無視する検索 |
| `::TEXT`, `::INT` (キャスト) | `CAST(col AS VARCHAR)` | 型キャスト |
| `NOW()` | `CURRENT_TIMESTAMP` | MODE=MySQL なら NOW() 可能 |
| `TRUE` / `FALSE` | `TRUE` / `FALSE` | H2 サポート (問題なし) |

### 2-6. プロファイルごとの DataSource 分離 (推奨)
ローカルは H2、本番は実 DB を使う安全な分離方法。
```yaml
# application.yml (共通)
spring:
  profiles:
    active: local   # デフォルト local (本番デプロイ時は環境変数で override)
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true

---
# application-local.yml (ローカル H2)
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
# application-prod.yml (本番 PostgreSQL)
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
      mode: never   # 本番では schema.sql の自動実行を禁止 (Flyway を使用)
```

## 3. よくあるミス
- ログの一番上の例外だけを見て本当の原因（一番下の `Caused by:`）を見逃す。
- `spring.sql.init.mode=always` を共通設定に入れて本番 DB でも schema.sql が実行される。
- H2 でのみテストして PostgreSQL 専用の分岐（`ON CONFLICT` など）が検証されない — ローカルも Testcontainers PostgreSQL で検証すると安全だ。
- `_databaseId` をデプロイ対象 DB ではなく別の値に設定して分岐がずれる。
- DAO に `@Mapper` の欠落、または `@MapperScan`/`mapper-locations` のパス不一致で Bean が作られない。

## 4. チェックリスト
- [ ] ログの一番最後の `Caused by:`（本当の原因）から読んだか
- [ ] schema.sql/data.sql の構文を検証したか (H2: AUTO_INCREMENT → GENERATED IDENTITY または MODE=MySQL, NOW() → CURRENT_TIMESTAMP)
- [ ] datasource.url に `MODE=MySQL` が含まれているかを確認したか
- [ ] Mapper XML に PostgreSQL 専用構文 (ON CONFLICT/RETURNING/SERIAL) があれば `_databaseId` 分岐または MERGE INTO に置き換えたか
- [ ] `@MapperScan` のパスと `mybatis.mapper-locations` が実際の DAO/XML の位置と一致するか
- [ ] すべての DAO に `@Mapper`、Bean クラスに `@Service`/`@Component`/`@Repository` があるか
- [ ] 本番プロファイルで `spring.sql.init.mode=never` に隔離したか
