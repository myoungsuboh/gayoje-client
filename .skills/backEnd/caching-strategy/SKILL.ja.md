---
name: キャッシュ戦略 (スタック中立)
description: Cache-Aside・Write-Through・Write-Behind パターン、TTL 設計、キャッシュ無効化・スタンピード防止の標準(スタック中立)。キャッシュレイヤを導入するときや TTL・無効化戦略を決めるときに読む。キーワード: cache, redis, cache-aside, ttl, invalidation, stale, cdn-cache, http-cache.
rules:
  - "キャッシュレイヤを追加する前に、まず DB クエリ・インデックスを最適化する — キャッシュは最後の手段ではなく増幅手段だ。"
  - "Cache-Aside(Lazy Loading)を基本パターンとして使う: read→miss→DB 照会→キャッシュ保存→返却。"
  - "TTL はデータ鮮度の要求に応じて明示的に設定し、無限 TTL(永久キャッシュ)を避ける。"
  - "キャッシュキーにバージョン・スコープを含め、無効化を容易にする(例: user:v2:{id}:profile)。"
  - "キャッシュスタンピード(Thundering Herd)防止のため、キャッシュミス時にロック(mutex)や stale-while-revalidate を使う。"
tags:
  - "cache"
  - "redis"
  - "cache-aside"
  - "ttl"
  - "invalidation"
  - "stale"
  - "cdn-cache"
  - "http-cache"
---

# 🗄️ キャッシュ戦略

> キャッシュパターン・TTL・無効化を標準化する。キャッシュレイヤを追加するときや TTL・無効化戦略を決めるときに読む。

## 1. 核心原則
- キャッシュレイヤを追加する前に、まず DB クエリ・インデックスを最適化する — キャッシュは最後の手段ではなく増幅手段だ。
- Cache-Aside(Lazy Loading)を基本パターンとして使う: read→miss→DB 照会→キャッシュ保存→返却。
- TTL はデータ鮮度の要求に応じて明示的に設定し、無限 TTL(永久キャッシュ)を避ける。
- キャッシュキーにバージョン・スコープを含め、無効化を容易にする(例: `user:v2:{id}:profile`)。
- キャッシュスタンピード(Thundering Herd)防止のため、キャッシュミス時にロック(mutex)や stale-while-revalidate を使う。

## 2. ルール

### 2-1. パターン選択
| パターン | 説明 | 適した状況 |
|------|------|-----------|
| Cache-Aside | アプリが直接キャッシュを管理 | 読み取り中心 |
| Write-Through | 書き込み時にキャッシュ+DB を同時に | 書き込み頻繁 + 一貫性が必要 |
| Write-Behind | キャッシュに先に書き、非同期で DB に反映 | 書き込み爆発の緩衝 |
| Read-Through | キャッシュが DB 照会を委譲 | ORM キャッシュプラグイン |

### 2-2. Cache-Aside 実装
```python
async def get_user(user_id: str) -> dict:
    key = f"user:v2:{user_id}"
    cached = await redis.get(key)
    if cached:
        return json.loads(cached)
    user = await db.fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    await redis.set(key, json.dumps(user), ex=300)  # TTL 5분
    return user
```

### 2-3. キャッシュキーのバージョン・スコープ
```python
# ❌ 금지 — 버전·스코프 없는 키 (무효화 어려움)
key = f"user_{user_id}"

# ✅ 권장 — 버전·스코프 포함 (패턴 무효화 가능)
key = f"user:v2:{user_id}:profile"
```

### 2-4. キャッシュ無効化
```python
# 패턴 기반 무효화 (같은 스코프 전체)
async def invalidate_user(user_id: str):
    keys = await redis.keys(f"user:*:{user_id}:*")
    if keys:
        await redis.delete(*keys)
```

### 2-5. TTL ガイドライン
| データ種別 | 推奨 TTL |
|-----------|---------|
| セッション | 30分~2時間 |
| ユーザープロフィール | 5~15分 |
| カタログ・設定 | 1~24時間 |
| 分析・集計 | 1時間~1日 |

```python
# ❌ 금지 — 무한 TTL (영구 캐시, 무효화 누락 시 영원히 stale)
await redis.set(key, value)

# ✅ 권장 — 명시적 TTL
await redis.set(key, value, ex=300)
```

### 2-6. キャッシュスタンピード防止
- キャッシュ有効期限に ±10% のジッター(jitter)を追加
- 単一再生成ロック: Redis `SET key value NX EX 10`(10秒ロック)
- stale-while-revalidate: 期限切れ後も古い値を返却 + バックグラウンド更新

## 3. よくあるミス
- DB 最適化なしにキャッシュから導入 → 根本のボトルネックはそのまま残る。
- 無限 TTL の使用 → 無効化漏れ時に永遠に古い値を返す。
- バージョン・スコープのないキー → 部分無効化が不可能。
- ミス殺到への未対策 → 期限切れの瞬間に DB へリクエストが殺到する(スタンピード)。

## 4. チェックリスト
- [ ] キャッシュの前に DB クエリ・インデックスを先に点検したか
- [ ] 基本パターンとして Cache-Aside を使ったか
- [ ] すべてのキーに明示的な TTL を設定したか
- [ ] キャッシュキーにバージョン・スコープを含めたか
- [ ] スタンピード防止(ジッター・ロック・SWR)を適用したか
