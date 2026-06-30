---
name: MongoDB 설계 표준 (Spring Data MongoDB)
description: MongoDB 컬렉션·도큐먼트 모델링, 인덱스 전략과 Spring Data MongoDB + MongoTemplate 연동 패턴. 새 컬렉션을 설계하거나 임베딩/참조를 정하고 Repository·MongoTemplate으로 쿼리·집계를 작성할 때 읽는다. 키워드: mongodb, mongo, MongoTemplate, @Document, ObjectId, MongoRepository, BSON, Aggregation, Criteria.
rules:
  - "컬렉션은 소문자 스네이크케이스 복수형, 도큐먼트 필드는 camelCase로 네이밍한다."
  - "기본 CRUD는 Repository로, 복잡한 쿼리는 MongoTemplate으로 작성한다."
  - "조회 패턴에 맞춰 단일·복합 인덱스를 설계한다."
  - "함께 조회되는 데이터는 임베딩, 독립 조회/조인이 잦은 데이터는 참조로 모델링한다."
  - "도큐먼트 크기 16MB 한계를 넘지 않도록 설계한다 (무한정 늘어나는 배열 지양)."
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

# 🍃 MongoDB 설계 표준 (Spring Data MongoDB)

> MongoDB 컬렉션 설계와 Spring Data MongoDB 연동 방식을 통일한다. 새 컬렉션을 만들거나 임베딩/참조 모델링·인덱스·집계 쿼리를 정할 때 읽는다.

## 1. 핵심 원칙
- 컬렉션은 소문자 스네이크케이스 복수형, 도큐먼트 필드는 camelCase로 네이밍한다.
- 기본 CRUD는 Repository로, 복잡한 쿼리는 MongoTemplate으로 작성한다.
- 조회 패턴에 맞춰 단일·복합 인덱스를 설계한다.
- 함께 조회되는 데이터는 임베딩, 독립 조회/조인이 잦은 데이터는 참조로 모델링한다.
- 도큐먼트 크기 16MB 한계를 넘지 않도록 설계한다 (무한정 늘어나는 배열 지양).

## 2. 규칙

### 2-1. 컬렉션 & 도큐먼트 네이밍
```
컬렉션명: 소문자 스네이크케이스, 복수형
  예) users, sensor_logs, meeting_records

필드명: camelCase (Java 모델 자동 매핑)
  예) userId, createdAt, sensorData
```

```json
// users 컬렉션 도큐먼트 예시
{
  "_id": ObjectId("..."),      // 자동 생성 (수동 지정 가능)
  "userId": "USR-001",
  "userNm": "홍길동",
  "email": "hong@example.com",
  "roles": ["ADMIN", "USER"],  // 배열
  "address": {                 // 임베디드 도큐먼트
    "city": "서울",
    "district": "강남구"
  },
  "createdAt": ISODate("2024-01-01T00:00:00Z"),
  "updatedAt": ISODate("2024-01-01T00:00:00Z")
}
```

임베딩 vs 참조 판단:
- ✅ 함께 조회되는 데이터는 임베딩 — 주소, 설정 등 항상 함께 쓰이는 데이터 → 임베디드 도큐먼트
- ✅ 별도 조회되는 데이터는 참조 — 댓글, 주문 이력 등 독립적으로 조회/관리 → 별도 컬렉션 + 참조 ID
- ❌ 무한정 늘어나는 배열은 임베딩 지양 (16MB 도큐먼트 크기 제한)

### 2-2. 모델 클래스 (@Document)
```java
// User.java
@Document(collection = "users")   // 컬렉션 매핑
@Data
@NoArgsConstructor
public class User {

    @Id
    private String id;             // MongoDB _id (ObjectId → String 자동 변환)

    @Field("userId")
    private String userId;

    @Field("userNm")
    private String userNm;

    @Indexed(unique = true)        // 유니크 인덱스
    private String email;

    private List<String> roles = new ArrayList<>();

    private Address address;       // 임베디드 도큐먼트

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// Address.java (임베디드 - @Document 없음)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Address {
    private String city;
    private String district;
}
```

`@EnableMongoAuditing` — `@CreatedDate`, `@LastModifiedDate` 자동 관리:
```java
@Configuration
@EnableMongoAuditing
public class MongoConfig {}
```

### 2-3. Repository (기본 CRUD)
```java
// UserRepository.java
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    List<User> findByRolesContaining(String role);

    // 쿼리 메서드: findBy, countBy, deleteBy, existsBy
    boolean existsByEmail(String email);

    long countByRolesContaining(String role);

    // @Query 어노테이션: MongoDB JSON 쿼리 직접 작성
    @Query("{ 'address.city': ?0, 'roles': { $in: ?1 } }")
    List<User> findByCityAndRoles(String city, List<String> roles);
}
```

### 2-4. MongoTemplate (복잡한 쿼리)
동적 쿼리·부분 수정·배열 조작·집계는 MongoTemplate으로 작성한다.

```java
@Repository
@RequiredArgsConstructor
public class UserCustomRepository {

    private final MongoTemplate mongoTemplate;

    // 동적 쿼리 (Criteria 빌더)
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

    // 전체 건수
    public long countUsers(String city) {
        Query query = new Query(Criteria.where("address.city").is(city));
        return mongoTemplate.count(query, User.class);
    }

    // 특정 필드만 조회 (Projection)
    public List<User> findUserSummaries() {
        Query query = new Query();
        query.fields().include("userId").include("userNm").include("email");
        return mongoTemplate.find(query, User.class);
    }

    // UPDATE (부분 수정)
    public void updateUserCity(String userId, String newCity) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update()
            .set("address.city", newCity)
            .currentDate("updatedAt");
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // 배열 요소 추가/제거
    public void addRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().addToSet("roles", role);  // 중복 없이 추가
        mongoTemplate.updateFirst(query, update, User.class);
    }

    public void removeRole(String userId, String role) {
        Query query = new Query(Criteria.where("userId").is(userId));
        Update update = new Update().pull("roles", role);
        mongoTemplate.updateFirst(query, update, User.class);
    }

    // Aggregation (집계)
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

### 2-5. application.yml + 의존성
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://app_user:${DB_PASSWORD}@localhost:27017/mydb?authSource=admin
      # 또는 개별 설정
      host: localhost
      port: 27017
      database: mydb
      username: app_user
      password: ${DB_PASSWORD}
      auto-index-creation: true   # @Indexed 자동 인덱스 생성 (개발 편의, 운영은 false)
```

```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-mongodb'
```

### 2-6. 인덱스 설계
```java
// 모델에 @Indexed 선언 (auto-index-creation: true 시 자동 생성)
@Indexed(unique = true)
private String email;

@Indexed(expireAfterSeconds = 86400)   // TTL 인덱스: 24시간 후 자동 삭제 (로그성 데이터)
private LocalDateTime expiresAt;

// 복합 인덱스: @CompoundIndex
@Document(collection = "sensor_logs")
@CompoundIndex(def = "{'deviceId': 1, 'timestamp': -1}")  // deviceId 오름차순, timestamp 내림차순
public class SensorLog { ... }
```

직접 생성 (MongoTemplate):
```java
@PostConstruct
public void createIndexes() {
    mongoTemplate.indexOps("users")
        .ensureIndex(new Index().on("address.city", Sort.Direction.ASC));

    // TTL 인덱스
    mongoTemplate.indexOps("session_logs")
        .ensureIndex(new Index().on("createdAt", Sort.Direction.ASC)
            .expire(Duration.ofHours(24)));
}
```

### 2-7. RDBMS vs MongoDB 설계 판단 기준
| 상황 | 선택 |
|------|------|
| 스키마가 고정되고 변경이 적음 | RDBMS |
| 스키마가 유동적, 중첩 구조 많음 | MongoDB |
| 복잡한 JOIN이 필수 | RDBMS |
| 대용량 로그, 이벤트 적재 | MongoDB |
| 트랜잭션 정합성 중요 (금융/주문) | RDBMS |
| 실시간 센서 데이터, IoT | MongoDB or TimescaleDB |
| 빠른 프로토타이핑, 스키마 미확정 | MongoDB |

## 3. 흔한 실수
- 무한정 늘어나는 배열을 임베딩 → 16MB 도큐먼트 한계 도달.
- 조인이 잦은 데이터를 임베딩 → 중복·정합성 문제, 참조로 모델링해야 함.
- 운영 환경에서 `auto-index-creation: true` 방치 → 의도치 않은 인덱스 생성. 운영은 false 후 명시적 생성.
- 복잡 쿼리를 Repository 메서드명으로 억지 표현 → MongoTemplate/Criteria로 작성.

## 4. 체크리스트
- [ ] 컬렉션은 복수형, 필드는 camelCase로 네이밍했는가
- [ ] 임베딩 vs 참조를 조회 패턴 기준으로 결정했는가
- [ ] 도큐먼트가 16MB 한계 안에 들어가는가 (배열 무한 증가 없음)
- [ ] 기본 CRUD는 Repository, 복잡 쿼리는 MongoTemplate으로 분리했는가
- [ ] 조회 패턴에 맞는 단일·복합 인덱스를 설계했는가
- [ ] 운영 환경에서 인덱스 생성 전략(`auto-index-creation`)을 확인했는가
