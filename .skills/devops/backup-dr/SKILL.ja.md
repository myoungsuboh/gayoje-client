---
name: バックアップ & 災害復旧 (DR)
description: データバックアップ戦略(3-2-1ルール)、RTO/RPO目標の設定、災害復旧手順とバックアップ検証の自動化により事業継続性を保証する標準。バックアップポリシーを設計するとき、またはDR手順・復元テストを定めるときに読む。キーワード: backup, restore, RTO, RPO, disaster-recovery, replication, snapshot。
rules:
  - "バックアップは3-2-1ルールに従う — データの複製3個、2種類の異なるメディア、1個はオフサイト(別リージョン/クラウド)。"
  - "RTO(復旧目標時間)とRPO(復旧時点目標)を事業要件として明示し、インフラ設計に反映する。"
  - "DBバックアップはフルバックアップ(週1回) + 増分バックアップ(日1回) + WAL/Binlog連続バックアップでRPOを最小化する。"
  - "バックアップファイルは暗号化して保存し、復号鍵はバックアップとは別の場所で管理する。"
  - "バックアップ復元テストを四半期に1回以上定期的に実施し、実際の復元時間をRTO目標と比較検証する。"
tags:
  - "backup"
  - "restore"
  - "RTO"
  - "RPO"
  - "disaster-recovery"
  - "replication"
  - "snapshot"
---

# 💾 バックアップ & 災害復旧 (DR)

> データ損失を防ぎ、障害時に素早く復旧する。バックアップポリシーを設計するとき、またはRTO/RPO目標・DR手順・復元テストを定めるときに読む。

## 1. 基本原則
- バックアップは3-2-1ルールに従う — データの複製3個、2種類の異なるメディア、1個はオフサイト(別リージョン/クラウド)。
- RTO(復旧目標時間)とRPO(復旧時点目標)を事業要件として明示し、インフラ設計に反映する。
- DBバックアップはフルバックアップ(週1回) + 増分バックアップ(日1回) + WAL/Binlog連続バックアップでRPOを最小化する。
- バックアップファイルは暗号化して保存し、復号鍵はバックアップとは別の場所で管理する。
- バックアップ復元テストを四半期に1回以上定期的に実施し、実際の復元時間をRTO目標と比較検証する。

## 2. ルール

### 2-1. RTO & RPO 目標の定義
サービスティアごとに目標を明示し、戦略をマッピングする。

| サービスティア | RTO | RPO | 戦略 |
|-------------|-----|-----|------|
| Tier 1 (決済・認証) | < 15分 | < 5分 | マルチリージョン、リアルタイム複製 |
| Tier 2 (中核機能) | < 4時間 | < 1時間 | 単一リージョン、増分バックアップ |
| Tier 3 (付加機能) | < 24時間 | < 24時間 | 日次フルバックアップ |

### 2-2. 3-2-1 バックアップルール
```
Primary DB (리전 A) ──┐
                      ├── 복사본 3개
Read Replica (리전 A) ┤
                      │── 2가지 미디어 (DB 복제 + 오브젝트 스토리지)
S3/GCS (리전 B) ──────┘── 오프사이트 (다른 리전)
```

### 2-3. PostgreSQL バックアップ自動化
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

### 2-4. バックアップ復元テストの自動化
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

### 2-5. 災害復旧ランブック (Runbook)
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

## 3. よくある間違い
- バックアップを取るだけで復元を一度も検証しない → いざ障害時に復元できない。
- バックアップを同一リージョン・同一メディアのみに保存 → オフサイト複製がなくリージョン障害に無力。
- 復号鍵をバックアップと同じ場所に保管 → バックアップが流出すれば鍵も一緒に露出。
- RTO/RPOを定めない → どの水準まで復旧すべきか合意がない。

## 4. チェックリスト
- [ ] サービスティアごとのRTO/RPO目標を明示したか
- [ ] バックアップが3-2-1ルール(複製3・メディア2・オフサイト1)を満たすか
- [ ] フル + 増分 + 連続(WAL/Binlog)バックアップでRPOを最小化したか
- [ ] バックアップを暗号化し復号鍵を別の場所で管理しているか
- [ ] 四半期に1回以上の復元テストで実際の復元時間をRTOと比較したか
- [ ] DRランブックが最新の状態で、担当者が熟知しているか
