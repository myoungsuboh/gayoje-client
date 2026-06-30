---
name: バックエンドテスト標準 (Backend Testing)
description: バックエンド自動化テストのスタック適用標準 — スライス（レイヤー）テストの境界と JUnit5・Mockito・Testcontainers の実装例を扱う。汎用概念（ピラミッド・AAA・隔離・モッキング・Clock・非決定性）は unit-testing・integration-testing・test-strategy に委譲する。テストを新たに書く、または遅い・flaky なテストを整備するときに読む。キーワード: スライステスト, 単体テスト, 統合テスト, junit, mockito, testcontainers, @WebMvcTest, @MybatisTest, MockMvc, Clock, flaky。
rules:
  - "テストピラミッドに従い、単体テストを多く、統合テストを少なく書く"
  - "サービス単体テストは Mockito の given/when/then で依存をモックする"
  - "コントローラは @WebMvcTest と MockMvc でスライステストする"
  - "統合テストは Testcontainers で実 DB・Kafka・Redis を隔離実行する"
  - "時刻依存コードは Clock を注入して決定的にテストする"
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

# 🧪 バックエンドテスト標準 (Backend Testing)

> バックエンドテストの**スライス（レイヤー）境界**とスタックごと（JUnit5・Mockito・Testcontainers）の適用を統一する。テストを新たに書く、または遅い・不安定なテストを整備するときに読む。汎用原則は下記の参照スキルに従い、本文書はバックエンド固有の部分と具体的なツール例（末尾の `## 付録: スタックごとの例`）のみを扱う。

## 1. 汎用概念は参照で（委譲）

テストピラミッド（単体は多く・統合/E2E は少なく）、**AAA（準備-実行-検証, given/when/then）**構造、外部依存（DB・ネットワーク・時計・ファイル）の**隔離**とモッキング境界、統合テストの**実インフラの隔離実行**、時刻依存コードの**Clock 注入**、固定 sleep の代わりに条件ポーリングで**非決定性（flaky）を排除**する — これらの汎用ルールはすべて `unit-testing`・`integration-testing`・`test-strategy` に従う。本文書はその上で、バックエンドのレイヤー構造に固有な部分だけを定義する。

## 2. バックエンド固有: スライス（レイヤー）テスト

単体と統合の間に、バックエンドはフレームワークの**1 レイヤー（Bean）だけを薄くロード**するスライステスト層を置く（例: API 入口 `@WebMvcTest`、データマッパー `@MybatisTest`/`@DataJpaTest`）。アプリケーション全体を起動せずにそのレイヤーの契約だけを検証することが肝心だ。

### 2-1. スライステスト — 薄い 1 レイヤー

- ✅ API 入口・データマッパーのような 1 レイヤーだけを薄くロードし、そのレイヤーの契約（ステータスコード・シリアライズ・検証ルール、クエリマッピング）を検証する。
- ❌ 1 レイヤーを見るためにアプリケーション全体を起動しない（遅く、意図がぼやける）。

```text
// ✅ 推奨 — 入口スライス: 成功/検証失敗のレスポンス契約を検証
GET  /resource/{id}          → 200 + 本文に期待フィールド
POST /resource (空の本文)     → 400 + 検証エラーコード

// ✅ 推奨 — データマッパースライス: 固定データ(SQL fixture)でクエリマッピングを検証
seed → クエリ実行 → マッピング結果を断言
```

### 2-2. テストフィクスチャ(Fixture/Builder)パターン

- ✅ テストデータ生成はフィクスチャ/ビルダーで一箇所にまとめる。モデルが変わっても一箇所だけ直せばよい。
- ❌ テストごとにオブジェクトを長くインライン生成 → モデル変更時に数十のテストを同時に修正しなければならない。

```text
// ✅ 推奨 — 意味のあるデフォルト値を持つフィクスチャを再利用
Fixture.entity(id):           { id, name: "デフォルト名", ... 合理的なデフォルト値 }
Fixture.createRequest():      { name: "新規", ... }

// ❌ 禁止 — 各テストで全フィールドをインラインで埋める
new Entity(1, id, "デフォルト名", "...", now(), ...)   // 変更に弱い
```

## 3. よくあるミス（バックエンド固有）

- **スライスに全コンテキストを使う**: 1 レイヤーの契約を見るのにアプリケーション全体を起動 → 遅い。該当レイヤーのスライス（`@WebMvcTest`/`@MybatisTest`）だけをロードする。
- **インメモリで統合を代替**: 実エンジンとの SQL 方言・機能差を隠し、本番バグを見逃す → 統合は実エンジンを隔離実行する（`integration-testing`）。互換性を明示的に検証するときだけ例外。
- **フィクスチャなしのインライン生成**: モデル変更時に数十のテストを同時に修正しなければならない → フィクスチャ/ビルダーにまとめる。

> その他の一般的なミス（全コンテキストの乱用・本番 DB の使用・グローバルな「今」の呼び出し・固定 sleep・テスト間の状態共有・検証のないテスト）は `unit-testing`・`integration-testing` のよくあるミスの節を見る。

## 4. チェックリスト（バックエンド固有）

- [ ] 1 レイヤーの検証を全起動ではなく**スライス**（`@WebMvcTest`/`@MybatisTest` など）で扱ったか
- [ ] スライスがそのレイヤーの契約（ステータスコード・シリアライズ・検証、クエリマッピング）だけを検証するか
- [ ] テストデータを**フィクスチャ/ビルダー**にまとめ、モデル変更に強くしたか
- [ ] 統合テストが**実インフラ（隔離コンテナなど）**で隔離されているか（インメモリ代替禁止）

> 汎用チェック（AAA 分離・結果ステータスの断言・Clock 注入・条件ポーリング・テスト独立性）は `unit-testing`・`integration-testing`・`test-strategy` のチェックリストもあわせて見る。

---

## 付録: スタックごとの例

> 以下は上記の中立的なルールを特定のスタックで実装した例だ。他のスタックでは同じ原則を該当ツールに移して適用する。

### JUnit5 + Mockito (Java/Spring)

#### テストピラミッド（レイヤーマッピング）

```
        ┌───────────────┐
        │   E2E (少量)   │     実環境シナリオ、非常に遅い
        ├───────────────┤
        │ 統合 (Testcontainers) │   実 DB/Kafka/Redis コンテナ
        ├───────────────┤
        │  スライステスト  │     @WebMvcTest, @MybatisTest, @DataJpaTest
        ├───────────────┤
        │   単体テスト (大量)   │  Mockito, 外部依存なし
        └───────────────┘
```

- **単体**: 純粋な Mockito。Spring コンテキストロードなし。1ms 単位で終わるべき。
- **スライス**: 必要な Bean だけをロード（`@WebMvcTest`, `@MybatisTest`）。
- **統合**: 実 DB/Kafka を Testcontainers で立ち上げる。

#### 依存関係 (build.gradle)

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

#### サービス単体テスト — Mockito given/when/then

Spring コンテキストなしで `@ExtendWith(MockitoExtension.class)` だけで回すのが定石。`@SpringBootTest` は単体テストには絶対に使わないこと。

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
    @DisplayName("タグ ID で資産を照会すると資産情報が返される")
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
    @DisplayName("存在しないタグ ID の照会時に BusinessException が発生する")
    void getAsset_notFound() {
        given(assetDao.findByTagId("UNKNOWN")).willReturn(null);

        assertThatThrownBy(() -> assetService.getAsset("UNKNOWN"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("자산을 찾을 수 없습니다");
    }
}
```

#### テストフィクスチャ(Builder/Fixture)パターン

テストごとに `new AssetResponse(...)` を長く書かず、Fixture を作れ。変更時にテストを数十個直さなくて済む。

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

#### コントローラスライステスト — @WebMvcTest + MockMvc

> `@MockitoBean`（Spring Boot 3.4+）が標準だ。旧版の `@MockBean`（`org.springframework.boot.test.mock.mockito.MockBean`）は廃止予定なので使わない。

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

#### MyBatis Mapper テスト — @MybatisTest

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
@AutoConfigureTestDatabase(replace = Replace.NONE) // Testcontainers 使用時に H2 自動代替を無効化
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

#### Testcontainers 統合テスト (PostgreSQL/Kafka/Redis)

H2 と PostgreSQL は SQL 方言が異なる（`JSONB`, `RETURNING`, `ON CONFLICT`）。実 DB と同一のコンテナでテストすれば、本番環境でしか発生しないバグを防げる。

> Kafka は廃止された `KafkaContainer` の代わりに `ConfluentKafkaContainer`（`org.testcontainers.kafka.ConfluentKafkaContainer`）を使う。

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

#### 時刻依存コード — Clock 注入

`LocalDateTime.now()` をサービス内で直接呼び出すと単体テストが不可能になる。`Clock` Bean を注入せよ。

```java
@Service
@RequiredArgsConstructor
public class ReportService {
    private final Clock clock;  // @Bean Clock clock() { return Clock.systemDefaultZone(); }

    public Report build() {
        LocalDateTime now = LocalDateTime.now(clock);  // テストで Clock.fixed() を注入可能
        // ...
    }
}

// テスト
Clock fixed = Clock.fixed(Instant.parse("2026-05-11T00:00:00Z"), ZoneId.of("Asia/Seoul"));
ReportService svc = new ReportService(fixed);
```

#### 非同期待機 — Awaitility (Thread.sleep 禁止)

```java
// アンチパターン
@Test
void test1() throws InterruptedException {
    asyncService.process();
    Thread.sleep(2000);  // ❌ Flaky
    assertThat(repo.count()).isEqualTo(1);
}

// 推奨
@Test
void test1() {
    asyncService.process();
    Awaitility.await().atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(repo.count()).isEqualTo(1));
}
```
