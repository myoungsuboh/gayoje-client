---
name: 备份 & 灾难恢复 (DR)
description: 通过数据备份策略（3-2-1 规则）、RTO/RPO 目标设定、灾难恢复流程和备份验证自动化来保障业务连续性的标准。设计备份策略，或确定 DR 流程、恢复测试时阅读。关键词：backup, restore, RTO, RPO, disaster-recovery, replication, snapshot。
rules:
  - "备份遵循 3-2-1 规则——数据副本 3 份、2 种不同介质、1 份异地（不同区域/云）。"
  - "将 RTO（恢复时间目标）和 RPO（恢复点目标）明确为业务需求并反映到基础设施设计中。"
  - "DB 备份用全量备份（每周1次）+ 增量备份（每日1次）+ WAL/Binlog 连续备份来最小化 RPO。"
  - "备份文件加密存储，解密密钥与备份分开在不同位置管理。"
  - "至少每季度定期执行一次备份恢复测试，并将实际恢复时间与 RTO 目标进行比较验证。"
tags:
  - "backup"
  - "restore"
  - "RTO"
  - "RPO"
  - "disaster-recovery"
  - "replication"
  - "snapshot"
---

# 💾 备份 & 灾难恢复 (DR)

> 防止数据丢失，并在故障时快速恢复。设计备份策略，或确定 RTO/RPO 目标、DR 流程、恢复测试时阅读。

## 1. 核心原则
- 备份遵循 3-2-1 规则——数据副本 3 份、2 种不同介质、1 份异地（不同区域/云）。
- 将 RTO（恢复时间目标）和 RPO（恢复点目标）明确为业务需求并反映到基础设施设计中。
- DB 备份用全量备份（每周1次）+ 增量备份（每日1次）+ WAL/Binlog 连续备份来最小化 RPO。
- 备份文件加密存储，解密密钥与备份分开在不同位置管理。
- 至少每季度定期执行一次备份恢复测试，并将实际恢复时间与 RTO 目标进行比较验证。

## 2. 规则

### 2-1. 定义 RTO & RPO 目标
按服务层级明确目标并映射策略。

| 服务层级 | RTO | RPO | 策略 |
|-------------|-----|-----|------|
| Tier 1（支付·认证） | < 15分钟 | < 5分钟 | 多区域，实时复制 |
| Tier 2（核心功能） | < 4小时 | < 1小时 | 单区域，增量备份 |
| Tier 3（附加功能） | < 24小时 | < 24小时 | 每日全量备份 |

### 2-2. 3-2-1 备份规则
```
Primary DB (리전 A) ──┐
                      ├── 복사본 3개
Read Replica (리전 A) ┤
                      │── 2가지 미디어 (DB 복제 + 오브젝트 스토리지)
S3/GCS (리전 B) ──────┘── 오프사이트 (다른 리전)
```

### 2-3. PostgreSQL 备份自动化
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

### 2-4. 备份恢复测试自动化
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

### 2-5. 灾难恢复手册 (Runbook)
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

## 3. 常见错误
- 只做备份却从不验证恢复 → 真正故障时无法恢复。
- 备份只存于同一区域·同一介质 → 没有异地副本，区域性故障时无能为力。
- 解密密钥与备份保管在同一处 → 备份泄露时密钥也一并暴露。
- 不设定 RTO/RPO → 对要恢复到什么程度没有共识。

## 4. 检查清单
- [ ] 是否按服务层级明确了 RTO/RPO 目标
- [ ] 备份是否满足 3-2-1 规则（副本3·介质2·异地1）
- [ ] 是否用全量 + 增量 + 连续（WAL/Binlog）备份最小化了 RPO
- [ ] 是否加密备份并将解密密钥在单独位置管理
- [ ] 是否通过至少每季度的恢复测试将实际恢复时间与 RTO 比较
- [ ] DR 手册是否为最新状态且负责人已熟知
