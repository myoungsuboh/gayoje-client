---
name: 分区策略
description: 时序·范围·哈希分区设计、分区裁剪、管理自动化标准（以PostgreSQL为主）。在设计数亿行大容量·时序表、对旧数据进行DROP/归档、或检查分区键·裁剪时阅读。关键词: partition, partitioning, range-partition, hash-partition, list-partition, pg_partman, time-series, pruning, DETACH.
rules:
  - "对数亿行以上的大容量表，或需要DROP旧分区的时序数据应用分区。"
  - "分区键选择查询WHERE条件中始终包含的列（例如 created_at），以利用分区裁剪。"
  - "时序数据按月·季度粒度采用RANGE分区管理，并用调度器自动化新分区的创建。"
  - "由于分区索引按各分区分别创建，需确认整表索引大小减小的效果。"
  - "在DROP分区前先用DETACH验证，为防止失误不要立即DELETE。"
tags:
  - "partition"
  - "partitioning"
  - "range-partition"
  - "hash-partition"
  - "list-partition"
  - "pg_partman"
  - "time-series"
  - "pruning"
  - "DETACH"
---

# 🗂️ 分区策略

> 将大容量·时序表拆分为分区，以控制查询性能与管理成本。在设计数亿行表或清理旧分区时阅读。

## 1. 核心原则
- 对数亿行以上的大容量表，或需要DROP旧分区的时序数据应用分区。
- 分区键选择查询WHERE条件中始终包含的列（例如 `created_at`），以利用分区裁剪。
- 时序数据按月·季度粒度采用RANGE分区管理，并用调度器自动化新分区的创建。
- 由于分区索引按各分区分别创建，需确认整表索引大小减小的效果。
- 在DROP分区前先用DETACH验证，为防止失误不要立即DELETE。

## 2. 规则

### 2-1. 选择分区类型
| 类型 | 标准 | 适用场景 |
|------|------|-----------|
| RANGE | 数值·日期范围 | 时序日志·事件 |
| LIST | 固定值列表 | 地区·状态码 |
| HASH | 哈希分散 | 均匀分散的大容量 |

### 2-2. RANGE分区 (PostgreSQL)
```sql
-- ✅ 创建父表 — 分区键为WHERE中始终使用的created_at
CREATE TABLE events (
  id         BIGINT NOT NULL,
  event_type VARCHAR,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- ✅ 创建按月分区
CREATE TABLE events_2026_01
  PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02
  PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 2-3. 确认分区裁剪
```sql
-- ✅ 将分区键放入WHERE，确认仅扫描单个分区
EXPLAIN SELECT * FROM events WHERE created_at >= '2026-06-01';
-- 应仅输出 "Seq Scan on events_2026_06"
-- 若 "Append" 之下没有其他分区，则裁剪成功
```

### 2-4. 分区自动管理 (pg_partman)
```sql
-- ✅ 预先创建未来分区以防止写入遗漏
SELECT partman.create_parent(
  p_parent_table => 'public.events',
  p_control => 'created_at',
  p_type => 'range',
  p_interval => '1 month',
  p_premake => 3   -- 预先创建未来3个月
);
```

### 2-5. 旧分区的保留 (DETACH后DROP)
```sql
-- ✅ 先分离（保留为表）以验证
ALTER TABLE events DETACH PARTITION events_2025_01;

-- ✅ 验证后删除或归档
DROP TABLE events_2025_01;  -- 或 pg_dump 到 ARCHIVE DB 后删除

-- ❌ 禁止 — 未经验证直接删除分区（不可恢复）
-- DROP TABLE events_2025_01;  (省略DETACH步骤)
```

## 3. 常见错误
- 未将分区键放入WHERE，导致扫描所有分区 → 裁剪失效。
- 未预先创建未来分区，写入时出现无分区错误。
- 未经DETACH直接DROP → 失误时不可恢复。
- 分区数拆分过度，元数据·规划成本增加。

## 4. 检查清单
- [ ] 是否真的达到需要分区的规模（数亿行/时序DROP）
- [ ] 分区键是否为WHERE中始终包含的列
- [ ] 是否用EXPLAIN确认了分区裁剪
- [ ] 是否用调度器（pg_partman 等）自动化了未来分区的创建
- [ ] 是否按 DETACH → 验证 → DROP 的顺序移除分区
