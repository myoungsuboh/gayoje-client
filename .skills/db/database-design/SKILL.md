---
name: PostgreSQL + TimescaleDB 설계 (시계열 도메인)
description: 시계열 데이터(IIoT 센서/이벤트)를 다루는 PostgreSQL + TimescaleDB 전용 설계 가이드. 하이퍼테이블·인덱스·MyBatis 매핑·Flyway 마이그레이션을 설계할 때 읽는다. 일반 RDBMS 공통 네이밍·컬럼 규약은 db-common-conventions가 단일 출처. 키워드: primary key, foreign key, normalize, snake_case, schema, constraint, hypertable, TimescaleDB.
rules:
  - "시계열 센서·이벤트 데이터는 PostgreSQL + TimescaleDB 하이퍼테이블로 저장한다."
  - "테이블·컬럼 네이밍은 db-common-conventions 표준을 따른다."
  - "모든 테이블에 생성·수정 시각 등 공통 컬럼을 포함한다."
  - "조회 패턴에 맞춰 복합 인덱스를 설계한다."
  - "DB 스키마 변경은 Flyway 마이그레이션으로 형상 관리한다."
tags:
  - "primary key"
  - "foreign key"
  - "normalize"
  - "snake_case"
  - "schema"
  - "constraint"
  - "hypertable"
  - "TimescaleDB"
---

# 🐘 PostgreSQL + TimescaleDB 설계

> 시계열 센서·이벤트 데이터를 PostgreSQL + TimescaleDB로 설계한다. 하이퍼테이블·인덱스·MyBatis 매핑·Flyway 마이그레이션을 설계할 때 읽는다.

> **공통 규약의 단일 출처**: 테이블/컬럼 네이밍, 공통 컬럼(`created_at` 등), MyBatis 매핑 등 RDBMS 비종속적인 규칙은 `db-common-conventions` 스킬에 있다. 이 파일은 **PostgreSQL/TimescaleDB 특화 내용**만 다룬다. 다른 dialect 파일(`mariadb-mybatis`, `oracle-mybatis` 등)과 네이밍 규칙이 충돌하면 **`db-common-conventions`가 우선**이다. 관련 스킬: 트랜잭션/락은 `transaction-locking`, HikariCP 튜닝은 `connection-pool-tuning`, 마이그레이션은 `db-migration-flyway`.

## 1. 핵심 원칙
- 시계열 센서·이벤트 데이터는 PostgreSQL + TimescaleDB 하이퍼테이블로 저장한다.
- 테이블·컬럼 네이밍은 `db-common-conventions` 표준을 따른다.
- 모든 테이블에 생성·수정 시각 등 공통 컬럼을 포함한다.
- 조회 패턴에 맞춰 복합 인덱스를 설계한다.
- DB 스키마 변경은 Flyway 마이그레이션으로 형상 관리한다.

## 2. 규칙

### 2-1. 테이블 네이밍 규칙 (요약 — 단일 출처는 db-common-conventions)
- 테이블명: 소문자 + `snake_case` + 복수형. 접두사(`tb_`, `TB_`) **금지**.
- 컬럼명: 소문자 + `snake_case`. 약어(`_nm`, `_dt`, `use_yn`) **금지**.
- Primary Key: 단일 테이블 단위 `id` 또는 참조 명확화가 필요하면 `<단수>_id` (예: `user_id`).
- Java 필드명(camelCase) ↔ DB 컬럼명(snake_case) 매핑은 `mybatis.configuration.map-underscore-to-camel-case: true`로 자동 처리.

```sql
-- ✅ 좋은 예
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL       PRIMARY KEY,
    tag_id          VARCHAR(50)     NOT NULL UNIQUE,
    asset_name      VARCHAR(200)    NOT NULL,
    deck_id         VARCHAR(20),
    sap_asset_id    VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                              -- 논리 삭제: NULL=활성
);

-- ❌ 나쁜 예 (단수형, 대문자 혼용)
CREATE TABLE AssetMaster (
    id      INT PRIMARY KEY,
    TagId   VARCHAR(50)
);
```

### 2-2. 공통 컬럼 (모든 테이블에 기본 포함)
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 생성 시각
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 수정 시각
deleted_at  TIMESTAMPTZ                          -- 논리 삭제: NULL=활성 (db-common-conventions 표준)
```

### 2-3. 인덱스 전략
자주 WHERE 조건에 쓰이는 컬럼에 인덱스를 건다. 인덱스가 너무 많으면 INSERT/UPDATE 속도가 느려지니 꼭 필요한 것만 건다.
```sql
-- 단일 컬럼 인덱스
CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);

-- 복합 인덱스 (두 컬럼을 같이 조회할 때)
CREATE INDEX idx_sensors_deck_time ON sensor_time_series(deck_id, measured_at DESC);

-- 부분 인덱스 (삭제되지 않은 데이터만)
CREATE INDEX idx_assets_active ON asset_masters(tag_id) WHERE deleted_at IS NULL;
```

### 2-4. TimescaleDB 시계열 데이터 처리
센서 데이터처럼 시간 순서로 쌓이는 데이터는 TimescaleDB의 하이퍼테이블을 사용한다.
```sql
-- 1. 일반 테이블 먼저 생성
CREATE TABLE sensor_time_series (
    sensor_id    VARCHAR(50)      NOT NULL,
    deck_id      VARCHAR(20)      NOT NULL,
    value        DOUBLE PRECISION,
    unit         VARCHAR(20),
    measured_at  TIMESTAMPTZ      NOT NULL
);

-- 2. 하이퍼테이블로 변환 (시간 컬럼 기준으로 자동 파티셔닝)
SELECT create_hypertable('sensor_time_series', 'measured_at');

-- 3. Deck ID 기반 공간 파티셔닝 추가 (쿼리 성능 향상)
SELECT add_dimension('sensor_time_series', 'deck_id', number_partitions => 8);

-- 4. 데이터 보관 정책 (2년 이후 자동 삭제)
SELECT add_retention_policy('sensor_time_series', INTERVAL '2 years');
```

### 2-5. MyBatis Mapper XML과 DB 컬럼 연동
DB 컬럼명(snake_case)과 Java 필드명(camelCase)은 `<resultMap>`으로 명시적으로 매핑한다. `application.yml`에 `map-underscore-to-camel-case: true` 설정을 하면 자동 변환되지만, 복잡한 쿼리나 JOIN이 있을 때는 `<resultMap>`을 직접 작성하는 것이 명확하다.
```xml
<!-- 기본 ResultMap -->
<resultMap id="assetResultMap" type="com.harness.dto.response.AssetResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <result property="deckId"    column="deck_id" />
    <result property="sapAssetId" column="sap_asset_id" />
    <result property="createdAt" column="created_at" />
</resultMap>

<!-- JOIN이 있는 경우 - association으로 연관 객체 매핑 -->
<resultMap id="assetDetailResultMap" type="com.harness.dto.response.AssetDetailResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <!-- 연관 객체 (1:1) -->
    <association property="sensorInfo" javaType="com.harness.dto.response.SensorInfoResponse">
        <result property="sensorId"   column="sensor_id" />
        <result property="protocol"   column="protocol" />
    </association>
    <!-- 연관 컬렉션 (1:N) -->
    <collection property="anomalyEvents" ofType="com.harness.dto.response.AnomalyEventResponse">
        <result property="eventId"    column="event_id" />
        <result property="score"      column="anomaly_score" />
    </collection>
</resultMap>
```

### 2-6. 동적 쿼리 패턴 (MyBatis)
검색 조건이 있을 때만 WHERE 절을 추가하는 동적 쿼리 작성법이다.
```xml
<!-- 검색 조건 DTO를 받아서 동적으로 쿼리 생성 -->
<select id="findByCondition" parameterType="com.harness.dto.request.AssetSearchRequest"
        resultMap="assetResultMap">
    SELECT asset_master_id
         , tag_id
         , asset_name
         , deck_id
      FROM asset_masters
     <where>
           deleted_at IS NULL
        <if test="deckId != null and deckId != ''">
           AND deck_id = #{deckId}
        </if>
        <if test="keyword != null and keyword != ''">
           AND asset_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        <if test="sapAssetId != null and sapAssetId != ''">
           AND sap_asset_id = #{sapAssetId}
        </if>
     </where>
     ORDER BY created_at DESC
    <if test="limit != null">
     LIMIT #{limit} OFFSET #{offset}
    </if>
</select>

<!-- IN 절 동적 처리 -->
<select id="findByDeckIds" resultMap="assetResultMap">
    SELECT asset_master_id, tag_id, asset_name, deck_id
      FROM asset_masters
     WHERE deck_id IN
    <foreach item="deckId" collection="deckIds" open="(" separator="," close=")">
        #{deckId}
    </foreach>
       AND deleted_at IS NULL
</select>
```

### 2-7. Flyway 마이그레이션 (DB 형상 관리)
DB 스키마 변경 이력을 코드로 관리한다. SQL 파일을 직접 DB에 실행하지 않는다. 파일명 규칙: `V{버전}__{설명}.sql` (언더스코어 2개).
```
src/main/resources/db/migration/
├── V1__create_asset_masters.sql
├── V2__create_sensor_time_series.sql
├── V3__add_sap_asset_id_to_assets.sql
└── V4__create_audit_logs.sql
```
```sql
-- V1__create_asset_masters.sql
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL    PRIMARY KEY,
    tag_id          VARCHAR(50)  NOT NULL UNIQUE,
    asset_name      VARCHAR(200) NOT NULL,
    deck_id         VARCHAR(20),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);
```

## 3. 흔한 실수
- 테이블/컬럼에 접두사·약어 사용 → `db-common-conventions` 표준 위반.
- 시계열 데이터를 일반 테이블에 적재 → 파티셔닝·보관 정책 부재로 성능·용량 문제.
- 인덱스 남발 → INSERT/UPDATE 성능 저하.
- SQL 파일을 DB에 직접 실행 → 스키마 형상 관리 불가, 환경 간 불일치.

## 4. 체크리스트
- [ ] 네이밍·공통 컬럼이 `db-common-conventions` 표준을 따르는가
- [ ] 시계열 데이터를 하이퍼테이블로 만들고 파티셔닝·보관 정책을 설정했는가
- [ ] 조회 패턴에 맞춘 복합/부분 인덱스를 설계했는가 (불필요한 인덱스 없는가)
- [ ] MyBatis `<resultMap>` 매핑이 컬럼명과 일치하는가
- [ ] 스키마 변경을 Flyway 마이그레이션(`V{버전}__{설명}.sql`)으로 관리하는가
