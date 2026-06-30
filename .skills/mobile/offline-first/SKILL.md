---
name: 오프라인 우선 & 동기화
description: 오프라인 데이터 캐싱, 로컬-원격 동기화, 충돌 해결, 큐(outbox) 기반 재전송 표준(모바일). 네트워크 의존 기능을 오프라인 우선으로 설계하거나 동기화 충돌·증분 동기화 정책을 정할 때 읽는다. 키워드: offline-first, sync, outbox, conflict-resolution, watermelondb, sqlite, last-write-wins, delta-sync.
rules:
  - "네트워크 의존 기능은 오프라인 우선(Offline-First)으로 설계해 로컬 DB를 진실의 원천으로 두고 백그라운드 동기화한다."
  - "오프라인 중 발생한 변경은 작업 큐(outbox)에 쌓고, 연결 복구 시 순서대로 서버에 재전송한다."
  - "동기화 충돌은 정책(Last-Write-Wins · 서버 우선 · 수동 병합)을 명시하고, 타임스탬프 또는 버전 벡터로 판단한다."
  - "동기화 상태(synced · pending · conflict)를 각 레코드에 저장하고, UI에 동기화 진행 상황을 표시한다."
  - "대용량 동기화는 증분(델타) 방식으로 처리하고, 마지막 동기화 시각(sync_token)을 기준으로 변경분만 가져온다."
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

# 📴 오프라인 우선 & 동기화

> 로컬 DB를 진실의 원천으로 두고 백그라운드로 서버와 동기화한다. 네트워크 의존 기능을 설계하거나 오프라인 변경의 재전송·충돌 해결을 정할 때 읽는다.

## 1. 핵심 원칙
- 네트워크 의존 기능은 오프라인 우선(Offline-First)으로 설계해 로컬 DB를 진실의 원천으로 두고 백그라운드 동기화한다.
- 오프라인 중 발생한 변경은 작업 큐(outbox)에 쌓고, 연결 복구 시 순서대로 서버에 재전송한다.
- 동기화 충돌은 정책(Last-Write-Wins · 서버 우선 · 수동 병합)을 명시하고, 타임스탬프 또는 버전 벡터로 판단한다.
- 동기화 상태(synced · pending · conflict)를 각 레코드에 저장하고, UI에 동기화 진행 상황을 표시한다.
- 대용량 동기화는 증분(델타) 방식으로 처리하고, 마지막 동기화 시각(sync_token)을 기준으로 변경분만 가져온다.

## 2. 규칙

### 2-1. 아키텍처 (로컬 DB가 진실의 원천)
```
UI → 로컬 DB (SQLite/WatermelonDB/Realm)  ← 진실의 원천
         ↓ (변경 시)
     Outbox 큐 (pending 작업)
         ↓ (연결 복구 시)
     동기화 엔진 → 서버 API
         ↑ (델타 풀)
     서버 변경분 → 로컬 DB 머지
```

### 2-2. Outbox 패턴
오프라인 변경은 곧장 서버에 보내지 말고 outbox에 쌓았다가 연결 복구 시 순서대로 재전송한다.

```kotlin
// ✅ Android (Room) 예시
@Entity
data class OutboxItem(
    @PrimaryKey val id: String,
    val operation: String,   // CREATE | UPDATE | DELETE
    val entityType: String,
    val payload: String,     // JSON
    val createdAt: Long,
    val retryCount: Int = 0
)

// 연결 복구 시 (WorkManager)
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

### 2-3. 충돌 해결 정책
충돌 시 어떤 값을 채택할지 정책을 명시한다.

| 정책 | 설명 | 적합 상황 |
|------|------|-----------|
| Last-Write-Wins | 최신 타임스탬프 우선 | 단순 필드 |
| Server-Wins | 서버 값 강제 | 권위 데이터 |
| Client-Wins | 로컬 값 우선 | 사용자 작성물 |
| Manual Merge | 사용자에게 선택 | 중요 충돌 |

### 2-4. 증분 동기화
마지막 동기화 시각(sync_token)을 기준으로 변경분만 가져온다.

```http
GET /api/sync?since=2026-06-13T00:00:00Z
→ { "changes": [...], "next_sync_token": "2026-06-13T12:00:00Z" }
```

## 3. 흔한 실수
- ❌ 충돌 해결 정책 없음 → 동기화 시 데이터 덮어쓰기·손실. LWW/서버우선/수동 병합을 명시한다.
- ❌ outbox 작업에 멱등성 없음 → 재전송 시 중복 생성. 멱등 키를 둔다.
- ❌ 무한 재시도(백오프 없음) → 서버 폭주·배터리 소모. 지수 백오프 + 상한.
- ❌ 동기화 상태(pending/conflict)를 UI에 미표시 → 사용자가 미반영을 모른다.
- ❌ 매번 전체 동기화 → 데이터·배터리 낭비. `sync_token` 기준 증분(델타)으로.
- ❌ 로컬 저장소 용량 무한 증가 → 오래된 캐시·완료된 outbox를 정리한다.

## 4. 체크리스트
- [ ] 로컬 DB를 진실의 원천으로 두고 백그라운드 동기화하는가
- [ ] 오프라인 변경을 outbox에 쌓고 순서대로 재전송하는가
- [ ] 충돌 해결 정책을 명시하고 타임스탬프/버전으로 판단하는가
- [ ] 레코드별 동기화 상태(synced/pending/conflict)를 저장하고 UI에 표시하는가
- [ ] 대용량은 sync_token 기준 증분(델타)으로 가져오는가
