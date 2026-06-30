---
name: Pagination & Filtering Standard (Pagination & Filtering)
description: Standard for cursor-based / offset-based pagination and dynamic filtering API design (stack-neutral). Read this when building list APIs or designing large-scale data retrieval, sorting, and filtering. Keywords: pagination, cursor, offset, filtering, page, limit, sort.
rules:
  - "For large datasets, use cursor-based pagination instead of offset to prevent the OFFSET N performance degradation."
  - "Include next_cursor (or next_page), total_count, and has_more in the pagination response."
  - "Process filter parameters only through an explicit whitelist, and prevent SQL/NoSQL injection."
  - "Always specify a default sort criterion (e.g., created_at DESC, id DESC); never paginate without sorting."
  - "Set a maximum value for the page size (limit) (e.g., max 100). Do not let clients request unlimited amounts."
tags:
  - "pagination"
  - "cursor"
  - "offset"
  - "filtering"
  - "page"
  - "limit"
  - "sort"
---

# 📄 Pagination & Filtering Standard

> Unify the pagination, sorting, and filtering approach for list APIs. Read this when building a new list API or tuning large-scale retrieval performance.

## 1. Core Principles
- For large datasets, use cursor-based pagination instead of offset to prevent the OFFSET N performance degradation.
- Include next_cursor (or next_page), total_count, and has_more in the pagination response.
- Process filter parameters only through an explicit whitelist, and prevent SQL/NoSQL injection.
- Always specify a default sort criterion (e.g., created_at DESC, id DESC); never paginate without sorting.
- Set a maximum value for the page size (limit) (e.g., max 100). Do not let clients request unlimited amounts.

## 2. Rules

### 2-1. Offset vs Cursor Selection
| Method | Pros | Cons | Recommended For |
|------|------|------|-----------|
| Offset | Can jump directly to a specific page | Slower as OFFSET grows, unstable with real-time data | Small volume (<100k), admin lists |
| Cursor | Consistent performance, stable | Cannot jump to a specific page | Large volume, infinite scroll |

### 2-2. Cursor-based Response Format
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

### 2-3. Filter Whitelist Pattern
```python
# ❌ Forbidden — passing client-sent filter keys directly into the query (injection risk)
# ✅ Recommended — process only through an explicit whitelist
ALLOWED_FILTERS = {"status", "category", "created_after", "created_before"}

def validate_filters(params: dict) -> dict:
    return {k: v for k, v in params.items() if k in ALLOWED_FILTERS}
```

### 2-4. Cursor Generation (opaque base64)
```python
import base64, json

def encode_cursor(row_id: int) -> str:
    return base64.b64encode(json.dumps({"id": row_id}).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.b64decode(cursor).decode())
```

### 2-5. Enforcing Sort & limit
```text
// ❌ Forbidden — pagination without sorting, unlimited limit
SELECT * FROM items LIMIT :clientLimit

// ✅ Recommended — explicit sort + limit cap
SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT min(:clientLimit, 100)
```

## 3. Common Mistakes
- Using offset on a large volume → the query slows down sharply as OFFSET grows.
- Pagination without sorting → the order shifts between pages, causing duplicates and omissions.
- Passing filter keys without a whitelist → SQL/NoSQL injection risk.
- No limit cap → a client can pull the entire set at once, causing load.

## 4. Checklist
- [ ] Did you use cursor-based pagination for large lists?
- [ ] Did you include next_cursor and has_more (total_count if needed) in the response?
- [ ] Did you process filters only through an explicit whitelist?
- [ ] Did you specify a default sort criterion (no pagination without sorting)?
- [ ] Did you set a maximum limit value?
