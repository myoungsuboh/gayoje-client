---
name: Frontend Testing Standard (Frontend Testing)
description: A stack-application standard for frontend testing — covers stable selectors (data-testid), frontend coverage thresholds & CI gates, and Vitest/Testing Library/Playwright implementation examples. General concepts (the pyramid, AAA, isolation, mocking boundaries, non-determinism) are delegated to unit-testing, integration-testing, and test-strategy. Read this when writing/maintaining tests or configuring the test environment & CI gates. Keywords: testing, component, e2e, data-test, stable selector, coverage, flaky, vitest, playwright.
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

# 🧪 Frontend Testing Standard (Frontend Testing)

> Unify the **stable selectors**, **coverage thresholds / CI gates**, and per-stack application (Vitest, Vue Test Utils, Playwright) of frontend testing. Read this when writing/maintaining tests or configuring the test environment & CI gates. Follow the referenced skills below for general principles; this document covers only frontend-specific concerns and concrete tooling examples (the closing `## Appendix: Per-stack examples`).
>
> Related skills:
> - Overall test strategy & pyramid: [test-strategy](../../testing/test-strategy/SKILL.md)
> - How to write unit tests: [unit-testing](../../testing/unit-testing/SKILL.md)
> - How to write integration tests: [integration-testing](../../testing/integration-testing/SKILL.md)
> - E2E automation: [e2e-testing](../../testing/e2e-testing/SKILL.md)
> - Form validation libraries: [forms-validation](../forms-validation/SKILL.md)
> - Error monitoring: [error-monitoring](../error-monitoring/SKILL.md)

## 1. Core principles

The test pyramid (unit > component > E2E ratio, roughly 70/25/5), the **AAA (Arrange-Act-Assert)** structure and test independence, **mocking external dependencies (network, time, storage) only at trust boundaries** while really executing the subject under test, **no real calls in unit/component tests**, and **eliminating non-determinism** via fake timers, clock injection, and seeds — all of these general rules follow `unit-testing`, `integration-testing`, and `test-strategy`. On top of those, this document defines only the two things specific to the frontend: **stable selectors** and **coverage thresholds / CI gates**.

## 2. Rules (frontend-specific)

### 2-1. Find interactive elements with stable selectors

- Find click/input targets by a test-only attribute (`data-test`/`data-testid`), not by displayed text or DOM structure.
- Finding by displayed text breaks on i18n/copy changes; finding by CSS class/structure breaks on refactoring.

```text
// ❌ Forbidden — selectors based on displayed text/structure
find("저장")                 // i18n·문구 변경에 깨짐
find(".btn-primary > span")  // 마크업 리팩터링에 깨짐

// ✅ Recommended — test-only stable attribute
find('[data-testid="submit"]')
```

> For why matching on displayed text is fragile to i18n changes, see [i18n-internationalization](../i18n-internationalization/SKILL.md).

### 2-2. Coverage is a metric only; put the gate in CI

- Don't force 100% coverage; prioritize covering the branches of core logic. Set a reasonable threshold (around 65–75% branch coverage).
- Run lint, unit/component, and E2E as a CI gate on every PR, so a merge requires passing.

```text
// ✅ Recommended — PR gate (concept): static checks → unit/component → E2E
ci: lint → test(unit+component) → e2e
```

## 3. Common mistakes (frontend-specific)

- **Finding elements by displayed text** → breaks on i18n/copy changes. Find by a test-only stable attribute (`data-testid`, etc.). → [i18n-internationalization](../i18n-internationalization/SKILL.md)
- **Finding elements by CSS class/DOM structure** → breaks on markup refactoring.
- **Obsessing over 100% coverage** → meaningless tests pile up. Keep branch coverage in a reasonable range and enforce it via a CI gate.

> For other general mistakes (everything-E2E, real calls, mocking the subject under test, sharing state between tests, using time/randomness directly), see the common-mistakes sections of `unit-testing` and `integration-testing`.

## 4. Checklist (frontend-specific)

- [ ] Are interactive elements found by a **stable attribute (`data-testid`, etc.)** rather than displayed text/structure?
- [ ] Is the coverage threshold reasonable (65–75% branch), and do lint, tests, and E2E run as a **CI gate on every PR**?

> For general checks (pyramid distribution, separation by kind, boundary mocking, no real calls, AAA/independence, pinning non-determinism), also see the checklists of `unit-testing`, `integration-testing`, and `test-strategy`.

## Appendix: Per-stack examples

> The following are reference implementation examples. Add examples that fit the stack your team uses (e.g., React/Jest + Testing Library/Cypress, Svelte/Vitest, etc.) following the same pattern. The principles & rules in sections 1–4 above are the standard; the appendix is merely an application of them.

### Vue 3 (Vitest + Vue Test Utils)

Implementation examples of unit/component/E2E tests for a Vue 3 + Vite project. It assumes the runner is **Vitest** (not Jest — it uses the same transformer as Vite so there's no config duplication and ESM works as-is), components use **Vue Test Utils**, E2E uses **Playwright**, the store is **Pinia**, and the UI is **Vuetify**.

#### Test pyramid (Vue version)

```
       /\
      /E2E\           Playwright — 핵심 플로우만 (로그인/주요 거래)
     /-----\
    / 컴포 \          Vue Test Utils — 화면 단위, 상호작용 검증
   /--------\
  /  단위    \         Vitest 단순 함수/composable/store
 /------------\
```

Recommended ratio: unit 70% / component 25% / E2E 5%.

#### Installation / setup

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

`src/test/setup.ts` (Pinia initialization + Vuetify, etc.):
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

#### Unit tests — composable / store

**Composable test (`useApi`)**:
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

**Pinia store test**:
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

#### Component tests (Vue Test Utils)

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

> ✅ **Assign a `data-test` attribute to every interactive element.** Text matching is fragile to i18n changes → [i18n-internationalization](../i18n-internationalization/SKILL.md).

#### E2E tests (Playwright) — core flows only

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

Use the `webServer` option in `playwright.config.ts` to auto-start `pnpm dev`.

#### AAA pattern + independence

Within each `it()` block, visually separate the three zones **Arrange / Act / Assert**.

- Reinitialize Pinia in `beforeEach` so one test doesn't affect another.
- For time-dependent code, use `vi.useFakeTimers()` or inject a `Clock`.
- Never make real calls to external APIs — use `vi.mock` or MSW (Mock Service Worker).

#### Linting / formatting

```bash
pnpm add -D eslint @vue/eslint-config-typescript eslint-plugin-vue prettier
```

`.eslintrc.cjs` essentials:
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

In CI, run `pnpm lint && pnpm test --run && pnpm test:e2e` on every PR.
