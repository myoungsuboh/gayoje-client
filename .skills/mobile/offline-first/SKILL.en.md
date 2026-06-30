---
name: Offline-First & Sync
description: Offline data caching, local-remote sync, conflict resolution, and queue (outbox) based retransmission standards (mobile). Read this when designing network-dependent features offline-first or when setting sync conflict / incremental sync policies. Keywords: offline-first, sync, outbox, conflict-resolution, watermelondb, sqlite, last-write-wins, delta-sync.
rules:
  - "Design network-dependent features offline-first, keeping the local DB as the source of truth and syncing in the background."
  - "Stack changes made while offline into a work queue (outbox), and retransmit them to the server in order when connectivity is restored."
  - "Make the sync conflict policy explicit (Last-Write-Wins · Server-Wins · Manual Merge), and decide based on timestamps or version vectors."
  - "Store the sync state (synced · pending · conflict) on each record, and surface sync progress in the UI."
  - "Handle large syncs incrementally (delta), fetching only the changes since the last sync time (sync_token)."
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

# 📴 Offline-First & Sync

> Keep the local DB as the source of truth and sync with the server in the background. Read this when designing network-dependent features or when deciding on retransmission and conflict resolution for offline changes.

## 1. Core Principles
- Design network-dependent features offline-first, keeping the local DB as the source of truth and syncing in the background.
- Stack changes made while offline into a work queue (outbox), and retransmit them to the server in order when connectivity is restored.
- Make the sync conflict policy explicit (Last-Write-Wins · Server-Wins · Manual Merge), and decide based on timestamps or version vectors.
- Store the sync state (synced · pending · conflict) on each record, and surface sync progress in the UI.
- Handle large syncs incrementally (delta), fetching only the changes since the last sync time (sync_token).

## 2. Rules

### 2-1. Architecture (Local DB is the source of truth)
```
UI → Local DB (SQLite/WatermelonDB/Realm)  ← Source of truth
         ↓ (on change)
     Outbox queue (pending operations)
         ↓ (when connectivity is restored)
     Sync engine → Server API
         ↑ (delta pull)
     Server changes → merge into local DB
```

### 2-2. Outbox Pattern
Don't send offline changes straight to the server; stack them in the outbox and retransmit them in order when connectivity is restored.

```kotlin
// ✅ Android (Room) example
@Entity
data class OutboxItem(
    @PrimaryKey val id: String,
    val operation: String,   // CREATE | UPDATE | DELETE
    val entityType: String,
    val payload: String,     // JSON
    val createdAt: Long,
    val retryCount: Int = 0
)

// On connectivity restore (WorkManager)
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

### 2-3. Conflict Resolution Policy
Make the policy explicit for which value to adopt on conflict.

| Policy | Description | Suitable Situation |
|------|------|-----------|
| Last-Write-Wins | Latest timestamp wins | Simple fields |
| Server-Wins | Force the server value | Authoritative data |
| Client-Wins | Local value wins | User-authored content |
| Manual Merge | Let the user choose | Critical conflicts |

### 2-4. Incremental Sync
Fetch only the changes since the last sync time (sync_token).

```http
GET /api/sync?since=2026-06-13T00:00:00Z
→ { "changes": [...], "next_sync_token": "2026-06-13T12:00:00Z" }
```

## 3. Common Mistakes
- ❌ No conflict resolution policy → data overwrite/loss during sync. Make LWW/Server-Wins/Manual Merge explicit.
- ❌ No idempotency on outbox operations → duplicate creation on retransmission. Add an idempotency key.
- ❌ Infinite retries (no backoff) → server overload, battery drain. Use exponential backoff + a cap.
- ❌ Not surfacing the sync state (pending/conflict) in the UI → users don't know changes aren't reflected.
- ❌ Full sync every time → wasted data and battery. Use `sync_token`-based incremental (delta).
- ❌ Unbounded growth of local storage → clean up old cache and completed outbox entries.

## 4. Checklist
- [ ] Is the local DB the source of truth, with background sync?
- [ ] Are offline changes stacked in the outbox and retransmitted in order?
- [ ] Is the conflict resolution policy explicit, deciding by timestamp/version?
- [ ] Is the per-record sync state (synced/pending/conflict) stored and shown in the UI?
- [ ] Are large datasets fetched incrementally (delta) based on sync_token?
