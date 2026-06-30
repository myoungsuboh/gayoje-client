---
name: 分页与过滤标准 (Pagination & Filtering)
description: 基于游标・基于偏移的分页和动态过滤 API 设计标准（技术栈中立）。在构建列表 API 或设计大数据量查询・排序・过滤时阅读。关键词: pagination, cursor, offset, filtering, page, limit, sort。
rules:
  - "大数据集使用基于游标的分页而非偏移，以避免 OFFSET N 的性能下降。"
  - "在分页响应中包含 next_cursor（或 next_page）、total_count 和 has_more。"
  - "过滤参数仅通过显式白名单（whitelist）处理，防止 SQL/NoSQL 注入。"
  - "始终明确默认排序标准（例如 created_at DESC, id DESC），不在无排序的情况下分页。"
  - "为页面大小（limit）设置最大值（例如最大 100）。不让客户端无限制请求。"
tags:
  - "pagination"
  - "cursor"
  - "offset"
  - "filtering"
  - "page"
  - "limit"
  - "sort"
---

# 📄 分页与过滤标准

> 统一列表 API 的分页・排序・过滤方式。在构建新的列表 API 或优化大数据量查询性能时阅读。

## 1. 核心原则
- 大数据集使用基于游标的分页而非偏移，以避免 OFFSET N 的性能下降。
- 在分页响应中包含 next_cursor（或 next_page）、total_count 和 has_more。
- 过滤参数仅通过显式白名单（whitelist）处理，防止 SQL/NoSQL 注入。
- 始终明确默认排序标准（例如 created_at DESC, id DESC），不在无排序的情况下分页。
- 为页面大小（limit）设置最大值（例如最大 100）。不让客户端无限制请求。

## 2. 规则

### 2-1. 偏移 vs 游标的选择
| 方式 | 优点 | 缺点 | 推荐场景 |
|------|------|------|-----------|
| 偏移 | 可直接跳转到特定页 | OFFSET 越大越慢，实时数据不稳定 | 小量（<10万）、管理员列表 |
| 游标 | 性能恒定、稳定 | 无法跳转到特定页 | 大数据量、无限滚动 |

### 2-2. 基于游标的响应格式
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

### 2-3. 过滤白名单模式
```python
# ❌ 禁止 — 将客户端发送的过滤键直接传入查询（注入风险）
# ✅ 推荐 — 仅通过显式白名单处理
ALLOWED_FILTERS = {"status", "category", "created_after", "created_before"}

def validate_filters(params: dict) -> dict:
    return {k: v for k, v in params.items() if k in ALLOWED_FILTERS}
```

### 2-4. 游标生成 (opaque base64)
```python
import base64, json

def encode_cursor(row_id: int) -> str:
    return base64.b64encode(json.dumps({"id": row_id}).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.b64decode(cursor).decode())
```

### 2-5. 强制排序・limit
```text
// ❌ 禁止 — 无排序的分页，limit 无限制
SELECT * FROM items LIMIT :clientLimit

// ✅ 推荐 — 显式排序 + limit 上限
SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT min(:clientLimit, 100)
```

## 3. 常见错误
- 数据量大却使用偏移 → OFFSET 越大查询急剧变慢。
- 无排序的分页 → 每页顺序晃动，产生重复・遗漏。
- 过滤键无白名单直接通过 → SQL/NoSQL 注入风险。
- 未设置 limit 上限 → 客户端一次拉取全部，引发负载。

## 4. 检查清单
- [ ] 大列表是否使用了基于游标的分页
- [ ] 响应中是否包含 next_cursor・has_more（必要时 total_count）
- [ ] 过滤是否仅通过显式白名单处理
- [ ] 是否明确了默认排序标准（禁止无排序的分页）
- [ ] 是否设置了 limit 最大值
