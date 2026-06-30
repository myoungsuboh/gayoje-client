---
name: Java バックエンド開発環境標準 (IntelliJ + Java 21 + Gradle + Lombok)
description: IntelliJ IDEA ベースの Java 21 + Spring Boot + Gradle Wrapper プロジェクト設定、実行/デバッグ構成、ローカルプロファイル、Lombok 適用の標準。新しいバックエンドプロジェクトをセットアップする、またはビルド・実行環境を統一するときに読む。キーワード: gradle, maven, pom.xml, build.gradle, jdk, jvm, lombok, IntelliJ。
rules:
  - "Java 21 + Spring Boot + Gradle Wrapper(gradlew) の組み合わせでプロジェクトを構成する。"
  - "IntelliJ で Lombok プラグインのインストールと Annotation Processing の有効化を先に行う。"
  - "プロジェクト SDK と Gradle JVM を Java 21 に統一する。"
  - "ローカル実行は local プロファイルを有効化し、秘密値は環境変数で注入する。"
tags:
  - "gradle"
  - "maven"
  - "pom.xml"
  - "build.gradle"
  - "jdk"
  - "jvm"
  - "lombok"
  - "IntelliJ"
---

# ☕ Java バックエンド開発環境標準

> IntelliJ + Java 21 + Spring Boot + Gradle Wrapper + Lombok 環境を統一する。新しいプロジェクトをセットアップする、またはビルド・実行環境を決めるときに読む。

## 1. 核心原則
- Java 21 + Spring Boot + Gradle Wrapper(gradlew) の組み合わせでプロジェクトを構成する。
- IntelliJ で Lombok プラグインのインストールと Annotation Processing の有効化を先に行う。
- プロジェクト SDK と Gradle JVM を Java 21 に統一する。
- ローカル実行は local プロファイルを有効化し、秘密値は環境変数で注入する。

## 2. ルール

### 2-1. 開発環境の基本スペック
| 項目 | 標準 |
|------|------|
| IDE | IntelliJ IDEA (Ultimate 推奨、Community 可) |
| Java | **21 LTS** (Amazon Corretto 21 または Eclipse Temurin 21 推奨) |
| ビルドツール | Maven または Gradle (プロジェクト初回作成時にチーム規約を統一) |
| フレームワーク | Spring Boot 3.x |
| Lombok | 最新バージョン (IntelliJ プラグイン + Annotation Processing の有効化必須) |

### 2-2. IntelliJ 必須設定
```
# Lombok プラグインのインストール
Settings (Ctrl+Alt+S) → Plugins → Marketplace → "Lombok" 検索 → Install → IDE 再起動

# Annotation Processing の有効化 (必須)
Settings → Build, Execution, Deployment → Compiler → Annotation Processors
→ ✅ Enable annotation processing をチェック

# Java SDK 設定
Project Structure (Ctrl+Alt+Shift+S) → Project
→ SDK: corretto-21 (または temurin-21)、Language level: 21
```
> ⚠️ Annotation Processing が無効だと @Getter, @Setter などが認識されずコンパイルエラーが発生する。

### 2-3. Maven プロジェクト設定 (pom.xml)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
             https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.0</version>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>my-app</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>my-app</name>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.mybatis.spring.boot</groupId>
            <artifactId>mybatis-spring-boot-starter</artifactId>
            <version>3.0.3</version>
        </dependency>
        <!-- Lombok (scope: provided — コンパイル時のみ必要) -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <!-- Lombok は最終 JAR から除外 -->
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

### 2-4. Gradle プロジェクト設定 (build.gradle.kts)
```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.3.0"
    id("io.spring.dependency-management") version "1.1.4"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)  // Java 21 固定
    }
}

configurations {
    compileOnly {
        extendsFrom(configurations.annotationProcessor.get())
    }
}

repositories { mavenCentral() }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.3")

    // ❌ compileOnly のみ追加すると @Data·@Builder が動かない
    // ✅ annotationProcessor にも必ず一緒に追加
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
```

### 2-5. Lombok でよく使うアノテーション
```java
import lombok.*;

@Data                      // DTO - getter/setter + コンストラクタ + toString + equals
public class UserDto {
    private String userId;
    private String userNm;
    private String email;
}

@Value                     // 不変 VO - final フィールド、全引数コンストラクタ、getter のみ
public class UserVo {
    String userId;
    String userNm;
}

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@ToString(exclude = "password")        // password フィールド除外
@EqualsAndHashCode(of = "userId")      // userId 基準でのみ比較
public class User {
    private String userId;
    private String userNm;
    private String password;
}

@Builder @Getter @NoArgsConstructor @AllArgsConstructor
public class CreateUserRequest {       // CreateUserRequest.builder().userNm("ホン・ギルドン").build()
    private String userNm;
    private String email;
}

@Service
@RequiredArgsConstructor   // final フィールドをコンストラクタで注入 → @Autowired の代替
public class UserService {
    private final UserRepository userRepository;  // final 必須
}

@Slf4j @RestController     // ロギング変数名はデフォルト log
public class UserController {
    public void someMethod() {
        log.info("ユーザー照会開始");
        log.debug("パラメータ: {}", userId);
    }
}
```

### 2-6. Lombok 使用時の注意事項
| 状況 | 推奨方式 |
|------|-----------|
| JPA Entity に `@Data` 使用 | ❌ 禁止 — `@EqualsAndHashCode` 循環参照のリスク。`@Getter` のみ使用 |
| MyBatis DTO | ✅ `@Data` 使用可 |
| `@Builder` + 継承 | `@SuperBuilder` を使用 |
| `@Slf4j` ログ変数名 | デフォルト `log` — 別途宣言不要 |
| `@RequiredArgsConstructor` | `final` または `@NonNull` フィールドのみコンストラクタに含まれる |

### 2-7. Gradle Wrapper 設定
プロジェクトに Gradle を直接インストールせず Wrapper を使う。チーム全員が同じ Gradle バージョンを使い、IntelliJ import なしですぐにビルド可能だ。
```
プロジェクトルート/
├── gradle/wrapper/
│   ├── gradle-wrapper.properties   ← Gradle バージョン指定
│   └── gradle-wrapper.jar          ← ./gradlew 実行に必要なバイナリ
├── gradlew         (Linux/Mac 実行スクリプト)
└── gradlew.bat     (Windows 実行スクリプト)
```
```properties
# gradle-wrapper.properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```
> Gradle バージョンは `gradle-8.7-bin.zip` の部分だけ変える。Spring Boot 3.3.x 基準で Gradle **8.7 以上** 推奨。
```bash
gradle wrapper --gradle-version 8.7   # 最初の 1 回 (ローカル gradle がインストール済みの場合)
./gradlew bootRun          # Linux/Mac (以降ローカル gradle 不要)
gradlew.bat bootRun        # Windows
```

### 2-8. IntelliJ 実行/デバッグ構成 (.idea/runConfigurations)
チーム共通の実行構成を XML でコミットすると、チーム全員の Run ドロップダウンに自動表示される。
```xml
<!-- .idea/runConfigurations/HarnessApplication.xml -->
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="HarnessApplication" type="SpringBootApplicationConfigurationType">
    <module name="your-app.main" />
    <option name="ACTIVE_PROFILES" value="local" />
    <option name="MAIN_CLASS_NAME" value="com.example.HarnessApplication" />
    <method v="2"><option name="Make" enabled="true" /></method>
  </configuration>
</component>
```
```xml
<!-- .idea/runConfigurations/HarnessApplication__Debug_.xml -->
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="HarnessApplication (Debug)" type="Remote">
    <option name="USE_SOCKET_TRANSPORT" value="true" />
    <option name="SERVER_MODE" value="false" />
    <option name="HOST" value="localhost" />
    <option name="PORT" value="5005" />
    <option name="AUTO_RESTART" value="false" />
    <RunnerSettings RunnerId="Debug"><option name="DEBUG_PORT" value="5005" /></RunnerSettings>
  </configuration>
</component>
```
> デバッグポートは **5005**(JDWP 標準)。アプリ実行 JVM オプションに `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005` の追加が必要。
> Gradle 同期(`Ctrl+Shift+O`)後、Run ドロップダウンで `HarnessApplication`(通常・local プロファイル)、`HarnessApplication (Debug)`(JDWP 5005)が自動認識される。

### 2-9. ローカル開発専用プロファイル (application-local.yml)
Git にコミットしてよいローカル専用設定。機微な値(実際の DB パスワードなど)は環境変数に分離する。
```yaml
# src/main/resources/application-local.yml
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypassword   # ローカル DB パスワード (運用と異なる値)
    driver-class-name: org.postgresql.Driver
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: validate
logging:
  level:
    root: INFO
    com.example: DEBUG        # 自分のパッケージは DEBUG
    org.mybatis: DEBUG        # MyBatis SQL ログ出力
server:
  port: 8080
# デバッグ実行時の JVM オプション: -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```
```bash
# プロファイル有効化 (いずれか 1 つ)
-Dspring.profiles.active=local        # JVM 引数
SPRING_PROFILES_ACTIVE=local          # 環境変数
# IntelliJ 実行構成 → Active profiles フィールドに "local"
```
```gitignore
# 機微情報を含むローカル設定 (個人環境専用)
application-local-secret.yml
.env
*.jks
*.p12
```

### 2-10. IntelliJ の便利なショートカット (バックエンド)
| ショートカット | 機能 |
|--------|------|
| `Shift+F10` / `Shift+F9` | 最後の実行構成を再実行 / デバッグ実行 |
| `Ctrl+B` | 宣言部へ移動 (Lombok 生成メソッドを含む) |
| `Alt+Enter` | クイックフィックス (import 追加、エラー修正) |
| `Ctrl+Alt+L` / `Ctrl+Alt+O` | コードフォーマット / 未使用 import の削除 |
| `Ctrl+Shift+T` | テストクラスの生成/移動 |
| `Double Shift` | 全体検索 (ファイル・クラス・シンボル) |
| `Ctrl+Shift+O` | Gradle プロジェクトの同期 |

## 3. よくある間違い
- Gradle で Lombok を `compileOnly` にのみ追加 → `annotationProcessor` 漏れで @Data·@Builder が動作しない。
- Annotation Processing 無効 → @Getter/@Setter 未認識のコンパイルエラー。
- JPA Entity に `@Data` 使用 → 循環参照・性能問題。
- プロジェクト SDK と Gradle JVM のバージョン不一致 → ビルド失敗。
- 機微な秘密値を application-local.yml に直接コミット → 環境変数に分離すべき。

## 4. チェックリスト
- [ ] プロジェクト SDK・Gradle JVM がすべて Java 21 か
- [ ] Lombok プラグイン + Annotation Processing が有効化されているか
- [ ] Gradle で Lombok を `annotationProcessor` にも追加したか
- [ ] Gradle Wrapper(gradlew) でビルド/実行しているか
- [ ] local プロファイルで実行し秘密値は環境変数で注入しているか
- [ ] JPA Entity に `@Data` の代わりに `@Getter` を使用したか
