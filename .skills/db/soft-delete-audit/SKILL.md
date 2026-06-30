---
name: Soft Delete & 감사 컬럼
description: 논리 삭제·생성/수정/삭제 감사 컬럼·변경 이력의 범용(foundational) 표준 — 물리 삭제 대신 `deleted_at`, 감사 컬럼 자동 갱신, 활성 레코드 기본 필터, 삭제 제외 조건부 유니크, 이력 보존. 삭제·감사 컬럼을 설계하거나 삭제 레코드와 유니크 제약이 충돌할 때 읽는다(컬럼 네이밍·타입은 `db-common-conventions`). 키워드: soft-delete, deleted_at, audit, history, partial unique, 이력 테이블.
rules:
  - "물리 삭제 대신 논리 삭제: 비즈니스 데이터는 행을 지우지 않고 '삭제 시각' 표시로 논리 삭제한다. 영구 삭제는 별도 아카이빙/정리 프로세스로만 처리한다 — 복구·감사 가능성을 남긴다."
  - "감사 컬럼은 모든 도메인 테이블 공통: 생성/수정/삭제의 '언제·누가'를 표준 컬럼(created_at/updated_at/deleted_at, created_by/updated_by/deleted_by)으로 모든 도메인 테이블에 둔다. 삭제 플래그는 nullable timestamp deleted_at(NULL=활성)을 쓴다 — 불리언이 아니다. 컬럼 네이밍·타입 규약 자체는 db-common-conventions 스킬을 따른다."
  - "감사 컬럼은 자동 갱신: updated_at 같은 값은 수동 갱신에 의존하지 말고 DB 트리거 또는 ORM/애플리케이션 훅으로 자동 채운다 — 일부 경로에서 빠지지 않게 한다."
  - "활성 레코드 기본 필터: '삭제 안 된 행만' 조건을 기본 조회에 포함하고, 가능하면 ORM 전역 스코프 등으로 자동 적용해 실수로 삭제 행이 노출되지 않게 한다."
  - "삭제 레코드를 제외한 유니크: 자연키(이메일 등) 유니크 제약은 '활성 레코드 한정'으로 건다 — 삭제 후 같은 값으로 재등록할 때 충돌하지 않게 한다."
  - "변경 이력은 별도 테이블: 중요한 데이터의 변경 추적이 필요하면 이력 테이블(audit_log 또는 *_history 접미사)을 별도로 운영한다."
  - "무한 증식 방지: 논리 삭제만 하고 정리하지 않으면 테이블이 무한히 커진다. 보존 기간·아카이빙·정리 정책을 함께 정한다."
tags:
  - "soft-delete"
  - "deleted_at"
  - "audit"
  - "history"
  - "partial unique"
  - "이력 테이블"
  - "created_at"
  - "updated_at"
  - "logical-delete"
foundational: true
---

# 🗑️ Soft Delete & 감사 컬럼

> 데이터를 물리 삭제하지 않고 논리 삭제·감사·이력 추적하는 표준을 정한다. 도메인 테이블을 설계하거나 변경 이력·삭제 정책을 정할 때 읽는다. 특정 DB/ORM에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **물리 삭제 대신 논리 삭제**: 비즈니스 데이터는 행을 지우지 않고 "삭제 시각" 표시로 논리 삭제한다. 영구 삭제는 별도 아카이빙/정리 프로세스로만 처리한다 — 복구·감사 가능성을 남긴다.
- **감사 컬럼은 모든 도메인 테이블 공통**: 생성/수정/삭제의 "언제·누가"를 표준 컬럼(`created_at`/`updated_at`/`deleted_at`, `created_by`/`updated_by`/`deleted_by`)으로 모든 도메인 테이블에 둔다. 삭제 플래그는 nullable timestamp `deleted_at`(NULL=활성)을 쓴다 — 불리언이 아니다. 컬럼 네이밍·타입 규약 자체는 `db-common-conventions` 스킬을 따른다.
- **감사 컬럼은 자동 갱신**: `updated_at` 같은 값은 수동 갱신에 의존하지 말고 DB 트리거 또는 ORM/애플리케이션 훅으로 자동 채운다 — 일부 경로에서 빠지지 않게 한다.
- **활성 레코드 기본 필터**: "삭제 안 된 행만" 조건을 기본 조회에 포함하고, 가능하면 ORM 전역 스코프 등으로 자동 적용해 실수로 삭제 행이 노출되지 않게 한다.
- **삭제 레코드를 제외한 유니크**: 자연키(이메일 등) 유니크 제약은 "활성 레코드 한정"으로 건다 — 삭제 후 같은 값으로 재등록할 때 충돌하지 않게 한다.
- **변경 이력은 별도 테이블**: 중요한 데이터의 변경 추적이 필요하면 이력 테이블(`audit_log` 또는 `*_history` 접미사)을 별도로 운영한다.
- **무한 증식 방지**: 논리 삭제만 하고 정리하지 않으면 테이블이 무한히 커진다. 보존 기간·아카이빙·정리 정책을 함께 정한다.

> 입력 검증·오류 응답 등 진입점 표준은 `validation-bean` 스킬을 따른다. 이 스킬은 데이터 모델(삭제·감사·이력)에 집중한다.

## 2. 규칙

### 2-1. 표준 감사 컬럼을 모든 도메인 테이블에 둔다
- 생성/수정/삭제의 "언제(시각)"와 "누가(행위자)"를 표준 컬럼으로 일관되게 둔다.
- `deleted_at`(또는 동등한 삭제 시각/플래그)은 **비어 있으면 활성, 채워져 있으면 삭제됨**을 의미한다.

```text
// ✅ 권장 — 모든 도메인 테이블이 공유하는 감사 컬럼(표준 SQL 의사 표현)
TABLE <도메인>:
  id           <식별자>  PRIMARY KEY
  ...업무 컬럼...

  created_at   TIMESTAMP   NOT NULL   -- 생성 시각
  updated_at   TIMESTAMP   NOT NULL   -- 최종 수정 시각(자동 갱신)
  created_by   <식별자>               -- 생성자
  updated_by   <식별자>               -- 최종 수정자
  deleted_at   TIMESTAMP   NULL       -- NULL=활성, NOT NULL=삭제됨
  deleted_by   <식별자>   NULL        -- 삭제자
```

### 2-2. updated_at 등 감사 컬럼은 자동 갱신
- 수정 시각을 호출부마다 손으로 채우지 않는다 — 한 경로라도 빠지면 신뢰할 수 없는 컬럼이 된다.
- DB 트리거(수정 직전 자동 세팅) 또는 ORM/애플리케이션 훅 중 팀 표준 한 가지로 일관되게 자동화한다.

```text
// ❌ 금지 — 업데이트마다 손으로 갱신(누락 발생)
UPDATE <도메인> SET name = ?, updated_at = <지금> WHERE id = ?   -- 어딘가는 빠진다

// ✅ 권장 — 수정 시 updated_at 을 자동으로 채운다(트리거/ORM 훅)
ON UPDATE <도메인>: set updated_at = <지금>   // 모든 수정 경로에 자동 적용
UPDATE <도메인> SET name = ? WHERE id = ?      // updated_at 은 자동
```

### 2-3. 삭제는 논리 삭제, 조회는 활성 레코드 기본 필터
- 물리 삭제(`DELETE`) 대신 삭제 시각을 채운다. 기본 조회는 "삭제 안 된 행만" 본다.
- 가능하면 활성 필터를 ORM 전역 스코프 등으로 자동 적용하고, 삭제 포함 조회는 관리자/감사 등 명시적 경로에서만 허용한다.

```text
// ❌ 금지 — 물리 삭제 (복구·감사 불가)
DELETE FROM <도메인> WHERE id = ?

// ✅ 권장 — 논리 삭제
UPDATE <도메인> SET deleted_at = <지금>, deleted_by = ? WHERE id = ?

// 활성 레코드만 조회 (기본 — 가능하면 자동 필터)
SELECT * FROM <도메인> WHERE deleted_at IS NULL

// 삭제 포함 조회 (관리자/감사 — 명시적 경로에서만)
SELECT * FROM <도메인>
```

### 2-4. 유니크 제약은 삭제 레코드를 제외
- 자연키(이메일·코드 등)에 "전체 행" 유니크를 걸면, 삭제 후 같은 값으로 재등록할 때 삭제된 행과 충돌한다.
- 유니크는 "활성 레코드 한정"으로 건다. DB가 조건부(부분) 유니크 인덱스를 지원하면 그것을, 아니면 동등한 수단(예: 유니크 키에 삭제 표시를 포함)을 쓴다.

```text
// ❌ 금지 — 전체 유니크: 삭제된 행과 재등록이 충돌
UNIQUE (email)

// ✅ 권장 — email 은 활성 레코드에서만 유니크 (조건부/부분 유니크)
UNIQUE (email) WHERE deleted_at IS NULL
```

### 2-5. 변경 이력은 별도 이력 테이블로
- 중요한 데이터의 변경 추적이 필요하면 본 테이블에 욱여넣지 말고 이력 테이블을 별도 운영한다(`audit_log` 또는 `*_history`).
- 이력에는 최소한 "무엇을(action)·언제(시각)·누가(행위자)·내용(변경된 행 스냅샷)"을 남긴다. 스냅샷 저장 형식(문서/JSON/컬럼 펼침)은 팀 DB 역량에 맞춘다.

```text
// ✅ 권장 — 변경 이력 테이블(표준 SQL 의사 표현)
TABLE <도메인>_history:
  history_id   <자동 증가 식별자>  PRIMARY KEY
  action       VARCHAR   NOT NULL    -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP             -- 변경 시각
  changed_by   <식별자>              -- 변경자
  row_data     <행 스냅샷>           -- 변경 전/후 전체 행(문서/JSON/펼친 컬럼)
```

## 3. 흔한 실수
- **기본 조회에 활성 필터 누락** → 삭제된 레코드가 그대로 노출된다. "삭제 안 된 행만"을 기본으로(가능하면 자동) 적용한다.
- **전체 유니크 제약** → 삭제 후 같은 값으로 재등록할 때 충돌한다. 활성 레코드 한정 유니크로.
- **`updated_at` 수동 갱신 의존** → 일부 경로에서 빠져 신뢰할 수 없게 된다. 트리거/ORM 훅으로 자동화한다.
- **아카이빙·정리 부재** → 논리 삭제만 쌓여 테이블이 무한히 커진다. 보존·정리 정책을 함께 정한다.
- **감사 컬럼 이름 제각각** → 테이블마다 다른 이름을 쓰면 공통 처리·조회가 어렵다. 팀에서 하나로 통일한다.

## 4. 체크리스트
- [ ] 비즈니스 데이터를 물리 삭제 대신 **논리 삭제**(삭제 시각/플래그)하는가
- [ ] 모든 도메인 테이블에 생성/수정/삭제 **감사 컬럼**이 있고, 이름이 통일돼 있는가
- [ ] `updated_at` 등 수정 시각이 **트리거/ORM 훅으로 자동 갱신**되는가
- [ ] 기본 조회가 **활성 레코드만**(삭제 제외) 보도록 (가능하면 자동) 필터링되는가
- [ ] 유니크 제약이 **삭제 레코드를 제외**(활성 한정)하는가
- [ ] 변경 이력이 필요한 테이블에 **이력 테이블**을 별도 운영하는가
- [ ] 논리 삭제 데이터의 **보존·아카이빙·정리 정책**이 있는가

## 부록: 스택별 예시

> 아래는 위 1~4 표준의 PostgreSQL 구현 예시다(개념·규칙 설명은 본문 참조). 팀이 쓰는 DB(예: MySQL, Oracle, SQL Server, SQLite 등)에 맞는 예시를 같은 패턴으로 추가한다.

### PostgreSQL

PostgreSQL은 `gen_random_uuid()`, `plpgsql` 트리거, 부분 유니크 인덱스(`WHERE`), `JSONB` 등을 기본 제공한다.

```sql
-- 표준 감사 컬럼 (2-1)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id),
  updated_by  UUID REFERENCES users(id),
  deleted_at  TIMESTAMP,          -- NULL = 활성, NOT NULL = 삭제됨
  deleted_by  UUID REFERENCES users(id)
);

-- updated_at 자동 갱신 트리거 (2-2)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 논리 삭제 + 활성 필터 (2-3)
UPDATE users SET deleted_at = NOW(), deleted_by = $user WHERE id = $id;
SELECT * FROM users WHERE deleted_at IS NULL;

-- 활성 레코드 한정 유니크 (2-4) — 부분 유니크 인덱스
CREATE UNIQUE INDEX ON users(email) WHERE deleted_at IS NULL;

-- 변경 이력 테이블 (2-5) — 스냅샷은 JSONB
CREATE TABLE users_history (
  history_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action       VARCHAR NOT NULL,  -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP DEFAULT NOW(),
  changed_by   UUID,
  row_data     JSONB              -- 변경 전 전체 행
);
```
