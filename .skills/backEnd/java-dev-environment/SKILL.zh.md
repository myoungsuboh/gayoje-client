---
name: Java 后端开发环境标准 (IntelliJ + Java 21 + Gradle + Lombok)
description: 基于 IntelliJ IDEA 的 Java 21 + Spring Boot + Gradle Wrapper 项目配置、运行/调试配置、本地 profile、Lombok 应用标准。在搭建新后端项目或统一构建·运行环境时阅读。关键词: gradle, maven, pom.xml, build.gradle, jdk, jvm, lombok, IntelliJ。
rules:
  - "以 Java 21 + Spring Boot + Gradle Wrapper(gradlew) 组合构建项目。"
  - "在 IntelliJ 中先安装 Lombok 插件并启用 Annotation Processing。"
  - "把项目 SDK 与 Gradle JVM 统一为 Java 21。"
  - "本地运行启用 local profile,秘密值通过环境变量注入。"
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

# ☕ Java 后端开发环境标准

> 统一 IntelliJ + Java 21 + Spring Boot + Gradle Wrapper + Lombok 环境。在搭建新项目或决定构建·运行环境时阅读。

## 1. 核心原则
- 以 Java 21 + Spring Boot + Gradle Wrapper(gradlew) 组合构建项目。
- 在 IntelliJ 中先安装 Lombok 插件并启用 Annotation Processing。
- 把项目 SDK 与 Gradle JVM 统一为 Java 21。
- 本地运行启用 local profile,秘密值通过环境变量注入。

## 2. 规则

### 2-1. 开发环境基本规格
| 项目 | 标准 |
|------|------|
| IDE | IntelliJ IDEA (推荐 Ultimate,Community 亦可) |
| Java | **21 LTS** (推荐 Amazon Corretto 21 或 Eclipse Temurin 21) |
| 构建工具 | Maven 或 Gradle (项目首次创建时统一团队约定) |
| 框架 | Spring Boot 3.x |
| Lombok | 最新版本 (必须启用 IntelliJ 插件 + Annotation Processing) |

### 2-2. IntelliJ 必需设置
```
# 安装 Lombok 插件
Settings (Ctrl+Alt+S) → Plugins → Marketplace → 搜索 "Lombok" → Install → 重启 IDE

# 启用 Annotation Processing (务必)
Settings → Build, Execution, Deployment → Compiler → Annotation Processors
→ ✅ 勾选 Enable annotation processing

# Java SDK 设置
Project Structure (Ctrl+Alt+Shift+S) → Project
→ SDK: corretto-21 (或 temurin-21),Language level: 21
```
> ⚠️ 若 Annotation Processing 关闭,@Getter、@Setter 等无法识别,导致编译错误。

### 2-3. Maven 项目配置 (pom.xml)
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
        <!-- Lombok (scope: provided — 仅编译时需要) -->
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
                    <!-- Lombok 从最终 JAR 中排除 -->
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

### 2-4. Gradle 项目配置 (build.gradle.kts)
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
        languageVersion = JavaLanguageVersion.of(21)  // 固定 Java 21
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

    // ❌ 仅添加 compileOnly 会导致 @Data·@Builder 不生效
    // ✅ 必须同时添加到 annotationProcessor
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
```

### 2-5. Lombok 常用注解
```java
import lombok.*;

@Data                      // DTO - getter/setter + 构造器 + toString + equals
public class UserDto {
    private String userId;
    private String userNm;
    private String email;
}

@Value                     // 不可变 VO - final 字段、全参构造器、仅 getter
public class UserVo {
    String userId;
    String userNm;
}

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@ToString(exclude = "password")        // 排除 password 字段
@EqualsAndHashCode(of = "userId")      // 仅以 userId 为基准比较
public class User {
    private String userId;
    private String userNm;
    private String password;
}

@Builder @Getter @NoArgsConstructor @AllArgsConstructor
public class CreateUserRequest {       // CreateUserRequest.builder().userNm("洪吉童").build()
    private String userNm;
    private String email;
}

@Service
@RequiredArgsConstructor   // 通过构造器注入 final 字段 → 替代 @Autowired
public class UserService {
    private final UserRepository userRepository;  // final 必需
}

@Slf4j @RestController     // 日志变量名默认为 log
public class UserController {
    public void someMethod() {
        log.info("开始查询用户");
        log.debug("参数: {}", userId);
    }
}
```

### 2-6. 使用 Lombok 的注意事项
| 情况 | 推荐方式 |
|------|-----------|
| 在 JPA Entity 上使用 `@Data` | ❌ 禁止 — `@EqualsAndHashCode` 循环引用风险。仅使用 `@Getter` |
| MyBatis DTO | ✅ 可使用 `@Data` |
| `@Builder` + 继承 | 使用 `@SuperBuilder` |
| `@Slf4j` 日志变量名 | 默认 `log` — 无需单独声明 |
| `@RequiredArgsConstructor` | 仅 `final` 或 `@NonNull` 字段会包含在构造器中 |

### 2-7. Gradle Wrapper 配置
不在项目中直接安装 Gradle,而使用 Wrapper。团队所有成员使用相同的 Gradle 版本,无需 IntelliJ import 即可直接构建。
```
项目根目录/
├── gradle/wrapper/
│   ├── gradle-wrapper.properties   ← 指定 Gradle 版本
│   └── gradle-wrapper.jar          ← 运行 ./gradlew 所需的二进制
├── gradlew         (Linux/Mac 运行脚本)
└── gradlew.bat     (Windows 运行脚本)
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
> Gradle 版本只需修改 `gradle-8.7-bin.zip` 部分。以 Spring Boot 3.3.x 为准,推荐 Gradle **8.7 以上**。
```bash
gradle wrapper --gradle-version 8.7   # 首次一次 (本地已安装 gradle 时)
./gradlew bootRun          # Linux/Mac (此后无需本地 gradle)
gradlew.bat bootRun        # Windows
```

### 2-8. IntelliJ 运行/调试配置 (.idea/runConfigurations)
把团队共用的运行配置以 XML 提交后,所有成员的 Run 下拉框中会自动显示。
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
> 调试端口为 **5005**(JDWP 标准)。应用运行 JVM 选项中需添加 `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005`。
> Gradle 同步(`Ctrl+Shift+O`)后,Run 下拉框会自动识别 `HarnessApplication`(常规·local profile)、`HarnessApplication (Debug)`(JDWP 5005)。

### 2-9. 本地开发专用 profile (application-local.yml)
可提交到 Git 的本地专用配置。敏感值(如真实 DB 密码)分离到环境变量。
```yaml
# src/main/resources/application-local.yml
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypassword   # 本地 DB 密码 (与生产不同的值)
    driver-class-name: org.postgresql.Driver
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: validate
logging:
  level:
    root: INFO
    com.example: DEBUG        # 自己的包设为 DEBUG
    org.mybatis: DEBUG        # 输出 MyBatis SQL 日志
server:
  port: 8080
# 调试运行时的 JVM 选项: -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```
```bash
# 激活 profile (任选其一)
-Dspring.profiles.active=local        # JVM 参数
SPRING_PROFILES_ACTIVE=local          # 环境变量
# IntelliJ 运行配置 → 在 Active profiles 字段填 "local"
```
```gitignore
# 含敏感信息的本地配置 (仅个人环境)
application-local-secret.yml
.env
*.jks
*.p12
```

### 2-10. IntelliJ 实用快捷键 (后端)
| 快捷键 | 功能 |
|--------|------|
| `Shift+F10` / `Shift+F9` | 重新运行上次运行配置 / 调试运行 |
| `Ctrl+B` | 跳转到声明处 (包含 Lombok 生成的方法) |
| `Alt+Enter` | 快速修复 (添加 import、修正错误) |
| `Ctrl+Alt+L` / `Ctrl+Alt+O` | 代码格式化 / 删除未使用的 import |
| `Ctrl+Shift+T` | 创建/跳转到测试类 |
| `Double Shift` | 全局搜索 (文件·类·符号) |
| `Ctrl+Shift+O` | 同步 Gradle 项目 |

## 3. 常见错误
- 在 Gradle 中只把 Lombok 添加到 `compileOnly` → 因缺少 `annotationProcessor` 导致 @Data·@Builder 不生效。
- 禁用 Annotation Processing → @Getter/@Setter 未识别的编译错误。
- 在 JPA Entity 上使用 `@Data` → 循环引用·性能问题。
- 项目 SDK 与 Gradle JVM 版本不一致 → 构建失败。
- 把敏感秘密值直接提交到 application-local.yml → 应分离到环境变量。

## 4. 检查清单
- [ ] 项目 SDK·Gradle JVM 是否都为 Java 21
- [ ] Lombok 插件 + Annotation Processing 是否已启用
- [ ] 是否在 Gradle 中也把 Lombok 添加到了 `annotationProcessor`
- [ ] 是否用 Gradle Wrapper(gradlew) 构建/运行
- [ ] 是否以 local profile 运行并通过环境变量注入秘密值
- [ ] JPA Entity 是否使用了 `@Getter` 而非 `@Data`
