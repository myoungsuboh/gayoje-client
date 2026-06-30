---
name: DB 組み込み全文検索 (FTS)
description: PostgreSQL・MySQL の組み込み全文検索 (FTS) の標準。tsvector/tsquery、GIN インデックス、ts_rank によるランキング、ts_headline によるハイライト、pg_trgm による部分文字列、韓国語検索の扱いをカバーする。別途の検索エンジンなしに DB でテキスト検索を追加する、または `LIKE '%...%'` の性能問題を解決するときに読む。キーワード: full-text-search, fts, tsvector, tsquery, gin-index, pg_trgm, ts_rank。
rules:
  - "小規模(数十万件以下)データの全文検索は、別途の検索エンジンなしに DB 組み込み FTS を優先的に検討する。"
  - "PostgreSQL は tsvector カラム + GIN インデックスを使い、検索カラムは GENERATED ALWAYS AS で自動更新する。"
  - "韓国語検索で DB 組み込みアナライザが限定的な場合は、アプリケーション側で形態素分割してから tsvector に保存する。"
  - "検索結果は ts_rank() でランク付けし、検索語のハイライトは ts_headline() で抽出する。"
  - "LIKE '%...%' はインデックスを使えないため、FTS または trigram インデックス(pg_trgm)で置き換える。"
tags:
  - "full-text-search"
  - "fts"
  - "tsvector"
  - "tsquery"
  - "gin-index"
  - "pg_trgm"
  - "ts_rank"
---

# 🔍 DB 組み込み全文検索 (FTS)

> PostgreSQL・MySQL の組み込み全文検索機能でテキスト検索を実装するための標準。小規模データに検索機能を追加する、または `LIKE '%...%'` の性能問題を解決するときに読む。

## 1. 核心原則
- 小規模(数十万件以下)データの全文検索は、別途の検索エンジンなしに DB 組み込み FTS を優先的に検討する。
- PostgreSQL は `tsvector` カラム + GIN インデックスを使い、検索カラムは `GENERATED ALWAYS AS` で自動更新する。
- 韓国語検索で DB 組み込みアナライザが限定的な場合は、アプリケーション側で形態素分割してから `tsvector` に保存する。
- 検索結果は `ts_rank()` でランク付けし、検索語のハイライトは `ts_headline()` で抽出する。
- `LIKE '%...%'` はインデックスを使えないため、FTS または trigram インデックス(`pg_trgm`)で置き換える。

## 2. ルール

### 2-1. PostgreSQL FTS の基礎 (tsvector / tsquery)
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

### 2-2. GENERATED カラム + GIN インデックス
検索カラムは `GENERATED ALWAYS AS ... STORED` で自動更新し、GIN インデックスを張る。`setweight` でタイトル(A)・本文(B)の重みを分ける。
```sql
ALTER TABLE articles
  ADD COLUMN search_vec tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX idx_articles_fts ON articles USING GIN(search_vec);
```

### 2-3. 検索クエリ + ランキング + ハイライト
```sql
SELECT
  id, title,
  ts_rank(search_vec, query) AS rank,
  ts_headline('simple', content, query, 'MaxWords=30') AS snippet
FROM articles, to_tsquery('simple', '검색 & 최적화') query
WHERE search_vec @@ query
ORDER BY rank DESC;
```

### 2-4. trigram 検索 (pg_trgm) — 部分文字列
`LIKE '%...%'` / `ILIKE` にインデックスを使わせるには、`pg_trgm` の GIN trigram インデックスを使う。
```sql
-- ❌ 금지 — 인덱스 미사용 (풀스캔)
SELECT * FROM articles WHERE title ILIKE '%검색%';

-- ✅ 권장 — trigram 인덱스로 ILIKE 가속
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_trgm ON articles USING GIN(title gin_trgm_ops);

SELECT * FROM articles WHERE title ILIKE '%검색%';  -- 이제 인덱스 활용
```

### 2-5. MySQL FULLTEXT (ngram パーサ)
MySQL は `FULLTEXT` インデックスを使い、韓国語など空白のないトークンは `ngram` パーサで分割する。
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
> `ngram_token_size`(デフォルト 2)でトークン長を調整する。BOOLEAN MODE は `+必須 -除外 *接頭` 演算子をサポートする。

## 3. よくあるミス
- ❌ `LIKE '%...%'` のフルスキャン → FTS/trigram インデックスで置き換える。
- ❌ PostgreSQL の `tsvector` カラムを手動更新 → 漏れが発生。`GENERATED ALWAYS AS ... STORED` で。
- ❌ GIN インデックスなしの FTS → 遅い。
- ❌ 韓国語をデフォルトアナライザで処理 → 形態素分割されない。PG は `simple` + 形態素分割、MySQL は `ngram`。
- ❌ 大規模(数百万+)で DB FTS に固執 → 専用検索エンジン(Elasticsearch/OpenSearch)を検討(`full-text-search` 参照)。
- ❌ MySQL で ngram パーサなしの韓国語 FULLTEXT → トークン化に失敗し検索 0 件。

## 4. チェックリスト
- [ ] データ規模上、別途の検索エンジンなしに DB 組み込み FTS で十分か検討したか
- [ ] `tsvector` 検索カラムを `GENERATED ALWAYS AS ... STORED` で自動更新しているか
- [ ] 検索カラムに GIN インデックスを作成したか
- [ ] 結果のランキングは `ts_rank()`、ハイライトは `ts_headline()` で処理したか
- [ ] 部分文字列検索は `LIKE '%...%'` の代わりに `pg_trgm` trigram インデックスで置き換えたか
- [ ] 韓国語検索の品質が不足する場合、形態素分割してから `tsvector` に保存しているか
