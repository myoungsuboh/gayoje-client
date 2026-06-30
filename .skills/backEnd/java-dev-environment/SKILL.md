---
name: Java 백엔드 개발 환경 표준 (IntelliJ + Java 21 + Gradle + Lombok)
description: IntelliJ IDEA 기반 Java 21 + Spring Boot + Gradle Wrapper 프로젝트 설정, 실행/디버그 구성, 로컬 프로파일, Lombok 적용 표준. 새 백엔드 프로젝트를 세팅하거나 빌드·실행 환경을 통일할 때 읽는다. 키워드: gradle, maven, pom.xml, build.gradle, jdk, jvm, lombok, IntelliJ.
rules:
  - "Java 21 + Spring Boot + Gradle Wrapper(gradlew) 조합으로 프로젝트를 구성한다."
  - "IntelliJ에서 Lombok 플러그인 설치와 Annotation Processing 활성화를 먼저 한다."
  - "프로젝트 SDK와 Gradle JVM을 Java 21로 통일한다."
  - "로컬 실행은 local 프로파일을 활성화하고 비밀값은 환경변수로 주입한다."
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

# ☕ Java 백엔드 개발 환경 표준

> IntelliJ + Java 21 + Spring Boot + Gradle Wrapper + Lombok 환경을 통일한다. 새 프로젝트를 세팅하거나 빌드·실행 환경을 정할 때 읽는다.

## 1. 핵심 원칙
- Java 21 + Spring Boot + Gradle Wrapper(gradlew) 조합으로 프로젝트를 구성한다.
- IntelliJ에서 Lombok 플러그인 설치와 Annotation Processing 활성화를 먼저 한다.
- 프로젝트 SDK와 Gradle JVM을 Java 21로 통일한다.
- 로컬 실행은 local 프로파일을 활성화하고 비밀값은 환경변수로 주입한다.

## 2. 규칙

### 2-1. 개발 환경 기본 스펙
| 항목 | 표준 |
|------|------|
| IDE | IntelliJ IDEA (Ultimate 권장, Community 가능) |
| Java | **21 LTS** (Amazon Corretto 21 또는 Eclipse Temurin 21 권장) |
| 빌드 도구 | Maven 또는 Gradle (프로젝트 첫 생성 시 팀 컨벤션 통일) |
| 프레임워크 | Spring Boot 3.x |
| Lombok | 최신 버전 (IntelliJ 플러그인 + Annotation Processing 활성화 필수) |

### 2-2. IntelliJ 필수 설정
```
# Lombok 플러그인 설치
Settings (Ctrl+Alt+S) → Plugins → Marketplace → "Lombok" 검색 → Install → IDE 재시작

# Annotation Processing 활성화 (반드시)
Settings → Build, Execution, Deployment → Compiler → Annotation Processors
→ ✅ Enable annotation processing 체크

# Java SDK 설정
Project Structure (Ctrl+Alt+Shift+S) → Project
→ SDK: corretto-21 (또는 temurin-21), Language level: 21
```
> ⚠️ Annotation Processing이 꺼져 있으면 @Getter, @Setter 등이 인식되지 않아 컴파일 에러 발생.

### 2-3. Maven 프로젝트 설정 (pom.xml)
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
        <!-- Lombok (scope: provided — 컴파일 시에만 필요) -->
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
                    <!-- Lombok은 최종 JAR에서 제외 -->
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

### 2-4. Gradle 프로젝트 설정 (build.gradle.kts)
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
        languageVersion = JavaLanguageVersion.of(21)  // Java 21 고정
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

    // ❌ compileOnly만 추가하면 @Data·@Builder 동작 안 함
    // ✅ annotationProcessor에도 반드시 같이 추가
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
```

### 2-5. Lombok 자주 쓰는 어노테이션
```java
import lombok.*;

@Data                      // DTO - getter/setter + 생성자 + toString + equals
public class UserDto {
    private String userId;
    private String userNm;
    private String email;
}

@Value                     // 불변 VO - final 필드, 전체 생성자, getter만
public class UserVo {
    String userId;
    String userNm;
}

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@ToString(exclude = "password")        // password 필드 제외
@EqualsAndHashCode(of = "userId")      // userId 기준으로만 비교
public class User {
    private String userId;
    private String userNm;
    private String password;
}

@Builder @Getter @NoArgsConstructor @AllArgsConstructor
public class CreateUserRequest {       // CreateUserRequest.builder().userNm("홍길동").build()
    private String userNm;
    private String email;
}

@Service
@RequiredArgsConstructor   // final 필드를 생성자로 주입 → @Autowired 대체
public class UserService {
    private final UserRepository userRepository;  // final 필수
}

@Slf4j @RestController     // 로깅 변수명은 기본 log
public class UserController {
    public void someMethod() {
        log.info("유저 조회 시작");
        log.debug("파라미터: {}", userId);
    }
}
```

### 2-6. Lombok 사용 시 주의사항
| 상황 | 권장 방식 |
|------|-----------|
| JPA Entity에 `@Data` 사용 | ❌ 금지 — `@EqualsAndHashCode` 순환참조 위험. `@Getter`만 사용 |
| MyBatis DTO | ✅ `@Data` 사용 가능 |
| `@Builder` + 상속 | `@SuperBuilder` 사용 |
| `@Slf4j` 로그 변수명 | 기본 `log` — 별도 선언 불필요 |
| `@RequiredArgsConstructor` | `final` 또는 `@NonNull` 필드만 생성자에 포함됨 |

### 2-7. Gradle Wrapper 설정
프로젝트에 Gradle을 직접 설치하지 않고 Wrapper를 사용한다. 팀원 모두 동일한 Gradle 버전을 쓰고, IntelliJ import 없이 바로 빌드 가능하다.
```
프로젝트루트/
├── gradle/wrapper/
│   ├── gradle-wrapper.properties   ← Gradle 버전 지정
│   └── gradle-wrapper.jar          ← ./gradlew 실행에 필요한 바이너리
├── gradlew         (Linux/Mac 실행 스크립트)
└── gradlew.bat     (Windows 실행 스크립트)
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
> Gradle 버전은 `gradle-8.7-bin.zip` 부분만 바꾼다. Spring Boot 3.3.x 기준 Gradle **8.7 이상** 권장.
```bash
gradle wrapper --gradle-version 8.7   # 최초 1회 (로컬 gradle 설치된 경우)
./gradlew bootRun          # Linux/Mac (이후 로컬 gradle 불필요)
gradlew.bat bootRun        # Windows
```

### 2-8. IntelliJ 실행/디버그 구성 (.idea/runConfigurations)
팀 공통 실행 구성을 XML로 커밋하면 팀원 모두 Run 드롭다운에 자동 표시된다.
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
> 디버그 포트는 **5005**(JDWP 표준). 앱 실행 JVM 옵션에 `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005` 추가 필요.
> Gradle 동기화(`Ctrl+Shift+O`) 후 Run 드롭다운에서 `HarnessApplication`(일반·local 프로파일), `HarnessApplication (Debug)`(JDWP 5005) 자동 인식.

### 2-9. 로컬 개발 전용 프로파일 (application-local.yml)
Git에 커밋해도 되는 로컬 전용 설정. 민감한 값(실제 DB 비밀번호 등)은 환경변수로 분리한다.
```yaml
# src/main/resources/application-local.yml
spring:
  config:
    activate:
      on-profile: local
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypassword   # 로컬 DB 비밀번호 (운영과 다른 값)
    driver-class-name: org.postgresql.Driver
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: validate
logging:
  level:
    root: INFO
    com.example: DEBUG        # 내 패키지는 DEBUG
    org.mybatis: DEBUG        # MyBatis SQL 로그 출력
server:
  port: 8080
# 디버그 실행 시 JVM 옵션: -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```
```bash
# 프로파일 활성화 (택1)
-Dspring.profiles.active=local        # JVM 인수
SPRING_PROFILES_ACTIVE=local          # 환경변수
# IntelliJ 실행 구성 → Active profiles 필드에 "local"
```
```gitignore
# 민감 정보가 담긴 로컬 설정 (개인 환경 전용)
application-local-secret.yml
.env
*.jks
*.p12
```

### 2-10. IntelliJ 유용한 단축키 (백엔드)
| 단축키 | 기능 |
|--------|------|
| `Shift+F10` / `Shift+F9` | 마지막 실행 구성 재실행 / 디버그 실행 |
| `Ctrl+B` | 선언부로 이동 (Lombok 생성 메서드 포함) |
| `Alt+Enter` | 빠른 수정 (import 추가, 오류 수정) |
| `Ctrl+Alt+L` / `Ctrl+Alt+O` | 코드 포맷팅 / 미사용 import 제거 |
| `Ctrl+Shift+T` | 테스트 클래스 생성/이동 |
| `Double Shift` | 전체 검색 (파일·클래스·심볼) |
| `Ctrl+Shift+O` | Gradle 프로젝트 동기화 |

## 3. 흔한 실수
- Gradle에서 Lombok을 `compileOnly`에만 추가 → `annotationProcessor` 누락으로 @Data·@Builder 미동작.
- Annotation Processing 비활성화 → @Getter/@Setter 미인식 컴파일 에러.
- JPA Entity에 `@Data` 사용 → 순환참조·성능 문제.
- 프로젝트 SDK와 Gradle JVM 버전 불일치 → 빌드 실패.
- 민감한 비밀값을 application-local.yml에 직접 커밋 → 환경변수로 분리해야 함.

## 4. 체크리스트
- [ ] 프로젝트 SDK·Gradle JVM이 모두 Java 21인가
- [ ] Lombok 플러그인 + Annotation Processing이 활성화됐는가
- [ ] Gradle에서 Lombok을 `annotationProcessor`에도 추가했는가
- [ ] Gradle Wrapper(gradlew)로 빌드/실행하는가
- [ ] local 프로파일로 실행하고 비밀값은 환경변수로 주입하는가
- [ ] JPA Entity에 `@Data` 대신 `@Getter`를 사용했는가
