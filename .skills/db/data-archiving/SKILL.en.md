---
name: Data Archiving
description: Strategies for retention, migration, and deletion of old data; compliance retention periods; archive access standards (DB-neutral). Read it when migrating/deleting old data, setting a retention-period policy, or safely destroying personal data. Keywords: archiving, retention, cold-storage, gdpr, backup, purge, s3-glacier.
rules:
  - "Define a retention-period policy (e.g., transactions 5 years, logs 1 year) and reflect regulations (GDPR, Personal Information Protection Act)."
  - "Archive in small batches to minimize production DB load, and run it avoiding peak hours."
  - "Store archive data compressed and encrypted in low-cost storage (S3 Glacier, Coldline), and document the restore procedure."
  - "Validate the target data before archiving and delete the original after archiving completes — do not delete simultaneously."
  - "Destroy archive data containing personal information irrecoverably after expiry (delete encryption keys, overwrite)."
tags:
  - "archiving"
  - "retention"
  - "cold-storage"
  - "gdpr"
  - "backup"
  - "purge"
  - "s3-glacier"
---

# 🗄️ Data Archiving

> Migrate old data to low-cost storage and destroy it per regulations. Read it when setting a retention-period policy, archiving/deleting data, or safely destroying personal data.

## 1. Core Principles
- Define a retention-period policy (e.g., transactions 5 years, logs 1 year) and reflect regulations (GDPR, Personal Information Protection Act).
- Archive in small batches to minimize production DB load, and run it avoiding peak hours.
- Store archive data compressed and encrypted in low-cost storage (S3 Glacier, Coldline), and document the restore procedure.
- Validate the target data before archiving and delete the original after archiving completes — do not delete simultaneously.
- Destroy archive data containing personal information irrecoverably after expiry (delete encryption keys, overwrite).

## 2. Rules

### 2-1. Define the retention-period policy
| Data type | Retention period | Basis |
|-----------|---------|------|
| Payment/transaction records | 5 years | Commercial Act, Tax Act |
| Personal information | 30 days after withdrawal | Personal Information Protection Act |
| Service logs | 1 year | Internal policy |
| Audit logs | 3 years | Security regulations |
| Analytics data | 2 years | Internal policy |

### 2-2. Batch archiving pattern
Process in small batches and throttle DB load with `sleep`. Delete the original after marking the archive complete.
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

### 2-3. Purge vs Archiving
```
Archiving: migrate data to low-cost storage → restorable when needed
Purge: remove irrecoverably → fulfills GDPR right to be forgotten
```

### 2-4. Safe destruction of personal information
```python
# ✅ 암호화 키 삭제 (Crypto-shredding)
await kms.schedule_key_deletion(KeyId=user_key_id, PendingWindowInDays=7)
# 복호화 키 없이 암호문은 무용지물
```

## 3. Common Mistakes
- Retention period undefined → infinite data accumulation, risk of regulatory violation.
- Archiving in one large batch → production DB load surge, peak-hour outage.
- Deleting original and archive simultaneously → permanent data loss if archiving fails.
- Handling personal information with a plain delete only → remains in backups/replicas, right to be forgotten not fulfilled.

## 4. Checklist
- [ ] Did you define a retention period per data type and reflect regulations?
- [ ] Did you process archiving in batches and avoid peak hours?
- [ ] Did you compress and encrypt archive data and document the restore procedure?
- [ ] Did you delete the original only after validating archive completion (no simultaneous deletion)?
- [ ] Did you destroy personal information irrecoverably after expiry (crypto-shredding, etc.)?
