---
name: 离线优先 & 同步
description: 离线数据缓存、本地-远程同步、冲突解决、基于队列(outbox)的重传标准(移动端)。当以离线优先方式设计依赖网络的功能,或制定同步冲突·增量同步策略时阅读。关键词: offline-first, sync, outbox, conflict-resolution, watermelondb, sqlite, last-write-wins, delta-sync.
rules:
  - "依赖网络的功能采用离线优先(Offline-First)设计,将本地数据库作为真实来源(source of truth),并在后台同步。"
  - "离线期间发生的变更堆入工作队列(outbox),连接恢复时按顺序重传到服务器。"
  - "明确同步冲突策略(Last-Write-Wins · 服务器优先 · 手动合并),并依据时间戳或版本向量判断。"
  - "在每条记录上保存同步状态(synced · pending · conflict),并在 UI 中显示同步进度。"
  - "大批量同步采用增量(增量差异)方式处理,以最后同步时刻(sync_token)为基准仅拉取变更部分。"
tags:
  - "offline-first"
  - "sync"
  - "outbox"
  - "conflict-resolution"
  - "watermelondb"
  - "sqlite"
  - "last-write-wins"
  - "delta-sync"
---

# 📴 离线优先 & 同步

> 将本地数据库作为真实来源,在后台与服务器同步。当设计依赖网络的功能,或制定离线变更的重传·冲突解决时阅读。

## 1. 核心原则
- 依赖网络的功能采用离线优先(Offline-First)设计,将本地数据库作为真实来源,并在后台同步。
- 离线期间发生的变更堆入工作队列(outbox),连接恢复时按顺序重传到服务器。
- 明确同步冲突策略(Last-Write-Wins · 服务器优先 · 手动合并),并依据时间戳或版本向量判断。
- 在每条记录上保存同步状态(synced · pending · conflict),并在 UI 中显示同步进度。
- 大批量同步采用增量(增量差异)方式处理,以最后同步时刻(sync_token)为基准仅拉取变更部分。

## 2. 规则

### 2-1. 架构 (本地数据库为真实来源)
```
UI → 本地数据库 (SQLite/WatermelonDB/Realm)  ← 真实来源
         ↓ (变更时)
     Outbox 队列 (pending 操作)
         ↓ (连接恢复时)
     同步引擎 → 服务器 API
         ↑ (增量拉取)
     服务器变更 → 合并到本地数据库
```

### 2-2. Outbox 模式
不要将离线变更直接发送到服务器,而是堆入 outbox,待连接恢复时按顺序重传。

```kotlin
// ✅ Android (Room) 示例
@Entity
data class OutboxItem(
    @PrimaryKey val id: String,
    val operation: String,   // CREATE | UPDATE | DELETE
    val entityType: String,
    val payload: String,     // JSON
    val createdAt: Long,
    val retryCount: Int = 0
)

// 连接恢复时 (WorkManager)
suspend fun syncOutbox() {
    outboxDao.getAll().sortedBy { it.createdAt }.forEach { item ->
        try {
            api.send(item)
            outboxDao.delete(item)
        } catch (e: Exception) {
            outboxDao.incrementRetry(item.id)
        }
    }
}
```

### 2-3. 冲突解决策略
明确在冲突时采用哪个值的策略。

| 策略 | 说明 | 适用场景 |
|------|------|-----------|
| Last-Write-Wins | 最新时间戳优先 | 简单字段 |
| Server-Wins | 强制采用服务器值 | 权威数据 |
| Client-Wins | 本地值优先 | 用户创作内容 |
| Manual Merge | 让用户选择 | 重要冲突 |

### 2-4. 增量同步
以最后同步时刻(sync_token)为基准仅拉取变更部分。

```http
GET /api/sync?since=2026-06-13T00:00:00Z
→ { "changes": [...], "next_sync_token": "2026-06-13T12:00:00Z" }
```

## 3. 常见错误
- ❌ 没有冲突解决策略 → 同步时数据被覆盖·丢失。明确 LWW/服务器优先/手动合并。
- ❌ outbox 操作没有幂等性 → 重传时重复创建。设置幂等键。
- ❌ 无限重试(无退避) → 服务器过载·耗电。指数退避 + 上限。
- ❌ 同步状态(pending/conflict)未在 UI 显示 → 用户不知道变更未反映。
- ❌ 每次都全量同步 → 浪费数据·电量。以 `sync_token` 为基准做增量(增量差异)。
- ❌ 本地存储容量无限增长 → 清理过期缓存·已完成的 outbox。

## 4. 检查清单
- [ ] 是否将本地数据库作为真实来源并在后台同步
- [ ] 是否将离线变更堆入 outbox 并按顺序重传
- [ ] 是否明确冲突解决策略并以时间戳/版本判断
- [ ] 是否保存每条记录的同步状态(synced/pending/conflict)并在 UI 显示
- [ ] 大批量是否以 sync_token 为基准做增量(增量差异)拉取
