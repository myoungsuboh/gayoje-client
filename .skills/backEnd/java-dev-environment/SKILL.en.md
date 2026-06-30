---
name: Java Backend Development Environment Standard (IntelliJ + Java 21 + Gradle + Lombok)
description: Standards for setting up an IntelliJ IDEA-based Java 21 + Spring Boot + Gradle Wrapper project, run/debug configuration, local profiles, and Lombok adoption. Read when setting up a new backend project or unifying the build/run environment. Keywords: gradle, maven, pom.xml, build.gradle, jdk, jvm, lombok, IntelliJ.
rules:
  - "Build the project with the Java 21 + Spring Boot + Gradle Wrapper(gradlew) combination."
  - "In IntelliJ, install the Lombok plugin and enable Annotation Processing first."
  - "Unify the project SDK and the Gradle JVM to Java 21."
  - "For local runs, activate the local profile and inject secrets via environment variables."
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

# ☕ Java Backend Development Environment Standard

> Unify the IntelliJ + Java 21 + Spring Boot + Gradle Wrapper + Lombok environment. Read when setting up a new project or deciding the build/run environment.

## 1. Core Principles
- Build the project with the Java 21 + Spring Boot + Gradle Wrapper(gradlew) combination.
- In IntelliJ, install the Lombok plugin and enable Annotation Processing first.
- Unify the project SDK and the Gradle JVM to Java 21.
- For local runs, activate the local profile and inject secrets via environment variables.

## 2. Rules

### 2-1. Development environment baseline spec
| Item | Standard |
|------|------|
| IDE | IntelliJ IDEA (Ultimate recommended, Community acceptable) |
| Java | **21 LTS** (Amazon Corretto 21 or Eclipse Temurin 21 recommended) |
| Build tool | Maven or Gradle (unify the team convention at first project creation) |
| Framework | Spring Boot 3.x |
| Lombok | Latest version (IntelliJ plugin + Annotation Processing enablement required) |

### 2-2. IntelliJ required settings
```
# Install the Lombok plugin
Settings (Ctrl+Alt+S) → Plugins → Marketplace → search "Lombok" → Install → restart the IDE

# Enable Annotation Processing (mandatory)
Settings → Build, Execution, Deployment → Compiler → Annotation Processors
→ ✅ check Enable annotation processing

# Java SDK setting
Project Structure (Ctrl+Alt+Shift+S) → Project
→ SDK: corretto-21 (or temurin-21), Language level: 21
```
> ⚠️ If Annotation Processing is off, @Getter, @Setter, etc. are not recognized, causing compile errors.

### 2-3. Maven project setup (pom.xml)
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
        <!-- Lombok (scope: provided — needed only at compile time) -->
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
                    <!-- Exclude Lombok from the final JAR -->
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

### 2-4. Gradle project setup (build.gradle.kts)
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
        languageVersion = JavaLanguageVersion.of(21)  // pin Java 21
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

    // ❌ adding only compileOnly makes @Data·@Builder not work
    // ✅ must also add to annotationProcessor
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
```

### 2-5. Frequently used Lombok annotations
```java
import lombok.*;

@Data                      // DTO - getter/setter + constructor + toString + equals
public class UserDto {
    private String userId;
    private String userNm;
    private String email;
}

@Value                     // immutable VO - final fields, all-args constructor, getter only
public class UserVo {
    String userId;
    String userNm;
}

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@ToString(exclude = "password")        // exclude the password field
@EqualsAndHashCode(of = "userId")      // compare by userId only
public class User {
    private String userId;
    private String userNm;
    private String password;
}

@Builder @Getter @NoArgsConstructor @AllArgsConstructor
public class CreateUserRequest {       // CreateUserRequest.builder().userNm("Hong Gil-dong").build()
    private String userNm;
    private String email;
}

@Service
@RequiredArgsConstructor   // inject final fields via constructor → replaces @Autowired
public class UserService {
    private final UserRepository userRepository;  // final required
}

@Slf4j @RestController     // default logging variable name is log
public class UserController {
    public void someMethod() {
        log.info("Starting user lookup");
        log.debug("Parameter: {}", userId);
    }
}
```

### 2-6. Precautions when using Lombok
| Situation | Recommended approach |
|------|-----------|
| Using `@Data` on a JPA Entity | ❌ Forbidden — risk of `@EqualsAndHashCode` circular reference. Use `@Getter` only |
| MyBatis DTO | ✅ `@Data` is fine to use |
| `@Builder` + inheritance | Use `@SuperBuilder` |
| `@Slf4j` log variable name | Default `log` — no separate declaration needed |
| `@RequiredArgsConstructor` | Only `final` or `@NonNull` fields are included in the constructor |

### 2-7. Gradle Wrapper setup
Use the Wrapper rather than installing Gradle directly in the project. All team members use the same Gradle version, and you can build immediately without an IntelliJ import.
```
project-root/
├── gradle/wrapper/
│   ├── gradle-wrapper.properties   ← specifies the Gradle version
│   └── gradle-wrapper.jar          ← binary needed to run ./gradlew
├── gradlew         (Linux/Mac run script)
└── gradlew.bat     (Windows run script)
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
> Change only the `gradle-8.7-bin.zip` part for the Gradle version. For Spring Boot 3.3.x, Gradle **8.7 or higher** is recommended.
```bash
gradle wrapper --gradle-version 8.7   # one-time (if a local gradle is installed)
./gradlew bootRun          # Linux/Mac (no local gradle needed afterward)
gradlew.bat bootRun        # Windows
```

### 2-8. IntelliJ run/debug configurations (.idea/runConfigurations)
If you commit shared team run configurations as XML, all members see them automatically in the Run dropdown.
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
> The debug port is **5005** (JDWP standard). The app run JVM options need `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005` added.
> After Gradle sync (`Ctrl+Shift+O`), the Run dropdown automatically recognizes `HarnessApplication` (normal, local profile) and `HarnessApplication (Debug)` (JDWP 5005).

### 2-9. Local-development-only profile (application-local.yml)
Local-only settings that are fine to commit to Git. Separate sensitive values (such as the real DB password) into environment variables.
```yaml
# src/main/resources/application-local.yml
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypassword   # local DB password (different from production)
    driver-class-name: org.postgresql.Driver
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: validate
logging:
  level:
    root: INFO
    com.example: DEBUG        # my package at DEBUG
    org.mybatis: DEBUG        # output MyBatis SQL logs
server:
  port: 8080
# JVM options for debug run: -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```
```bash
# Activate the profile (pick one)
-Dspring.profiles.active=local        # JVM argument
SPRING_PROFILES_ACTIVE=local          # environment variable
# IntelliJ run configuration → "local" in the Active profiles field
```
```gitignore
# local settings containing sensitive info (personal environment only)
application-local-secret.yml
.env
*.jks
*.p12
```

### 2-10. Useful IntelliJ shortcuts (backend)
| Shortcut | Function |
|--------|------|
| `Shift+F10` / `Shift+F9` | Rerun last run configuration / debug run |
| `Ctrl+B` | Go to declaration (including Lombok-generated methods) |
| `Alt+Enter` | Quick fix (add import, fix error) |
| `Ctrl+Alt+L` / `Ctrl+Alt+O` | Code formatting / remove unused imports |
| `Ctrl+Shift+T` | Create/navigate to test class |
| `Double Shift` | Search everywhere (file, class, symbol) |
| `Ctrl+Shift+O` | Sync the Gradle project |

## 3. Common Mistakes
- Adding Lombok only to `compileOnly` in Gradle → @Data·@Builder do not work due to the missing `annotationProcessor`.
- Disabling Annotation Processing → @Getter/@Setter unrecognized, compile error.
- Using `@Data` on a JPA Entity → circular reference / performance problems.
- Mismatched project SDK and Gradle JVM versions → build failure.
- Committing sensitive secrets directly into application-local.yml → they must be separated into environment variables.

## 4. Checklist
- [ ] Are the project SDK and Gradle JVM both Java 21?
- [ ] Is the Lombok plugin + Annotation Processing enabled?
- [ ] Did you also add Lombok to `annotationProcessor` in Gradle?
- [ ] Do you build/run with the Gradle Wrapper(gradlew)?
- [ ] Do you run with the local profile and inject secrets via environment variables?
- [ ] Did you use `@Getter` instead of `@Data` on JPA Entities?
