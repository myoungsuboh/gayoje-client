---
name: 페이지네이션 & 필터링 표준 (Pagination & Filtering)
description: 커서 기반·오프셋 기반 페이지네이션과 동적 필터링 API 설계 표준(스택 중립). 목록 API를 만들거나 대용량 데이터 조회·정렬·필터를 설계할 때 읽는다. 키워드: pagination, cursor, offset, filtering, page, limit, sort.
rules:
  - "대용량 데이터셋은 오프셋 대신 커서 기반 페이지네이션을 사용해 OFFSET N 성능 저하를 방지한다."
  - "페이지네이션 응답에 next_cursor(또는 next_page), total_count, has_more를 포함한다."
  - "필터 파라미터는 명시적 허용목록(whitelist)으로만 처리하고, SQL/NoSQL 인젝션을 방지한다."
  - "기본 정렬 기준을 항상 명시하고(예: created_at DESC, id DESC), 정렬 없이 페이지네이션하지 않는다."
  - "페이지 크기(limit)에 최대값을 설정한다(예: 최대 100). 클라이언트가 무제한 요청하지 못하게 한다."
tags:
  - "pagination"
  - "cursor"
  - "offset"
  - "filtering"
  - "page"
  - "limit"
  - "sort"
---

# 📄 페이지네이션 & 필터링 표준

> 목록 API의 페이지네이션·정렬·필터 방식을 통일한다. 새 목록 API를 만들거나 대용량 조회 성능을 잡을 때 읽는다.

## 1. 핵심 원칙
- 대용량 데이터셋은 오프셋 대신 커서 기반 페이지네이션을 사용해 OFFSET N 성능 저하를 방지한다.
- 페이지네이션 응답에 next_cursor(또는 next_page), total_count, has_more를 포함한다.
- 필터 파라미터는 명시적 허용목록(whitelist)으로만 처리하고, SQL/NoSQL 인젝션을 방지한다.
- 기본 정렬 기준을 항상 명시하고(예: created_at DESC, id DESC), 정렬 없이 페이지네이션하지 않는다.
- 페이지 크기(limit)에 최대값을 설정한다(예: 최대 100). 클라이언트가 무제한 요청하지 못하게 한다.

## 2. 규칙

### 2-1. 오프셋 vs 커서 선택
| 방식 | 장점 | 단점 | 권장 상황 |
|------|------|------|-----------|
| 오프셋 | 특정 페이지 직접 이동 가능 | OFFSET 클수록 느림, 실시간 데이터 불안정 | 소량(<10만), 관리자 목록 |
| 커서 | 일정한 성능, 안정적 | 특정 페이지 점프 불가 | 대용량, 무한 스크롤 |

### 2-2. 커서 기반 응답 형식
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "has_more": true,
    "limit": 20
  }
}
```

### 2-3. 필터 허용목록 패턴
```python
# ❌ 금지 — 클라이언트가 보낸 필터 키를 그대로 쿼리에 전달 (인젝션 위험)
# ✅ 권장 — 명시적 허용목록으로만 처리
ALLOWED_FILTERS = {"status", "category", "created_after", "created_before"}

def validate_filters(params: dict) -> dict:
    return {k: v for k, v in params.items() if k in ALLOWED_FILTERS}
```

### 2-4. 커서 생성 (opaque base64)
```python
import base64, json

def encode_cursor(row_id: int) -> str:
    return base64.b64encode(json.dumps({"id": row_id}).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.b64decode(cursor).decode())
```

### 2-5. 정렬·limit 강제
```text
// ❌ 금지 — 정렬 없이 페이지네이션, limit 무제한
SELECT * FROM items LIMIT :clientLimit

// ✅ 권장 — 명시적 정렬 + limit 상한
SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT min(:clientLimit, 100)
```

## 3. 흔한 실수
- 대용량인데 오프셋 사용 → OFFSET 커질수록 쿼리 급격히 느려짐.
- 정렬 없이 페이지네이션 → 페이지마다 순서가 흔들려 중복·누락 발생.
- 필터 키를 허용목록 없이 통과 → SQL/NoSQL 인젝션 위험.
- limit 상한 미설정 → 클라이언트가 한 번에 전체를 끌어가 부하 유발.

## 4. 체크리스트
- [ ] 대용량 목록에 커서 기반을 사용했는가
- [ ] 응답에 next_cursor·has_more(필요시 total_count)를 포함했는가
- [ ] 필터를 명시적 허용목록으로만 처리했는가
- [ ] 기본 정렬 기준을 명시했는가(정렬 없는 페이지네이션 금지)
- [ ] limit 최대값을 설정했는가
