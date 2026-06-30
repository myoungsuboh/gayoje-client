---
name: DB 내장 전문 검색 (FTS)
description: PostgreSQL·MySQL 내장 전문 검색(FTS) 표준. tsvector/tsquery, GIN 인덱스, ts_rank 순위, ts_headline 하이라이트, pg_trgm 부분 문자열, 한국어 검색 처리를 다룬다. 별도 검색 엔진 없이 DB로 텍스트 검색을 붙이거나 `LIKE '%...%'` 성능 문제를 해결할 때 읽는다. 키워드: full-text-search, fts, tsvector, tsquery, gin-index, pg_trgm, ts_rank.
rules:
  - "소규모(수십만 건 이하) 데이터의 전문 검색은 별도 검색 엔진 없이 DB 내장 FTS를 우선 검토한다."
  - "PostgreSQL은 tsvector 컬럼 + GIN 인덱스를 사용하고, 검색 컬럼은 GENERATED ALWAYS AS로 자동 갱신한다."
  - "한국어 검색에서 DB 내장 분석기가 제한적이면 애플리케이션에서 형태소 분리 후 tsvector에 저장한다."
  - "검색 결과는 ts_rank()로 순위를 매기고, 검색어 하이라이트는 ts_headline()으로 추출한다."
  - "LIKE '%...%' 는 인덱스를 사용하지 못하므로 FTS나 trigram 인덱스(pg_trgm)로 대체한다."
tags:
  - "full-text-search"
  - "fts"
  - "tsvector"
  - "tsquery"
  - "gin-index"
  - "pg_trgm"
  - "ts_rank"
---

# 🔍 DB 내장 전문 검색 (FTS)

> PostgreSQL·MySQL 내장 전문 검색 기능으로 텍스트 검색을 구현하는 표준. 소규모 데이터에 검색 기능을 붙이거나 `LIKE '%...%'` 의 성능 문제를 풀 때 읽는다.

## 1. 핵심 원칙
- 소규모(수십만 건 이하) 데이터의 전문 검색은 별도 검색 엔진 없이 DB 내장 FTS를 우선 검토한다.
- PostgreSQL은 `tsvector` 컬럼 + GIN 인덱스를 사용하고, 검색 컬럼은 `GENERATED ALWAYS AS`로 자동 갱신한다.
- 한국어 검색에서 DB 내장 분석기가 제한적이면 애플리케이션에서 형태소 분리 후 `tsvector`에 저장한다.
- 검색 결과는 `ts_rank()`로 순위를 매기고, 검색어 하이라이트는 `ts_headline()`으로 추출한다.
- `LIKE '%...%'` 는 인덱스를 사용하지 못하므로 FTS나 trigram 인덱스(`pg_trgm`)로 대체한다.

## 2. 규칙

### 2-1. PostgreSQL FTS 기초 (tsvector / tsquery)
```sql
-- tsvector 생성
SELECT to_tsvector('simple', '안녕하세요 검색 테스트') AS vec;
-- 결과: '검색':2 '테스트':3 '안녕하세요':1

-- tsquery 생성
SELECT to_tsquery('simple', '검색 & 테스트') AS q;

-- 매칭
SELECT * FROM articles
WHERE to_tsvector('simple', content) @@ to_tsquery('simple', '검색');
```

### 2-2. GENERATED 컬럼 + GIN 인덱스
검색 컬럼은 `GENERATED ALWAYS AS ... STORED`로 자동 갱신하고, GIN 인덱스를 건다. `setweight`로 제목(A)·본문(B) 가중치를 분리한다.
```sql
ALTER TABLE articles
  ADD COLUMN search_vec tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX idx_articles_fts ON articles USING GIN(search_vec);
```

### 2-3. 검색 쿼리 + 순위 + 하이라이트
```sql
SELECT
  id, title,
  ts_rank(search_vec, query) AS rank,
  ts_headline('simple', content, query, 'MaxWords=30') AS snippet
FROM articles, to_tsquery('simple', '검색 & 최적화') query
WHERE search_vec @@ query
ORDER BY rank DESC;
```

### 2-4. trigram 검색 (pg_trgm) — 부분 문자열
`LIKE '%...%'` / `ILIKE` 가 인덱스를 타게 하려면 `pg_trgm` 의 GIN trigram 인덱스를 쓴다.
```sql
-- ❌ 금지 — 인덱스 미사용 (풀스캔)
SELECT * FROM articles WHERE title ILIKE '%검색%';

-- ✅ 권장 — trigram 인덱스로 ILIKE 가속
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_trgm ON articles USING GIN(title gin_trgm_ops);

SELECT * FROM articles WHERE title ILIKE '%검색%';  -- 이제 인덱스 활용
```

### 2-5. MySQL FULLTEXT (ngram 파서)
MySQL은 `FULLTEXT` 인덱스를 쓰고, 한국어 등 공백 없는 토큰은 `ngram` 파서로 분리한다.
```sql
-- ❌ 금지 — LIKE '%...%' 풀스캔
SELECT * FROM articles WHERE content LIKE '%검색%';

-- ✅ 권장 — FULLTEXT + ngram 파서 (한국어)
ALTER TABLE articles ADD FULLTEXT INDEX ft_articles (title, content) WITH PARSER ngram;
SELECT *, MATCH(title, content) AGAINST('검색' IN BOOLEAN MODE) AS score
FROM articles
WHERE MATCH(title, content) AGAINST('검색' IN BOOLEAN MODE)
ORDER BY score DESC;
```
> `ngram_token_size`(기본 2)로 토큰 길이를 조정한다. BOOLEAN MODE는 `+필수 -제외 *접두` 연산자를 지원한다.

## 3. 흔한 실수
- ❌ `LIKE '%...%'` 풀스캔 → FTS/trigram 인덱스로 대체.
- ❌ PostgreSQL `tsvector` 컬럼을 수동 갱신 → 누락. `GENERATED ALWAYS AS ... STORED`로.
- ❌ GIN 인덱스 없이 FTS → 느리다.
- ❌ 한국어를 기본 분석기로 → 형태소 분리 안 됨. PG는 `simple`+형태소 분리, MySQL은 `ngram`.
- ❌ 대규모(수백만+)에 DB FTS 고집 → 전용 검색엔진(Elasticsearch/OpenSearch) 검토(`full-text-search` 참조).
- ❌ MySQL에서 ngram 파서 없이 한국어 FULLTEXT → 토큰화 실패로 검색 0건.

## 4. 체크리스트
- [ ] 데이터 규모상 별도 검색 엔진 없이 DB 내장 FTS로 충분한지 검토했는가
- [ ] `tsvector` 검색 컬럼을 `GENERATED ALWAYS AS ... STORED`로 자동 갱신하는가
- [ ] 검색 컬럼에 GIN 인덱스를 만들었는가
- [ ] 결과 순위는 `ts_rank()`, 하이라이트는 `ts_headline()` 으로 처리했는가
- [ ] 부분 문자열 검색은 `LIKE '%...%'` 대신 `pg_trgm` trigram 인덱스로 대체했는가
- [ ] 한국어 검색 품질이 부족하면 형태소 분리 후 `tsvector`에 저장하는가
