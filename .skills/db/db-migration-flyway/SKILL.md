---
name: Flyway DB 마이그레이션 운영 표준
description: Flyway 기반 DB 형상 관리 표준. 디렉토리/네이밍/체크섬 규칙, 환경별 정책, Zero-downtime 마이그레이션, 보상 마이그레이션 롤백, Spring Boot/다중 모듈 통합, CI 검증을 다룬다. 스키마를 변경하거나 마이그레이션 파일을 작성·리뷰·배포할 때 읽는다. 키워드: flyway, migration, V1__, baseline, db.migration, zero-downtime, flyway_schema_history.
rules:
  - "DB 형상 관리는 Flyway로 하고 V{버전}__{설명}.sql 네이밍을 따른다. SQL을 사람이 운영 DB에 직접 실행하지 않는다."
  - "이미 적용된 V 파일은 절대 수정하지 않고 새 버전을 추가한다(체크섬 불일치 방지)."
  - "DROP과 배포를 같은 릴리즈에서 동시에 하지 않는다."
  - "flyway_schema_history 테이블을 수동으로 건드리지 않는다(flyway repair만 사용)."
  - "컬럼 추가·삭제는 Zero-downtime을 위해 단계적으로 배포한다."
  - "Flyway는 자동 롤백이 없으므로 보상 마이그레이션으로 되돌린다."
tags:
  - "flyway"
  - "migration"
  - "V1__"
  - "baseline"
  - "db.migration"
  - "zero-downtime"
  - "flyway_schema_history"
  - "V2__"
  - "FlywayMigration"
---

# 🛫 Flyway DB 마이그레이션 표준

> 모든 스키마 변경은 버전 관리되는 마이그레이션 파일로만 한다. 스키마를 변경하거나 마이그레이션 파일을 작성·리뷰·배포할 때 읽는다. 이 원칙이 깨지면 환경별 스키마가 어긋나고 롤백/재현이 불가능해진다.

## 1. 핵심 원칙
- DB 형상 관리는 Flyway로 하고 `V{버전}__{설명}.sql` 네이밍을 따른다. SQL을 사람이 운영 DB에 직접 실행하지 않는다.
- 이미 적용된 `V` 파일은 절대 수정하지 않고 새 버전을 추가한다(체크섬 불일치 방지).
- `DROP`과 배포를 같은 릴리즈에서 동시에 하지 않는다.
- `flyway_schema_history` 테이블을 수동으로 건드리지 않는다(`flyway repair`만 사용).
- 컬럼 추가·삭제는 Zero-downtime을 위해 단계적으로 배포한다.
- Flyway는 자동 롤백이 없으므로 보상 마이그레이션으로 되돌린다.

> **Flyway vs Liquibase**: 순수 SQL을 그대로 리뷰/디버깅하는 Flyway가 코드 리뷰·DBA 협업·장애 디버깅에서 유리해 신규 프로젝트 기본. Liquibase(XML/YAML DSL, 일부 자동 롤백)는 멀티 DBMS 변환이 핵심일 때만 고려한다.

## 2. 규칙

### 2-1. 디렉토리 & 네이밍
```
src/main/resources/db/migration/
├── V1.0.0__init_schema.sql
├── V1.0.1__create_users.sql
├── V1.0.2__create_orders.sql
├── V1.1.0__add_orders_payment_status.sql
├── V1.2.0__seed_reference_data.sql
└── R__refresh_views.sql            # Repeatable (체크섬 바뀔 때마다 재실행)
```
- 접두사 `V`(Versioned, 1회 실행) / `R`(Repeatable, 체크섬 변경 시 재실행) / `U`(Undo, 유료판).
- 버전: `V{major}.{minor}.{patch}__{설명}.sql`. 언더스코어 **2개**.
- 설명은 `snake_case`, 동사 시작 권장: `create_users`, `add_orders_status_index`, `backfill_user_country`.
- 한 파일 = 한 가지 변경 단위. 100줄을 넘기지 않는다.

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false      # 신규는 false, 기존 DB 도입 시만 true
    validate-on-migrate: true       # 체크섬 검증 (prod 필수)
    out-of-order: false             # prod에서 false, dev/staging만 true 허용
    placeholder-replacement: false  # ${var} 치환 비활성 (실수 방지)
```

### 2-2. 이미 적용된 `V` 파일을 수정하지 않는다
Flyway는 `flyway_schema_history`에 각 파일의 체크섬을 저장한다. 적용된 파일을 수정하면 검증이 실패한다.
```
ERROR: Validate failed: Migration checksum mismatch for migration version 1.0.1
-> Applied to database : 1234567890
-> Resolved locally    : 9876543210
```
```sql
-- ❌ 금지 — V1.0.1__create_users.sql 을 수정해 컬럼 추가
-- ✅ 권장 — 새 V 파일 추가: V1.0.5__add_users_phone.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

### 2-3. DROP과 배포를 동시에 하지 않는다
```sql
-- ❌ 금지 — V2.0.0__drop_legacy_column.sql
ALTER TABLE users DROP COLUMN old_field;
-- 배포 중 구버전 인스턴스가 old_field를 SELECT → 즉시 500
```
→ Zero-downtime 패턴(2-5)으로 분리한다.

### 2-4. 환경별 정책
| 환경 | `clean` | `validate` | `out-of-order` | `baseline` |
|---|---|---|---|---|
| local/dev | 허용 | true | true | true (필요 시) |
| staging | **금지** | true | false | false |
| prod | **절대 금지** (구성에서 비활성) | true | false | false |

```yaml
# prod 추가 보호 — 코드로 clean() 호출조차 차단
spring:
  flyway:
    clean-disabled: true
```
> dev에서는 자유롭게 `mvn flyway:clean flyway:migrate` 로 초기화하되, prod에는 `clean-disabled: true` 를 박아 실수로도 데이터가 날아갈 수 없게 한다. `flyway_schema_history` 는 손으로 건드리지 말고 `flyway repair` 로만 처리한다.

### 2-5. Zero-downtime 마이그레이션
배포 중 구버전/신버전이 동시에 떠 있어도 둘 다 동작해야 한다. 컬럼 추가/삭제는 한 번에 하지 않는다.
```sql
-- 컬럼 추가: nullable → backfill → not null
-- 릴리즈 1: V1.5.0__add_users_country_nullable.sql
ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;
-- 릴리즈 2: V1.5.1__backfill_users_country.sql
UPDATE users SET country = 'KR' WHERE country IS NULL;
-- 릴리즈 3: V1.5.2__alter_users_country_not_null.sql
ALTER TABLE users MODIFY country VARCHAR(2) NOT NULL;
```
```
컬럼 삭제: 앱 변경 → 배포 → DROP
1) 앱 코드에서 해당 컬럼 SELECT/INSERT/UPDATE 제거 → 배포
2) 일정 기간(최소 1주) 운영 안정성 확인
3) 다음 릴리즈에서 V x.y.z__drop_users_old_field.sql 적용

컬럼 rename: 추가 → 이중쓰기 → 읽기 전환 → 삭제
1) new_name 컬럼 추가
2) 앱이 양쪽 모두에 쓰도록 변경 (이중 쓰기)
3) 백필로 과거 데이터 복사
4) 앱이 new_name 읽도록 변경 + old_name 쓰기 제거
5) old_name DROP
```
> Zero-downtime은 "배포 한 번 = 마이그레이션 한 번" 모델을 포기하는 대신 롤백 가능한 작은 단계로 쪼개는 것이다.

### 2-6. 롤백 — 보상 마이그레이션
Flyway는 자동 롤백이 없다(`undo`는 유료 Teams Edition, 실용성 낮음). 표준은 보상 마이그레이션이다.
```sql
-- 실패한 변경: V2.0.0__add_orders_discount.sql
ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;

-- 롤백이 필요하면 새 마이그레이션 추가
-- V2.0.1__revert_orders_discount.sql
ALTER TABLE orders DROP COLUMN discount;
```
- 데이터 변경 마이그레이션은 사전 백업 + 검증 쿼리를 PR 본문에 첨부한다.
- 큰 변경은 staging에서 prod 사이즈 dump로 시간 측정한다. `ALTER TABLE`이 5시간 걸리는 케이스가 흔하다.

### 2-7. Spring Boot 통합 & 다중 모듈
```groovy
// build.gradle
implementation 'org.flywaydb:flyway-core'
runtimeOnly  'org.flywaydb:flyway-mysql'  // MariaDB/MySQL 10.x+은 별도 모듈 필수
```
```yaml
# 다중 모듈에서 location 분리 — 충돌 회피
spring:
  flyway:
    locations:
      - classpath:db/migration/common
      - classpath:db/migration/${MODULE_NAME}    # user / order / payment
    table: flyway_schema_history_${MODULE_NAME}  # 모듈별 히스토리 테이블 분리
```
> 서비스가 자기 스키마를 소유하면 히스토리 테이블도 분리한다. 한 DB에 여러 서비스가 붙는 과도기엔 `table` 분리가 충돌을 막는다.

### 2-8. CI/CD에서 검증
```yaml
# GitHub Actions / GitLab CI 단계
- name: Flyway validate
  run: ./gradlew flywayValidate -Pflyway.url=$STAGING_DB_URL

- name: Migration dry-run on staging clone
  run: |
    pg_dump prod | psql staging-clone
    ./gradlew flywayMigrate -Pflyway.url=$STAGING_CLONE_URL
```
> PR 머지 전 staging clone에서 마이그레이션을 실행해 실행 시간/락 시간/실패 여부를 측정한 결과를 본문에 붙이는 것을 표준 절차로 한다.

## 3. 흔한 실수
```sql
-- [안티] V 파일에 DML(INSERT/UPDATE)만 잔뜩 → 환경마다 다르게 적용됨. R__ 또는 별도 seed로
-- [안티] 대용량 테이블에 ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT → 락 + 풀스캔 → 운영 정지
ALTER TABLE huge_table ADD COLUMN flag BOOLEAN NOT NULL DEFAULT FALSE;
-- [안티] 한 V 파일에 무관한 변경 여러 개 묶기 → 부분 적용 위험, 리뷰 난이도 폭증
```
```yaml
# [안티] prod에서 체크섬 검증 끄기 → 의미 없는 형상관리
spring.flyway.validate-on-migrate: false
```
> 콘솔에서 `psql -c "ALTER TABLE ..."` 한 줄이 운영 사고의 최단 경로다. 마이그레이션은 코드 변경이다 — PR로 리뷰받고 CI에서 검증하고 롤백을 준비한다.

## 4. 체크리스트
- [ ] 모든 스키마 변경을 `V{버전}__{설명}.sql` 파일로 만들었는가 (직접 SQL 실행 금지)
- [ ] 이미 적용된 `V` 파일을 수정하지 않고 새 버전을 추가했는가
- [ ] 한 파일 = 한 변경 단위, 100줄 이내인가
- [ ] DROP/컬럼 변경을 Zero-downtime 단계로 분리했는가
- [ ] 환경별 정책(prod `clean-disabled`, `validate-on-migrate: true`)을 적용했는가
- [ ] 롤백이 필요한 변경에 보상 마이그레이션과 백업/검증 쿼리를 준비했는가
- [ ] PR 머지 전 staging clone에서 dry-run으로 시간/락/실패를 측정했는가
- [ ] `flyway_schema_history` 를 손으로 건드리지 않았는가
