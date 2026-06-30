---
name: Full-text Search (Full-text Search)
description: A stack-neutral standard for search engine selection, indexing strategy, Korean morphological analysis, and search quality improvement. Read when introducing natural-language/morphological search or removing LIKE overuse, and when deciding search index sync, quality metrics, and query timeouts. Keywords: full-text search, Elasticsearch, OpenSearch, Typesense, nori, korean, indexing, CDC, nDCG, MRR.
rules:
  - "For complex full-text search (natural language, morphology, boosting, typo tolerance), use a dedicated search engine and do not overuse LIKE '%...%' queries."
  - "Apply a morphological analyzer to Korean text and index/search at the morpheme level — whitespace splitting alone yields poor Korean search quality."
  - "A search index is not a simple replica of the source DB but is populated by a separate sync pipeline (CDC, events, batch)."
  - "Measure search quality — evaluate and improve with offline metrics (nDCG, MRR) and online metrics (click-through rate)."
  - "Set timeouts on queries, and on exceeding them do not disguise as empty results but provide an error and retry path."
tags:
  - "full-text search"
  - "전문 검색"
  - "Elasticsearch"
  - "OpenSearch"
  - "Typesense"
  - "nori"
  - "형태소"
  - "korean"
  - "indexing"
  - "CDC"
  - "nDCG"
  - "MRR"
  - "full-text-search"
  - "search"
  - "relevance"
  - "cdc"
  - "search-quality"
---

# 🔍 Full-text Search (Full-text Search)

> Design natural-language and morphology-based search in a way that is not bound to a specific engine. Read when newly introducing search functionality, moving away from LIKE queries to dedicated search, or deciding Korean search quality, sync, and timeouts.

## 1. Core Principles
- For complex full-text search (natural language, morphology, boosting, typo tolerance), use a dedicated search engine and do not overuse `LIKE '%...%'` queries.
- Apply a morphological analyzer to Korean text and index/search at the morpheme level — whitespace splitting alone yields poor Korean search quality.
- A search index is not a simple replica of the source DB but is populated by a separate sync pipeline (CDC, events, batch).
- Measure search quality — evaluate and improve with offline metrics (nDCG, MRR) and online metrics (click-through rate).
- Set timeouts on queries, and on exceeding them do not disguise as empty results but provide an error and retry path.

## 2. Rules

### 2-1. Dedicated Search Engine vs No LIKE Overuse
- Simple matching and small document counts are fine with the DB's built-in features, but when natural language / morphology / boosting / typo tolerance are needed, move to a dedicated search engine.
- `LIKE '%keyword%'` cannot use an index because of the leading wildcard, resulting in a full scan, and it cannot support morphology, boosting, or highlighting.

```text
# ❌ Forbidden — patching a full-text search need with LIKE (full scan, no morphology, no relevance)
SELECT * FROM docs WHERE title LIKE '%사용자 입력%' OR content LIKE '%사용자 입력%'

# ✅ Recommended — query with a dedicated search engine's morphological analysis + field boosting + highlighting
search(query="사용자 입력", fields=["title^3", "content"], fuzziness="AUTO")
```

Decide engine choice by scale, operating environment, and feature requirements.

| Engine | Strengths | Suitable Situation |
|------|------|-----------|
| Elasticsearch | Feature-rich, Korean nori | Large-scale, complex search |
| OpenSearch | AWS integration, OSS | AWS environment |
| Typesense | Easy install, typo tolerance | Small-scale SaaS |
| PostgreSQL FTS | No extra infrastructure | Small document count, simple search |

### 2-2. Korean Morphological Analysis
- In Korean, particles and endings attach so word boundaries do not match whitespace; therefore tokenizing with a morphological analyzer is required so that "검색했다 / 검색하는 / 검색" match to the same root.
- Choose a representative analyzer per engine: `nori` for Elasticsearch, and `mecab`/`khaiii` etc. for other environments.
- The same analyzer must be applied at index time and query time so the tokens do not diverge.

### 2-3. Separate Sync Pipeline
- A search index is not a verbatim copy of the source DB but a separate store optimized for search. Place an explicit sync path that reflects DB changes into the index.
- Among CDC (e.g., Debezium), domain events, and periodic batch, choose the approach that matches your data freshness requirements.

```text
# ✅ Recommended — reflect DB changes into the index via a pipeline
DB change → CDC / event publish → queue → indexer worker → search engine upsert
```

### 2-4. Search Quality Metrics
- Search does not end at "results appear" but aims for "relevant results are at the top" — always measure.
- Offline: quantitatively evaluate ranking quality with nDCG and MRR.
- Online: track actual satisfaction with user click-through rate (CTR) and re-search rate.

### 2-5. Query Timeout
- Set a timeout (e.g., 5 seconds) on search queries so that slow queries cannot monopolize the system.
- Disguising a timeout as empty results makes users misread it as "no results" — provide an error message and retry path.

## 3. Common Mistakes
- Patching a full-text search need with `LIKE '%...%'` → full scan, no morphology, no relevance.
- No morphological analyzer for Korean → search misses due to ending changes and particles.
- Applying different analyzers at index/query time → matching fails due to token mismatch.
- No path to sync the index with the DB → search results diverge from the latest data.
- Not measuring quality metrics → poor ranking goes unnoticed.
- No timeout set, or returning empty results on exceeding → an outage masquerades as "no results".

## 4. Checklist
- [ ] Did you handle natural-language/morphological search needs with a dedicated search engine rather than LIKE?
- [ ] Did you choose an engine matching scale and operating environment?
- [ ] Did you apply a morphological analyzer to Korean and use the same analyzer at index/query time?
- [ ] Did you design a DB → index sync pipeline (CDC, events, batch)?
- [ ] Do you measure search quality with nDCG, MRR (offline) and click-through rate (online)?
- [ ] Did you set a query timeout and provide an error/retry on exceeding it?

---

## Appendix: Stack-specific Examples

These are concrete settings bound to a specific engine. Use them as a reference when implementing the principles in the main text above with Elasticsearch; if you use a different engine, replace with the corresponding settings.

### Elasticsearch Index Settings (Korean nori)

```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "korean": {
          "type": "custom",
          "tokenizer": "nori_tokenizer",
          "filter": ["lowercase", "nori_part_of_speech"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title":   { "type": "text", "analyzer": "korean", "boost": 3 },
      "content": { "type": "text", "analyzer": "korean" },
      "tags":    { "type": "keyword" }
    }
  }
}
```

### Elasticsearch Search Query Pattern

```json
{
  "query": {
    "multi_match": {
      "query": "사용자 입력",
      "fields": ["title^3", "content"],
      "type": "best_fields",
      "fuzziness": "AUTO"
    }
  },
  "highlight": {
    "fields": { "title": {}, "content": {} }
  }
}
```

### DB → Search Index Sync (implementation example)

```text
DB change → CDC(Debezium) → Kafka → indexer worker → ES upsert
```
or
```text
On DB change → event publish → index update job queue → ES upsert
```
