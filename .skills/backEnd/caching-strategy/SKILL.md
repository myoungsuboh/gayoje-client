---
name: 캐싱 전략 (스택 중립)
description: Cache-Aside·Write-Through·Write-Behind 패턴, TTL 설계, 캐시 무효화·스탬피드 방지 표준(스택 중립). 캐시 레이어를 도입하거나 TTL·무효화 전략을 정할 때 읽는다. 키워드: cache, redis, cache-aside, ttl, invalidation, stale, cdn-cache, http-cache.
rules:
  - "캐시 레이어를 추가하기 전에 먼저 DB 쿼리·인덱스를 최적화한다 — 캐시는 최후 수단이 아닌 증폭 수단이다."
  - "Cache-Aside(Lazy Loading)을 기본 패턴으로 사용한다: read→miss→DB 조회→캐시 저장→반환."
  - "TTL은 데이터 신선도 요구에 따라 명시적으로 설정하고, 무한 TTL(영구 캐시)을 피한다."
  - "캐시 키에 버전·스코프를 포함해 무효화를 쉽게 한다 (예: user:v2:{id}:profile)."
  - "캐시 스탬피드(Thundering Herd) 방지를 위해 캐시 미스 시 잠금(mutex)이나 stale-while-revalidate를 사용한다."
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

# 🗄️ 캐싱 전략

> 캐싱 패턴·TTL·무효화를 표준화한다. 캐시 레이어를 추가하거나 TTL·무효화 전략을 정할 때 읽는다.

## 1. 핵심 원칙
- 캐시 레이어를 추가하기 전에 먼저 DB 쿼리·인덱스를 최적화한다 — 캐시는 최후 수단이 아닌 증폭 수단이다.
- Cache-Aside(Lazy Loading)을 기본 패턴으로 사용한다: read→miss→DB 조회→캐시 저장→반환.
- TTL은 데이터 신선도 요구에 따라 명시적으로 설정하고, 무한 TTL(영구 캐시)을 피한다.
- 캐시 키에 버전·스코프를 포함해 무효화를 쉽게 한다 (예: `user:v2:{id}:profile`).
- 캐시 스탬피드(Thundering Herd) 방지를 위해 캐시 미스 시 잠금(mutex)이나 stale-while-revalidate를 사용한다.

## 2. 규칙

### 2-1. 패턴 선택
| 패턴 | 설명 | 적합 상황 |
|------|------|-----------|
| Cache-Aside | 앱이 직접 캐시 관리 | 읽기 중심 |
| Write-Through | 쓰기 시 캐시+DB 동시 | 쓰기 빈번 + 일관성 필요 |
| Write-Behind | 캐시 먼저 쓰고 비동기 DB 반영 | 쓰기 폭발 완충 |
| Read-Through | 캐시가 DB 조회 위임 | ORM 캐시 플러그인 |

### 2-2. Cache-Aside 구현
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

### 2-3. 캐시 키 버전·스코프
```python
# ❌ 금지 — 버전·스코프 없는 키 (무효화 어려움)
key = f"user_{user_id}"

# ✅ 권장 — 버전·스코프 포함 (패턴 무효화 가능)
key = f"user:v2:{user_id}:profile"
```

### 2-4. 캐시 무효화
```python
# 패턴 기반 무효화 (같은 스코프 전체)
async def invalidate_user(user_id: str):
    keys = await redis.keys(f"user:*:{user_id}:*")
    if keys:
        await redis.delete(*keys)
```

### 2-5. TTL 가이드라인
| 데이터 유형 | 권장 TTL |
|-----------|---------|
| 세션 | 30분~2시간 |
| 사용자 프로필 | 5~15분 |
| 카탈로그·설정 | 1~24시간 |
| 분석·집계 | 1시간~1일 |

```python
# ❌ 금지 — 무한 TTL (영구 캐시, 무효화 누락 시 영원히 stale)
await redis.set(key, value)

# ✅ 권장 — 명시적 TTL
await redis.set(key, value, ex=300)
```

### 2-6. 캐시 스탬피드 방지
- 캐시 만료 시간에 ±10% 지터(jitter) 추가
- 단일 재생성 잠금: Redis `SET key value NX EX 10` (10초 잠금)
- stale-while-revalidate: 만료 후에도 오래된 값 반환 + 백그라운드 갱신

## 3. 흔한 실수
- DB 최적화 없이 캐시부터 도입 → 근본 병목은 그대로 남는다.
- 무한 TTL 사용 → 무효화 누락 시 영원히 오래된 값을 반환한다.
- 버전·스코프 없는 키 → 부분 무효화가 불가능하다.
- 미스 폭주 미대비 → 만료 순간 DB로 요청이 몰린다(스탬피드).

## 4. 체크리스트
- [ ] 캐시 전에 DB 쿼리·인덱스를 먼저 점검했는가
- [ ] 기본 패턴으로 Cache-Aside를 사용했는가
- [ ] 모든 키에 명시적 TTL을 설정했는가
- [ ] 캐시 키에 버전·스코프를 포함했는가
- [ ] 스탬피드 방지(지터·잠금·SWR)를 적용했는가
