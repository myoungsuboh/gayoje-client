---
name: 数据归档
description: 旧数据的保存·迁移·删除策略，合规保留期，归档访问标准 (DB 中立)。在迁移·删除旧数据、制定保留期策略、安全销毁个人信息时阅读。关键词: archiving, retention, cold-storage, gdpr, backup, purge, s3-glacier。
rules:
  - "定义保留期策略(例: 交易 5 年、日志 1 年)，并反映法规(GDPR·个人信息保护法)。"
  - "归档以小批量分批处理以最小化生产 DB 负载，并避开峰值时段执行。"
  - "归档数据压缩·加密后存入低成本存储(S3 Glacier·Coldline)，并将恢复流程文档化。"
  - "归档前先校验目标数据，归档完成后再删除原始数据 — 不同时删除。"
  - "含个人信息的归档数据在到期后不可恢复地销毁(删除加密密钥·覆写)。"
tags:
  - "archiving"
  - "retention"
  - "cold-storage"
  - "gdpr"
  - "backup"
  - "purge"
  - "s3-glacier"
---

# 🗄️ 数据归档

> 把旧数据迁移到低成本存储并依法规销毁。在制定保留期策略、归档·删除数据、安全销毁个人信息时阅读。

## 1. 核心原则
- 定义保留期策略(例: 交易 5 年、日志 1 年)，并反映法规(GDPR·个人信息保护法)。
- 归档以小批量分批处理以最小化生产 DB 负载，并避开峰值时段执行。
- 归档数据压缩·加密后存入低成本存储(S3 Glacier·Coldline)，并将恢复流程文档化。
- 归档前先校验目标数据，归档完成后再删除原始数据 — 不同时删除。
- 含个人信息的归档数据在到期后不可恢复地销毁(删除加密密钥·覆写)。

## 2. 规则

### 2-1. 定义保留期策略
| 数据类型 | 保留期 | 依据 |
|-----------|---------|------|
| 支付·交易记录 | 5 年 | 商法·税法 |
| 个人信息 | 注销后 30 天 | 个人信息保护法 |
| 服务日志 | 1 年 | 内部策略 |
| 审计日志 | 3 年 | 安全规定 |
| 分析数据 | 2 年 | 内部策略 |

### 2-2. 批量归档模式
以小批量分批处理，用 `sleep` 调节 DB 负载。标记归档完成后再删除原始数据。
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

### 2-3. 删除(Purge) vs 归档
```
归档: 把数据迁移到低成本存储 → 需要时可恢复
删除(Purge): 不可恢复地移除 → 履行 GDPR 被遗忘权
```

### 2-4. 个人信息的安全销毁
```python
# ✅ 암호화 키 삭제 (Crypto-shredding)
await kms.schedule_key_deletion(KeyId=user_key_id, PendingWindowInDays=7)
# 복호화 키 없이 암호문은 무용지물
```

## 3. 常见错误
- 未定义保留期 → 数据无限堆积，违规风险。
- 一次性大量归档 → 生产 DB 负载暴增，峰值时段故障。
- 原始数据·归档同时删除 → 归档失败时数据永久丢失。
- 个人信息仅用简单 delete 处理 → 残留于备份/副本，未履行被遗忘权。

## 4. 检查清单
- [ ] 是否按数据类型定义了保留期并反映了法规
- [ ] 是否以批量处理归档并避开了峰值时段
- [ ] 是否将归档数据压缩·加密并将恢复流程文档化
- [ ] 是否在校验归档完成后才删除原始数据 (禁止同时删除)
- [ ] 个人信息是否在到期后不可恢复地销毁 (crypto-shredding 等)
