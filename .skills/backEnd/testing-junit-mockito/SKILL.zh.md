---
name: 后端测试标准 (Backend Testing)
description: 后端自动化测试的栈应用标准 — 涵盖切片（分层）测试边界与 JUnit5·Mockito·Testcontainers 实现示例。通用概念（金字塔·AAA·隔离·模拟·Clock·非确定性）委托给 unit-testing·integration-testing·test-strategy。当新写测试或整顿慢速·flaky 测试时阅读。关键词：切片测试, 单元测试, 集成测试, junit, mockito, testcontainers, @WebMvcTest, @MybatisTest, MockMvc, Clock, flaky。
rules:
  - "按照测试金字塔，编写大量单元测试和少量集成测试"
  - "服务单元测试用 Mockito 的 given/when/then 来模拟依赖"
  - "控制器用 @WebMvcTest 和 MockMvc 做切片测试"
  - "集成测试用 Testcontainers 隔离运行真实的 DB·Kafka·Redis"
  - "对时间依赖的代码注入 Clock 以进行确定性测试"
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

# 🧪 后端测试标准 (Backend Testing)

> 统一后端测试的**切片（分层）边界**与按栈（JUnit5·Mockito·Testcontainers）的应用。当新写测试或整顿慢速·不稳定测试时阅读。通用原则遵循下方的参考技能，本文档仅涵盖后端特有的部分与具体工具示例（末尾的 `## 附录：按栈示例`）。

## 1. 通用概念以参考方式（委托）

测试金字塔（单元多·集成/E2E 少）、**AAA（准备-执行-验证, given/when/then）**结构、外部依赖（DB·网络·时钟·文件）的**隔离**与模拟边界、集成测试的**真实基础设施隔离运行**、时间依赖代码的**Clock 注入**、用条件轮询代替固定 sleep 来**消除非确定性（flaky）** — 这些通用规则全部遵循 `unit-testing`·`integration-testing`·`test-strategy`。本文档在其之上，只定义后端分层结构所特有的部分。

## 2. 后端特有：切片（分层）测试

在单元与集成之间，后端设有一个**只薄薄加载框架的一层（bean）**的切片测试层（例如：API 入口 `@WebMvcTest`、数据映射器 `@MybatisTest`/`@DataJpaTest`）。关键在于不启动整个应用，只验证该层的契约。

### 2-1. 切片测试 — 薄薄的单一层

- ✅ 只薄薄加载 API 入口·数据映射器这样的单一层，验证该层的契约（状态码·序列化·校验规则，查询映射）。
- ❌ 不要为了看一层而启动整个应用（慢且意图模糊）。

```text
// ✅ 推荐 — 入口切片：验证成功/校验失败的响应契约
GET  /resource/{id}          → 200 + 正文中含期望字段
POST /resource (空正文)       → 400 + 校验错误码

// ✅ 推荐 — 数据映射器切片：用固定数据(SQL fixture)验证查询映射
seed → 执行查询 → 断言映射结果
```

### 2-2. 测试夹具(Fixture/Builder)模式

- ✅ 将测试数据的创建用夹具/构建器集中到一处。模型变了也只需改一处。
- ❌ 每个测试都长长地内联创建对象 → 模型变更时需同时修改数十个测试。

```text
// ✅ 推荐 — 复用带有有意义默认值的夹具
Fixture.entity(id):           { id, name: "默认名", ... 合理的默认值 }
Fixture.createRequest():      { name: "新建", ... }

// ❌ 禁止 — 在每个测试中内联填充所有字段
new Entity(1, id, "默认名", "...", now(), ...)   // 对变更脆弱
```

## 3. 常见错误（后端特有）

- **对切片使用完整上下文**：为看一层的契约而启动整个应用 → 慢。只加载该层的切片（`@WebMvcTest`/`@MybatisTest`）。
- **用内存库替代集成**：掩盖了与真实引擎的 SQL 方言·功能差异，错过生产 bug → 集成应隔离运行真实引擎（`integration-testing`）。仅当明确验证兼容性时例外。
- **无夹具的内联创建**：模型变更时需同时修改数十个测试 → 用夹具/构建器集中。

> 其他通用错误（滥用完整上下文·使用生产 DB·调用全局「现在」·固定 sleep·测试间共享状态·无断言的测试）见 `unit-testing`·`integration-testing` 的常见错误一节。

## 4. 检查清单（后端特有）

- [ ] 单层验证是否用**切片**（`@WebMvcTest`/`@MybatisTest` 等）而非完整启动来处理？
- [ ] 切片是否只验证该层的契约（状态码·序列化·校验，查询映射）？
- [ ] 是否用**夹具/构建器**集中测试数据，使其对模型变更更健壮？
- [ ] 集成测试是否用**真实基础设施（隔离容器等）**隔离（禁止内存库替代）？

> 通用检查（AAA 分离·断言结果状态·Clock 注入·条件轮询·测试独立性）请一并参见 `unit-testing`·`integration-testing`·`test-strategy` 的检查清单。

---

## 附录：按栈示例

> 以下是把上述中立规则在特定栈中实现的示例。在其他栈中，把相同原则迁移到相应工具上应用。

### JUnit5 + Mockito (Java/Spring)

#### 测试金字塔（分层映射）

```
        ┌───────────────┐
        │   E2E (少量)   │     真实环境场景，非常慢
        ├───────────────┤
        │ 集成 (Testcontainers) │   真实 DB/Kafka/Redis 容器
        ├───────────────┤
        │  切片测试  │     @WebMvcTest, @MybatisTest, @DataJpaTest
        ├───────────────┤
        │   单元测试 (大量)   │  Mockito, 无外部依赖
        └───────────────┘
```

- **单元**：纯 Mockito。不加载 Spring 上下文。应在 1ms 量级内结束。
- **切片**：只加载所需的 bean（`@WebMvcTest`, `@MybatisTest`）。
- **集成**：用 Testcontainers 启动真实的 DB/Kafka。

#### 依赖 (build.gradle)

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

#### 服务单元测试 — Mockito given/when/then

不加载 Spring 上下文、仅用 `@ExtendWith(MockitoExtension.class)` 来跑才是正道。绝对不要在单元测试中使用 `@SpringBootTest`。

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
    @DisplayName("用标签 ID 查询资产时返回资产信息")
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
    @DisplayName("查询不存在的标签 ID 时抛出 BusinessException")
    void getAsset_notFound() {
        given(assetDao.findByTagId("UNKNOWN")).willReturn(null);

        assertThatThrownBy(() -> assetService.getAsset("UNKNOWN"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("자산을 찾을 수 없습니다");
    }
}
```

#### 测试夹具(Builder/Fixture)模式

不要每个测试都长长地写 `new AssetResponse(...)`，而要做一个 Fixture。变更时就不必修改数十个测试。

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

#### 控制器切片测试 — @WebMvcTest + MockMvc

> `@MockitoBean`（Spring Boot 3.4+）是标准。旧版 `@MockBean`（`org.springframework.boot.test.mock.mockito.MockBean`）即将废弃，因此不使用。

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

#### MyBatis Mapper 测试 — @MybatisTest

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
@AutoConfigureTestDatabase(replace = Replace.NONE) // 使用 Testcontainers 时禁用 H2 自动替换
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

#### Testcontainers 集成测试 (PostgreSQL/Kafka/Redis)

H2 与 PostgreSQL 的 SQL 方言不同（`JSONB`, `RETURNING`, `ON CONFLICT`）。用与真实 DB 相同的容器测试，可以防止只在生产环境才爆出的 bug。

> Kafka 用 `ConfluentKafkaContainer`（`org.testcontainers.kafka.ConfluentKafkaContainer`）代替已废弃的 `KafkaContainer`。

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

#### 时间依赖代码 — Clock 注入

在服务内部直接调用 `LocalDateTime.now()` 会使单元测试无法进行。注入一个 `Clock` bean。

```java
@Service
@RequiredArgsConstructor
public class ReportService {
    private final Clock clock;  // @Bean Clock clock() { return Clock.systemDefaultZone(); }

    public Report build() {
        LocalDateTime now = LocalDateTime.now(clock);  // 测试中可注入 Clock.fixed()
        // ...
    }
}

// 测试
Clock fixed = Clock.fixed(Instant.parse("2026-05-11T00:00:00Z"), ZoneId.of("Asia/Seoul"));
ReportService svc = new ReportService(fixed);
```

#### 异步等待 — Awaitility (禁止 Thread.sleep)

```java
// 反模式
@Test
void test1() throws InterruptedException {
    asyncService.process();
    Thread.sleep(2000);  // ❌ Flaky
    assertThat(repo.count()).isEqualTo(1);
}

// 推荐
@Test
void test1() {
    asyncService.process();
    Awaitility.await().atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(repo.count()).isEqualTo(1));
}
```
