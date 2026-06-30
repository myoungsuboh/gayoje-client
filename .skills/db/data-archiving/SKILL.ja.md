---
name: データアーカイビング
description: 古いデータの保存・移行・削除戦略、規制順守の保管期間、アーカイブアクセス標準 (DB 中立)。古いデータを移行・削除する、保管期間ポリシーを定める、個人情報を安全に破棄するときに読む。キーワード: archiving, retention, cold-storage, gdpr, backup, purge, s3-glacier。
rules:
  - "保管期間ポリシーを定義し(例: トランザクション5年、ログ1年)、規制(GDPR・個人情報保護法)を反映する。"
  - "アーカイビングは少量ずつバッチで処理して本番 DB の負荷を最小化し、ピーク時間帯を避けて実行する。"
  - "アーカイブデータは低コストストレージ(S3 Glacier・Coldline)に圧縮・暗号化して保存し、復元手順を文書化する。"
  - "アーカイビング前に対象データを検証し、アーカイブ完了後に原本を削除する — 同時に削除しない。"
  - "個人情報を含むアーカイブデータは満了後に復元不可能に破棄(暗号化キー削除・上書き)する。"
tags:
  - "archiving"
  - "retention"
  - "cold-storage"
  - "gdpr"
  - "backup"
  - "purge"
  - "s3-glacier"
---

# 🗄️ データアーカイビング

> 古いデータを低コストストレージに移行し、規制に合わせて破棄する。保管期間ポリシーを定める、データをアーカイビング・削除する、個人情報を安全破棄するときに読む。

## 1. 核心原則
- 保管期間ポリシーを定義し(例: トランザクション5年、ログ1年)、規制(GDPR・個人情報保護法)を反映する。
- アーカイビングは少量ずつバッチで処理して本番 DB の負荷を最小化し、ピーク時間帯を避けて実行する。
- アーカイブデータは低コストストレージ(S3 Glacier・Coldline)に圧縮・暗号化して保存し、復元手順を文書化する。
- アーカイビング前に対象データを検証し、アーカイブ完了後に原本を削除する — 同時に削除しない。
- 個人情報を含むアーカイブデータは満了後に復元不可能に破棄(暗号化キー削除・上書き)する。

## 2. ルール

### 2-1. 保管期間ポリシーの定義
| データ種別 | 保管期間 | 根拠 |
|-----------|---------|------|
| 決済・取引履歴 | 5年 | 商法・税法 |
| 個人情報 | 退会後30日 | 個人情報保護法 |
| サービスログ | 1年 | 内部ポリシー |
| 監査ログ | 3年 | セキュリティ規定 |
| 分析データ | 2年 | 内部ポリシー |

### 2-2. バッチアーカイビングパターン
少量ずつバッチで処理し、`sleep` で DB 負荷を調整する。アーカイブ完了マーク後に原本を削除する。
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

### 2-3. 削除(Purge) vs アーカイビング
```
アーカイビング: データを低コストストレージに移行 → 必要時に復元可能
削除(Purge): 復元不可能に除去 → GDPR 忘れられる権利の履行
```

### 2-4. 個人情報の安全破棄
```python
# ✅ 암호화 키 삭제 (Crypto-shredding)
await kms.schedule_key_deletion(KeyId=user_key_id, PendingWindowInDays=7)
# 복호화 키 없이 암호문은 무용지물
```

## 3. よくある間違い
- 保管期間未定義 → データ無限蓄積、規制違反リスク。
- 大量を一度にアーカイビング → 本番 DB 負荷急増、ピーク時間障害。
- 原本・アーカイブを同時に削除 → アーカイブ失敗時にデータ永久損失。
- 個人情報を単純 delete だけで処理 → バックアップ/レプリカに残存、忘れられる権利未履行。

## 4. チェックリスト
- [ ] データ種別ごとの保管期間を定義し規制を反映したか
- [ ] アーカイビングをバッチで処理しピーク時間帯を避けたか
- [ ] アーカイブデータを圧縮・暗号化し復元手順を文書化したか
- [ ] アーカイブ完了を検証したうえで原本を削除したか (同時削除禁止)
- [ ] 個人情報は満了後に復元不可能に破棄したか (crypto-shredding 等)
