---
name: MongoDB 设计标准 (Spring Data MongoDB)
description: MongoDB 集合·文档建模、索引策略以及 Spring Data MongoDB + MongoTemplate 集成模式。在设计新集合、决定内嵌/引用，或用 Repository·MongoTemplate 编写查询·聚合时阅读。关键词: mongodb, mongo, MongoTemplate, @Document, ObjectId, MongoRepository, BSON, Aggregation, Criteria.
rules:
  - "集合用小写蛇形复数命名，文档字段用 camelCase 命名。"
  - "基础 CRUD 用 Repository 编写，复杂查询用 MongoTemplate 编写。"
  - "按查询模式设计单列·复合索引。"
  - "经常一起查询的数据用内嵌建模，经常独立查询/连接的数据用引用建模。"
  - "设计时确保文档大小不超过 16MB 上限（避免无限增长的数组）。"
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

# 🍃 MongoDB 设计标准 (Spring Data MongoDB)

> 统一 MongoDB 集合设计与 Spring Data MongoDB 集成方式。在创建新集合或决定内嵌/引用建模·索引·聚合查询时阅读。

## 1. 核心原则
- 集合用小写蛇形复数命名，文档字段用 camelCase 命名。
- 基础 CRUD 用 Repository 编写，复杂查询用 MongoTemplate 编写。
- 按查询模式设计单列·复合索引。
- 经常一起查询的数据用内嵌建模，经常独立查询/连接的数据用引用建模。
- 设计时确保文档大小不超过 16MB 上限（避免无限增长的数组）。

## 2. 规则

### 2-1. 集合 & 文档命名
```
集合名: 小写蛇形, 复数
  例) users, sensor_logs, meeting_records

字段名: camelCase (自动映射到 Java 模型)
  例) userId, createdAt, sensorData
```

```json
// users 集合文档示例
{
  "_id": ObjectId("..."),      // 自动生成 (可手动指定)
  "userId": "USR-001",
  "userNm": "홍길동",
  "email": "hong@example.com",
  "roles": ["ADMIN", "USER"],  // 数组
  "address": {                 // 内嵌文档
    "city": "서울",
    "district": "강남구"
  },
  "createdAt": ISODate("2024-01-01T00:00:00Z"),
  "updatedAt": ISODate("2024-01-01T00:00:00Z")
}
```

内嵌 vs 引用 判断:
- ✅ 一起查询的数据用内嵌 — 地址、设置等总是一起使用的数据 → 内嵌文档
- ✅ 单独查询的数据用引用 — 评论、订单历史等独立查询/管理的数据 → 独立集合 + 引用 ID
- ❌ 无限增长的数组避免内嵌 (16MB 文档大小限制)

### 2-2. 模型类 (@Document)
```java
// User.java
@Document(collection = "users")   // 集合映射
@Data
@NoArgsConstructor
public class User {

    @Id
    private String id;             // MongoDB _id (ObjectId → String 自动转换)

    @Field("userId")
    private String userId;

    @Field("userNm")
    private String userNm;

    @Indexed(unique = true)        // 唯一索引
    private String email;

    private List<String> roles = new ArrayList<>();

    private Address address;       // 内嵌文档

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// Address.java (内嵌 - 无 @Document)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Address {
    private String city;
    private String district;
}
```

`@EnableMongoAuditing` — 自动管理 `@CreatedDate`, `@LastModifiedDate`:
```java
@Configuration
@EnableMongoAuditing
public class MongoConfig {}
```

### 2-3. Repository (基础 CRUD)
```java
// UserRepository.java
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    List<User> findByRolesContaining(String role);

    // 查询方法: findBy, countBy, deleteBy, existsBy
    boolean existsByEmail(String email);

    long countByRolesContaining(String role);

    // @Query 注解: 直接编写 MongoDB JSON 查询
    @Query("{ 'address.city': ?0, 'roles': { $in: ?1 } }")
    List<User> findByCityAndRoles(String city, List<String> roles);
}
```

### 2-4. MongoTemplate (复杂查询)
动态查询·部分更新·数组操作·聚合用 MongoTemplate 编写。

```java
@Repository
@RequiredArgsConstructor
public class UserCustomRepository {

    private final MongoTemplate mongoTemplate;

    // 动态查询 (Criteria 构建器)
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

    // 总数
    public long countUsers(String city) {
        Query query = new Query(Criteria.where("address.city").is(city));
        return mongoTemplate.count(query, User.class);
    }

    // 只查询特定字段 (Projection)
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

    // 数组元素添加/移除
    public void addRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().addToSet("roles", role);  // 无重复添加
        mongoTemplate.updateFirst(query, update, User.class);
    }

    public void removeRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().pull("roles", role);
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // Aggregation (聚合)
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

### 2-5. application.yml + 依赖
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://app_user:${DB_PASSWORD}@localhost:27017/mydb?authSource=admin
      # 或单独设置
      host: localhost
      port: 27017
      database: mydb
      username: app_user
      password: ${DB_PASSWORD}
      auto-index-creation: true   # @Indexed 自动创建索引 (开发便利, 生产设为 false)
```

```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-mongodb'
```

### 2-6. 索引设计
```java
// 在模型上声明 @Indexed (auto-index-creation: true 时自动创建)
@Indexed(unique = true)
private String email;

@Indexed(expireAfterSeconds = 86400)   // TTL 索引: 24小时后自动删除 (日志类数据)
private LocalDateTime expiresAt;

// 复合索引: @CompoundIndex
@Document(collection = "sensor_logs")
@CompoundIndex(def = "{'deviceId': 1, 'timestamp': -1}")  // deviceId 升序, timestamp 降序
public class SensorLog { ... }
```

直接创建 (MongoTemplate):
```java
@PostConstruct
public void createIndexes() {
    mongoTemplate.indexOps("users")
        .ensureIndex(new Index().on("address.city", Sort.Direction.ASC));

    // TTL 索引
    mongoTemplate.indexOps("session_logs")
        .ensureIndex(new Index().on("createdAt", Sort.Direction.ASC)
            .expire(Duration.ofHours(24)));
}
```

### 2-7. RDBMS vs MongoDB 设计判断标准
| 情况 | 选择 |
|------|------|
| 模式固定且变更少 | RDBMS |
| 模式灵活, 嵌套结构多 | MongoDB |
| 必须复杂 JOIN | RDBMS |
| 大量日志, 事件写入 | MongoDB |
| 事务一致性重要 (金融/订单) | RDBMS |
| 实时传感器数据, IoT | MongoDB or TimescaleDB |
| 快速原型, 模式未定 | MongoDB |

## 3. 常见错误
- 内嵌无限增长的数组 → 触及 16MB 文档上限。
- 内嵌经常连接的数据 → 重复·一致性问题, 应用引用建模。
- 在生产环境放任 `auto-index-creation: true` → 产生意外索引。生产设为 false 后显式创建。
- 用 Repository 方法名硬套复杂查询 → 用 MongoTemplate/Criteria 编写。

## 4. 检查清单
- [ ] 集合是否用复数、字段是否用 camelCase 命名
- [ ] 是否按查询模式决定内嵌 vs 引用
- [ ] 文档是否在 16MB 上限内 (无数组无限增长)
- [ ] 基础 CRUD 是否分离到 Repository、复杂查询分离到 MongoTemplate
- [ ] 是否设计了匹配查询模式的单列·复合索引
- [ ] 是否确认了生产环境的索引创建策略 (`auto-index-creation`)
