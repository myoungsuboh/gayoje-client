---
name: オフラインファースト & 同期
description: オフラインデータのキャッシュ、ローカル-リモート同期、競合解決、キュー(outbox)ベースの再送信の標準(モバイル)。ネットワーク依存機能をオフラインファーストで設計する、あるいは同期競合・増分同期ポリシーを決める際に読む。キーワード: offline-first, sync, outbox, conflict-resolution, watermelondb, sqlite, last-write-wins, delta-sync.
rules:
  - "ネットワーク依存機能はオフラインファースト(Offline-First)で設計し、ローカルDBを信頼できる情報源(source of truth)とし、バックグラウンドで同期する。"
  - "オフライン中に発生した変更は作業キュー(outbox)に積み、接続復旧時に順番にサーバーへ再送信する。"
  - "同期競合はポリシー(Last-Write-Wins · サーバー優先 · 手動マージ)を明示し、タイムスタンプまたはバージョンベクターで判断する。"
  - "同期状態(synced · pending · conflict)を各レコードに保存し、UIに同期の進行状況を表示する。"
  - "大容量同期は増分(デルタ)方式で処理し、最後の同期時刻(sync_token)を基準に変更分のみ取得する。"
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

# 📴 オフラインファースト & 同期

> ローカルDBを信頼できる情報源とし、バックグラウンドでサーバーと同期する。ネットワーク依存機能を設計する、あるいはオフライン変更の再送信・競合解決を決める際に読む。

## 1. 中核原則
- ネットワーク依存機能はオフラインファースト(Offline-First)で設計し、ローカルDBを信頼できる情報源とし、バックグラウンドで同期する。
- オフライン中に発生した変更は作業キュー(outbox)に積み、接続復旧時に順番にサーバーへ再送信する。
- 同期競合はポリシー(Last-Write-Wins · サーバー優先 · 手動マージ)を明示し、タイムスタンプまたはバージョンベクターで判断する。
- 同期状態(synced · pending · conflict)を各レコードに保存し、UIに同期の進行状況を表示する。
- 大容量同期は増分(デルタ)方式で処理し、最後の同期時刻(sync_token)を基準に変更分のみ取得する。

## 2. ルール

### 2-1. アーキテクチャ (ローカルDBが信頼できる情報源)
```
UI → ローカルDB (SQLite/WatermelonDB/Realm)  ← 信頼できる情報源
         ↓ (変更時)
     Outbox キュー (pending 作業)
         ↓ (接続復旧時)
     同期エンジン → サーバー API
         ↑ (デルタプル)
     サーバー変更分 → ローカルDB にマージ
```

### 2-2. Outbox パターン
オフライン変更はすぐにサーバーへ送らず、outbox に積んでおき、接続復旧時に順番に再送信する。

```kotlin
// ✅ Android (Room) 例
@Entity
data class OutboxItem(
    @PrimaryKey val id: String,
    val operation: String,   // CREATE | UPDATE | DELETE
    val entityType: String,
    val payload: String,     // JSON
    val createdAt: Long,
    val retryCount: Int = 0
)

// 接続復旧時 (WorkManager)
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

### 2-3. 競合解決ポリシー
競合時にどの値を採用するかポリシーを明示する。

| ポリシー | 説明 | 適した状況 |
|------|------|-----------|
| Last-Write-Wins | 最新タイムスタンプ優先 | 単純なフィールド |
| Server-Wins | サーバー値を強制 | 権威データ |
| Client-Wins | ローカル値優先 | ユーザー作成物 |
| Manual Merge | ユーザーに選択させる | 重要な競合 |

### 2-4. 増分同期
最後の同期時刻(sync_token)を基準に変更分のみ取得する。

```http
GET /api/sync?since=2026-06-13T00:00:00Z
→ { "changes": [...], "next_sync_token": "2026-06-13T12:00:00Z" }
```

## 3. よくあるミス
- ❌ 競合解決ポリシーがない → 同期時にデータ上書き・損失。LWW/サーバー優先/手動マージを明示する。
- ❌ outbox 作業に冪等性がない → 再送信時に重複生成。冪等キーを設ける。
- ❌ 無限リトライ(バックオフなし) → サーバー過負荷・バッテリー消耗。指数バックオフ + 上限。
- ❌ 同期状態(pending/conflict)をUIに非表示 → ユーザーが未反映を知らない。
- ❌ 毎回フル同期 → データ・バッテリーの無駄。`sync_token` 基準の増分(デルタ)で。
- ❌ ローカルストレージ容量の無限増加 → 古いキャッシュ・完了した outbox を整理する。

## 4. チェックリスト
- [ ] ローカルDBを信頼できる情報源とし、バックグラウンド同期しているか
- [ ] オフライン変更を outbox に積み、順番に再送信しているか
- [ ] 競合解決ポリシーを明示し、タイムスタンプ/バージョンで判断しているか
- [ ] レコードごとの同期状態(synced/pending/conflict)を保存しUIに表示しているか
- [ ] 大容量は sync_token 基準の増分(デルタ)で取得しているか
