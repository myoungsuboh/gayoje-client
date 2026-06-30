---
name: Backend Testing Standard (Backend Testing)
description: The stack-application standard for backend automated testing — covers slice (layer) test boundaries and JUnit5·Mockito·Testcontainers implementation examples. General concepts (pyramid·AAA·isolation·mocking·Clock·non-determinism) are delegated to unit-testing·integration-testing·test-strategy. Read this when writing new tests or fixing slow/flaky tests. Keywords: slice test, unit test, integration test, junit, mockito, testcontainers, @WebMvcTest, @MybatisTest, MockMvc, Clock, flaky.
rules:
  - "Following the test pyramid, write many unit tests and few integration tests"
  - "Mock dependencies in service unit tests with Mockito given/when/then"
  - "Slice-test controllers with @WebMvcTest and MockMvc"
  - "Run integration tests with Testcontainers, isolating real DB·Kafka·Redis"
  - "Inject a Clock into time-dependent code to test it deterministically"
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

# 🧪 Backend Testing Standard (Backend Testing)

> Unify the **slice (layer) boundaries** of backend testing and the per-stack (JUnit5·Mockito·Testcontainers) application. Read this when writing new tests or fixing slow/flaky tests. Follow the referenced skills below for general principles; this document covers only the backend-specific parts and concrete tool examples (the final `## Appendix: Per-stack examples`).

## 1. General concepts by reference (delegation)

The test pyramid (many unit, few integration/E2E), the **AAA (Arrange-Act-Assert, given/when/then)** structure, **isolation** of external dependencies (DB·network·clock·file) and the mocking boundary, **isolated execution of real infrastructure** for integration tests, **injecting a Clock** into time-dependent code, and **removing non-determinism (flaky)** via condition polling instead of fixed sleep — all these general rules follow `unit-testing`·`integration-testing`·`test-strategy`. This document defines only the parts unique to the backend layer structure on top of those.

## 2. Backend-specific: slice (layer) tests

Between unit and integration, the backend has a slice test layer that **thinly loads only one layer (beans)** of the framework (e.g., API entry point `@WebMvcTest`, data mapper `@MybatisTest`/`@DataJpaTest`). The key is verifying only that layer's contract without booting the entire application.

### 2-1. Slice test — a thin single layer

- ✅ Load thinly only one layer such as the API entry point or data mapper to verify that layer's contract (status code·serialization·validation rules, query mapping).
- ❌ Do not boot the entire application just to look at one layer (slow and the intent gets blurred).

```text
// ✅ Recommended — entry-point slice: verify the success/validation-failure response contract
GET  /resource/{id}          → 200 + expected fields in the body
POST /resource (empty body)  → 400 + validation error code

// ✅ Recommended — data-mapper slice: verify query mapping with fixed data (SQL fixture)
seed → run query → assert mapped result
```

### 2-2. Test fixture (Fixture/Builder) pattern

- ✅ Gather test data creation in one place with a fixture/builder. Even when the model changes, you only fix one place.
- ❌ Creating objects inline at length per test → when the model changes, dozens of tests must be modified at once.

```text
// ✅ Recommended — reuse a fixture with meaningful defaults
Fixture.entity(id):           { id, name: "default name", ... reasonable defaults }
Fixture.createRequest():      { name: "new", ... }

// ❌ Forbidden — fill all fields inline in every test
new Entity(1, id, "default name", "...", now(), ...)   // fragile to change
```

## 3. Common mistakes (backend-specific)

- **Using the full context for a slice**: booting the entire application to look at one layer's contract → slow. Load only that layer's slice (`@WebMvcTest`/`@MybatisTest`).
- **Substituting in-memory for integration**: hides SQL dialect/feature differences from the real engine and misses production bugs → integration runs the real engine in isolation (`integration-testing`). Only an exception when explicitly verifying compatibility.
- **Inline creation without fixtures**: when the model changes, dozens of tests must be modified at once → gather them with a fixture/builder.

> For other general mistakes (overusing the full context·using the production DB·calling global "now"·fixed sleep·sharing state between tests·tests without assertions), see the common-mistakes section of `unit-testing`·`integration-testing`.

## 4. Checklist (backend-specific)

- [ ] Did you handle single-layer verification with a **slice** (`@WebMvcTest`/`@MybatisTest`, etc.) instead of a full boot?
- [ ] Does the slice verify only that layer's contract (status code·serialization·validation, query mapping)?
- [ ] Did you gather test data with a **fixture/builder** to make it robust to model changes?
- [ ] Are integration tests isolated with **real infrastructure (isolated containers, etc.)** (no in-memory substitution)?

> For general checks (AAA separation·asserting result status·Clock injection·condition polling·test independence), also see the checklists of `unit-testing`·`integration-testing`·`test-strategy`.

---

## Appendix: Per-stack examples

> The following is an example of implementing the above neutral rules in a specific stack. For other stacks, port the same principles to the relevant tools.

### JUnit5 + Mockito (Java/Spring)

#### Test pyramid (layer mapping)

```
        ┌───────────────┐
        │   E2E (few)    │     real-environment scenarios, very slow
        ├───────────────┤
        │ Integration (Testcontainers) │   real DB/Kafka/Redis containers
        ├───────────────┤
        │  Slice tests   │     @WebMvcTest, @MybatisTest, @DataJpaTest
        ├───────────────┤
        │  Unit tests (many)  │  Mockito, no external dependencies
        └───────────────┘
```

- **Unit**: pure Mockito. No Spring context load. Must finish in the order of 1ms.
- **Slice**: load only the needed beans (`@WebMvcTest`, `@MybatisTest`).
- **Integration**: spin up real DB/Kafka with Testcontainers.

#### Dependencies (build.gradle)

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

#### Service unit test — Mockito given/when/then

The standard is to run with just `@ExtendWith(MockitoExtension.class)` without a Spring context. Never use `@SpringBootTest` for unit tests.

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
    @DisplayName("Looking up an asset by tag ID returns the asset information")
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
    @DisplayName("Looking up a non-existent tag ID throws a BusinessException")
    void getAsset_notFound() {
        given(assetDao.findByTagId("UNKNOWN")).willReturn(null);

        assertThatThrownBy(() -> assetService.getAsset("UNKNOWN"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("자산을 찾을 수 없습니다");
    }
}
```

#### Test fixture (Builder/Fixture) pattern

Instead of writing `new AssetResponse(...)` at length per test, make a Fixture. Then you don't have to fix dozens of tests when something changes.

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

#### Controller slice test — @WebMvcTest + MockMvc

> `@MockitoBean` (Spring Boot 3.4+) is the standard. The older `@MockBean` (`org.springframework.boot.test.mock.mockito.MockBean`) is slated for deprecation, so do not use it.

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

#### MyBatis Mapper test — @MybatisTest

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
@AutoConfigureTestDatabase(replace = Replace.NONE) // disable H2 auto-substitution when using Testcontainers
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

#### Testcontainers integration test (PostgreSQL/Kafka/Redis)

H2 and PostgreSQL have different SQL dialects (`JSONB`, `RETURNING`, `ON CONFLICT`). Testing with a container identical to the real DB prevents bugs that only blow up in the production environment.

> For Kafka, use `ConfluentKafkaContainer` (`org.testcontainers.kafka.ConfluentKafkaContainer`) instead of the deprecated `KafkaContainer`.

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

#### Time-dependent code — Clock injection

Calling `LocalDateTime.now()` directly inside a service makes unit testing impossible. Inject a `Clock` bean.

```java
@Service
@RequiredArgsConstructor
public class ReportService {
    private final Clock clock;  // @Bean Clock clock() { return Clock.systemDefaultZone(); }

    public Report build() {
        LocalDateTime now = LocalDateTime.now(clock);  // can inject Clock.fixed() in tests
        // ...
    }
}

// test
Clock fixed = Clock.fixed(Instant.parse("2026-05-11T00:00:00Z"), ZoneId.of("Asia/Seoul"));
ReportService svc = new ReportService(fixed);
```

#### Async waiting — Awaitility (no Thread.sleep)

```java
// anti-pattern
@Test
void test1() throws InterruptedException {
    asyncService.process();
    Thread.sleep(2000);  // ❌ Flaky
    assertThat(repo.count()).isEqualTo(1);
}

// recommended
@Test
void test1() {
    asyncService.process();
    Awaitility.await().atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(repo.count()).isEqualTo(1));
}
```
