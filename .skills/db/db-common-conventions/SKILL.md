---
name: 관계형 DB 공통 네이밍/타입 표준 (Relational DB Conventions)
description: 모든 관계형 DB에 동일 적용하는 범용(foundational) 네이밍·공통 컬럼·데이터 타입 단일 규격. 신규 테이블/컬럼을 설계하거나 약어 컬럼 등 레거시를 이주할 때, 갈린 네이밍을 통일할 때 읽는다. dialect 차이는 전용 스킬로, 논리삭제·감사는 `soft-delete-audit`으로 위임. 키워드: snake_case, primary key, foreign key, naming, common columns, created_at, deleted_at, data type, decimal.
rules:
  - "네이밍은 한 규격으로: 테이블명은 복수형 snake_case, 컬럼명은 단수형 snake_case. 접두사(TB_, tb_ 등)·대문자·약어를 섞지 않는다."
  - "키는 일관된 형식으로: PK는 id, FK는 참조테이블단수_id 형식으로 통일한다. 의미가 바뀔 수 있는 자연키(이메일·사번)를 PK로 쓰지 않는다."
  - "이름은 의미를 드러낸다: 약어 컬럼명을 금지하고 전체 단어를 쓴다 — 이름만 보고 무엇인지 알 수 있어야 한다."
  - "공통 컬럼을 강제한다: 모든 테이블에 생성/수정 시각·작성자 등 공통 컬럼을 둔다. 감사(audit) 정보 없이 운영하지 않는다."
  - "삭제는 논리 삭제가 기본: 물리 삭제 대신 삭제 시각(deleted_at)을 채우고, 조회는 항상 '살아있는 행'(deleted_at IS NULL)만 본다. 감사 추적과 참조 무결성을 보존한다(패턴 상세는 soft-delete-audit)."
  - "타입은 안전한 기본값으로: 금액은 부동소수점이 아닌 고정소수점, 참/거짓은 전용 불리언 타입, 키는 충분히 큰 정수형/식별자 타입을 쓴다."
  - "제품·도구 종속은 위임한다: 페이징·UPSERT·자동 증가 키 같은 dialect 차이, 매퍼/ORM 매핑 같은 도구 사용법은 본문이 아니라 각 전용 스킬·부록으로 미룬다."
tags:
  - "snake_case"
  - "primary key"
  - "foreign key"
  - "naming"
  - "common columns"
  - "created_at"
  - "deleted_at"
  - "data type"
  - "decimal"
  - "varchar"
  - "updated_at"
foundational: true
---

# 🗄️ 관계형 DB 공통 네이밍/타입 표준

> 모든 관계형 DB에서 동일하게 적용하는 네이밍·공통 컬럼·타입 선택의 단일 표준(Single Source of Truth). 신규 테이블/컬럼을 설계하거나 레거시 약어 컬럼을 이주할 때, 팀·제품마다 갈린 네이밍을 통일할 때 읽는다. 특정 DB 제품이나 매퍼/ORM 도구·언어에 종속되지 않는 범용 표준이다.

## 1. 목적

- 테이블·컬럼·인덱스 네이밍을 **하나의 규격**으로 통일해, 사람·팀·DB 제품마다 다르게 짓던 혼선(`snake_case`/`PascalCase`, 접두사 유무 등)을 없앤다.
- 모든 테이블이 동일한 **공통 컬럼**과 **논리 삭제** 정책을 따르게 해, 감사 추적과 조회 일관성을 보장한다.
- 데이터 타입 선택의 보편 원칙을 정해, 금액 반올림 오차·타입 미스매치 같은 반복 사고를 막는다.
- 제품(dialect)·도구(매퍼/ORM)에 종속된 세부는 본문에서 빼고 각 전용 스킬·부록으로 위임해, 이 문서가 **어떤 스택에서도 읽히는 공통 규격**으로 남게 한다.

## 2. 핵심 원칙

- **네이밍은 한 규격으로**: 테이블명은 복수형 `snake_case`, 컬럼명은 단수형 `snake_case`. 접두사(`TB_`, `tb_` 등)·대문자·약어를 섞지 않는다.
- **키는 일관된 형식으로**: PK는 `id`, FK는 `참조테이블단수_id` 형식으로 통일한다. 의미가 바뀔 수 있는 자연키(이메일·사번)를 PK로 쓰지 않는다.
- **이름은 의미를 드러낸다**: 약어 컬럼명을 금지하고 전체 단어를 쓴다 — 이름만 보고 무엇인지 알 수 있어야 한다.
- **공통 컬럼을 강제한다**: 모든 테이블에 생성/수정 시각·작성자 등 공통 컬럼을 둔다. 감사(audit) 정보 없이 운영하지 않는다.
- **삭제는 논리 삭제가 기본**: 물리 삭제 대신 삭제 시각(`deleted_at`)을 채우고, 조회는 항상 "살아있는 행"(`deleted_at IS NULL`)만 본다. 감사 추적과 참조 무결성을 보존한다(패턴 상세는 `soft-delete-audit`).
- **타입은 안전한 기본값으로**: 금액은 부동소수점이 아닌 고정소수점, 참/거짓은 전용 불리언 타입, 키는 충분히 큰 정수형/식별자 타입을 쓴다.
- **제품·도구 종속은 위임한다**: 페이징·UPSERT·자동 증가 키 같은 dialect 차이, 매퍼/ORM 매핑 같은 도구 사용법은 본문이 아니라 각 전용 스킬·부록으로 미룬다.

## 3. 규칙

### 3-1. 테이블 네이밍 — 복수형 snake_case, 접두사·약어 금지

조인(N:M) 테이블은 두 테이블명을 알파벳 순으로 연결한다.

```text
// ✅ 권장
users
asset_logs
order_items
user_roles          // N:M 조인 테이블 (users × roles)

// ❌ 금지 (즉시 리팩토링)
TB_USER             // 접두사 + 대문자 + 단수
tbl_orders          // 접두사
UserAccount         // PascalCase
usr                 // 약어
```

### 3-2. 컬럼 네이밍 — PK/FK/일반

| 종류 | 규칙 | 예 |
|---|---|---|
| PK (단일 PK 권장) | `id` 또는 `<단수>_id` | `users.id` 또는 `users.user_id` |
| FK | 참조 테이블 단수 + `_id` | `orders.user_id` → `users.id` |
| 일반 컬럼 | `snake_case`, 명사 | `email`, `total_amount` |
| 불리언 | `is_*` / `has_*` | `is_active`, `has_paid` |
| 날짜시각 | `*_at` (시각) / `*_on` (날짜) | `created_at`, `deleted_at`, `birth_on` |

```text
// ✅ 권장 — 일관된 키·불리언·시각 네이밍
table orders:
  id            PK
  user_id       FK → users.id
  total_amount  고정소수점 금액
  is_paid       불리언 (기본 false)
  paid_at       시각 (nullable)

// ❌ 금지 — 약어 키, Y/N 플래그, 모호한 날짜 컬럼
table orders:
  ordr_id, usr_id, amt, pay_yn('Y'/'N'), pay_dt
```

### 3-3. 약어 컬럼명 금지 — 풀네임을 쓴다

레거시에서 가장 흔한 가독성 파괴 패턴. 신규 스키마에서는 무조건 금지하고, 마이그레이션 시 **첫 작업**으로 풀네임으로 바꾼다.

| ❌ 금지 약어 | ✅ 풀네임 | 비고 |
|---|---|---|
| `user_nm` | `user_name` | `_nm` 은 의미가 모호 |
| `reg_dt`, `upd_dt` | `created_at`, `updated_at` | `_dt` 는 날짜/시각 불명확 |
| `del_yn` (`'Y'`/`'N'`) | `deleted_at` (nullable 시각) | 문자 Y/N 은 인덱스·조건식 비효율, 삭제 시각도 못 남김 |
| `use_yn` | `deleted_at` | 활성/삭제는 삭제 시각으로 표현 |
| `tel_no` | `phone_number` | |
| `cust_cd` | `customer_code` | |

```text
// ❌ 금지 — 약어 폭격
table tb_user:
  user_id, user_nm, use_yn('Y'/'N'), reg_dt, upd_dt

// ✅ 권장 — 풀네임 + 공통 컬럼
table users:
  id            PK
  user_name
  email
  created_at, updated_at
  created_by, updated_by
  deleted_at, deleted_by   // NULL=활성, NOT NULL=삭제됨
```

### 3-4. 공통 컬럼 — 모든 테이블 강제

모든 테이블에 아래 의미의 컬럼을 둔다(이름은 이 표준을 따른다).

| 컬럼 | 의미 |
|---|---|
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |
| `created_by` | 생성자 식별자 (nullable) |
| `updated_by` | 수정자 식별자 (nullable) |
| `deleted_at` | 논리 삭제 시각 (nullable timestamp, `NULL`=활성·`NOT NULL`=삭제됨) |
| `deleted_by` | 삭제자 식별자 (nullable) |

- **삭제 플래그는 `deleted_at`(nullable timestamp)으로 통일한다**: 불리언 `is_deleted` 대신 삭제 시각을 채워 "삭제됨"과 "언제 삭제됐는지"를 한 컬럼으로 남긴다. 물리 삭제 대신 `deleted_at`을 채우고, 모든 조회에 "삭제되지 않은 행"(`deleted_at IS NULL`) 조건을 강제한다. 논리삭제·감사 패턴 상세는 `soft-delete-audit` 스킬을 따른다.
- **작성자(`created_by`/`updated_by`)는 자동 주입**: 인증 컨텍스트에서 가로채 채운다(예: 영속 계층 인터셉터·횡단 관심사). 컨트롤러/서비스가 직접 채우지 않는다 — 구현 수단은 팀 스택에 위임한다.

```text
// ❌ 금지 — 감사 컬럼 없음 + 물리 삭제
table products: id, name, price          // created_at/updated_at 없음
DELETE FROM products WHERE id = ?         // 흔적 없이 사라짐

// ✅ 권장 — 공통 컬럼 + 논리 삭제
table products: id, name, price, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by
UPDATE products SET deleted_at = <지금>, deleted_by = ? WHERE id = ?
SELECT ... FROM products WHERE deleted_at IS NULL   // 조회는 항상 살아있는 행만
```

### 3-5. 인덱스 / 제약 네이밍

| 종류 | 형식 | 예 |
|---|---|---|
| 인덱스 | `idx_<테이블>_<컬럼들>` | `idx_orders_user_id_created_at` |
| 유니크 인덱스 | `ux_<테이블>_<컬럼들>` | `ux_users_email` |
| FK 제약 | `fk_<테이블>_<참조테이블>` | `fk_orders_user` |
| CHECK 제약 | `ck_<테이블>_<컬럼>` | `ck_orders_total_amount` |

```text
// ✅ 권장 — 한눈에 종류·대상이 읽히는 이름
idx_orders_user_id_created_at   on orders(user_id, created_at desc)
ux_users_email                  on users(email)

// ❌ 금지 — 자동 생성된 의미 없는 이름 / 종류 불명
orders_idx1, SYS_C0012345
```

### 3-6. 데이터 타입 선택 — 안전한 기본값

| 용도 | 권장 | ❌ 피한다 |
|---|---|---|
| PK / FK | 큰 정수형(예: 64-bit) 또는 식별자(UUID) | 작은 정수형(범위 한계) |
| 짧은 문자열 | 가변 길이 문자열, 길이 상한 통일(예: 255) | 무제한/제각각 길이 |
| 코드값 | 짧은 가변 문자열(예: 50) | |
| 긴 텍스트 | 대용량 텍스트 타입 | |
| **금액** | **고정소수점(decimal/numeric)** | **부동소수점(float/double) — 반올림 오차** |
| 참/거짓 | 전용 불리언 타입 | 문자 `'Y'`/`'N'` (인덱스·조건식 비효율) |
| 날짜시각 | 시각 타입 (UTC 저장 권장) | |
| 날짜만 | 날짜 타입 | |

- **금액에 부동소수점 금지**: `0.1 + 0.2 = 0.30000000000000004` 같은 오차가 회계 사고로 이어진다. 항상 고정소수점.
- **참/거짓은 불리언 타입**: 문자 Y/N 은 카디널리티가 낮고 대소문자 휴먼 에러(`'y'`)가 난다.
- **타임존은 UTC 저장**: 서버·DB·런타임을 UTC로 저장하고 표시 시점에만 지역 시간으로 변환한다. 구체 타입·세션 타임존 처리는 dialect 차이다(아래 3-7로 위임).

```text
// ❌ 금지
amount  float                 // 반올림 오차
is_paid char(1) 'Y'/'N'       // 인덱스/조건식 비효율
id      int                   // 범위 한계

// ✅ 권장
amount  decimal(15,2)
is_paid boolean
id      bigint (또는 uuid)
```

### 3-7. dialect·도구 차이는 전용 스킬로 위임

이 문서는 **공통 규격만** 다룬다. 제품(dialect)별 문법과 도구 사용법은 본문에 적지 말고 각 전용 스킬을 본다.

| 항목 | 어디서 다루나 |
|---|---|
| 페이징, UPSERT, 자동 증가 PK, 불리언/시각의 구체 타입 | 각 dialect 전용 스킬 (예: PostgreSQL/MySQL/Oracle 스킬) |
| 트랜잭션·락 | `transaction-locking` 스킬 |
| 커넥션 풀 | `connection-pool-tuning` 스킬 |
| 마이그레이션 | `db-migration-flyway` 스킬 |
| 매퍼/ORM 매핑·공통 절 중앙화 | 부록의 스택별 예시 (아래) |

## 4. 흔한 실수

- **약어 폭격**: `tb_usr(usr_nm, reg_dt, use_yn)` — 신규 스키마에서 금지, 풀네임으로.
- **참/거짓을 문자 Y/N 으로**: `WHERE use_yn = 'Y'` — 인덱스 카디널리티가 낮고 소문자 `'y'` 휴먼 에러. 불리언 타입으로.
- **자연키를 PK로**: 이메일·사번을 PK로 쓰면 값 변경이 불가하고 FK 전파 비용이 폭증한다.
- **금액에 부동소수점**: `0.1 + 0.2 = 0.30000000000000004` 반올림 오차.
- **물리 삭제**: 흔적 없이 사라져 감사 추적이 불가하고 참조 무결성이 깨진다. 논리 삭제로.
- **조회에서 삭제 조건 누락**: `deleted_at IS NULL` 을 빠뜨려 삭제된 행까지 조회된다.
- **공통 컬럼 누락**: 생성/수정 시각·작성자 없이 만들면 사후 감사·추적이 불가하다.
- **dialect 문법을 공통 규격에 박음**: 특정 제품 전용 문법을 이 문서에 적으면 다른 제품에서 깨진다 — 전용 스킬로 위임.

## 5. 체크리스트

- [ ] 테이블=복수형 `snake_case`, 접두사 없음, 컬럼=단수형 `snake_case` 인가
- [ ] PK는 `id`, FK는 `참조테이블단수_id` 형식인가 (자연키 PK 아님)
- [ ] 약어 컬럼(`_nm`, `_dt`, `_yn` 등) 없이 풀네임을 썼는가
- [ ] 공통 컬럼(`created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`)을 모두 넣었는가
- [ ] 물리 삭제 대신 논리 삭제(`deleted_at` 채움)를 적용했는가
- [ ] 모든 조회에 "삭제되지 않은 행" 조건(`deleted_at IS NULL`)이 포함됐는가
- [ ] 인덱스/제약 접두사(`idx_`/`ux_`/`fk_`/`ck_`)를 따랐는가
- [ ] 금액은 고정소수점, 참/거짓은 불리언, PK는 큰 정수형/UUID 인가
- [ ] dialect·도구 종속 세부(페이징·UPSERT·매퍼 설정 등)를 전용 스킬/부록으로 위임했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 위 1~5의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. **팀이 쓰는 스택(매퍼/ORM·언어)에 맞는 예시를 같은 패턴으로 추가**한다.

### MyBatis (Java)

영속 계층에서 `resultMap` 과 `<sql>`/`<include>` 로 매핑과 공통 절을 중앙화한다. 컬럼이 바뀌어도 한 군데만 고치면 전 Mapper에 반영된다.

```yaml
mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # user_name → userName (전 프로젝트 통일)
    default-statement-timeout: 30
    jdbc-type-for-null: NULL              # Oracle 호환
    cache-enabled: false                  # 2차 캐시는 별도 캐시 레이어로
```
```xml
<!-- ✅ resultMap: 단순 매핑이라도 항상 작성 (JOIN 확장 대비) -->
<resultMap id="userResultMap" type="com.example.dto.UserResponse">
    <id     property="id"         column="id"/>
    <result property="userName"   column="user_name"/>
    <result property="email"      column="email"/>
    <result property="createdAt"  column="created_at"/>
</resultMap>

<!-- ✅ 공통 컬럼 SELECT 절은 <sql>로 추출해 중앙화 -->
<sql id="userColumns">
    id, user_name, email, created_at, updated_at, deleted_at
</sql>
<sql id="activeWhere">
    AND deleted_at IS NULL
</sql>

<select id="findById" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id = #{id}
       <include refid="activeWhere"/>
</select>

<!-- IN 절 동적 처리 -->
<select id="findByIds" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id IN
     <foreach collection="ids" item="id" open="(" separator="," close=")">
         #{id}
     </foreach>
     <include refid="activeWhere"/>
</select>
```
> `<sql>` + `<include>` 로 SELECT 컬럼과 공통 WHERE 절을 중앙화하면, 컬럼 추가 시 한 군데만 고쳐도 전 Mapper에 반영된다.

#### MyBatis 특유의 흔한 실수
- **`resultMap` 없이 `SELECT *` 자동 매핑에 의존** — 컬럼 추가 시 운영 단계에서 매핑 깨짐을 발견한다. 단순 매핑이라도 `resultMap` 을 작성한다.
- **공통 WHERE 절 미중앙화** — `deleted_at IS NULL` 을 Mapper마다 직접 써서 누락이 생긴다. `<sql>`/`<include>` 로 중앙화한다.
