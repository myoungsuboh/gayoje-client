---
name: 백엔드 테스트 표준 (Backend Testing)
description: 백엔드 자동화 테스트의 스택 적용 표준 — 슬라이스(계층) 테스트 경계와 JUnit5·Mockito·Testcontainers 구현 예시를 다룬다. 범용 개념(피라미드·AAA·격리·모킹·Clock·비결정성)은 unit-testing·integration-testing·test-strategy 에 위임한다. 테스트를 새로 짜거나 느린·flaky 테스트를 정비할 때 읽는다. 키워드: 슬라이스 테스트, 단위 테스트, 통합 테스트, junit, mockito, testcontainers, @WebMvcTest, @MybatisTest, MockMvc, Clock, flaky.
rules:
  - "테스트 피라미드에 따라 단위 테스트를 다수, 통합 테스트를 소수로 작성한다"
  - "서비스 단위 테스트는 Mockito given/when/then 으로 의존성을 모킹한다"
  - "컨트롤러는 @WebMvcTest 와 MockMvc 로 슬라이스 테스트한다"
  - "통합 테스트는 Testcontainers 로 실제 DB·Kafka·Redis 를 격리 실행한다"
  - "시간 의존 코드는 Clock 을 주입해 결정적으로 테스트한다"
tags:
  - "슬라이스 테스트"
  - "단위 테스트"
  - "통합 테스트"
  - "junit"
  - "mockito"
  - "testcontainers"
  - "@WebMvcTest"
  - "@MybatisTest"
  - "MockMvc"
  - "Clock"
  - "flaky"
  - "@Test"
  - "@Mock"
  - "@InjectMocks"
  - "when("
  - "verify("
  - "assertEquals"
  - "Mockito"
  - "@SpringBootTest"
---

# 🧪 백엔드 테스트 표준 (Backend Testing)

> 백엔드 테스트의 **슬라이스(계층) 경계**와 스택별(JUnit5·Mockito·Testcontainers) 적용을 통일한다. 테스트를 새로 작성하거나 느린·불안정한 테스트를 정비할 때 읽는다. 범용 원칙은 아래 참조 스킬을 따르고, 이 문서는 백엔드 고유분과 구체 도구 예시(맨 끝 `## 부록: 스택별 예시`)만 다룬다.

## 1. 범용 개념은 참조로 (위임)

테스트 피라미드(단위 다수·통합/E2E 소수), **AAA(준비-실행-검증, given/when/then)** 구조, 외부 의존(DB·네트워크·시계·파일) **격리**와 모킹 경계, 통합 테스트의 **실제 인프라 격리 실행**, 시간 의존 코드의 **Clock 주입**, 고정 sleep 대신 조건 폴링으로 **비결정성(flaky) 제거** — 이 범용 규칙은 모두 `unit-testing`·`integration-testing`·`test-strategy` 를 따른다. 본 문서는 그 위에서 백엔드 계층 구조에 고유한 부분만 정의한다.

## 2. 백엔드 고유: 슬라이스(계층) 테스트

단위와 통합 사이에, 백엔드는 프레임워크의 **한 계층(빈)만 얇게 로드**하는 슬라이스 테스트 계층을 둔다(예: API 진입점 `@WebMvcTest`, 데이터 매퍼 `@MybatisTest`/`@DataJpaTest`). 전체 애플리케이션을 부팅하지 않고 그 계층의 계약만 검증하는 것이 핵심이다.

### 2-1. 슬라이스 테스트 — 얇은 한 계층

- ✅ API 진입점·데이터 매퍼 같은 한 계층만 얇게 로드해, 그 계층의 계약(상태 코드·직렬화·검증 규칙, 쿼리 매핑)을 검증한다.
- ❌ 한 계층을 보려고 전체 애플리케이션을 부팅하지 않는다(느리고 의도가 흐려진다).

```text
// ✅ 권장 — 진입점 슬라이스: 성공/검증실패 응답 계약 검증
GET  /resource/{id}          → 200 + 본문에 기대 필드
POST /resource (빈 본문)      → 400 + 검증 에러 코드

// ✅ 권장 — 데이터 매퍼 슬라이스: 고정 데이터(SQL fixture)로 쿼리 매핑 검증
seed → 쿼리 실행 → 매핑 결과 단언
```

### 2-2. 테스트 픽스처(Fixture/Builder) 패턴

- ✅ 테스트 데이터 생성은 픽스처/빌더로 한곳에 모은다. 모델이 바뀌어도 한 곳만 고치면 된다.
- ❌ 테스트마다 객체를 길게 인라인 생성 → 모델 변경 시 수십 개 테스트를 동시에 수정해야 한다.

```text
// ✅ 권장 — 의미 있는 기본값을 가진 픽스처를 재사용
Fixture.entity(id):           { id, name: "기본명", ... 합리적 기본값 }
Fixture.createRequest():      { name: "신규", ... }

// ❌ 금지 — 매 테스트에서 전체 필드를 인라인으로 채움
new Entity(1, id, "기본명", "...", now(), ...)   // 변경에 취약
```

## 3. 흔한 실수 (백엔드 고유)

- **슬라이스에 전체 컨텍스트 사용**: 한 계층 계약을 보는데 전체 애플리케이션을 부팅 → 느림. 해당 계층 슬라이스(`@WebMvcTest`/`@MybatisTest`)만 로드한다.
- **인메모리로 통합 대체**: 실제 엔진과 SQL 방언·기능 차이를 가려 운영 버그를 놓친다 → 통합은 실제 엔진을 격리 실행(`integration-testing`). 호환을 명시적으로 검증할 때만 예외.
- **픽스처 없이 인라인 생성**: 모델 변경 시 수십 개 테스트를 동시에 수정해야 한다 → 픽스처/빌더로 모은다.

> 그 외 일반 실수(전체 컨텍스트 남발·운영 DB 사용·전역 "지금" 호출·고정 sleep·테스트 간 상태 공유·검증 없는 테스트)는 `unit-testing`·`integration-testing` 의 흔한 실수 절을 본다.

## 4. 체크리스트 (백엔드 고유)

- [ ] 한 계층 검증은 전체 부팅 대신 **슬라이스**(`@WebMvcTest`/`@MybatisTest` 등)로 다뤘는가
- [ ] 슬라이스가 그 계층의 계약(상태 코드·직렬화·검증, 쿼리 매핑)만 검증하는가
- [ ] 테스트 데이터를 **픽스처/빌더**로 모아 모델 변경에 강하게 만들었는가
- [ ] 통합 테스트가 **실제 인프라(격리 컨테이너 등)** 로 격리되었는가 (인메모리 대체 금지)

> 범용 체크(AAA 분리·결과 상태 단언·Clock 주입·조건 폴링·테스트 독립성)는 `unit-testing`·`integration-testing`·`test-strategy` 의 체크리스트를 함께 본다.

---

## 부록: 스택별 예시

> 아래는 위 중립 규칙을 특정 스택으로 구현한 예시다. 다른 스택에서는 같은 원칙을 해당 도구로 옮겨 적용한다.

### JUnit5 + Mockito (Java/Spring)

#### 테스트 피라미드 (계층 매핑)

```
        ┌───────────────┐
        │   E2E (소량)   │     실제 환경 시나리오, 매우 느림
        ├───────────────┤
        │ 통합 (Testcontainers) │   실제 DB/Kafka/Redis 컨테이너
        ├───────────────┤
        │  슬라이스 테스트  │     @WebMvcTest, @MybatisTest, @DataJpaTest
        ├───────────────┤
        │   단위 테스트 (대량)   │  Mockito, 외부 의존 없음
        └───────────────┘
```

- **단위**: 순수 Mockito. Spring 컨텍스트 로드 X. 1ms 단위로 끝나야 함.
- **슬라이스**: 필요한 빈만 로드 (`@WebMvcTest`, `@MybatisTest`).
- **통합**: 실제 DB/Kafka를 Testcontainers로 띄움.

#### 의존성 (build.gradle)

```groovy
dependencies {
    testImplementation 'org.springframework.boot:spring-boot-starter-test'  // JUnit5 + Mockito + AssertJ + MockMvc
    testImplementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter-test:3.0.3'
    testImplementation 'org.testcontainers:junit-jupiter:1.19.7'
    testImplementation 'org.testcontainers:postgresql:1.19.7'
    testImplementation 'org.testcontainers:kafka:1.19.7'
    testImplementation 'com.redis.testcontainers:testcontainers-redis-junit:1.6.4'
    testRuntimeOnly  'com.h2database:h2'
}

test {
    useJUnitPlatform()
}
```

#### 서비스 단위 테스트 — Mockito given/when/then

Spring 컨텍스트 없이 `@ExtendWith(MockitoExtension.class)`만으로 돌리는 게 정석. `@SpringBootTest`는 단위 테스트에 절대 쓰지 말 것.

```java
package com.harness.src.asset.service;

import com.harness.src.asset.dao.AssetDao;
import com.harness.src.asset.dto.request.AssetCreateRequest;
import com.harness.src.asset.dto.response.AssetResponse;
import com.harness.src.asset.service.impl.AssetServiceImpl;
import com.harness.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AssetServiceImplTest {

    @Mock
    private AssetDao assetDao;

    @InjectMocks
    private AssetServiceImpl assetService;

    @Test
    @DisplayName("태그 ID로 자산을 조회하면 자산 정보가 반환된다")
    void getAsset_success() {
        // given
        String tagId = "TAG-001";
        AssetResponse fixture = AssetFixture.asset(tagId);
        given(assetDao.findByTagId(tagId)).willReturn(fixture);

        // when
        AssetResponse result = assetService.getAsset(tagId);

        // then
        assertThat(result.getTagId()).isEqualTo(tagId);
        assertThat(result.getAssetName()).isEqualTo("펌프-01");
        verify(assetDao).findByTagId(tagId);
    }

    @Test
    @DisplayName("존재하지 않는 태그 ID 조회 시 BusinessException이 발생한다")
    void getAsset_notFound() {
        given(assetDao.findByTagId("UNKNOWN")).willReturn(null);

        assertThatThrownBy(() -> assetService.getAsset("UNKNOWN"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("자산을 찾을 수 없습니다");
    }
}
```

#### 테스트 픽스처(Builder/Fixture) 패턴

테스트마다 `new AssetResponse(...)` 길게 쓰지 말고 Fixture를 만들어라. 변경 시 테스트 수십 개를 고치지 않아도 된다.

```java
public class AssetFixture {

    public static AssetResponse asset(String tagId) {
        AssetResponse r = new AssetResponse();
        r.setAssetId(1L);
        r.setTagId(tagId);
        r.setAssetName("펌프-01");
        r.setDeckId("DECK-A");
        r.setCreatedAt(LocalDateTime.of(2026, 1, 1, 0, 0));
        return r;
    }

    public static AssetCreateRequest createRequest() {
        AssetCreateRequest req = new AssetCreateRequest();
        ReflectionTestUtils.setField(req, "tagId", "TAG-NEW");
        ReflectionTestUtils.setField(req, "assetName", "신규자산");
        return req;
    }
}
```

#### 컨트롤러 슬라이스 테스트 — @WebMvcTest + MockMvc

> `@MockitoBean`(Spring Boot 3.4+)이 표준이다. 구버전 `@MockBean`(`org.springframework.boot.test.mock.mockito.MockBean`)은 폐기 예정이므로 쓰지 않는다.

```java
package com.harness.src.asset.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.harness.src.asset.service.AssetService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AssetController.class)
class AssetControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockitoBean private AssetService assetService;

    @Test
    void getAsset_returns200() throws Exception {
        given(assetService.getAsset("TAG-001")).willReturn(AssetFixture.asset("TAG-001"));

        mockMvc.perform(get("/api/v1/assets/{tagId}", "TAG-001"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.tagId").value("TAG-001"));
    }

    @Test
    void createAsset_validationFails_returns400() throws Exception {
        String emptyBody = "{\"tagId\":\"\",\"assetName\":\"\"}";

        mockMvc.perform(post("/api/v1/assets")
                .contentType(MediaType.APPLICATION_JSON)
                .content(emptyBody))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }
}
```

#### MyBatis Mapper 테스트 — @MybatisTest

```java
package com.harness.src.asset.dao;

import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.jdbc.Sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;

@MybatisTest
@AutoConfigureTestDatabase(replace = Replace.NONE) // Testcontainers 사용 시 H2 자동 대체 비활성화
@Sql(scripts = "/sql/asset-fixtures.sql")
class AssetDaoTest {

    @Autowired
    private AssetDao assetDao;

    @Test
    void findByTagId_returnsAsset() {
        AssetResponse result = assetDao.findByTagId("TAG-001");

        assertThat(result).isNotNull();
        assertThat(result.getAssetName()).isEqualTo("펌프-01");
    }
}
```

`src/test/resources/sql/asset-fixtures.sql`:
```sql
INSERT INTO asset_masters (asset_master_id, tag_id, asset_name, deck_id, created_at, updated_at)
VALUES (1, 'TAG-001', '펌프-01', 'DECK-A', NOW(), NOW());
```

#### Testcontainers 통합 테스트 (PostgreSQL/Kafka/Redis)

H2와 PostgreSQL은 SQL 방언이 다르다(`JSONB`, `RETURNING`, `ON CONFLICT`). 실 DB와 동일한 컨테이너로 테스트하면 운영 환경에서만 터지는 버그를 막을 수 있다.

> Kafka는 폐기된 `KafkaContainer` 대신 `ConfluentKafkaContainer`(`org.testcontainers.kafka.ConfluentKafkaContainer`)를 쓴다.

```java
package com.harness.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.kafka.ConfluentKafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
class AssetIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("harness")
            .withUsername("test")
            .withPassword("test");

    @Container
    static final ConfluentKafkaContainer KAFKA =
        new ConfluentKafkaContainer("confluentinc/cp-kafka:7.6.0");

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @Autowired private AssetService assetService;

    @Test
    void createAsset_persisted() {
        assetService.createAsset(AssetFixture.createRequest());

        AssetResponse saved = assetService.getAsset("TAG-NEW");
        assertThat(saved).isNotNull();
    }
}
```

`application-test.yml`:
```yaml
spring:
  datasource:
    driver-class-name: org.postgresql.Driver
  jackson:
    serialization:
      write-dates-as-timestamps: false
logging:
  level:
    com.harness: DEBUG
```

#### 시간 의존 코드 — Clock 주입

`LocalDateTime.now()`를 서비스 안에서 직접 호출하면 단위 테스트가 불가능하다. `Clock` 빈을 주입해라.

```java
@Service
@RequiredArgsConstructor
public class ReportService {
    private final Clock clock;  // @Bean Clock clock() { return Clock.systemDefaultZone(); }

    public Report build() {
        LocalDateTime now = LocalDateTime.now(clock);  // 테스트에서 Clock.fixed() 주입 가능
        // ...
    }
}

// 테스트
Clock fixed = Clock.fixed(Instant.parse("2026-05-11T00:00:00Z"), ZoneId.of("Asia/Seoul"));
ReportService svc = new ReportService(fixed);
```

#### 비동기 대기 — Awaitility (Thread.sleep 금지)

```java
// 안티패턴
@Test
void test1() throws InterruptedException {
    asyncService.process();
    Thread.sleep(2000);  // ❌ Flaky
    assertThat(repo.count()).isEqualTo(1);
}

// 권장
@Test
void test1() {
    asyncService.process();
    Awaitility.await().atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(repo.count()).isEqualTo(1));
}
```
