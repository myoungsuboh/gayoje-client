---
name: Oracle DB 설계 표준 (MyBatis 연동)
description: Oracle 테이블 설계·네이밍·시퀀스/트리거 패턴과 MyBatis Mapper XML 연동 표준. Oracle 테이블을 설계하거나 MyBatis로 페이징·UPSERT·동적 쿼리를 작성할 때, 인덱스를 설계할 때 읽는다. 키워드: oracle, ojdbc, jdbc:oracle, mybatis, Mapper, SqlSession, ROWNUM, OFFSET FETCH, sequence, MERGE.
rules:
  - "자동 증가 ID는 시퀀스로 생성하고, 필요 시 트리거로 채운다 (12c 이상은 GENERATED AS IDENTITY 가능)."
  - "페이징은 ROWNUM(12c 미만) 또는 OFFSET/FETCH(12c 이상) 구문으로 구현한다."
  - "테이블·컬럼 네이밍과 공통 컬럼은 db-common-conventions가 단일 출처다 — 소문자 복수형 snake_case, 접두어(TB_)·대문자·약어 금지, 논리삭제는 deleted_at. (Oracle은 따옴표 없는 식별자를 대문자로 저장하지만, 표기·매핑은 소문자 snake_case로 통일한다.)"
  - "MyBatis Mapper XML에 Oracle 전용 동적 쿼리를 작성한다."
  - "조회 조건 컬럼에 인덱스를 설계한다 (동등 조건 먼저, 범위 조건 나중)."
tags:
  - "oracle"
  - "ojdbc"
  - "jdbc:oracle"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "ROWNUM"
  - "OFFSET FETCH"
  - "sequence"
  - "MERGE"
---

# 🗄️ Oracle DB 설계 표준 (MyBatis 연동)

> Oracle 테이블 설계와 MyBatis Mapper XML 연동 방식을 통일한다. Oracle 테이블을 만들거나 MyBatis 쿼리를 작성·수정할 때 읽는다.

## 1. 핵심 원칙
- 자동 증가 ID는 시퀀스로 생성하고, 필요 시 트리거로 채운다 (12c 이상은 `GENERATED AS IDENTITY` 가능).
- 페이징은 ROWNUM(12c 미만) 또는 OFFSET/FETCH(12c 이상) 구문으로 구현한다.
- **테이블·컬럼 네이밍과 공통 컬럼은 `db-common-conventions`가 단일 출처다** — 소문자 복수형 `snake_case`, 접두어(`TB_`)·대문자·약어 금지, 논리삭제는 `deleted_at`. (Oracle은 따옴표 없는 식별자를 대문자로 저장하지만, 표기·매핑은 소문자 `snake_case`로 통일한다.)
- MyBatis Mapper XML에 Oracle 전용 동적 쿼리를 작성한다.
- 조회 조건 컬럼에 인덱스를 설계한다 (동등 조건 먼저, 범위 조건 나중).

## 2. 규칙

### 2-1. 테이블 & 컬럼 네이밍
네이밍·공통 컬럼 규격은 `db-common-conventions`를 따른다(소문자 복수형 `snake_case`, 풀네임, 논리삭제 `deleted_at`). 아래는 Oracle 타입·시퀀스 적용 예다.

```sql
-- ✅ 권장 — 소문자 복수형 snake_case, 풀네임, 공통 컬럼 + 논리삭제
CREATE TABLE users (
    id          VARCHAR2(36)   DEFAULT SYS_GUID() NOT NULL,   -- UUID PK
    user_name   VARCHAR2(100)  NOT NULL,
    email       VARCHAR2(255)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    updated_at  DATE,
    deleted_at  DATE,                                          -- 논리 삭제: NULL=활성
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS '사용자';
COMMENT ON COLUMN users.id IS '사용자 ID';
```

- 테이블: 소문자 복수형 `snake_case` (접두어·대문자 금지)
- 제약: PK `pk_테이블`, UK `ux_테이블_컬럼`, FK `fk_테이블_참조테이블`
- 공통 컬럼: `created_at`/`updated_at`/`created_by`/`updated_by`/`deleted_at`/`deleted_by` — 규격은 `db-common-conventions`

### 2-2. 시퀀스 (자동 증가 ID)
```sql
-- ✅ 숫자 PK가 필요하면 시퀀스 사용
CREATE SEQUENCE seq_items
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

CREATE TABLE items (
    id          NUMBER         DEFAULT seq_items.NEXTVAL NOT NULL,
    item_name   VARCHAR2(200)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    deleted_at  DATE,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- ✅ Oracle 12c 이상: IDENTITY 컬럼 사용 가능
-- id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

### 2-3. MyBatis Mapper XML — Oracle 전용 패턴
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- ✅ Oracle: ROWNUM 기반 페이징 (12c 미만) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT *
        FROM (
            SELECT A.*, ROWNUM AS rnum
            FROM (
                SELECT id, item_name, created_at
                FROM items
                WHERE deleted_at IS NULL
                <if test="keyword != null and keyword != ''">
                    AND item_name LIKE '%' || #{keyword} || '%'
                </if>
                ORDER BY created_at DESC
            ) A
            WHERE ROWNUM &lt;= #{endRow}
        )
        WHERE rnum &gt; #{startRow}
    </select>

    <!-- ✅ Oracle 12c 이상: OFFSET FETCH 페이징 -->
    <select id="selectItemListV2" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- ✅ INSERT: 시퀀스 사용 -->
    <insert id="insertItem" parameterType="com.example.model.Item">
        <selectKey keyProperty="id" resultType="long" order="BEFORE">
            SELECT seq_items.NEXTVAL FROM DUAL
        </selectKey>
        INSERT INTO items (id, item_name, created_at)
        VALUES (#{id}, #{itemName}, SYSDATE)
    </insert>

    <!-- ✅ INSERT: GENERATED AS IDENTITY 사용 시 -->
    <insert id="insertItemAuto" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, SYSDATE)
    </insert>

    <!-- ✅ UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = SYSDATE
        </set>
        WHERE id = #{id}
    </update>

    <!-- ✅ 논리 삭제 (deleted_at 채움) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = SYSDATE
        WHERE id = #{id}
    </update>

    <!-- ✅ MERGE INTO (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items T
        USING DUAL
        ON (T.id = #{id})
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = SYSDATE
        WHEN NOT MATCHED THEN
            INSERT (id, item_name, created_at)
            VALUES (seq_items.NEXTVAL, #{itemName}, SYSDATE)
    </update>

</mapper>
```

### 2-4. application.yml Oracle 설정
```yaml
spring:
  datasource:
    driver-class-name: oracle.jdbc.OracleDriver
    url: jdbc:oracle:thin:@//localhost:1521/XEPDB1   # 서비스명 방식
    # url: jdbc:oracle:thin:@localhost:1521:ORCL     # SID 방식 (구버전)
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000
      idle-timeout: 600000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 자동 변환
    default-fetch-size: 100
    default-statement-timeout: 30
```

> `map-underscore-to-camel-case: true` 설정 시 resultMap 없이도 자동 매핑 가능.

### 2-5. 자주 쓰는 Oracle 함수
```sql
-- 날짜 포맷
TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
TO_DATE('2024-01-01', 'YYYY-MM-DD')
TRUNC(SYSDATE)          -- 오늘 00:00:00
SYSDATE - 7             -- 7일 전

-- NULL 처리
NVL(컬럼, 기본값)
NVL2(컬럼, NULL아닐때, NULL일때)
COALESCE(col1, col2, '기본값')  -- ANSI 표준, 권장

-- 문자열
SUBSTR(컬럼, 시작, 길이)
INSTR(컬럼, '검색어')
TRIM(컬럼) / LTRIM / RTRIM
LISTAGG(컬럼, ',') WITHIN GROUP (ORDER BY 컬럼)  -- GROUP_CONCAT

-- 조건
DECODE(컬럼, 'A', '가', 'B', '나', '기타')  -- CASE WHEN 단순형
CASE WHEN 조건 THEN 값 ELSE 기본값 END

-- 분석함수 (윈도우)
ROW_NUMBER() OVER (PARTITION BY 그룹컬럼 ORDER BY 정렬컬럼)
RANK() / DENSE_RANK()
SUM(금액) OVER (PARTITION BY 월 ORDER BY 일 ROWS UNBOUNDED PRECEDING)
```

### 2-6. 인덱스 전략
```sql
-- ✅ 단일 인덱스
CREATE INDEX idx_items_created_at ON items (created_at DESC);

-- ✅ 복합 인덱스 (활성 행 조회 최적화: 동등 → 범위 순서)
CREATE INDEX idx_items_active_created ON items (deleted_at, created_at DESC);

-- ✅ 함수 기반 인덱스 (LIKE 검색 최적화)
CREATE INDEX idx_items_name_upper ON items (UPPER(item_name));
```

> WHERE 절 컬럼은 동등 조건 먼저, 범위 조건 나중. 카디널리티가 낮은 컬럼은 단독 인덱스가 비효율적 → 복합 인덱스 앞에 배치.

## 3. 흔한 실수
- 접두어(`TB_`)·대문자·약어(`USE_YN`·`REG_DT`) 사용 → `db-common-conventions` 위반. 소문자 복수형 `snake_case`·풀네임·`deleted_at`을 쓴다.
- 시퀀스 없이 애플리케이션에서 ID를 채번 → 동시성 충돌.
- ROWNUM 페이징에서 ORDER BY를 인라인 뷰 안에 두지 않음 → 정렬 깨짐.
- 카디널리티 낮은 컬럼에 단독 인덱스 생성 → 비효율.
- `map-underscore-to-camel-case`를 끄고 resultMap도 없음 → 매핑 누락.

## 4. 체크리스트
- [ ] 테이블·컬럼 네이밍이 `db-common-conventions`(소문자 복수형 `snake_case`, 풀네임, `deleted_at`)를 따르는가
- [ ] 자동 증가 ID를 시퀀스 또는 IDENTITY로 생성하는가
- [ ] 페이징을 ROWNUM/OFFSET FETCH 구문으로 구현하고 조회에 `deleted_at IS NULL`을 적용했는가
- [ ] 조회 조건 컬럼에 인덱스를 설계했는가 (동등 → 범위 순서)
- [ ] 논리 삭제·UPSERT 등 공통 패턴을 Mapper로 통일했는가
