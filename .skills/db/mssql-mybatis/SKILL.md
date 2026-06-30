---
name: MSSQL(SQL Server) DB 설계 표준 (MyBatis 연동)
description: Microsoft SQL Server 테이블 설계, T-SQL 패턴, IDENTITY/페이징(OFFSET·FETCH)과 MyBatis Mapper XML 연동 표준. SQL Server 테이블을 설계하거나 MyBatis Mapper XML로 T-SQL 동적 쿼리·페이징·MERGE를 작성할 때 읽는다. 키워드: sqlserver, mssql, T-SQL, jdbc:sqlserver, mybatis, Mapper, SqlSession, IDENTITY, OFFSET, FETCH NEXT, MERGE, NVARCHAR.
rules:
  - "숫자 PK는 IDENTITY(1,1)로 자동 증가시킨다."
  - "페이징은 OFFSET ... FETCH NEXT ... ROWS ONLY 구문으로 구현한다 (SQL Server 2012+)."
  - "테이블·컬럼 네이밍과 공통 컬럼은 db-common-conventions가 단일 출처다 — 소문자 복수형 snake_case, 접두어(TB_)·PascalCase·약어 금지, 논리삭제는 deleted_at."
  - "문자열은 NVARCHAR, 날짜는 DATETIME2를 사용한다 (SQL Server 고유 타입)."
  - "MyBatis Mapper XML에 T-SQL 전용 동적 쿼리를 작성하고, 조회 조건 컬럼에 인덱스를 설계한다."
tags:
  - "sqlserver"
  - "mssql"
  - "T-SQL"
  - "jdbc:sqlserver"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "IDENTITY"
  - "OFFSET"
  - "FETCH NEXT"
  - "MERGE"
  - "NVARCHAR"
---

# 🪟 MSSQL (SQL Server) DB 설계 표준 (MyBatis 연동)

> SQL Server 테이블 설계와 MyBatis 연동 방식을 통일한다. 새 테이블을 만들거나 Mapper XML에 T-SQL 페이징·동적 쿼리·MERGE를 작성할 때 읽는다.

## 1. 핵심 원칙
- 숫자 PK는 `IDENTITY(1,1)`로 자동 증가시킨다.
- 페이징은 `OFFSET ... FETCH NEXT ... ROWS ONLY` 구문으로 구현한다 (SQL Server 2012+).
- **테이블·컬럼 네이밍과 공통 컬럼은 `db-common-conventions`가 단일 출처다** — 소문자 복수형 `snake_case`, 접두어(`TB_`)·PascalCase·약어 금지, 논리삭제는 `deleted_at`.
- 문자열은 `NVARCHAR`, 날짜는 `DATETIME2`를 사용한다 (SQL Server 고유 타입).
- MyBatis Mapper XML에 T-SQL 전용 동적 쿼리를 작성하고, 조회 조건 컬럼에 인덱스를 설계한다.

## 2. 규칙

### 2-1. 테이블 & 컬럼 네이밍
네이밍·공통 컬럼 규격은 `db-common-conventions`를 따른다(소문자 복수형 `snake_case`). SQL Server 고유 타입(`NVARCHAR`·`DATETIME2`·`UNIQUEIDENTIFIER`)만 적용한다.

```sql
-- ✅ 권장 — 소문자 복수형 snake_case, 풀네임, 공통 컬럼 + 논리삭제
CREATE TABLE users (
    id          UNIQUEIDENTIFIER  DEFAULT NEWID()  NOT NULL,   -- UUID PK
    user_name   NVARCHAR(100)     NOT NULL,
    email       NVARCHAR(255)     NOT NULL,
    created_at  DATETIME2         DEFAULT GETDATE() NOT NULL,
    updated_at  DATETIME2,
    deleted_at  DATETIME2,                                      -- 논리 삭제: NULL=활성
    CONSTRAINT pk_users       PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

-- 테이블/컬럼 설명 (MS_Description 방식)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'사용자',
    @level0type = N'SCHEMA', @level0name = 'dbo',
    @level1type = N'TABLE',  @level1name = 'users';
```

네이밍·타입 규칙:
- 테이블/컬럼: 소문자 복수형 `snake_case`, 풀네임 (`db-common-conventions`)
- 문자열: ✅ `NVARCHAR` 사용 (한글 깨짐 방지) / ❌ `VARCHAR` 금지
- 날짜: `DATETIME2` 사용 (`DATETIME`보다 정밀도 높음)
- PK: 숫자는 `IDENTITY`, UUID는 `NEWID()` / `NEWSEQUENTIALID()`

### 2-2. IDENTITY 자동 증가
```sql
CREATE TABLE items (
    id          INT           IDENTITY(1,1)   NOT NULL,    -- 자동 증가
    item_name   NVARCHAR(200) NOT NULL,
    created_at  DATETIME2     DEFAULT GETDATE() NOT NULL,
    deleted_at  DATETIME2,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- INSERT 후 생성된 ID 조회
INSERT INTO items (item_name) VALUES (N'테스트상품');
SELECT SCOPE_IDENTITY();          -- 현재 세션의 마지막 IDENTITY 값
-- ✅ 권장 — OUTPUT 절 사용
INSERT INTO items (item_name)
OUTPUT INSERTED.id
VALUES (N'테스트상품');
```

### 2-3. MyBatis Mapper XML (MSSQL 전용 패턴)
페이징은 `OFFSET ... FETCH NEXT`, UPSERT는 `MERGE`, 논리삭제는 `deleted_at` 채움. 부등호(`<` `>` `&`)는 반드시 이스케이프 또는 `CDATA`로 감싼다.

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

    <!-- MSSQL 페이징: OFFSET FETCH (SQL Server 2012 이상) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS
        FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- 전체 건수 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
    </select>

    <!-- INSERT + 생성된 ID 반환 -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, GETDATE())
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = GETDATE()
        </set>
        WHERE id = #{id}
    </update>

    <!-- 논리 삭제 (deleted_at 채움) -->
    <update id="deleteItem" parameterType="int">
        UPDATE items
        SET deleted_at = GETDATE()
        WHERE id = #{id}
    </update>

    <!-- MERGE (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items AS T
        USING (SELECT #{id} AS id) AS S
        ON (T.id = S.id)
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (item_name, created_at) VALUES (#{itemName}, GETDATE());
    </update>

    <!-- XML 예약문자: < > & 처리 -->
    <!-- MyBatis XML에서 부등호는 반드시 이스케이프 또는 CDATA 사용 -->
    <select id="selectRecentItems" parameterType="int" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <![CDATA[ AND created_at >= DATEADD(DAY, -#{days}, GETDATE()) ]]>
        ORDER BY created_at DESC
    </select>

</mapper>
```

### 2-4. application.yml + 의존성
```yaml
spring:
  datasource:
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    url: jdbc:sqlserver://localhost:1433;databaseName=mydb;encrypt=true;trustServerCertificate=true
    username: sa
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 자동 변환 (snake_case 표준)
    default-statement-timeout: 30
```

```groovy
implementation 'com.microsoft.sqlserver:mssql-jdbc:12.4.2.jre11'
```

### 2-5. 자주 쓰는 T-SQL 함수
```sql
-- 날짜
GETDATE()                               -- 현재 날짜시간
SYSDATETIME()                           -- 더 정밀한 현재시간 (DATETIME2)
DATEADD(DAY, -7, GETDATE())            -- 7일 전
DATEDIFF(DAY, 시작일, 종료일)           -- 날짜 차이
FORMAT(GETDATE(), 'yyyy-MM-dd')         -- 날짜 포맷 문자열

-- NULL 처리
ISNULL(컬럼, 기본값)                   -- Oracle NVL 상당
COALESCE(col1, col2, '기본값')         -- ANSI 표준, 권장
NULLIF(컬럼, 비교값)                   -- 같으면 NULL 반환

-- 문자열
SUBSTRING(컬럼, 시작, 길이)
CHARINDEX('검색어', 컬럼)              -- Oracle INSTR 상당
TRIM(컬럼) / LTRIM / RTRIM
STRING_AGG(컬럼, ',') WITHIN GROUP (ORDER BY 컬럼)  -- GROUP_CONCAT (2017+)
CONCAT(col1, N'-', col2)               -- 문자열 연결 (N 접두어로 유니코드)

-- 조건
IIF(조건, 참값, 거짓값)               -- 단순 삼항
CASE WHEN 조건 THEN 값 ELSE 기본값 END

-- 분석함수
ROW_NUMBER() OVER (PARTITION BY 그룹 ORDER BY 정렬)
RANK() / DENSE_RANK()
```

### 2-6. 인덱스 전략
```sql
-- 클러스터드 인덱스: PK에 자동 생성 (테이블당 1개)
-- 넌클러스터드 인덱스: 검색 최적화용
CREATE NONCLUSTERED INDEX idx_items_created_at
    ON items (created_at DESC)
    INCLUDE (item_name);    -- INCLUDE: 커버링 인덱스 (SELECT 컬럼 추가)

-- 필터 인덱스 (활성 행만)
CREATE NONCLUSTERED INDEX idx_items_active
    ON items (created_at DESC)
    WHERE deleted_at IS NULL;   -- 활성 데이터만 인덱싱 → 크기 감소
```

## 3. 흔한 실수
- 접두어(`TB_`)·PascalCase·약어(`UseYn`·`RegDt`) 사용 → `db-common-conventions` 위반. 소문자 복수형 `snake_case`·풀네임·`deleted_at`을 쓴다.
- `VARCHAR` 사용 → 한글 깨짐. 문자열은 `NVARCHAR`, 리터럴은 `N'...'`.
- Mapper XML에서 부등호(`<` `>`)를 그대로 작성 → XML 파싱 오류. 이스케이프 또는 `CDATA` 사용.
- `NVARCHAR` 컬럼 LIKE 검색에서 앞에 `%` → 인덱스 미사용. 전문 검색(Full-Text Search) 또는 Filtered Index 고려.
- 조회에서 `deleted_at IS NULL` 누락 → 삭제된 행까지 조회.

## 4. 체크리스트
- [ ] 테이블·컬럼 네이밍이 `db-common-conventions`(소문자 복수형 `snake_case`, 풀네임, `deleted_at`)를 따르는가
- [ ] 문자열을 `NVARCHAR`, 날짜를 `DATETIME2`로 선언했는가
- [ ] 숫자 PK를 `IDENTITY(1,1)`로 생성하고 ID를 `OUTPUT`/`SCOPE_IDENTITY()`로 회수했는가
- [ ] 페이징을 `OFFSET ... FETCH NEXT`로, 조회에 `deleted_at IS NULL`을 적용했는가
- [ ] Mapper XML의 부등호를 이스케이프/CDATA로 처리했는가
- [ ] 조회 조건 컬럼에 (필요 시 커버링/필터) 인덱스를 설계했는가
