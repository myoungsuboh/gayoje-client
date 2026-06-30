---
name: DB Built-in Full-Text Search (FTS)
description: Standard for PostgreSQL/MySQL built-in full-text search (FTS). Covers tsvector/tsquery, GIN indexes, ts_rank ranking, ts_headline highlighting, pg_trgm substring matching, and Korean search handling. Read when adding text search via the DB without a separate search engine or fixing `LIKE '%...%'` performance issues. Keywords: full-text-search, fts, tsvector, tsquery, gin-index, pg_trgm, ts_rank.
rules:
  - "For full-text search over small datasets (hundreds of thousands of rows or fewer), consider the DB's built-in FTS first, without a separate search engine."
  - "In PostgreSQL, use a tsvector column + GIN index, and keep the search column auto-updated with GENERATED ALWAYS AS."
  - "When the DB's built-in analyzer is limited for Korean search, perform morphological tokenization in the application and store the result in tsvector."
  - "Rank results with ts_rank(), and extract search-term highlights with ts_headline()."
  - "LIKE '%...%' cannot use indexes, so replace it with FTS or a trigram index (pg_trgm)."
tags:
  - "full-text-search"
  - "fts"
  - "tsvector"
  - "tsquery"
  - "gin-index"
  - "pg_trgm"
  - "ts_rank"
---

# 🔍 DB Built-in Full-Text Search (FTS)

> A standard for implementing text search with the built-in full-text search features of PostgreSQL/MySQL. Read when adding search to small datasets or solving the performance problems of `LIKE '%...%'`.

## 1. Core Principles
- For full-text search over small datasets (hundreds of thousands of rows or fewer), consider the DB's built-in FTS first, without a separate search engine.
- In PostgreSQL, use a `tsvector` column + GIN index, and keep the search column auto-updated with `GENERATED ALWAYS AS`.
- When the DB's built-in analyzer is limited for Korean search, perform morphological tokenization in the application and store the result in `tsvector`.
- Rank results with `ts_rank()`, and extract search-term highlights with `ts_headline()`.
- `LIKE '%...%'` cannot use indexes, so replace it with FTS or a trigram index (`pg_trgm`).

## 2. Rules

### 2-1. PostgreSQL FTS Basics (tsvector / tsquery)
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

### 2-2. GENERATED Column + GIN Index
Keep the search column auto-updated with `GENERATED ALWAYS AS ... STORED` and put a GIN index on it. Use `setweight` to separate the weights of title (A) and body (B).
```sql
ALTER TABLE articles
  ADD COLUMN search_vec tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX idx_articles_fts ON articles USING GIN(search_vec);
```

### 2-3. Search Query + Ranking + Highlighting
```sql
SELECT
  id, title,
  ts_rank(search_vec, query) AS rank,
  ts_headline('simple', content, query, 'MaxWords=30') AS snippet
FROM articles, to_tsquery('simple', '검색 & 최적화') query
WHERE search_vec @@ query
ORDER BY rank DESC;
```

### 2-4. Trigram Search (pg_trgm) — Substrings
To make `LIKE '%...%'` / `ILIKE` use an index, use a `pg_trgm` GIN trigram index.
```sql
-- ❌ 금지 — 인덱스 미사용 (풀스캔)
SELECT * FROM articles WHERE title ILIKE '%검색%';

-- ✅ 권장 — trigram 인덱스로 ILIKE 가속
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_trgm ON articles USING GIN(title gin_trgm_ops);

SELECT * FROM articles WHERE title ILIKE '%검색%';  -- 이제 인덱스 활용
```

### 2-5. MySQL FULLTEXT (ngram parser)
MySQL uses a `FULLTEXT` index, and tokenizes tokens without whitespace such as Korean with the `ngram` parser.
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
> Adjust the token length with `ngram_token_size` (default 2). BOOLEAN MODE supports the `+required -exclude *prefix` operators.

## 3. Common Mistakes
- ❌ `LIKE '%...%'` full scan → replace with an FTS/trigram index.
- ❌ Manually updating a PostgreSQL `tsvector` column → leads to omissions. Use `GENERATED ALWAYS AS ... STORED`.
- ❌ FTS without a GIN index → slow.
- ❌ Using the default analyzer for Korean → no morphological tokenization. For PG use `simple` + morphological tokenization, for MySQL use `ngram`.
- ❌ Insisting on DB FTS at large scale (millions+) → consider a dedicated search engine (Elasticsearch/OpenSearch) (see `full-text-search`).
- ❌ Korean FULLTEXT in MySQL without the ngram parser → tokenization fails, returning 0 results.

## 4. Checklist
- [ ] Did you evaluate whether the DB's built-in FTS is sufficient for the data size, without a separate search engine?
- [ ] Is the `tsvector` search column auto-updated with `GENERATED ALWAYS AS ... STORED`?
- [ ] Did you create a GIN index on the search column?
- [ ] Did you handle result ranking with `ts_rank()` and highlighting with `ts_headline()`?
- [ ] Did you replace substring search with a `pg_trgm` trigram index instead of `LIKE '%...%'`?
- [ ] If Korean search quality is insufficient, do you perform morphological tokenization and store the result in `tsvector`?
