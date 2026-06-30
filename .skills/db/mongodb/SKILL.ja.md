---
name: MongoDB 設計標準 (Spring Data MongoDB)
description: MongoDB コレクション・ドキュメントのモデリング、インデックス戦略、Spring Data MongoDB + MongoTemplate 連携パターン。新しいコレクションを設計する、埋め込み/参照を決める、Repository・MongoTemplate でクエリ・集計を書くときに読む。キーワード: mongodb, mongo, MongoTemplate, @Document, ObjectId, MongoRepository, BSON, Aggregation, Criteria.
rules:
  - "コレクションは小文字スネークケースの複数形、ドキュメントのフィールドは camelCase で命名する。"
  - "基本的な CRUD は Repository で、複雑なクエリは MongoTemplate で書く。"
  - "クエリパターンに合わせて単一・複合インデックスを設計する。"
  - "一緒に照会されるデータは埋め込み、独立して照会/結合されることが多いデータは参照でモデリングする。"
  - "ドキュメントサイズが 16MB の上限を超えないよう設計する（無限に増える配列を避ける）。"
tags:
  - "mongodb"
  - "mongo"
  - "MongoTemplate"
  - "@Document"
  - "ObjectId"
  - "MongoRepository"
  - "BSON"
  - "Aggregation"
  - "Criteria"
---

# 🍃 MongoDB 設計標準 (Spring Data MongoDB)

> MongoDB コレクション設計と Spring Data MongoDB の連携方式を統一する。新しいコレクションを作る、埋め込み/参照モデリング・インデックス・集計クエリを決めるときに読む。

## 1. 中核原則
- コレクションは小文字スネークケースの複数形、ドキュメントのフィールドは camelCase で命名する。
- 基本的な CRUD は Repository で、複雑なクエリは MongoTemplate で書く。
- クエリパターンに合わせて単一・複合インデックスを設計する。
- 一緒に照会されるデータは埋め込み、独立して照会/結合されることが多いデータは参照でモデリングする。
- ドキュメントサイズが 16MB の上限を超えないよう設計する（無限に増える配列を避ける）。

## 2. ルール

### 2-1. コレクション & ドキュメントの命名
```
コレクション名: 小文字スネークケース、複数形
  例) users, sensor_logs, meeting_records

フィールド名: camelCase (Java モデルへ自動マッピング)
  例) userId, createdAt, sensorData
```

```json
// users コレクションのドキュメント例
{
  "_id": ObjectId("..."),      // 自動生成 (手動指定も可能)
  "userId": "USR-001",
  "userNm": "홍길동",
  "email": "hong@example.com",
  "roles": ["ADMIN", "USER"],  // 配列
  "address": {                 // 埋め込みドキュメント
    "city": "서울",
    "district": "강남구"
  },
  "createdAt": ISODate("2024-01-01T00:00:00Z"),
  "updatedAt": ISODate("2024-01-01T00:00:00Z")
}
```

埋め込み vs 参照の判断:
- ✅ 一緒に照会されるデータは埋め込み — 住所、設定など常に一緒に使うデータ → 埋め込みドキュメント
- ✅ 別々に照会されるデータは参照 — コメント、注文履歴など独立して照会/管理するデータ → 別コレクション + 参照 ID
- ❌ 無限に増える配列の埋め込みは避ける (16MB ドキュメントサイズ制限)

### 2-2. モデルクラス (@Document)
```java
// User.java
@Document(collection = "users")   // コレクションのマッピング
@Data
@NoArgsConstructor
public class User {

    @Id
    private String id;             // MongoDB _id (ObjectId → String 自動変換)

    @Field("userId")
    private String userId;

    @Field("userNm")
    private String userNm;

    @Indexed(unique = true)        // ユニークインデックス
    private String email;

    private List<String> roles = new ArrayList<>();

    private Address address;       // 埋め込みドキュメント

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// Address.java (埋め込み - @Document なし)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Address {
    private String city;
    private String district;
}
```

`@EnableMongoAuditing` — `@CreatedDate`, `@LastModifiedDate` を自動管理:
```java
@Configuration
@EnableMongoAuditing
public class MongoConfig {}
```

### 2-3. Repository (基本 CRUD)
```java
// UserRepository.java
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    List<User> findByRolesContaining(String role);

    // クエリメソッド: findBy, countBy, deleteBy, existsBy
    boolean existsByEmail(String email);

    long countByRolesContaining(String role);

    // @Query アノテーション: MongoDB JSON クエリを直接記述
    @Query("{ 'address.city': ?0, 'roles': { $in: ?1 } }")
    List<User> findByCityAndRoles(String city, List<String> roles);
}
```

### 2-4. MongoTemplate (複雑なクエリ)
動的クエリ・部分更新・配列操作・集計は MongoTemplate で書く。

```java
@Repository
@RequiredArgsConstructor
public class UserCustomRepository {

    private final MongoTemplate mongoTemplate;

    // 動的クエリ (Criteria ビルダー)
    public List<User> searchUsers(String city, String role, int page, int size) {
        Criteria criteria = new Criteria();

        if (StringUtils.hasText(city)) {
            criteria.and("address.city").is(city);
        }
        if (StringUtils.hasText(role)) {
            criteria.and("roles").in(role);
        }

        Query query = new Query(criteria)
            .with(Sort.by(Sort.Direction.DESC, "createdAt"))
            .skip((long) page * size)
            .limit(size);

        return mongoTemplate.find(query, User.class);
    }

    // 全体件数
    public long countUsers(String city) {
        Query query = new Query(Criteria.where("address.city").is(city));
        return mongoTemplate.count(query, User.class);
    }

    // 特定フィールドのみ照会 (Projection)
    public List<User> findUserSummaries() {
        Query query = new Query();
        query.fields().include("userId").include("userNm").include("email");
        return mongoTemplate.find(query, User.class);
    }

    // UPDATE (部分更新)
    public void updateUserCity(String userId, String newCity) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update()
            .set("address.city", newCity)
            .currentDate("updatedAt");
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // 配列要素の追加/削除
    public void addRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().addToSet("roles", role);  // 重複なく追加
        mongoTemplate.updateFirst(query, update, User.class);
    }

    public void removeRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().pull("roles", role);
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // Aggregation (集計)
    public List<Document> countByCity() {
        Aggregation agg = Aggregation.newAggregation(
            Aggregation.group("address.city").count().as("userCount"),
            Aggregation.sort(Sort.Direction.DESC, "userCount"),
            Aggregation.limit(10)
        );
        return mongoTemplate.aggregate(agg, "users", Document.class).getMappedResults();
    }
}
```

### 2-5. application.yml + 依存関係
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://app_user:${DB_PASSWORD}@localhost:27017/mydb?authSource=admin
      # または個別設定
      host: localhost
      port: 27017
      database: mydb
      username: app_user
      password: ${DB_PASSWORD}
      auto-index-creation: true   # @Indexed 自動インデックス生成 (開発の利便性、運用は false)
```

```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-mongodb'
```

### 2-6. インデックス設計
```java
// モデルに @Indexed を宣言 (auto-index-creation: true 時に自動生成)
@Indexed(unique = true)
private String email;

@Indexed(expireAfterSeconds = 86400)   // TTL インデックス: 24時間後に自動削除 (ログ系データ)
private LocalDateTime expiresAt;

// 複合インデックス: @CompoundIndex
@Document(collection = "sensor_logs")
@CompoundIndex(def = "{'deviceId': 1, 'timestamp': -1}")  // deviceId 昇順、timestamp 降順
public class SensorLog { ... }
```

直接生成 (MongoTemplate):
```java
@PostConstruct
public void createIndexes() {
    mongoTemplate.indexOps("users")
        .ensureIndex(new Index().on("address.city", Sort.Direction.ASC));

    // TTL インデックス
    mongoTemplate.indexOps("session_logs")
        .ensureIndex(new Index().on("createdAt", Sort.Direction.ASC)
            .expire(Duration.ofHours(24)));
}
```

### 2-7. RDBMS vs MongoDB 設計判断基準
| 状況 | 選択 |
|------|------|
| スキーマが固定で変更が少ない | RDBMS |
| スキーマが流動的、ネスト構造が多い | MongoDB |
| 複雑な JOIN が必須 | RDBMS |
| 大容量ログ、イベント蓄積 | MongoDB |
| トランザクション整合性が重要 (金融/注文) | RDBMS |
| リアルタイムセンサーデータ、IoT | MongoDB or TimescaleDB |
| 高速プロトタイピング、スキーマ未確定 | MongoDB |

## 3. よくあるミス
- 無限に増える配列を埋め込み → 16MB ドキュメント上限に到達。
- 結合が多いデータを埋め込み → 重複・整合性の問題、参照でモデリングすべき。
- 運用環境で `auto-index-creation: true` を放置 → 意図しないインデックス生成。運用は false にして明示的に生成。
- 複雑なクエリを Repository メソッド名で無理に表現 → MongoTemplate/Criteria で書く。

## 4. チェックリスト
- [ ] コレクションは複数形、フィールドは camelCase で命名したか
- [ ] 埋め込み vs 参照をクエリパターン基準で決定したか
- [ ] ドキュメントが 16MB 上限内に収まるか (配列の無限増加なし)
- [ ] 基本 CRUD は Repository、複雑なクエリは MongoTemplate に分離したか
- [ ] クエリパターンに合う単一・複合インデックスを設計したか
- [ ] 運用環境でインデックス生成戦略 (`auto-index-creation`) を確認したか
