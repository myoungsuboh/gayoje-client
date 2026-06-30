# Paddle 샌드박스 컷오버 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paddle 샌드박스 기준으로 결제(체크아웃→웹훅→entitlement→구독관리)를 E2E 동작 가능 상태로 완성한다. 정식 등록 후엔 env 교체만으로 production 전환.

**Architecture:** FE(이 repo, Vue3+Vite)는 Paddle.js 오버레이 체크아웃을 열고, 결제 확정의 진실원천은 BE(`C:\project\harness-server`, FastAPI+Neo4j) 웹훅이다. 구독관리(해지/카드변경/영수증)는 Paddle 고객포털로 위임하고 BE가 포털 세션 URL을 생성한다. 토스 잔재는 이번에 은퇴.

**Tech Stack:** Paddle.js v2 (Billing), Paddle REST API(customer-portal-sessions), FastAPI, Neo4j, Vitest, pytest.

---

## 현재 상태 분석 (2026-06-10 인수 시점)

### 완료된 것
| 영역 | 상태 |
|---|---|
| FE `src/utils/paddle.js` | 스캐폴딩 + 단위테스트 13건 (게이트/가드/체크아웃 인자/싱글톤/티어 매핑) |
| FE `pricing.vue` CTA | `openTierCheckout` 배선 완료 (Paddle 설정 시) |
| BE 웹훅 | `app/api/paddle_webhook_routes.py` — 서명검증+멱등+entitlement 갱신, 테스트 존재, main.py 등록 완료 |
| BE 설정 | `PADDLE_API_KEY/WEBHOOK_SECRET/ENV` + 월간 price→tier 매핑 3건 |

### 발견된 버그 / 공백 (이 계획이 해결)
1. **[버그-치명] sandbox 환경 미적용**: `Paddle.Initialize({ token, environment })` — Paddle.js v2에 `environment` 파라미터는 **존재하지 않는다**. `Paddle.Environment.set('sandbox')`를 Initialize **전에** 별도 호출해야 함. 현재 코드로는 샌드박스 토큰이 production 엔드포인트로 가서 인증 실패. (공식문서 확인: developer.paddle.com/paddlejs/methods/paddle-initialize)
2. **[버그] BE 연간 price 미매핑**: env 계약은 price ID 6개(월/연×3티어)인데 BE `paddle_price_to_tier`는 월 3개만 매핑 → 연간 구독 결제 시 웹훅이 등급 부여를 skip.
3. **[공백] 체크아웃 성공 후처리 없음**: `checkout.completed` 이벤트 핸들링이 없어 결제 후 등급 반영 확인/안내 불가.
4. **[공백] 구독관리 = 토스 API**: 해지/재개 버튼이 폐기된 토스 BE 라우트 호출. Paddle 고객포털로 교체 필요 + BE 포털 세션 엔드포인트 부재.
5. **[공백] BE가 Paddle customer/subscription ID를 저장 안 함**: 포털 세션 생성에 customer_id 필요 → 웹훅에서 영속화 필요.
6. **[잔재] 토스 코드/문구**: `billing.js`의 토스 SDK·issue-key·makeCustomerKey, i18n `toss_not_ready`, 환불정책 KRW/토스 기준.

### 의도적 보류 (이번 범위 아님 — Phase 2 이후)
- **연간(yearly) 결제 UI 토글**: BE PricingConfig가 월 가격만 보유 → 연간 표시가격 소스 없음. `paddle.js`는 yearly priceId를 이미 지원하므로 env만 넣으면 코드는 동작. UI 토글은 정식 등록 후 가격 확정과 함께.
- **초과팩(one-time)**: `docs/superpowers/specs/2026-06-08-overage-packs-design.md` 파킹 유지.
- **쿠폰 → Paddle Discount 마이그레이션**: 자체 BETA 쿠폰은 토스 subscribe API에 결합되어 있었음. Paddle 전환 후엔 Paddle Discount 코드로 이관 예정 — 이번엔 쿠폰 섹션을 Paddle 활성 시 숨김 처리.

---

## 파일 구조

**FE (C:\project\harness)**
- Modify: `src/utils/paddle.js` — 환경버그 수정, eventCallback, entitlement 폴링 헬퍼
- Modify: `tests/utils/paddle.test.js` — 신규 동작 테스트
- Create: `src/utils/paddleApi.js` — BE `/api/paddle/*` axios 래퍼
- Create: `tests/utils/paddleApi.test.js`
- Modify: `src/pages/pricing.vue` — 성공 후처리, 포털 버튼, 토스 흐름 제거
- Modify: `src/utils/billing.js` — validateCouponApi만 잔존
- Modify: `src/locales/{ko,en,zh,ja}/pricing.json` — 키 정리/추가
- Modify: `src/pages/legal/refund-policy.vue` — USD/MoR 기준

**BE (C:\project\harness-server)**
- Modify: `app/core/config.py` — 연간 price ID 3개 + 매핑 확장
- Create: `app/service/paddle_subscription_repository.py` — Neo4j 영속화
- Modify: `app/api/paddle_webhook_routes.py` — 웹훅에서 구독 영속화
- Create: `app/api/paddle_billing_routes.py` — GET subscription / POST portal-session
- Modify: `app/api/main.py` — 라우터 등록
- Test: `tests/api/test_paddle_webhook.py` 확장, `tests/api/test_paddle_billing.py` 신규

---

### Task 1 (FE): paddle.js — sandbox 환경 버그 수정

**Files:** Modify `src/utils/paddle.js`, `tests/utils/paddle.test.js`

- [ ] **Step 1: 실패 테스트 작성** — `tests/utils/paddle.test.js`의 `setPaddleMock`에 `Environment: { set: vi.fn() }` 추가 후 테스트 추가:

```js
describe('paddle.js — 환경 설정 (v2: Environment.set)', () => {
  it('sandbox 면 Initialize 전에 Paddle.Environment.set("sandbox") 호출', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    vi.stubEnv('VITE_PADDLE_ENV', 'sandbox')
    const mock = setPaddleMock()
    await initPaddle()
    expect(mock.Environment.set).toHaveBeenCalledWith('sandbox')
    // Initialize 에 environment 파라미터는 없어야 함 (v2 API에 존재하지 않음)
    expect(mock.Initialize).toHaveBeenCalledWith(
      expect.not.objectContaining({ environment: expect.anything() })
    )
  })

  it('production 이면 Environment.set 호출 안 함 (기본값)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_tok_123')
    vi.stubEnv('VITE_PADDLE_ENV', 'production')
    const mock = setPaddleMock()
    await initPaddle()
    expect(mock.Environment.set).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/utils/paddle.test.js` → 신규 2건 FAIL 기대.
- [ ] **Step 3: 구현** — `initPaddle` 수정:

```js
export const initPaddle = async () => {
  if (!isPaddleConfigured()) {
    throw new Error('Paddle 미설정 (VITE_PADDLE_CLIENT_TOKEN 없음)')
  }
  const Paddle = await loadPaddleSdk()
  if (!_initialized) {
    // [v2] sandbox 는 Initialize 파라미터가 아니라 Environment.set 으로 — Initialize 전에.
    if (getPaddleEnv() === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Initialize({ token: getPaddleToken() })
    _initialized = true
  }
  return Paddle
}
```

기존 "Initialize 인자" 테스트(`environment: 'sandbox'` 기대)도 새 계약으로 갱신.
- [ ] **Step 4: 전체 paddle 테스트 PASS 확인**
- [ ] **Step 5: Commit** — `fix(paddle): sandbox 환경 적용 버그 — Initialize environment 파라미터는 v2에 없음, Environment.set 사용`

### Task 2 (FE): paddle.js — eventCallback 디스패치 (checkout.completed 수신)

**Files:** Modify `src/utils/paddle.js`, `tests/utils/paddle.test.js`

- [ ] **Step 1: 실패 테스트**

```js
describe('paddle.js — 이벤트 핸들러', () => {
  it('Initialize 에 eventCallback 전달, setPaddleEventHandler 로 수신', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    const received = []
    setPaddleEventHandler((ev) => received.push(ev))
    await initPaddle()
    const cb = mock.Initialize.mock.calls[0][0].eventCallback
    expect(typeof cb).toBe('function')
    cb({ name: 'checkout.completed', data: { id: 'txn_1' } })
    expect(received).toEqual([{ name: 'checkout.completed', data: { id: 'txn_1' } }])
  })

  it('핸들러는 init 이후에 교체해도 동작 (클로저가 최신 핸들러 참조)', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    await initPaddle()
    const received = []
    setPaddleEventHandler((ev) => received.push(ev.name))
    mock.Initialize.mock.calls[0][0].eventCallback({ name: 'checkout.closed' })
    expect(received).toEqual(['checkout.closed'])
  })

  it('핸들러 미설정이어도 eventCallback 은 throw 하지 않음', async () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_tok_123')
    const mock = setPaddleMock()
    await initPaddle()
    expect(() => mock.Initialize.mock.calls[0][0].eventCallback({ name: 'x' })).not.toThrow()
  })
})
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```js
// 체크아웃 이벤트 핸들러 — 화면(pricing.vue)이 설정/해제. 항상 최신 참조를 호출.
let _eventHandler = null
export const setPaddleEventHandler = (fn) => { _eventHandler = fn }

// initPaddle 내 Initialize 호출:
Paddle.Initialize({
  token: getPaddleToken(),
  eventCallback: (ev) => { try { _eventHandler?.(ev) } catch { /* 핸들러 오류가 SDK를 깨지 않게 */ } },
})

// _resetPaddleForTest 에 _eventHandler = null 추가.
```

- [ ] **Step 4: PASS 확인** / **Step 5: Commit** — `feat(paddle): eventCallback 디스패치 — checkout.completed 수신 경로`

### Task 3 (FE): paddle.js — entitlement 반영 대기 폴링 헬퍼

**Files:** Modify `src/utils/paddle.js`, `tests/utils/paddle.test.js`

웹훅은 비동기 → 결제 직후 등급 반영까지 수 초 걸림. 등급 변화를 폴링으로 감지.

- [ ] **Step 1: 실패 테스트** (fake timers)

```js
describe('paddle.js — waitForEntitlementChange', () => {
  it('티어가 바뀌면 그 티어를 반환', async () => {
    vi.useFakeTimers()
    let tier = 'free'
    const p = waitForEntitlementChange(async () => tier, { fromTier: 'free', tries: 5, intervalMs: 1000 })
    tier = 'pro'
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBe('pro')
    vi.useRealTimers()
  })

  it('tries 소진까지 안 바뀌면 null', async () => {
    vi.useFakeTimers()
    const p = waitForEntitlementChange(async () => 'free', { fromTier: 'free', tries: 3, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000)
    await expect(p).resolves.toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```js
/**
 * 결제 후 entitlement(등급) 반영 대기 — getTier 를 주기 호출해 fromTier 와 달라지면 반환.
 * 웹훅 지연 대비 기본 10회 × 3초 = 최대 30초. 실패(null)면 호출자가 안내 토스트.
 */
export const waitForEntitlementChange = async (getTier, { fromTier, tries = 10, intervalMs = 3000 } = {}) => {
  for (let i = 0; i < tries; i++) {
    let tier = null
    try { tier = await getTier() } catch { /* 일시 오류는 다음 시도 */ }
    if (tier && tier !== fromTier) return tier
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}
```

(주의: 첫 호출을 즉시 수행 → 마지막 sleep 생략. 테스트 타이밍은 이 계약 기준.)
- [ ] **Step 4: PASS** / **Step 5: Commit** — `feat(paddle): entitlement 반영 폴링 헬퍼`

### Task 4 (FE): paddleApi.js — BE 연동 래퍼

**Files:** Create `src/utils/paddleApi.js`, `tests/utils/paddleApi.test.js`

- [ ] **Step 1: 실패 테스트** — axios 모킹(`vi.mock('@/utils/axios')`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/utils/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import axios from '@/utils/axios'
import { fetchPaddleSubscriptionApi, createPortalSessionApi } from '@/utils/paddleApi'

beforeEach(() => vi.clearAllMocks())

describe('paddleApi', () => {
  it('fetchPaddleSubscriptionApi — GET /api/paddle/subscription', async () => {
    axios.get.mockResolvedValue({ data: { subscription: { status: 'active' } } })
    const r = await fetchPaddleSubscriptionApi()
    expect(axios.get).toHaveBeenCalledWith('/api/paddle/subscription')
    expect(r).toEqual({ success: true, data: { subscription: { status: 'active' } } })
  })

  it('createPortalSessionApi — POST /api/paddle/portal-session', async () => {
    axios.post.mockResolvedValue({ data: { url: 'https://customer-portal.paddle.com/x' } })
    const r = await createPortalSessionApi()
    expect(axios.post).toHaveBeenCalledWith('/api/paddle/portal-session')
    expect(r.success).toBe(true)
    expect(r.data.url).toMatch(/^https:/)
  })

  it('실패 시 success:false + error 메시지', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } })
    const r = await fetchPaddleSubscriptionApi()
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `src/utils/paddleApi.js` (billing.js 의 wrap 패턴 복제):

```js
/**
 * Paddle 연동 BE API — 구독 조회 + 고객포털 세션.
 * 결제 실행은 paddle.js(오버레이), 여기는 BE 가 보유한 Paddle 상태 조회/포털 진입만.
 */
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'

const wrap = async (fn, fallbackMsg) => {
  try {
    const res = await fn()
    return { success: true, data: res.data }
  } catch (error) {
    return { success: false, error: extractError(error, fallbackMsg), status: error?.response?.status }
  }
}

/** 현재 사용자 Paddle 구독 — { subscription: {...} | null } */
export const fetchPaddleSubscriptionApi = () =>
  wrap(() => axios.get('/api/paddle/subscription'), '구독 정보를 가져오지 못했습니다.')

/** Paddle 고객포털 세션 URL 생성 — { url } */
export const createPortalSessionApi = () =>
  wrap(() => axios.post('/api/paddle/portal-session'), '구독 관리 페이지를 열지 못했습니다.')
```

- [ ] **Step 4: PASS** / **Step 5: Commit** — `feat(paddle): BE 연동 API 래퍼 (구독 조회·고객포털 세션)`

### Task 5 (BE): config — 연간 price ID 매핑

**Files:** Modify `app/core/config.py`, Test `tests/` (기존 config/웹훅 테스트 파일 패턴 따름)

- [ ] **Step 1: 실패 테스트** — `tests/api/test_paddle_webhook.py`에 추가 (기존 settings monkeypatch 패턴 사용):

```python
def test_paddle_price_to_tier_includes_yearly(monkeypatch):
    monkeypatch.setattr(settings, "PADDLE_PRICE_PRO", "pri_pro_m")
    monkeypatch.setattr(settings, "PADDLE_PRICE_PRO_Y", "pri_pro_y")
    monkeypatch.setattr(settings, "PADDLE_PRICE_PRO_PLUS_Y", "pri_pp_y")
    monkeypatch.setattr(settings, "PADDLE_PRICE_PRO_MAX_Y", "pri_pm_y")
    m = settings.paddle_price_to_tier
    assert m["pri_pro_m"] == "pro"
    assert m["pri_pro_y"] == "pro"
    assert m["pri_pp_y"] == "pro_plus"
    assert m["pri_pm_y"] == "pro_max"
```

- [ ] **Step 2: 실패 확인** — `pytest tests/api/test_paddle_webhook.py -k yearly -v`
- [ ] **Step 3: 구현** — config.py 에 3개 필드 + 매핑 확장:

```python
    # 연간 Price ID — 월간과 같은 등급으로 매핑 (웹훅 등급 판별용).
    PADDLE_PRICE_PRO_Y: Optional[str] = None
    PADDLE_PRICE_PRO_PLUS_Y: Optional[str] = None
    PADDLE_PRICE_PRO_MAX_Y: Optional[str] = None
```

```python
    @property
    def paddle_price_to_tier(self) -> dict[str, str]:
        """Paddle Price ID → 구독 등급 (월간+연간). 미설정 항목은 제외."""
        from app.core.subscription import (
            SUBSCRIPTION_PRO, SUBSCRIPTION_PRO_MAX, SUBSCRIPTION_PRO_PLUS,
        )
        pairs = [
            (self.PADDLE_PRICE_PRO, SUBSCRIPTION_PRO),
            (self.PADDLE_PRICE_PRO_Y, SUBSCRIPTION_PRO),
            (self.PADDLE_PRICE_PRO_PLUS, SUBSCRIPTION_PRO_PLUS),
            (self.PADDLE_PRICE_PRO_PLUS_Y, SUBSCRIPTION_PRO_PLUS),
            (self.PADDLE_PRICE_PRO_MAX, SUBSCRIPTION_PRO_MAX),
            (self.PADDLE_PRICE_PRO_MAX_Y, SUBSCRIPTION_PRO_MAX),
        ]
        return {pid: tier for pid, tier in pairs if pid}
```

- [ ] **Step 4: PASS** / **Step 5: Commit** — `fix(paddle): 연간 price ID 매핑 누락 — 연간 구독 웹훅 등급부여 실패 방지`

### Task 6 (BE): paddle_subscription_repository — 구독 영속화

**Files:** Create `app/service/paddle_subscription_repository.py`, Test `tests/api/test_paddle_billing.py` (또는 기존 repository 테스트 패턴 위치)

- [ ] **Step 1: 실패 테스트** — neo4j_client 모킹(기존 repository 테스트 패턴 미러링):

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.service import paddle_subscription_repository as repo

@pytest.mark.asyncio
async def test_upsert_passes_fields():
    with patch.object(repo, "neo4j_client") as mc:
        mc.run_cypher = AsyncMock(return_value=[{"s": {"subscription_id": "sub_1"}}])
        r = await repo.upsert(
            email="U@X.com", subscription_id="sub_1", customer_id="ctm_1",
            status="active", price_id="pri_pro_m", current_period_end="2026-07-10T00:00:00Z",
        )
        assert r is not None
        params = mc.run_cypher.call_args.args[1]
        assert params["email"] == "u@x.com"   # 소문자 정규화
        assert params["customer_id"] == "ctm_1"

@pytest.mark.asyncio
async def test_get_by_email_none_when_missing():
    with patch.object(repo, "neo4j_client") as mc:
        mc.run_cypher = AsyncMock(return_value=[])
        assert await repo.get_by_email("u@x.com") is None
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** (User 노드 매칭은 `admin_repository._CHANGE_SUBSCRIPTION_CYPHER` 의 라벨/키와 동일하게 — 구현 시 확인):

```python
"""
PaddleSubscription 영속화 — 웹훅이 받은 구독 상태 저장.
용도: (1) 고객포털 세션 생성에 customer_id 필요 (2) FE 구독현황 표시.
"""
from __future__ import annotations
from typing import Any, Dict, Optional
from app.db.neo4j_client import neo4j_client  # 기존 repository 들과 동일 import 경로 사용

_UPSERT_CYPHER = """
MATCH (u:User {email: $email})
MERGE (u)-[:HAS_PADDLE_SUBSCRIPTION]->(s:PaddleSubscription)
SET s.subscription_id = $subscription_id,
    s.customer_id = $customer_id,
    s.status = $status,
    s.price_id = $price_id,
    s.current_period_end = $current_period_end,
    s.updated_at = datetime()
RETURN s { .* } AS s
"""

_GET_CYPHER = """
MATCH (u:User {email: $email})-[:HAS_PADDLE_SUBSCRIPTION]->(s:PaddleSubscription)
RETURN s { .* } AS s
"""

async def upsert(*, email: str, subscription_id: str, customer_id: str,
                 status: str, price_id: Optional[str],
                 current_period_end: Optional[str]) -> Optional[Dict[str, Any]]:
    rows = await neo4j_client.run_cypher(_UPSERT_CYPHER, {
        "email": (email or "").strip().lower(),
        "subscription_id": subscription_id or "",
        "customer_id": customer_id or "",
        "status": status or "",
        "price_id": price_id or "",
        "current_period_end": current_period_end or "",
    })
    return rows[0]["s"] if rows else None

async def get_by_email(email: str) -> Optional[Dict[str, Any]]:
    rows = await neo4j_client.run_cypher(_GET_CYPHER, {"email": (email or "").strip().lower()})
    return rows[0]["s"] if rows else None
```

- [ ] **Step 4: PASS** / **Step 5: Commit** — `feat(paddle): PaddleSubscription 영속화 repository`

### Task 7 (BE): 웹훅에서 구독 영속화 호출

**Files:** Modify `app/api/paddle_webhook_routes.py`, Test `tests/api/test_paddle_webhook.py`

- [ ] **Step 1: 실패 테스트** — 기존 웹훅 테스트의 grant 케이스에 `paddle_subscription_repository.upsert` 호출 검증 추가 (기존 모킹 패턴 따름). subscription.* 이벤트 페이로드에 `data.id`, `data.customer_id`, `data.status`, `data.current_billing_period.ends_at` 포함.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `_handle_event` 에서 grant/revoke 분기 후 (등급 갱신과 별개로) 영속화:

```python
    # 구독 스냅샷 영속화 — 포털 세션(customer_id)·FE 구독현황의 소스.
    # 실패해도 entitlement 갱신은 진행 (best-effort 아님: 둘 다 핵심이지만 상호 독립).
    sub_id = str(data.get("id") or "")
    customer_id = str(data.get("customer_id") or "")
    if sub_id and customer_id:
        period = data.get("current_billing_period") or {}
        price_id = None
        for it in data.get("items") or []:
            pid = ((it or {}).get("price") or {}).get("id")
            if pid:
                price_id = pid
                break
        await paddle_subscription_repository.upsert(
            email=email, subscription_id=sub_id, customer_id=customer_id,
            status=str(data.get("status") or ""), price_id=price_id,
            current_period_end=period.get("ends_at"),
        )
```

(import 추가: `from app.service import paddle_subscription_repository`. revoke 이벤트도 status 갱신을 위해 동일 영속화 수행 — `_handle_event` 의 email 확보 직후, 등급 변경 전에 배치.)
- [ ] **Step 4: 웹훅 테스트 전체 PASS** / **Step 5: Commit** — `feat(paddle): 웹훅에서 구독 스냅샷 영속화 — 포털·구독현황 소스`

### Task 8 (BE): GET /api/paddle/subscription + POST /api/paddle/portal-session

**Files:** Create `app/api/paddle_billing_routes.py`, Modify `app/api/main.py`, Test `tests/api/test_paddle_billing.py`

- [ ] **Step 1: 실패 테스트** (기존 라우트 테스트의 auth override 패턴 미러링):
  - GET: 구독 있으면 `{subscription:{...}}`, 없으면 `{subscription:null}`.
  - POST: `PADDLE_API_KEY` 미설정 → 503 / 구독·customer_id 없음 → 404 / 정상 → Paddle API(`POST {base}/customers/{cid}/portal-sessions`) 호출 후 `{url}` 반환 (httpx 모킹).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**:

```python
"""
Paddle 결제 부속 라우트 — FE 구독현황 + 고객포털 진입.
체크아웃은 FE(Paddle.js), 상태 확정은 웹훅. 여기는 조회/포털만.
"""
from __future__ import annotations
import logging
from typing import Any, Dict
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import UserPublic  # billing_routes.py 와 동일 import — 구현 시 실제 경로 확인
from app.service import paddle_subscription_repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/paddle", tags=["Paddle", "Billing"])


@router.get("/subscription", summary="현재 사용자 Paddle 구독 스냅샷")
async def get_paddle_subscription_route(
    current_user: UserPublic = Depends(get_current_user),
) -> Dict[str, Any]:
    sub = await paddle_subscription_repository.get_by_email(current_user.email)
    return {"subscription": sub}


@router.post("/portal-session", summary="Paddle 고객포털 세션 URL 생성")
async def create_portal_session_route(
    current_user: UserPublic = Depends(get_current_user),
) -> Dict[str, Any]:
    if not settings.PADDLE_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="paddle_api_not_configured")
    sub = await paddle_subscription_repository.get_by_email(current_user.email)
    customer_id = (sub or {}).get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no_paddle_subscription")
    url = f"{settings.paddle_api_base}/customers/{customer_id}/portal-sessions"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {settings.PADDLE_API_KEY}"},
                json={"subscription_ids": [sub["subscription_id"]] if sub.get("subscription_id") else []},
            )
    except httpx.HTTPError as e:
        logger.warning("paddle portal-session 호출 실패: %s", e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="paddle_api_error")
    if resp.status_code >= 400:
        logger.warning("paddle portal-session %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="paddle_api_error")
    body = resp.json()
    portal_url = (((body.get("data") or {}).get("urls") or {}).get("general") or {}).get("overview")
    if not portal_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="paddle_api_unexpected_response")
    return {"url": portal_url}
```

main.py: `from app.api.paddle_billing_routes import router as paddle_billing_router` + `app.include_router(paddle_billing_router)` (paddle_webhook_router 옆).
- [ ] **Step 4: PASS** / **Step 5: Commit** — `feat(paddle): 구독 조회 + 고객포털 세션 라우트`

### Task 9 (FE): pricing.vue — 체크아웃 성공 후처리 + 구독현황 Paddle 소스 + 포털 버튼 + 토스 흐름 제거

**Files:** Modify `src/pages/pricing.vue`, `src/locales/{ko,en,zh,ja}/pricing.json`

- [ ] **Step 1: script 교체** — 핵심 변경:
  - import: `setPaddleEventHandler, waitForEntitlementChange` 추가, `fetchPaddleSubscriptionApi, createPortalSessionApi` 추가. `fetchSubscriptionApi/fetchBillingMethodApi/fetchPaymentsApi/cancelApi/resumeApi` import 제거.
  - 상태: `subscription/billingMethod/payments` → `paddleSub = ref(null)`, `portalLoading = ref(false)`.
  - `load()`:

```js
const load = async () => {
  isLoading.value = true
  const r = await fetchPaddleSubscriptionApi()
  paddleSub.value = (r.success && r.data?.subscription) || null
  isLoading.value = false
}
```

  - 체크아웃 이벤트 (onMounted 에서 등록, onUnmounted 해제):

```js
const onPaddleEvent = (ev) => {
  if (ev?.name !== 'checkout.completed') return
  showSuccess?.(t('pricing.checkout_success'))
  applyEntitlement()
}
const applyEntitlement = async () => {
  const usageStore = useUsageStore()
  const newTier = await waitForEntitlementChange(
    async () => {
      await usageStore.refresh({ force: true, silent: true })
      return usageStore.subscriptionType
    },
    { fromTier: userTier.value },
  )
  if (newTier) {
    const v = await verifyToken()           // user.subscription_type 갱신
    if (v.valid && v.user) user.value = v.user
    await load()
    showSuccess?.(t('pricing.entitlement_updated', { tier: getTierLabel(newTier) }))
  } else {
    showWarning?.(t('pricing.entitlement_pending'))
  }
}
```

  - 포털: 

```js
const openPortal = async () => {
  portalLoading.value = true
  const r = await createPortalSessionApi()
  portalLoading.value = false
  if (!r.success || !r.data?.url) {
    showError?.(r.error || t('pricing.portal_failed'))
    return
  }
  window.open(r.data.url, '_blank', 'noopener')
}
```

  - `handleCancel/handleResume` 삭제. `handleCtaClick` 의 미설정 분기 토스트 키를 `pricing.payment_not_ready` 로.
- [ ] **Step 2: template 교체** — current-sub 섹션을 `paddleSub` 기반으로 (plan 은 `userTier`, status 는 paddleSub.status: active/trialing/paused/past_due/canceled), 해지/재개 버튼 → "구독 관리" 단일 버튼(`openPortal`, `portalLoading` 스피너) + 포털 안내 문구. 결제 이력 섹션(payments) 제거 — 영수증/인보이스는 포털에서. 쿠폰 섹션 `v-if` 에 `!paddleReady` 추가 (Paddle Discount 이관 전까지 숨김). `warning-box` 의 i18n 키 교체.
- [ ] **Step 3: i18n** — 4개 로케일 `pricing.json`: `toss_not_ready` 제거 → `payment_not_ready` 추가, 신규 키 `checkout_success`, `entitlement_updated`, `entitlement_pending`, `portal_manage`, `portal_hint`, `portal_failed`. 미사용 키 제거: `confirm_cancel_*`, `toast_cancel_*`, `toast_resume_*`, `col_*`, `payments_*`, `status_paid/failed/refunded/partial_refund/pending`, `purpose_*`, `receipt_*` (pricing.vue 내 사용처가 사라진 것만 — 제거 전 전역 grep 으로 다른 사용처 없는지 확인).
- [ ] **Step 4: 검증** — `pnpm test` 전체 + `pnpm build` + (가능하면) preview 로 /pricing 화면 깨짐 없는지 확인 (Paddle env 미설정 → "결제 준비 중" 게이트 동작 = 현행과 동일해야 함).
- [ ] **Step 5: Commit** — `feat(pricing): Paddle 컷오버 — 체크아웃 성공 후처리 + 고객포털 + 토스 흐름 은퇴`

### Task 10 (FE): billing.js 토스 잔재 은퇴

**Files:** Modify `src/utils/billing.js`

- [ ] **Step 1: 전역 사용처 확인** — `issueBillingKeyApi|subscribeApi|upgradeApi|cancelApi|resumeApi|fetchSubscriptionApi|fetchBillingMethodApi|fetchPaymentsApi|makeCustomerKey|loadTossSdk` grep → pricing.vue 외 사용처 없음 확인 (있으면 해당 화면도 정리).
- [ ] **Step 2: 축소** — billing.js 에 `validateCouponApi`(+ wrap) 만 남기고 전부 삭제. 파일 doc 주석을 "쿠폰 검증 전용 — 결제는 paddle.js/paddleApi.js" 로 갱신.
- [ ] **Step 3: `pnpm test` + `pnpm build` PASS 확인**
- [ ] **Step 4: Commit** — `refactor(billing): 토스 결제 코드 은퇴 — Paddle MoR 전환 완료분`

### Task 11 (FE): 환불정책 페이지 — Paddle MoR/USD 기준 갱신

**Files:** Modify `src/pages/legal/refund-policy.vue`

- [ ] **Step 1: 내용 교체** — KRW 예시(9,900원 등)·토스 기반 문구 제거. 갱신 골자: ① 결제는 Merchant of Record 인 Paddle 을 통해 USD 로 처리되며 영수증/세금계산은 Paddle 발행 ② 청약철회(7일, 실질 사용 시 제한) 골격 유지 ③ 업그레이드 차액은 Paddle 이 일할(proration) 계산 ④ 해지는 고객포털에서 — 현재 주기 종료까지 유지 ⑤ 결제 실패 시 Paddle dunning(자동 재시도) 후 강등 ⑥ 환불 요청 채널: 고객포털 또는 support 메일. `lastUpdated` = '2026-06-10'.
- [ ] **Step 2: pricing.vue 약관 링크와 정합 확인** (agree 섹션 문구가 토스 전제면 함께 수정)
- [ ] **Step 3: Commit** — `docs(legal): 환불정책 Paddle MoR/USD 기준 갱신`

### Task 12: 전체 검증 게이트 (더블체크)

- [ ] FE: `pnpm test` 전체 PASS, `pnpm build` 성공.
- [ ] BE: `pytest tests/api/test_paddle_webhook.py tests/api/test_paddle_billing.py -v` PASS + 전체 스위트.
- [ ] 회귀 더블체크: ① Paddle env 미설정 시 /pricing 이 "결제 준비 중" 게이트로 현행과 동일 동작 ② UpgradePromptDialog → /pricing 진입 정상 ③ usage/quota(402) 흐름 무변경 ④ i18n 4개 로케일 키 누락 grep (`$t('pricing.` 사용 키 전수 대조).
- [ ] FE/BE 각각 PR 생성.

### Task 13 (ops — 사용자 액션 필요): 샌드박스 셋업 + E2E

코드로 불가능한 부분 — 체크리스트로 핸드오프:

- [ ] Paddle **sandbox 계정** 생성 (sandbox-vendors.paddle.com)
- [ ] Catalog → Products/Prices: Pro/Pro+/Pro Max 월간(+선택 연간) USD 가격 생성 → `pri_xxx` 확보 (가격: docs/pricing-final.md — $9/$19/$29)
- [ ] Developer Tools → Authentication: **client-side token**(FE용) + **API key**(BE용) 발급
- [ ] Developer Tools → Notifications: webhook 등록 — URL = `https://<BE도메인>/api/paddle/webhook`, 이벤트 = `subscription.*`(created/activated/updated/canceled/paused/resumed) → **webhook secret** 확보. (로컬 BE 테스트 시 ngrok 등 터널 필요 — 배포된 BE 사용 권장)
- [ ] FE env (.env.local + Vercel preview): `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_ENV=sandbox`, `VITE_PADDLE_PRICE_PRO_M` 등
- [ ] BE env (Portainer): `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV=sandbox`, `PADDLE_PRICE_PRO(_Y)` 등 → 컨테이너 재시작
- [ ] ⚠️ **FE·BE price ID 페어링 필수**: FE 에 `VITE_PADDLE_PRICE_*_Y`(연간)를 넣으면 BE 에도 반드시 `PADDLE_PRICE_*_Y` 를 같은 값으로. FE 만 설정하면 **결제는 되는데 등급 부여가 누락**된다 (웹훅 unmapped_price skip). 월간 3종도 동일 페어 (FE `VITE_PADDLE_PRICE_PRO_M` ↔ BE `PADDLE_PRICE_PRO`).
- [ ] **E2E 시나리오**: ① Free 계정으로 Pro 결제(테스트카드 4242 4242 4242 4242) → 오버레이 성공 → 30초 내 등급 Pro 반영 + 토스트 ② /pricing 구독현황 표시 ③ "구독 관리" → 포털 열림 → 해지 → 웹훅 → (주기 종료 시) free 강등 확인 ④ 포털에서 결제수단 변경 ⑤ 업그레이드(Pro→Pro+) 결제 → 등급 갱신 ⑥ 잘못된 서명 웹훅 401 확인

---

## Phase 2 — 정식 등록 후 (이번 계획 범위 밖, 메모)
1. Paddle 본계정 승인 후 production Products/Prices 재생성 (sandbox 와 ID 다름)
2. env 전체 교체: FE `VITE_PADDLE_ENV=production` + live token/price ID, BE `PADDLE_ENV=production` + live key/secret/price ID
3. 가격 최종 확정 (BE 마진 측정 결과 반영 — docs/pricing-final.md 미정 항목)
4. 연간 결제 UI 토글 (BE PricingConfig 연간 가격 추가와 함께)
5. 쿠폰 → Paddle Discount 이관
6. 소액 실결제 스모크 테스트 → 라이브
