---
name: DB 内置全文搜索 (FTS)
description: PostgreSQL、MySQL 内置全文搜索 (FTS) 标准。涵盖 tsvector/tsquery、GIN 索引、ts_rank 排序、ts_headline 高亮、pg_trgm 子串匹配以及韩语搜索处理。在不引入独立搜索引擎而用 DB 添加文本搜索，或解决 `LIKE '%...%'` 性能问题时阅读。关键词: full-text-search, fts, tsvector, tsquery, gin-index, pg_trgm, ts_rank。
rules:
  - "小规模(数十万条以下)数据的全文搜索，应优先考虑不引入独立搜索引擎而使用 DB 内置 FTS。"
  - "PostgreSQL 使用 tsvector 列 + GIN 索引，搜索列用 GENERATED ALWAYS AS 自动更新。"
  - "韩语搜索中若 DB 内置分析器能力有限，则在应用层做形态素分词后存入 tsvector。"
  - "搜索结果用 ts_rank() 排序，搜索词高亮用 ts_headline() 提取。"
  - "LIKE '%...%' 无法使用索引，应改用 FTS 或 trigram 索引(pg_trgm)。"
tags:
  - "full-text-search"
  - "fts"
  - "tsvector"
  - "tsquery"
  - "gin-index"
  - "pg_trgm"
  - "ts_rank"
---

# 🔍 DB 内置全文搜索 (FTS)

> 用 PostgreSQL、MySQL 的内置全文搜索功能实现文本搜索的标准。在为小规模数据添加搜索功能，或解决 `LIKE '%...%'` 的性能问题时阅读。

## 1. 核心原则
- 小规模(数十万条以下)数据的全文搜索，应优先考虑不引入独立搜索引擎而使用 DB 内置 FTS。
- PostgreSQL 使用 `tsvector` 列 + GIN 索引，搜索列用 `GENERATED ALWAYS AS` 自动更新。
- 韩语搜索中若 DB 内置分析器能力有限，则在应用层做形态素分词后存入 `tsvector`。
- 搜索结果用 `ts_rank()` 排序，搜索词高亮用 `ts_headline()` 提取。
- `LIKE '%...%'` 无法使用索引，应改用 FTS 或 trigram 索引(`pg_trgm`)。

## 2. 规则

### 2-1. PostgreSQL FTS 基础 (tsvector / tsquery)
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

### 2-2. GENERATED 列 + GIN 索引
搜索列用 `GENERATED ALWAYS AS ... STORED` 自动更新，并建立 GIN 索引。用 `setweight` 区分标题(A)、正文(B)的权重。
```sql
ALTER TABLE articles
  ADD COLUMN search_vec tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX idx_articles_fts ON articles USING GIN(search_vec);
```

### 2-3. 搜索查询 + 排序 + 高亮
```sql
SELECT
  id, title,
  ts_rank(search_vec, query) AS rank,
  ts_headline('simple', content, query, 'MaxWords=30') AS snippet
FROM articles, to_tsquery('simple', '검색 & 최적화') query
WHERE search_vec @@ query
ORDER BY rank DESC;
```

### 2-4. trigram 搜索 (pg_trgm) — 子串
要让 `LIKE '%...%'` / `ILIKE` 走索引，使用 `pg_trgm` 的 GIN trigram 索引。
```sql
-- ❌ 금지 — 인덱스 미사용 (풀스캔)
SELECT * FROM articles WHERE title ILIKE '%검색%';

-- ✅ 권장 — trigram 인덱스로 ILIKE 가속
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_trgm ON articles USING GIN(title gin_trgm_ops);

SELECT * FROM articles WHERE title ILIKE '%검색%';  -- 이제 인덱스 활용
```

### 2-5. MySQL FULLTEXT (ngram 解析器)
MySQL 使用 `FULLTEXT` 索引，韩语等无空格的词元用 `ngram` 解析器切分。
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
> 用 `ngram_token_size`(默认 2)调整词元长度。BOOLEAN MODE 支持 `+必需 -排除 *前缀` 运算符。

## 3. 常见错误
- ❌ `LIKE '%...%'` 全表扫描 → 改用 FTS/trigram 索引。
- ❌ 手动更新 PostgreSQL 的 `tsvector` 列 → 会遗漏。应用 `GENERATED ALWAYS AS ... STORED`。
- ❌ 没有 GIN 索引的 FTS → 慢。
- ❌ 用默认分析器处理韩语 → 不做形态素分词。PG 用 `simple` + 形态素分词，MySQL 用 `ngram`。
- ❌ 大规模(数百万+)仍坚持用 DB FTS → 考虑专用搜索引擎(Elasticsearch/OpenSearch)(参见 `full-text-search`)。
- ❌ MySQL 中不带 ngram 解析器的韩语 FULLTEXT → 分词失败导致搜索 0 条。

## 4. 检查清单
- [ ] 是否评估过就数据规模而言，不引入独立搜索引擎、用 DB 内置 FTS 是否足够
- [ ] `tsvector` 搜索列是否用 `GENERATED ALWAYS AS ... STORED` 自动更新
- [ ] 是否在搜索列上创建了 GIN 索引
- [ ] 结果排序是否用 `ts_rank()`、高亮是否用 `ts_headline()` 处理
- [ ] 子串搜索是否用 `pg_trgm` trigram 索引代替 `LIKE '%...%'`
- [ ] 韩语搜索质量不足时，是否做形态素分词后存入 `tsvector`
