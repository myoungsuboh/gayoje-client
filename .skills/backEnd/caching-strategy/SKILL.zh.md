---
name: 缓存策略 (技术栈无关)
description: Cache-Aside·Write-Through·Write-Behind 模式、TTL 设计、缓存失效·击穿防护标准(技术栈无关)。在引入缓存层或确定 TTL·失效策略时阅读。关键词: cache, redis, cache-aside, ttl, invalidation, stale, cdn-cache, http-cache.
rules:
  - "在添加缓存层之前,先优化 DB 查询·索引 — 缓存是放大手段,而非最后手段。"
  - "以 Cache-Aside(Lazy Loading)作为默认模式: read→miss→DB 查询→写入缓存→返回。"
  - "根据数据新鲜度要求显式设置 TTL,避免无限 TTL(永久缓存)。"
  - "在缓存键中包含版本·作用域以便于失效(例如 user:v2:{id}:profile)。"
  - "为防止缓存击穿(Thundering Herd),在缓存未命中时使用锁(mutex)或 stale-while-revalidate。"
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

# 🗄️ 缓存策略

> 标准化缓存模式·TTL·失效。在添加缓存层或确定 TTL·失效策略时阅读。

## 1. 核心原则
- 在添加缓存层之前,先优化 DB 查询·索引 — 缓存是放大手段,而非最后手段。
- 以 Cache-Aside(Lazy Loading)作为默认模式: read→miss→DB 查询→写入缓存→返回。
- 根据数据新鲜度要求显式设置 TTL,避免无限 TTL(永久缓存)。
- 在缓存键中包含版本·作用域以便于失效(例如 `user:v2:{id}:profile`)。
- 为防止缓存击穿(Thundering Herd),在缓存未命中时使用锁(mutex)或 stale-while-revalidate。

## 2. 规则

### 2-1. 模式选择
| 模式 | 说明 | 适合场景 |
|------|------|-----------|
| Cache-Aside | 应用直接管理缓存 | 读密集 |
| Write-Through | 写入时缓存+DB 同时 | 写入频繁 + 需要一致性 |
| Write-Behind | 先写缓存,异步反映到 DB | 缓冲写入峰值 |
| Read-Through | 缓存委托 DB 查询 | ORM 缓存插件 |

### 2-2. Cache-Aside 实现
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

### 2-3. 缓存键的版本·作用域
```python
# ❌ 금지 — 버전·스코프 없는 키 (무효화 어려움)
key = f"user_{user_id}"

# ✅ 권장 — 버전·스코프 포함 (패턴 무효화 가능)
key = f"user:v2:{user_id}:profile"
```

### 2-4. 缓存失效
```python
# 패턴 기반 무효화 (같은 스코프 전체)
async def invalidate_user(user_id: str):
    keys = await redis.keys(f"user:*:{user_id}:*")
    if keys:
        await redis.delete(*keys)
```

### 2-5. TTL 指南
| 数据类型 | 推荐 TTL |
|-----------|---------|
| 会话 | 30分钟~2小时 |
| 用户资料 | 5~15分钟 |
| 目录·配置 | 1~24小时 |
| 分析·聚合 | 1小时~1天 |

```python
# ❌ 금지 — 무한 TTL (영구 캐시, 무효화 누락 시 영원히 stale)
await redis.set(key, value)

# ✅ 권장 — 명시적 TTL
await redis.set(key, value, ex=300)
```

### 2-6. 缓存击穿防护
- 给缓存过期时间加上 ±10% 抖动(jitter)
- 单次再生成锁: Redis `SET key value NX EX 10`(10秒锁)
- stale-while-revalidate: 过期后仍返回旧值 + 后台刷新

## 3. 常见错误
- 未做 DB 优化就先引入缓存 → 根本瓶颈依旧存在。
- 使用无限 TTL → 失效遗漏时永远返回旧值。
- 无版本·作用域的键 → 无法进行部分失效。
- 未防范未命中洪峰 → 过期瞬间请求涌向 DB(击穿)。

## 4. 检查清单
- [ ] 缓存之前是否先检查了 DB 查询·索引
- [ ] 是否以 Cache-Aside 作为默认模式
- [ ] 是否给所有键设置了显式 TTL
- [ ] 是否在缓存键中包含了版本·作用域
- [ ] 是否应用了击穿防护(抖动·锁·SWR)
