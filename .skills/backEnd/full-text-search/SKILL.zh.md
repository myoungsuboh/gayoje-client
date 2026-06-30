---
name: 全文检索 (Full-text Search)
description: 检索引擎选择、索引策略、韩语形态素分析、检索质量改进的栈中立标准。在引入自然语言/形态素检索或清除 LIKE 滥用时，在确定检索索引同步、质量指标、查询超时时阅读。关键词：full-text search, Elasticsearch, OpenSearch, Typesense, nori, korean, indexing, CDC, nDCG, MRR.
rules:
  - "复杂的全文检索(自然语言·形态素·加权·容错)使用专用检索引擎，不滥用 LIKE '%...%' 查询。"
  - "韩语文本应用形态素分析器以形态素为单位进行索引·检索 — 仅靠空格分割会使韩语检索质量下降。"
  - "检索索引不是源 DB 的简单副本，而是由单独的同步管道(CDC·事件·批处理)填充。"
  - "检索质量要测量 — 用离线指标(nDCG·MRR)和在线指标(点击率)评估并改进。"
  - "查询要设置超时，超时时不要伪装成空结果，而应提供错误与重试路径。"
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

# 🔍 全文检索 (Full-text Search)

> 以不依赖特定引擎的方式设计自然语言·形态素检索。在新引入检索功能、清除 LIKE 查询并迁移到专用检索、或确定韩语检索质量·同步·超时时阅读。

## 1. 核心原则
- 复杂的全文检索(自然语言·形态素·加权·容错)使用专用检索引擎，不滥用 `LIKE '%...%'` 查询。
- 韩语文本应用形态素分析器以形态素为单位进行索引·检索 — 仅靠空格分割会使韩语检索质量下降。
- 检索索引不是源 DB 的简单副本，而是由单独的同步管道(CDC·事件·批处理)填充。
- 检索质量要测量 — 用离线指标(nDCG·MRR)和在线指标(点击率)评估并改进。
- 查询要设置超时，超时时不要伪装成空结果，而应提供错误与重试路径。

## 2. 规则

### 2-1. 专用检索引擎 vs 禁止滥用 LIKE
- 简单匹配·少量文档用 DB 内置功能就够，但需要自然语言/形态素/加权/容错时，迁移到专用检索引擎。
- `LIKE '%关键词%'` 因前导通配符无法走索引而变成全表扫描，且无法支持形态素·加权·高亮。

```text
# ❌ 禁止 — 用 LIKE 凑合全文检索需求(全表扫描·不支持形态素·无相关度)
SELECT * FROM docs WHERE title LIKE '%사용자 입력%' OR content LIKE '%사용자 입력%'

# ✅ 推荐 — 用专用检索引擎的形态素分析 + 字段加权 + 高亮进行查询
search(query="사용자 입력", fields=["title^3", "content"], fuzziness="AUTO")
```

引擎选择由规模·运维环境·功能需求决定。

| 引擎 | 优点 | 适用场景 |
|------|------|-----------|
| Elasticsearch | 功能丰富，韩语 nori | 大规模·复杂检索 |
| OpenSearch | AWS 集成，OSS | AWS 环境 |
| Typesense | 安装简便，容错 | 小规模 SaaS |
| PostgreSQL FTS | 无需额外基础设施 | 少量文档·简单检索 |

### 2-2. 韩语形态素分析
- 韩语因助词·词尾附着，单词边界与空格不一致，因此须用形态素分析器分词，使「검색했다 / 검색하는 / 검색」匹配到同一词根。
- 按引擎选择代表性分析器：Elasticsearch 用 `nori`，其他环境用 `mecab`·`khaiii` 等。
- 索引时与查询时须应用相同的分析器，token 才不会错位。

### 2-3. 单独的同步管道
- 检索索引不是源 DB 的原样复制，而是为检索优化的单独存储。明确放置将 DB 变更反映到索引的同步路径。
- 在 CDC(如 Debezium)·领域事件·周期批处理中，选择符合数据新鲜度需求的方式。

```text
# ✅ 推荐 — 通过管道将 DB 变更反映到索引
DB 变更 → CDC / 事件发布 → 队列 → 索引器 worker → 检索引擎 upsert
```

### 2-4. 检索质量指标
- 检索不是「出结果」就完事，而是「相关结果在上面」为目标 — 务必测量。
- 离线：用 nDCG·MRR 定量评估排序质量。
- 在线：用用户点击率(CTR)·再检索率追踪实际满意度。

### 2-5. 查询超时
- 给检索查询设置超时(如 5 秒)，使慢查询无法占用系统。
- 发生超时时伪装成空结果会让用户误解为「无结果」 — 提供错误消息与重试路径。

## 3. 常见错误
- 用 `LIKE '%...%'` 凑合全文检索需求 → 全表扫描·不支持形态素·无相关度。
- 韩语未应用形态素分析器 → 因词尾变化·助词导致检索遗漏。
- 索引/查询应用不同的分析器 → token 不一致导致匹配失败。
- 没有将索引与 DB 同步的路径 → 检索结果与最新数据错位。
- 不测量质量指标 → 排序变差也无法察觉。
- 未设置超时或超时时返回空结果 → 故障伪装成「无结果」。

## 4. 检查清单
- [ ] 是否用专用检索引擎而非 LIKE 处理自然语言/形态素检索需求
- [ ] 是否选择了符合规模·运维环境的引擎
- [ ] 是否对韩语应用形态素分析器，且索引/查询使用相同分析器
- [ ] 是否设计了 DB → 索引同步管道(CDC·事件·批处理)
- [ ] 是否用 nDCG·MRR(离线)和点击率(在线)测量检索质量
- [ ] 是否设置查询超时，并在超时时提供错误·重试

---

## 附录：分栈示例

这是依赖特定引擎的具体配置。用作以 Elasticsearch 实现上述正文原则时的参考；如使用其他引擎，请替换为对应配置。

### Elasticsearch 索引设置 (韩语 nori)

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

### Elasticsearch 检索查询模式

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

### DB → 检索索引同步 (实现示例)

```text
DB 变更 → CDC(Debezium) → Kafka → 索引器 worker → ES upsert
```
或
```text
DB 变更时 → 事件发布 → 索引更新作业队列 → ES upsert
```
