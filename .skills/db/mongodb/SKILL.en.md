---
name: MongoDB Design Standard (Spring Data MongoDB)
description: MongoDB collection/document modeling, indexing strategy, and Spring Data MongoDB + MongoTemplate integration patterns. Read when designing a new collection, deciding embedding vs. referencing, or writing queries/aggregations with Repository/MongoTemplate. Keywords: mongodb, mongo, MongoTemplate, @Document, ObjectId, MongoRepository, BSON, Aggregation, Criteria.
rules:
  - "Name collections in lowercase snake_case plural, and document fields in camelCase."
  - "Write basic CRUD with Repository and complex queries with MongoTemplate."
  - "Design single and compound indexes to match query patterns."
  - "Model data that is queried together as embedded, and data that is frequently queried/joined independently as references."
  - "Design so documents do not exceed the 16MB size limit (avoid unbounded arrays)."
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

# 🍃 MongoDB Design Standard (Spring Data MongoDB)

> Unify MongoDB collection design and Spring Data MongoDB integration. Read when creating a new collection or deciding embedding/reference modeling, indexes, and aggregation queries.

## 1. Core Principles
- Name collections in lowercase snake_case plural, and document fields in camelCase.
- Write basic CRUD with Repository and complex queries with MongoTemplate.
- Design single and compound indexes to match query patterns.
- Model data that is queried together as embedded, and data that is frequently queried/joined independently as references.
- Design so documents do not exceed the 16MB size limit (avoid unbounded arrays).

## 2. Rules

### 2-1. Collection & Document Naming
```
Collection name: lowercase snake_case, plural
  e.g.) users, sensor_logs, meeting_records

Field name: camelCase (auto-mapped to Java model)
  e.g.) userId, createdAt, sensorData
```

```json
// Example document in the users collection
{
  "_id": ObjectId("..."),      // auto-generated (can be assigned manually)
  "userId": "USR-001",
  "userNm": "홍길동",
  "email": "hong@example.com",
  "roles": ["ADMIN", "USER"],  // array
  "address": {                 // embedded document
    "city": "서울",
    "district": "강남구"
  },
  "createdAt": ISODate("2024-01-01T00:00:00Z"),
  "updatedAt": ISODate("2024-01-01T00:00:00Z")
}
```

Embedding vs. reference decision:
- ✅ Embed data that is queried together — data always used together such as address or settings → embedded document
- ✅ Reference data that is queried separately — data queried/managed independently such as comments or order history → separate collection + reference ID
- ❌ Avoid embedding unbounded arrays (16MB document size limit)

### 2-2. Model Class (@Document)
```java
// User.java
@Document(collection = "users")   // collection mapping
@Data
@NoArgsConstructor
public class User {

    @Id
    private String id;             // MongoDB _id (ObjectId → String auto-conversion)

    @Field("userId")
    private String userId;

    @Field("userNm")
    private String userNm;

    @Indexed(unique = true)        // unique index
    private String email;

    private List<String> roles = new ArrayList<>();

    private Address address;       // embedded document

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// Address.java (embedded - no @Document)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Address {
    private String city;
    private String district;
}
```

`@EnableMongoAuditing` — auto-manages `@CreatedDate`, `@LastModifiedDate`:
```java
@Configuration
@EnableMongoAuditing
public class MongoConfig {}
```

### 2-3. Repository (basic CRUD)
```java
// UserRepository.java
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    List<User> findByRolesContaining(String role);

    // query methods: findBy, countBy, deleteBy, existsBy
    boolean existsByEmail(String email);

    long countByRolesContaining(String role);

    // @Query annotation: write MongoDB JSON queries directly
    @Query("{ 'address.city': ?0, 'roles': { $in: ?1 } }")
    List<User> findByCityAndRoles(String city, List<String> roles);
}
```

### 2-4. MongoTemplate (complex queries)
Write dynamic queries, partial updates, array manipulation, and aggregation with MongoTemplate.

```java
@Repository
@RequiredArgsConstructor
public class UserCustomRepository {

    private final MongoTemplate mongoTemplate;

    // dynamic query (Criteria builder)
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

    // total count
    public long countUsers(String city) {
        Query query = new Query(Criteria.where("address.city").is(city));
        return mongoTemplate.count(query, User.class);
    }

    // query only specific fields (Projection)
    public List<User> findUserSummaries() {
        Query query = new Query();
        query.fields().include("userId").include("userNm").include("email");
        return mongoTemplate.find(query, User.class);
    }

    // UPDATE (partial)
    public void updateUserCity(String userId, String newCity) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update()
            .set("address.city", newCity)
            .currentDate("updatedAt");
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // add/remove array elements
    public void addRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().addToSet("roles", role);  // add without duplicates
        mongoTemplate.updateFirst(query, update, User.class);
    }

    public void removeRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().pull("roles", role);
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // Aggregation
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

### 2-5. application.yml + dependency
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://app_user:${DB_PASSWORD}@localhost:27017/mydb?authSource=admin
      # or individual settings
      host: localhost
      port: 27017
      database: mydb
      username: app_user
      password: ${DB_PASSWORD}
      auto-index-creation: true   # @Indexed auto index creation (dev convenience; false in production)
```

```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-mongodb'
```

### 2-6. Index Design
```java
// declare @Indexed on the model (auto-created when auto-index-creation: true)
@Indexed(unique = true)
private String email;

@Indexed(expireAfterSeconds = 86400)   // TTL index: auto-delete after 24 hours (log-type data)
private LocalDateTime expiresAt;

// compound index: @CompoundIndex
@Document(collection = "sensor_logs")
@CompoundIndex(def = "{'deviceId': 1, 'timestamp': -1}")  // deviceId ascending, timestamp descending
public class SensorLog { ... }
```

Create directly (MongoTemplate):
```java
@PostConstruct
public void createIndexes() {
    mongoTemplate.indexOps("users")
        .ensureIndex(new Index().on("address.city", Sort.Direction.ASC));

    // TTL index
    mongoTemplate.indexOps("session_logs")
        .ensureIndex(new Index().on("createdAt", Sort.Direction.ASC)
            .expire(Duration.ofHours(24)));
}
```

### 2-7. RDBMS vs MongoDB Design Decision Criteria
| Situation | Choice |
|------|------|
| Schema is fixed with few changes | RDBMS |
| Schema is fluid, with many nested structures | MongoDB |
| Complex JOINs are essential | RDBMS |
| High-volume logs, event ingestion | MongoDB |
| Transactional integrity matters (finance/orders) | RDBMS |
| Real-time sensor data, IoT | MongoDB or TimescaleDB |
| Rapid prototyping, schema undecided | MongoDB |

## 3. Common Mistakes
- Embedding unbounded arrays → reaching the 16MB document limit.
- Embedding data that is frequently joined → duplication/integrity problems; should be modeled as references.
- Leaving `auto-index-creation: true` in production → unintended index creation. Set to false in production and create explicitly.
- Forcing complex queries into Repository method names → write with MongoTemplate/Criteria.

## 4. Checklist
- [ ] Are collections named in plural and fields in camelCase?
- [ ] Was embedding vs. reference decided based on query patterns?
- [ ] Do documents fit within the 16MB limit (no unbounded array growth)?
- [ ] Are basic CRUD separated into Repository and complex queries into MongoTemplate?
- [ ] Are single/compound indexes designed to match query patterns?
- [ ] Was the index creation strategy (`auto-index-creation`) verified for production?
