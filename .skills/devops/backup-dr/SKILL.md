---
name: 백업 & 재해 복구 (DR)
description: 데이터 백업 전략(3-2-1 규칙), RTO/RPO 목표 설정, 재해 복구 절차와 백업 검증 자동화로 비즈니스 연속성을 보장하는 표준. 백업 정책을 설계하거나 DR 절차·복원 테스트를 정할 때 읽는다. 키워드: backup, restore, RTO, RPO, disaster-recovery, replication, snapshot.
rules:
  - "백업은 3-2-1 규칙을 따른다 — 데이터 복사본 3개, 2가지 다른 미디어, 1개는 오프사이트(다른 리전/클라우드)."
  - "RTO(복구 목표 시간)와 RPO(복구 지점 목표)를 비즈니스 요구사항으로 명시하고 인프라 설계에 반영한다."
  - "DB 백업은 전체 백업(주 1회) + 증분 백업(일 1회) + WAL/Binlog 연속 백업으로 RPO를 최소화한다."
  - "백업 파일은 암호화해 저장하고, 복호화 키는 백업과 별도 위치에 관리한다."
  - "백업 복원 테스트를 분기별 이상 정기적으로 수행하고 실제 복원 시간을 RTO 목표와 비교 검증한다."
tags:
  - "backup"
  - "restore"
  - "RTO"
  - "RPO"
  - "disaster-recovery"
  - "replication"
  - "snapshot"
---

# 💾 백업 & 재해 복구 (DR)

> 데이터 손실을 막고 장애 시 빠르게 복구한다. 백업 정책을 설계하거나 RTO/RPO 목표·DR 절차·복원 테스트를 정할 때 읽는다.

## 1. 핵심 원칙
- 백업은 3-2-1 규칙을 따른다 — 데이터 복사본 3개, 2가지 다른 미디어, 1개는 오프사이트(다른 리전/클라우드).
- RTO(복구 목표 시간)와 RPO(복구 지점 목표)를 비즈니스 요구사항으로 명시하고 인프라 설계에 반영한다.
- DB 백업은 전체 백업(주 1회) + 증분 백업(일 1회) + WAL/Binlog 연속 백업으로 RPO를 최소화한다.
- 백업 파일은 암호화해 저장하고, 복호화 키는 백업과 별도 위치에 관리한다.
- 백업 복원 테스트를 분기별 이상 정기적으로 수행하고 실제 복원 시간을 RTO 목표와 비교 검증한다.

## 2. 규칙

### 2-1. RTO & RPO 목표 정의
서비스 티어별로 목표를 명시하고 전략을 매핑한다.

| 서비스 티어 | RTO | RPO | 전략 |
|-------------|-----|-----|------|
| Tier 1 (결제·인증) | < 15분 | < 5분 | 다중 리전, 실시간 복제 |
| Tier 2 (핵심 기능) | < 4시간 | < 1시간 | 단일 리전, 증분 백업 |
| Tier 3 (부가 기능) | < 24시간 | < 24시간 | 일일 전체 백업 |

### 2-2. 3-2-1 백업 규칙
```
Primary DB (리전 A) ──┐
                      ├── 복사본 3개
Read Replica (리전 A) ┤
                      │── 2가지 미디어 (DB 복제 + 오브젝트 스토리지)
S3/GCS (리전 B) ──────┘── 오프사이트 (다른 리전)
```

### 2-3. PostgreSQL 백업 자동화
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

### 2-4. 백업 복원 테스트 자동화
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

### 2-5. 재해 복구 런북 (Runbook)
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

## 3. 흔한 실수
- 백업만 받고 복원을 한 번도 검증하지 않음 → 정작 장애 때 복원 불가.
- 백업을 동일 리전·동일 미디어에만 저장 → 오프사이트 사본이 없어 리전 장애에 무력.
- 복호화 키를 백업과 같은 곳에 보관 → 백업이 유출되면 키도 함께 노출.
- RTO/RPO를 정하지 않음 → 어느 수준까지 복구해야 하는지 합의 없음.

## 4. 체크리스트
- [ ] 서비스 티어별 RTO/RPO 목표를 명시했는가
- [ ] 백업이 3-2-1 규칙(복사본 3·미디어 2·오프사이트 1)을 만족하는가
- [ ] 전체 + 증분 + 연속(WAL/Binlog) 백업으로 RPO를 최소화했는가
- [ ] 백업을 암호화하고 복호화 키를 별도 위치에 관리하는가
- [ ] 분기별 이상 복원 테스트로 실제 복원 시간을 RTO와 비교했는가
- [ ] DR 런북이 최신 상태이며 담당자가 숙지했는가
