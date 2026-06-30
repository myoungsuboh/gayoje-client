---
name: Caching Strategy (stack-neutral)
description: Cache-Aside·Write-Through·Write-Behind patterns, TTL design, and cache invalidation·stampede-prevention standards (stack-neutral). Read it when introducing a cache layer or deciding TTL·invalidation strategy. Keywords: cache, redis, cache-aside, ttl, invalidation, stale, cdn-cache, http-cache.
rules:
  - "Before adding a cache layer, first optimize DB queries and indexes — a cache is an amplifier, not a last resort."
  - "Use Cache-Aside (Lazy Loading) as the default pattern: read→miss→DB lookup→store in cache→return."
  - "Set TTL explicitly according to data-freshness requirements, and avoid infinite TTL (permanent cache)."
  - "Include version and scope in cache keys to make invalidation easy (e.g. user:v2:{id}:profile)."
  - "To prevent a cache stampede (thundering herd), use a lock (mutex) or stale-while-revalidate on a cache miss."
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

# 🗄️ Caching Strategy

> Standardize caching patterns·TTL·invalidation. Read it when adding a cache layer or deciding TTL·invalidation strategy.

## 1. Core Principles
- Before adding a cache layer, first optimize DB queries and indexes — a cache is an amplifier, not a last resort.
- Use Cache-Aside (Lazy Loading) as the default pattern: read→miss→DB lookup→store in cache→return.
- Set TTL explicitly according to data-freshness requirements, and avoid infinite TTL (permanent cache).
- Include version and scope in cache keys to make invalidation easy (e.g. `user:v2:{id}:profile`).
- To prevent a cache stampede (thundering herd), use a lock (mutex) or stale-while-revalidate on a cache miss.

## 2. Rules

### 2-1. Pattern Selection
| Pattern | Description | Suitable for |
|------|------|-----------|
| Cache-Aside | App manages the cache directly | Read-heavy |
| Write-Through | Write to cache + DB simultaneously | Frequent writes + consistency needed |
| Write-Behind | Write to cache first, reflect to DB asynchronously | Buffering write bursts |
| Read-Through | Cache delegates the DB lookup | ORM cache plugins |

### 2-2. Cache-Aside Implementation
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

### 2-3. Cache Key Version·Scope
```python
# ❌ 금지 — 버전·스코프 없는 키 (무효화 어려움)
key = f"user_{user_id}"

# ✅ 권장 — 버전·스코프 포함 (패턴 무효화 가능)
key = f"user:v2:{user_id}:profile"
```

### 2-4. Cache Invalidation
```python
# 패턴 기반 무효화 (같은 스코프 전체)
async def invalidate_user(user_id: str):
    keys = await redis.keys(f"user:*:{user_id}:*")
    if keys:
        await redis.delete(*keys)
```

### 2-5. TTL Guidelines
| Data type | Recommended TTL |
|-----------|---------|
| Session | 30 min–2 hours |
| User profile | 5–15 min |
| Catalog·config | 1–24 hours |
| Analytics·aggregates | 1 hour–1 day |

```python
# ❌ 금지 — 무한 TTL (영구 캐시, 무효화 누락 시 영원히 stale)
await redis.set(key, value)

# ✅ 권장 — 명시적 TTL
await redis.set(key, value, ex=300)
```

### 2-6. Cache Stampede Prevention
- Add ±10% jitter to the cache expiry time
- Single-regeneration lock: Redis `SET key value NX EX 10` (10-second lock)
- stale-while-revalidate: return the stale value even after expiry + refresh in the background

## 3. Common Mistakes
- Introducing a cache before DB optimization → the root bottleneck remains.
- Using infinite TTL → if invalidation is missed, it returns a stale value forever.
- Keys without version·scope → partial invalidation is impossible.
- Not preparing for a miss surge → requests pile onto the DB at the moment of expiry (stampede).

## 4. Checklist
- [ ] Did you check DB queries·indexes first, before caching?
- [ ] Did you use Cache-Aside as the default pattern?
- [ ] Did you set an explicit TTL on every key?
- [ ] Did you include version·scope in cache keys?
- [ ] Did you apply stampede prevention (jitter·lock·SWR)?
