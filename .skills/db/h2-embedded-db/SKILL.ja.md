---
name: H2 内蔵 DB 単独使用ガイド
description: 外部 DB サーバーなしで H2 インメモリ/ファイル DB により Spring Boot + MyBatis 環境を構成するパターン。Gradle 未インストール対応、Java toolchain 自動ダウンロード、H2 予約語・日付関数の互換性、BCrypt ハッシュ、Spring Security 設定を決める際に読む。キーワード: h2-console, jdbc:h2, h2database, in-memory, spring.h2.
rules:
  - "外部 DB なしで開発する際は H2 インメモリ/ファイル DB で素早く構成する。"
  - "PostgreSQL プロジェクトも H2 MODE=MySQL で互換モードを合わせる。"
  - "Gradle 未インストール環境は Wrapper の手動生成や Foojay toolchain 自動ダウンロードで対応する。"
  - "schema-h2.sql は H2 予約語と日付関数の互換性を確認して作成する。"
  - "H2 コンソールは local プロファイルでのみ有効化する。"
tags:
  - "h2-console"
  - "jdbc:h2"
  - "h2database"
  - "in-memory"
  - "spring.h2"
---

# 🗄️ H2 内蔵 DB 単独使用ガイド

> 外部 DB サーバーなしで Spring Boot アプリケーション内部で H2 を DB として使う。別途 DB をインストールせず素早く開発環境を構成したり、H2 予約語・日付関数の互換性問題を解決する際に読む。

## 1. 中核原則
- 外部 DB なしで開発する際は H2 インメモリ/ファイル DB で素早く構成する。
- PostgreSQL プロジェクトも H2 `MODE=MySQL` で互換モードを合わせる。
- Gradle 未インストール環境は Wrapper の手動生成や Foojay toolchain 自動ダウンロードで対応する。
- `schema-h2.sql` は H2 予約語と日付関数の互換性を確認して作成する。
- H2 コンソールは local プロファイルでのみ有効化する。

## 2. 規則

### 2-1. Gradle/Maven 未インストール環境での開始
Java だけあって Gradle がなければ Wrapper ファイルを直接作る。

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

> `gradle-wrapper.jar` は Gradle 公式配布版からコピーするか、Spring Initializr(https://start.spring.io)で生成すれば自動的に含まれる。Spring Initializr の使用を推奨する。

Java バージョンが合わなければ `settings.gradle` に Foojay プラグインを追加して自動ダウンロードする。
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
        languageVersion = JavaLanguageVersion.of(21)  // なければ自動ダウンロード
    }
}
```
> Java 17 だけインストールされた環境で Java 21 プロジェクトをビルドする際、自動的に JDK 21 をダウンロードする。`./gradlew bootRun` の初回実行時に自動処理される。

### 2-2. 依存関係の追加
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

### 2-3. H2 互換 MODE の選択 — `MODE=MySQL` 推奨
PostgreSQL プロジェクトも MySQL モードを使用する。
```yaml
spring:
  datasource:
    url: jdbc:h2:mem:mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
```

| MODE | AUTO_INCREMENT | NOW() | ON CONFLICT | MERGE INTO |
|------|---------------|-------|-------------|-----------|
| デフォルト | ❌ | ❌ | ❌ | ✅ |
| MySQL | ✅ | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ (2.x) | ✅ |

> **`MODE=PostgreSQL` は使用しない。** H2 2.x では `AUTO_INCREMENT` をサポートせず、`FORMATDATETIME` のような日付関数も動作しないことがある。PostgreSQL を本番 DB として使っても、ローカル H2 は常に `MODE=MySQL` に設定する。

### 2-4. 推奨 application.yml の全体構成
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
    database-id: h2      # Mapper XML _databaseId 分岐用
```

### 2-5. schema-h2.sql 作成規則
```sql
-- schema-h2.sql (MODE=MySQL 基準)
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

### 2-6. H2 予約語 — カラム名の衝突に注意
予約語をカラム名に使うと `JdbcSQLSyntaxErrorException` が発生する。

| 衝突カラム名 | 原因 | 解決 |
|------------|---------|---------|
| `month` | H2 予約語 | `month_val`, `report_month` |
| `year` | H2 予約語 | `target_year`, `fiscal_year` |
| `day` | H2 予約語 | `day_of_week`, `report_day` |
| `value` | H2 予約語 | `metric_value`, `sensor_value` |
| `key` | H2 予約語 | `item_key`, `config_key` |
| `name` | 一部モードで衝突 | `user_name`, `item_name` |
| `comment` | H2 予約語 | `remarks`, `note` |

```xml
<!-- ❌ H2 で失敗 -->
<select id="getMonthlyTrend" resultType="map">
    SELECT month, count FROM kpi_metric
</select>

<!-- ✅ バッククォート(MySQL モード)または alias で回避 -->
<select id="getMonthlyTrend" resultType="map">
    SELECT `month`, count FROM kpi_metric
</select>
<select id="getMonthlyTrend" resultType="map">
    SELECT report_month AS month, cnt FROM kpi_metric
</select>
```
> **根本的な解決策:** schema 設計時に予約語をカラム名に使わない。`month` → `report_month` のように接頭/接尾辞を付ける。

### 2-7. H2 日付関数の互換性
| PostgreSQL | MySQL | H2 (MODE=MySQL) | 用途 |
|-----------|-------|----------------|------|
| `NOW()` | `NOW()` | `NOW()` ✅ | 現在時刻 |
| `CURRENT_DATE` | `CURDATE()` | `CURRENT_DATE` ✅ | 今日の日付 |
| `date_trunc('month', col)` | `DATE_FORMAT(col,'%Y-%m-01')` | `FORMATDATETIME(col,'yyyy-MM-01')` | 月初日 |
| `EXTRACT(MONTH FROM col)` | `MONTH(col)` | `MONTH(col)` ✅ | 月の抽出 |
| `col + INTERVAL '1 day'` | `DATE_ADD(col, INTERVAL 1 DAY)` | `DATEADD('DAY', 1, col)` | 日付の加算 |
| `col - INTERVAL '30 days'` | `DATE_SUB(col, INTERVAL 30 DAY)` | `DATEADD('DAY', -30, col)` | 日付の減算 |
| `TO_CHAR(col, 'YYYY-MM')` | `DATE_FORMAT(col,'%Y-%m')` | `FORMATDATETIME(col,'yyyy-MM')` | 日付のフォーマット |

```xml
<!-- ✅ _databaseId で日付関数を分岐 -->
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

### 2-8. UPSERT: H2 用 MERGE INTO パターン
`ON CONFLICT ... DO UPDATE` は H2 で未サポート。`MERGE INTO` を使用する。
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

### 2-9. BCrypt ハッシュ — data-h2.sql テストアカウント
平文パスワードは Spring Security BCrypt 検証で失敗する。必ずハッシュ値を入れる。

| 平文 | BCrypt ハッシュ (strength=10、例示値) |
|------|------------|
| `admin123` | `$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iAt6Z5EH` |
| `password` | `$2a$10$EblZqNptyYvcLm/VwDCVAuBjzZOI7khzdyGPBr08PpIi0na624b8.` |
| `test1234` | `$2a$10$slYQmyNdgTY79B7/9fBVUeIMX5nOELSZ1AUblLBVQ0H/nAknROoJ2` |

> ⚠️ 上記のハッシュは例示値である。実際のプロジェクトでは自分で生成したハッシュを使用する。

```java
// 方法 1 — Java コードで生成 (最も確実)
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class HashGen {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        System.out.println(encoder.encode("admin123"));
    }
}
// 方法 2 — IntelliJ デバッグの Evaluate Expression ウィンドウ
new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("admin123")
// 方法 3 — 開発用の一時コントローラ (本番デプロイ前に必ず削除)
@GetMapping("/dev/hash")
public String hash(@RequestParam String pw) {
    return new BCryptPasswordEncoder().encode(pw);
}
```
```sql
-- data-h2.sql (BCrypt ハッシュ: 上記の方法で自分で生成した値を入れること)
INSERT INTO users (user_id, user_name, password, email) VALUES
    ('admin', '관리자', '$2a$10$...実際に生成したハッシュ値...', 'admin@example.com'),
    ('user01', '홍길동', '$2a$10$...実際に生成したハッシュ値...', 'hong@example.com');
```

### 2-10. H2 コンソール — Spring Security と併用
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
            .frameOptions(frame -> frame.sameOrigin()));  // H2 コンソールは iframe を使用
    return http.build();
}
```
```
接続: http://localhost:8080/h2-console
JDBC URL: jdbc:h2:mem:mydb  (application.yml と同一に)
User: sa / Password: (空欄)
```

### 2-11. ファイルモード — 再起動後にデータを保持
```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/mydb;MODE=MySQL;DB_CLOSE_DELAY=-1;AUTO_SERVER=TRUE
  sql:
    init:
      mode: embedded   # ファイルがすでにあれば schema を再実行しない
```
- `AUTO_SERVER=TRUE`: IntelliJ DB タブ + アプリの同時接続が可能

```gitignore
# .gitignore
data/
*.mv.db
*.trace.db
```

## 3. よくあるミス
| エラー | 原因 | 解決 |
|------|------|------|
| `Syntax error ... ON CONFLICT` | PostgreSQL UPSERT 構文 | `MERGE INTO ... KEY(...)` に変更 |
| `Syntax error ... month` | 予約語をカラム名に使用 | カラム名変更(`report_month`)またはバッククォート |
| `Function "FORMATDATETIME" not found` | MODE=PostgreSQL 未サポート | `MODE=MySQL` に変更 |
| `Function "DATE_TRUNC" not found` | H2 未サポート関数 | `FORMATDATETIME(col, 'yyyy-MM-01')` で代替 |
| `AUTO_INCREMENT not supported` | MODE=PostgreSQL 未サポート | `MODE=MySQL` に変更 |
| ログイン失敗 (401) | data.sql のパスワードが平文 | BCrypt ハッシュに置き換え |
| H2 コンソール接続不可 (403) | Spring Security による遮断 | `/h2-console/**` permitAll を追加 |
| H2 コンソール画面の崩れ (白い画面) | X-Frame-Options による遮断 | `frameOptions(frame -> frame.sameOrigin())` を追加 |

## 4. チェックリスト
- [ ] H2 URL に `MODE=MySQL` を使用したか (PostgreSQL モード未使用)
- [ ] カラム名が H2 予約語(month・year・value など)と衝突しないか
- [ ] 日付関数を H2 互換関数または `_databaseId` 分岐で作成したか
- [ ] UPSERT を `MERGE INTO ... KEY(...)` で処理したか
- [ ] data-h2.sql のパスワードが BCrypt ハッシュ値か
- [ ] H2 コンソールが local プロファイルでのみ有効化され、Security 例外が設定されているか

### 選択基準のまとめ
| 状況 | 推奨モード |
|------|---------|
| 単体テスト、素早いプロトタイプ | インメモリ (`jdbc:h2:mem:mydb;MODE=MySQL`) |
| ローカル開発、再起動後にデータ保持 | ファイル (`jdbc:h2:file:./data/mydb;MODE=MySQL`) |
| 本番環境 | PostgreSQL / MySQL (外部 DB) |
