---
name: 프론트엔드 테스트 표준 (Frontend Testing)
description: 프론트엔드 테스트의 스택 적용 표준 — 안정 셀렉터(data-testid)와 프론트 커버리지 임계·CI 게이트, Vitest/Testing Library/Playwright 구현 예시를 다룬다. 범용 개념(피라미드·AAA·격리·모킹 경계·비결정성)은 unit-testing·integration-testing·test-strategy 에 위임한다. 테스트를 작성·정비하거나 테스트 환경·CI 게이트를 구성할 때 읽는다. 키워드: testing, component, e2e, data-test, stable selector, coverage, flaky, vitest, playwright.
tags:
  - "testing"
  - "component"
  - "e2e"
  - "data-test"
  - "stable selector"
  - "coverage"
  - "flaky"
  - "vitest"
  - "playwright"
---

# 🧪 프론트엔드 테스트 표준 (Frontend Testing)

> 프론트엔드 테스트의 **안정 셀렉터**·**커버리지 임계/CI 게이트**와 스택별(Vitest·Vue Test Utils·Playwright) 적용을 통일한다. 테스트를 작성·정비하거나 테스트 환경·CI 게이트를 구성할 때 읽는다. 범용 원칙은 아래 참조 스킬을 따르고, 이 문서는 프론트 고유분과 구체 도구 예시(맨 끝 `## 부록: 스택별 예시`)만 다룬다.
>
> 관련 스킬:
> - 테스트 전략·피라미드 전반: [test-strategy](../../testing/test-strategy/SKILL.md)
> - 단위 테스트 작성법: [unit-testing](../../testing/unit-testing/SKILL.md)
> - 통합 테스트 작성법: [integration-testing](../../testing/integration-testing/SKILL.md)
> - E2E 자동화: [e2e-testing](../../testing/e2e-testing/SKILL.md)
> - 폼 검증 라이브러리: [forms-validation](../forms-validation/SKILL.md)
> - 에러 모니터링: [error-monitoring](../error-monitoring/SKILL.md)

## 1. 핵심 원칙

테스트 피라미드(단위 > 컴포넌트 > E2E 비율, 대략 70/25/5), **AAA(준비-실행-검증)** 구조와 테스트 독립성, 외부 의존(네트워크·시간·스토리지)을 **신뢰 경계에서만 모킹**하고 검증 대상은 진짜로 실행, 단위/컴포넌트의 **실호출 금지**, fake timer·clock 주입·seed로 **비결정성 제거** — 이 범용 규칙은 모두 `unit-testing`·`integration-testing`·`test-strategy` 를 따른다. 본 문서는 그 위에서 프론트엔드에 고유한 두 가지, **안정 셀렉터**와 **커버리지 임계·CI 게이트**만 정의한다.

## 2. 규칙 (프론트 고유)

### 2-1. 상호작용 요소는 안정 셀렉터로 찾는다

- 클릭·입력 대상은 표시 텍스트나 DOM 구조가 아니라 테스트 전용 속성(`data-test`/`data-testid`)으로 찾는다.
- 표시 텍스트로 찾으면 i18n·문구 변경에 깨지고, CSS 클래스/구조로 찾으면 리팩터링에 깨진다.

```text
// ❌ 금지 — 표시 텍스트/구조 기반 셀렉터
find("저장")                 // i18n·문구 변경에 깨짐
find(".btn-primary > span")  // 마크업 리팩터링에 깨짐

// ✅ 권장 — 테스트 전용 안정 속성
find('[data-testid="submit"]')
```

> 표시 텍스트 매칭이 i18n 변경에 약한 이유는 [i18n-internationalization](../i18n-internationalization/SKILL.md) 참고.

### 2-2. 커버리지는 지표로만, 게이트는 CI에 둔다

- 커버리지 100%를 강요하지 말고, 핵심 로직의 분기를 우선 덮는다. 합리적 임계(분기 65~75% 수준)를 정한다.
- 린트·단위/컴포넌트·E2E를 PR마다 CI 게이트로 실행해, 통과해야 머지되게 한다.

```text
// ✅ 권장 — PR 게이트(개념): 정적 검사 → 단위/컴포넌트 → E2E
ci: lint → test(unit+component) → e2e
```

## 3. 흔한 실수 (프론트 고유)

- **표시 텍스트로 요소 찾기** → i18n·문구 변경에 깨진다. 테스트 전용 안정 속성(`data-testid` 등)으로 찾는다. → [i18n-internationalization](../i18n-internationalization/SKILL.md)
- **CSS 클래스/DOM 구조로 요소 찾기** → 마크업 리팩터링에 깨진다.
- **커버리지 100% 강박** → 의미 없는 테스트가 늘어난다. 분기 커버리지를 합리적 범위로 두고 CI 게이트로 강제한다.

> 그 외 일반 실수(전부 E2E·실호출·검증 대상 모킹·테스트 간 상태 공유·시간/난수 직접 사용)는 `unit-testing`·`integration-testing` 의 흔한 실수 절을 본다.

## 4. 체크리스트 (프론트 고유)

- [ ] 상호작용 요소를 표시 텍스트/구조가 아니라 **안정 속성(`data-testid` 등)**으로 찾는가
- [ ] 커버리지 임계가 합리적 수준(분기 65~75%)이고, 린트·테스트·E2E가 **PR마다 CI 게이트**로 실행되는가

> 범용 체크(피라미드 분포·종류 분리·경계 모킹·실호출 금지·AAA/독립성·비결정성 고정)는 `unit-testing`·`integration-testing`·`test-strategy` 의 체크리스트를 함께 본다.

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: React/Jest + Testing Library/Cypress, Svelte/Vitest 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vue 3 (Vitest + Vue Test Utils)

Vue 3 + Vite 프로젝트의 단위/컴포넌트/E2E 테스트 구현 예시. 러너는 **Vitest**(Jest 아님 — Vite와 같은 트랜스포머를 써서 설정 중복이 없고 ESM이 그대로 동작), 컴포넌트는 **Vue Test Utils**, E2E는 **Playwright**, 스토어는 **Pinia**, UI는 **Vuetify**를 가정한다.

#### 테스트 피라미드 (Vue 버전)

```
       /\
      /E2E\           Playwright — 핵심 플로우만 (로그인/주요 거래)
     /-----\
    / 컴포 \          Vue Test Utils — 화면 단위, 상호작용 검증
   /--------\
  /  단위    \         Vitest 단순 함수/composable/store
 /------------\
```

비율 권장: 단위 70% / 컴포넌트 25% / E2E 5%.

#### 설치 / 설정

```bash
pnpm add -D vitest @vue/test-utils @vitest/coverage-v8 jsdom @testing-library/vue
pnpm add -D @playwright/test
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/types/**'],
      thresholds: { lines: 70, branches: 65, functions: 70, statements: 70 },
    },
  },
})
```

`src/test/setup.ts` (Pinia 초기화 + Vuetify 등):
```ts
import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  setActivePinia(createPinia())
})

// matchMedia 폴리필 (Vuetify 등에서 필요)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((q) => ({ matches: false, media: q, addListener: vi.fn(), removeListener: vi.fn() })),
})
```

#### 단위 테스트 — composable / store

**Composable 테스트 (`useApi`)**:
```ts
import { describe, it, expect, vi } from 'vitest'
import { useApi } from '@/composables/useApi'

describe('useApi', () => {
  it('execute 성공 시 data 채워지고 loading false 로 끝난다', async () => {
    // Arrange
    const fakeFn = vi.fn().mockResolvedValue([{ id: '1' }])
    const { data, loading, error, execute } = useApi(fakeFn)

    // Act
    const result = await execute()

    // Assert
    expect(result).toEqual([{ id: '1' }])
    expect(data.value).toEqual([{ id: '1' }])
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('execute 실패 시 error 채워지고 data 는 null 유지', async () => {
    const failFn = vi.fn().mockRejectedValue({ code: 'NETWORK', message: '네트워크 오류' })
    const { data, error, execute } = useApi(failFn)

    await execute()

    expect(data.value).toBeNull()
    expect(error.value?.code).toBe('NETWORK')
  })
})
```

**Pinia store 테스트**:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import * as authApi from '@/api/authApi'

vi.mock('@/api/authApi')

describe('useAuthStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('refresh 성공 시 accessToken 이 세팅된다', async () => {
    vi.mocked(authApi.refreshTokenApi).mockResolvedValue({ accessToken: 'new-token' })
    const auth = useAuthStore()

    const token = await auth.refresh()

    expect(token).toBe('new-token')
    expect(auth.accessToken).toBe('new-token')
    expect(auth.isAuthenticated).toBe(true)
  })
})
```

#### 컴포넌트 테스트 (Vue Test Utils)

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import SensorList from '@/components/SensorList.vue'

const vuetify = createVuetify()

describe('SensorList', () => {
  it('items 가 비면 빈 상태 메시지를 보여준다', () => {
    const wrapper = mount(SensorList, {
      global: { plugins: [vuetify] },
      props: { items: [] },
    })
    expect(wrapper.text()).toContain('표시할 센서가 없습니다')
  })

  it('아이템 클릭 시 select 이벤트가 emit 된다', async () => {
    const wrapper = mount(SensorList, {
      global: { plugins: [vuetify] },
      props: { items: [{ id: 's1', name: 'Sensor 1' }] },
    })
    await wrapper.find('[data-test="sensor-item"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['s1'])
  })
})
```

> ✅ **`data-test` 속성을 모든 상호작용 요소에 부여**. 텍스트 매칭은 i18n 변경에 약함 → [i18n-internationalization](../i18n-internationalization/SKILL.md).

#### E2E 테스트 (Playwright) — 핵심 플로우만

```ts
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test'

test('로그인 후 대시보드 진입', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('email').fill('test@example.com')
  await page.getByTestId('password').fill('Test1234!')
  await page.getByTestId('submit').click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByTestId('dashboard-title')).toBeVisible()
})
```

`playwright.config.ts` 의 `webServer` 옵션으로 `pnpm dev` 자동 기동.

#### AAA 패턴 + 독립성

각 `it()` 블록 안에서 **Arrange / Act / Assert** 세 구역을 시각적으로 구분.

- 한 테스트가 다른 테스트에 영향 주지 않도록 `beforeEach` 에서 Pinia 재초기화.
- 시간 의존 코드는 `vi.useFakeTimers()` 또는 `Clock` 주입.
- 외부 API 는 절대 실호출 하지 말 것 — `vi.mock` 또는 MSW(Mock Service Worker) 사용.

#### 린팅 / 포맷팅

```bash
pnpm add -D eslint @vue/eslint-config-typescript eslint-plugin-vue prettier
```

`.eslintrc.cjs` 핵심:
```js
module.exports = {
  extends: [
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-typescript',
    'prettier',
  ],
  rules: {
    'vue/multi-word-component-names': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
}
```

CI에서 `pnpm lint && pnpm test --run && pnpm test:e2e` 를 PR마다 실행.
