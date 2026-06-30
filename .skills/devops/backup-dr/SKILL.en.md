---
name: Backup & Disaster Recovery (DR)
description: A standard for ensuring business continuity through data backup strategies (the 3-2-1 rule), RTO/RPO target setting, disaster recovery procedures, and backup verification automation. Read it when designing a backup policy or defining DR procedures and restore tests. Keywords: backup, restore, RTO, RPO, disaster-recovery, replication, snapshot.
rules:
  - "Backups follow the 3-2-1 rule — 3 copies of the data, 2 different media, 1 offsite (a different region/cloud)."
  - "Specify RTO (Recovery Time Objective) and RPO (Recovery Point Objective) as business requirements and reflect them in the infrastructure design."
  - "Minimize RPO for DB backups with full backups (weekly) + incremental backups (daily) + continuous WAL/Binlog backups."
  - "Store backup files encrypted, and manage the decryption key in a location separate from the backups."
  - "Perform backup restore tests regularly, at least quarterly, and verify the actual restore time against the RTO target."
tags:
  - "backup"
  - "restore"
  - "RTO"
  - "RPO"
  - "disaster-recovery"
  - "replication"
  - "snapshot"
---

# 💾 Backup & Disaster Recovery (DR)

> Prevent data loss and recover quickly during failures. Read it when designing a backup policy or defining RTO/RPO targets, DR procedures, and restore tests.

## 1. Core Principles
- Backups follow the 3-2-1 rule — 3 copies of the data, 2 different media, 1 offsite (a different region/cloud).
- Specify RTO (Recovery Time Objective) and RPO (Recovery Point Objective) as business requirements and reflect them in the infrastructure design.
- Minimize RPO for DB backups with full backups (weekly) + incremental backups (daily) + continuous WAL/Binlog backups.
- Store backup files encrypted, and manage the decryption key in a location separate from the backups.
- Perform backup restore tests regularly, at least quarterly, and verify the actual restore time against the RTO target.

## 2. Rules

### 2-1. Defining RTO & RPO Targets
Specify targets per service tier and map a strategy to each.

| Service Tier | RTO | RPO | Strategy |
|-------------|-----|-----|------|
| Tier 1 (payments·auth) | < 15 min | < 5 min | Multi-region, real-time replication |
| Tier 2 (core features) | < 4 hours | < 1 hour | Single region, incremental backup |
| Tier 3 (supplementary features) | < 24 hours | < 24 hours | Daily full backup |

### 2-2. The 3-2-1 Backup Rule
```
Primary DB (리전 A) ──┐
                      ├── 복사본 3개
Read Replica (리전 A) ┤
                      │── 2가지 미디어 (DB 복제 + 오브젝트 스토리지)
S3/GCS (리전 B) ──────┘── 오프사이트 (다른 리전)
```

### 2-3. PostgreSQL Backup Automation
```bash
#!/bin/bash
# 일일 전체 백업 스크립트
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${TIMESTAMP}.dump"

pg_dump -Fc $DATABASE_URL > $BACKUP_FILE

# 암호화
gpg --symmetric --cipher-algo AES256 $BACKUP_FILE

# S3 업로드
aws s3 cp "${BACKUP_FILE}.gpg" s3://backups/db/$BACKUP_FILE.gpg

# 30일 이상 구 백업 삭제
aws s3 ls s3://backups/db/ | awk '{print $4}' | \
  head -n -30 | xargs -I{} aws s3 rm s3://backups/db/{}

rm $BACKUP_FILE ${BACKUP_FILE}.gpg
```

### 2-4. Backup Restore Test Automation
```yaml
# 분기별 DR 훈련 — GitHub Actions Schedule
on:
  schedule:
    - cron: "0 2 1 */3 *"  # 분기 1일 02:00

jobs:
  dr-test:
    runs-on: ubuntu-latest
    steps:
      - name: 최신 백업 다운로드
        run: aws s3 cp s3://backups/db/latest.gpg .
      - name: 복호화 & 복원
        run: |
          gpg --decrypt latest.gpg > restore.dump
          pg_restore -d $TEST_DB_URL restore.dump
      - name: 데이터 무결성 검증
        run: python scripts/verify_restore.py
      - name: 알림
        run: echo "DR 테스트 완료 — RTO: ${{ steps.restore.outputs.duration }}분"
```

### 2-5. Disaster Recovery Runbook
```markdown
## DR 절차 (장애 발생 시)
1. 장애 선언 → 인시던트 채널 생성 (#incident-YYYYMMDD)
2. 영향 범위 파악 → 데이터 손실 시점 확인 (마지막 백업/복제 시간)
3. DR 환경 활성화 → 로드밸런서를 DR 리전으로 전환
4. 백업 복원 시작 → 복원 시작 시간 기록
5. 데이터 무결성 검증 → 체크섬·레코드 수 비교
6. 서비스 재개 → 점진적 트래픽 전환
7. 사후 분석 → 24시간 내 PIR(Post-Incident Review) 작성
```

## 3. Common Mistakes
- Only taking backups but never verifying a restore → unable to restore when an actual failure happens.
- Storing backups only in the same region·same media → no offsite copy, so powerless against a regional failure.
- Keeping the decryption key in the same place as the backup → if the backup leaks, the key is exposed with it.
- Not setting RTO/RPO → no agreement on the level to recover to.

## 4. Checklist
- [ ] Did you specify RTO/RPO targets per service tier?
- [ ] Do the backups satisfy the 3-2-1 rule (3 copies·2 media·1 offsite)?
- [ ] Did you minimize RPO with full + incremental + continuous (WAL/Binlog) backups?
- [ ] Do you encrypt backups and manage the decryption key in a separate location?
- [ ] Did you compare actual restore time against RTO via restore tests at least quarterly?
- [ ] Is the DR runbook up to date and have the owners reviewed it?
