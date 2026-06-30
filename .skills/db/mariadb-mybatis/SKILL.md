---
name: MariaDB/MySQL DB 설계 표준 (MyBatis 연동)
description: MariaDB/MySQL 테이블 설계, AUTO_INCREMENT, 페이징(LIMIT/OFFSET)과 MyBatis Mapper XML 연동 표준. MariaDB/MySQL 테이블을 설계하거나 MyBatis Mapper XML로 동적 쿼리·페이징·UPSERT를 작성할 때 읽는다. 키워드: mariadb, mysql, mybatis, Mapper, SqlSession, select, insert, update, delete, resultMap, parameterType, AUTO_INCREMENT, LIMIT, OFFSET.
rules:
  - "숫자 PK는 AUTO_INCREMENT로 생성한다 (BIGINT 권장)."
  - "페이징은 LIMIT / OFFSET으로 구현한다."
  - "테이블·컬럼 네이밍과 공통 컬럼은 db-common-conventions가 단일 출처다 — 소문자 복수형 snake_case, 접두어(tb_)·약어 금지, 논리삭제는 deleted_at(nullable). 이 문서는 MariaDB/MySQL 고유 문법만 다룬다."
  - "MyBatis Mapper XML에 MariaDB/MySQL 전용 동적 쿼리를 작성한다."
  - "조회 조건 컬럼에 인덱스를 설계한다."
tags:
  - "mariadb"
  - "mysql"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "select"
  - "insert"
  - "update"
  - "delete"
  - "resultMap"
  - "parameterType"
  - "AUTO_INCREMENT"
  - "LIMIT"
  - "OFFSET"
  - "<select"
  - "<insert"
  - "<update"
  - "<delete"
---

# 🐬 MariaDB / MySQL DB 설계 표준 (MyBatis 연동)

> MariaDB/MySQL 테이블 설계와 MyBatis 연동 방식을 통일한다. 새 테이블을 만들거나 Mapper XML에 페이징·동적 쿼리·UPSERT를 작성할 때 읽는다.

## 1. 핵심 원칙
- 숫자 PK는 `AUTO_INCREMENT`로 생성한다 (`BIGINT` 권장).
- 페이징은 `LIMIT / OFFSET`으로 구현한다.
- **테이블·컬럼 네이밍과 공통 컬럼은 `db-common-conventions`가 단일 출처다** — 소문자 복수형 `snake_case`, 접두어(`tb_`)·약어 금지, 논리삭제는 `deleted_at`(nullable). 이 문서는 MariaDB/MySQL 고유 문법만 다룬다.
- MyBatis Mapper XML에 MariaDB/MySQL 전용 동적 쿼리를 작성한다.
- 조회 조건 컬럼에 인덱스를 설계한다.

## 2. 규칙

### 2-1. 테이블 & 컬럼 네이밍
테이블은 소문자 복수형 `snake_case`(Linux 파일시스템 대소문자 구분 주의). 엔진·문자셋은 반드시 명시한다. 네이밍·공통 컬럼 규격은 `db-common-conventions`를 따른다.

```sql
-- ✅ 권장 — InnoDB + utf8mb4, 소문자 복수형 snake_case, 공통 컬럼 + 논리삭제
CREATE TABLE users (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    user_name   VARCHAR(100)    NOT NULL,
    email       VARCHAR(255)    NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),         -- 수정 시 자동 갱신
    deleted_at  DATETIME        NULL,                          -- 논리 삭제: NULL=활성
    PRIMARY KEY (id),
    UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users COMMENT = '사용자';
```

핵심 설정:
- `ENGINE=InnoDB`: 트랜잭션, 외래키 지원 (반드시 명시)
- `CHARSET=utf8mb4`: 이모지 포함 한글 완전 지원 (`utf8`은 이모지 저장 불가)
- `COLLATE=utf8mb4_unicode_ci`: 대소문자 구분 없는 비교 (ci = case insensitive)

> UUID PK가 필요하면 `id VARCHAR(36) NOT NULL DEFAULT (UUID())`. 공통 컬럼(`created_by`·`updated_by`·`deleted_by` 등) 전체 규격은 `db-common-conventions`를 따른다.

### 2-2. AUTO_INCREMENT (숫자 PK)
```sql
-- ✅ 권장 — BIGINT AUTO_INCREMENT (INT 21억 한계보다 안전)
CREATE TABLE items (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    item_name   VARCHAR(200)    NOT NULL,
    price       DECIMAL(15, 2)  NOT NULL DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),
    deleted_at  DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_items_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2-3. MyBatis Mapper XML (MariaDB/MySQL 전용 패턴)
페이징은 `LIMIT ? OFFSET ?`, INSERT는 `useGeneratedKeys`로 PK 회수, UPSERT는 `ON DUPLICATE KEY UPDATE`, 논리삭제는 `deleted_at`을 채우고 조회는 `deleted_at IS NULL`로 거른다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="price"     column="price"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- LIMIT OFFSET 페이징 (조회는 살아있는 행만) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, price, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        ORDER BY created_at DESC
        LIMIT #{limit} OFFSET #{offset}
    </select>

    <!-- 전체 건수 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
    </select>

    <!-- INSERT + 생성된 PK 반환 -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, price, created_at)
        VALUES (#{itemName}, #{price}, NOW())
    </insert>

    <!-- INSERT IGNORE (중복 무시) -->
    <insert id="insertItemIgnore" parameterType="com.example.model.Item">
        INSERT IGNORE INTO items (item_name, price)
        VALUES (#{itemName}, #{price})
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            <if test="price != null">price = #{price},</if>
            updated_at = NOW()
        </set>
        WHERE id = #{id}
    </update>

    <!-- 논리 삭제 (deleted_at 채움) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = NOW()
        WHERE id = #{id}
    </update>

    <!-- ON DUPLICATE KEY UPDATE (UPSERT) -->
    <insert id="upsertItem" parameterType="com.example.model.Item">
        INSERT INTO items (id, item_name, price)
        VALUES (#{id}, #{itemName}, #{price})
        ON DUPLICATE KEY UPDATE
            item_name = VALUES(item_name),
            price     = VALUES(price),
            updated_at = NOW()
    </insert>

    <!-- IN 절 (foreach) -->
    <select id="selectItemsByIds" parameterType="list" resultMap="itemResultMap">
        SELECT id, item_name, price
        FROM items
        WHERE id IN
        <foreach collection="list" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
        AND deleted_at IS NULL
    </select>

    <!-- 배치 INSERT -->
    <insert id="insertItemBatch" parameterType="list">
        INSERT INTO items (item_name, price, created_at)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.itemName}, #{item.price}, NOW())
        </foreach>
    </insert>

</mapper>
```

### 2-4. application.yml + 의존성
```yaml
spring:
  datasource:
    driver-class-name: org.mariadb.jdbc.Driver   # MariaDB 전용 드라이버
    # driver-class-name: com.mysql.cj.jdbc.Driver  # MySQL 사용 시
    url: jdbc:mariadb://localhost:3306/mydb?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 자동 변환
    default-statement-timeout: 30
```

```groovy
// MariaDB
implementation 'org.mariadb.jdbc:mariadb-java-client:3.3.2'
// MySQL 사용 시
implementation 'com.mysql:mysql-connector-j:8.3.0'
```

### 2-5. 자주 쓰는 함수
```sql
-- 날짜
NOW()                               -- 현재 날짜시간
CURDATE()                           -- 오늘 날짜 (시간 없음)
DATE_ADD(NOW(), INTERVAL -7 DAY)   -- 7일 전
DATEDIFF(종료일, 시작일)            -- 날짜 차이 (일)
DATE_FORMAT(NOW(), '%Y-%m-%d')     -- 날짜 포맷

-- NULL 처리
IFNULL(컬럼, 기본값)               -- Oracle NVL 상당
COALESCE(col1, col2, '기본값')     -- ANSI 표준
NULLIF(컬럼, 비교값)

-- 문자열
SUBSTRING(컬럼, 시작, 길이)
LOCATE('검색어', 컬럼)
TRIM(컬럼) / LTRIM / RTRIM
GROUP_CONCAT(컬럼 ORDER BY 컬럼 SEPARATOR ',')   -- 그룹 합치기
CONCAT(col1, '-', col2)

-- 조건
IF(조건, 참값, 거짓값)
CASE WHEN 조건 THEN 값 ELSE 기본값 END
ELT(인덱스, 값1, 값2, 값3)        -- 인덱스 기반 선택

-- 분석함수 (MariaDB 10.2+, MySQL 8.0+)
ROW_NUMBER() OVER (PARTITION BY 그룹 ORDER BY 정렬)
RANK() / DENSE_RANK()
```

### 2-6. 인덱스 전략
```sql
-- 단일 인덱스
ALTER TABLE items ADD INDEX idx_items_created_at (created_at DESC);

-- 복합 인덱스 (활성 행 조회 최적화)
ALTER TABLE items ADD INDEX idx_items_active_created (deleted_at, created_at DESC);

-- 전문 검색 인덱스 (LIKE 검색 대안)
ALTER TABLE items ADD FULLTEXT INDEX ft_items_name (item_name)
    WITH PARSER ngram;   -- 한글 분리: ngram 파서 필수

-- 전문 검색 쿼리
SELECT * FROM items
WHERE MATCH(item_name) AGAINST('검색어' IN BOOLEAN MODE)
  AND deleted_at IS NULL;
```

## 3. 흔한 실수
- 엔진·문자셋 미명시 → 이모지/한글 깨짐, 트랜잭션 미지원.
- `INT` PK 사용 → 21억 한계 도달 위험 (`BIGINT` 권장).
- 접두어(`tb_`)·약어(`user_nm`·`reg_dt`)·`use_yn 'Y'/'N'` 플래그 → `db-common-conventions` 위반. 풀네임·`deleted_at`을 쓴다.
- 조회에서 `deleted_at IS NULL` 누락 → 삭제된 행까지 조회.
- `lower_case_table_names` 미확인 → Linux에서 테이블명 대소문자 구분으로 쿼리 실패. Docker 배포 시 `my.cnf`에 명시 권장.
- LIKE 검색 앞에 `%` → 인덱스 미사용 (전문 검색 인덱스 고려).

## 4. 체크리스트
- [ ] 테이블=소문자 복수형 `snake_case`, 컬럼=풀네임, 공통 컬럼·`deleted_at`을 적용했는가 (`db-common-conventions`)
- [ ] 테이블에 `ENGINE=InnoDB`, `CHARSET=utf8mb4`, `COLLATE`를 명시했는가
- [ ] 숫자 PK를 `BIGINT AUTO_INCREMENT`로 생성했는가
- [ ] 페이징을 `LIMIT / OFFSET`으로, 조회에 `deleted_at IS NULL`을 적용했는가
- [ ] INSERT에서 `useGeneratedKeys`로 PK를 회수했는가
- [ ] 조회 조건 컬럼에 인덱스를 설계했는가
- [ ] `lower_case_table_names` 설정을 확인했는가
