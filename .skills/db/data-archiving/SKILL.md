---
name: 데이터 아카이빙
description: 오래된 데이터의 보존·이전·삭제 전략, 규정 준수 보관 기간, 아카이브 접근 표준 (DB 중립). 오래된 데이터를 이전·삭제하거나, 보관 기간 정책을 정하거나, 개인정보를 안전하게 파기할 때 읽는다. 키워드: archiving, retention, cold-storage, gdpr, backup, purge, s3-glacier.
rules:
  - "보관 기간 정책을 정의하고(예: 트랜잭션 5년, 로그 1년), 규정(GDPR·개인정보보호법)을 반영한다."
  - "아카이빙은 소량씩 배치로 처리해 프로덕션 DB 부하를 최소화하고, 피크 시간대를 피해 실행한다."
  - "아카이브 데이터는 저비용 스토리지(S3 Glacier·Coldline)에 압축·암호화해 저장하고, 복원 절차를 문서화한다."
  - "아카이빙 전에 대상 데이터를 검증하고, 아카이브 완료 후에 원본을 삭제한다 — 동시 삭제하지 않는다."
  - "개인정보가 포함된 아카이브 데이터는 만료 후 복구 불가능하게 파기(암호화 키 삭제·덮어쓰기)한다."
tags:
  - "archiving"
  - "retention"
  - "cold-storage"
  - "gdpr"
  - "backup"
  - "purge"
  - "s3-glacier"
---

# 🗄️ 데이터 아카이빙

> 오래된 데이터를 저비용 저장소로 이전하고 규정에 맞게 파기한다. 보관 기간 정책을 정하거나, 데이터를 아카이빙·삭제하거나, 개인정보를 안전 파기할 때 읽는다.

## 1. 핵심 원칙
- 보관 기간 정책을 정의하고(예: 트랜잭션 5년, 로그 1년), 규정(GDPR·개인정보보호법)을 반영한다.
- 아카이빙은 소량씩 배치로 처리해 프로덕션 DB 부하를 최소화하고, 피크 시간대를 피해 실행한다.
- 아카이브 데이터는 저비용 스토리지(S3 Glacier·Coldline)에 압축·암호화해 저장하고, 복원 절차를 문서화한다.
- 아카이빙 전에 대상 데이터를 검증하고, 아카이브 완료 후에 원본을 삭제한다 — 동시 삭제하지 않는다.
- 개인정보가 포함된 아카이브 데이터는 만료 후 복구 불가능하게 파기(암호화 키 삭제·덮어쓰기)한다.

## 2. 규칙

### 2-1. 보관 기간 정책 정의
| 데이터 유형 | 보관 기간 | 근거 |
|-----------|---------|------|
| 결제·거래 내역 | 5년 | 상법·세법 |
| 개인정보 | 탈퇴 후 30일 | 개인정보보호법 |
| 서비스 로그 | 1년 | 내부 정책 |
| 감사 로그 | 3년 | 보안 규정 |
| 분석 데이터 | 2년 | 내부 정책 |

### 2-2. 배치 아카이빙 패턴
소량씩 배치로 처리하고 `sleep`으로 DB 부하를 조절한다. 아카이브 완료 표시 후에 원본을 삭제한다.
```python
BATCH_SIZE = 1000
ARCHIVE_THRESHOLD = datetime.now() - timedelta(days=365)

async def archive_old_logs():
    while True:
        rows = await db.fetch("""
            SELECT * FROM event_logs
            WHERE created_at < $1 AND archived = false
            LIMIT $2
        """, ARCHIVE_THRESHOLD, BATCH_SIZE)

        if not rows:
            break

        await s3.put_object(
            Bucket=ARCHIVE_BUCKET,
            Key=f"logs/{date.today()}/{uuid4()}.json.gz",
            Body=gzip.compress(json.dumps(rows).encode()),
        )
        ids = [r["id"] for r in rows]
        await db.execute(
            "UPDATE event_logs SET archived = true WHERE id = ANY($1)", ids
        )
        await asyncio.sleep(0.1)  # DB 부하 조절
```

### 2-3. 삭제(Purge) vs 아카이빙
```
아카이빙: 데이터를 저비용 저장소로 이전 → 필요 시 복원 가능
삭제(Purge): 복구 불가능하게 제거 → GDPR 잊혀질 권리 이행
```

### 2-4. 개인정보 안전 파기
```python
# ✅ 암호화 키 삭제 (Crypto-shredding)
await kms.schedule_key_deletion(KeyId=user_key_id, PendingWindowInDays=7)
# 복호화 키 없이 암호문은 무용지물
```

## 3. 흔한 실수
- 보관 기간 미정의 → 데이터 무한 누적, 규정 위반 위험.
- 대량 한 번에 아카이빙 → 프로덕션 DB 부하 폭증, 피크 시간 장애.
- 원본·아카이브 동시 삭제 → 아카이브 실패 시 데이터 영구 손실.
- 개인정보를 단순 delete로만 처리 → 백업/복제본에 잔존, 잊혀질 권리 미이행.

## 4. 체크리스트
- [ ] 데이터 유형별 보관 기간을 정의하고 규정을 반영했는가
- [ ] 아카이빙을 배치로 처리하고 피크 시간대를 피했는가
- [ ] 아카이브 데이터를 압축·암호화하고 복원 절차를 문서화했는가
- [ ] 아카이브 완료를 검증한 뒤에 원본을 삭제했는가 (동시 삭제 금지)
- [ ] 개인정보는 만료 후 복구 불가능하게 파기했는가 (crypto-shredding 등)
