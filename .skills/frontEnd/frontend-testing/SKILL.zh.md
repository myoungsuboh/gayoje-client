---
name: 前端测试标准 (Frontend Testing)
description: 前端测试的技术栈应用标准 — 涵盖稳定选择器(data-testid)、前端覆盖率阈值与CI门禁,以及Vitest/Testing Library/Playwright的实现示例。通用概念(金字塔、AAA、隔离、模拟边界、非确定性)委托给unit-testing、integration-testing、test-strategy。在编写/维护测试或配置测试环境与CI门禁时阅读。关键词: testing, component, e2e, data-test, stable selector, coverage, flaky, vitest, playwright.
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

# 🧪 前端测试标准 (Frontend Testing)

> 统一前端测试的**稳定选择器**、**覆盖率阈值/CI门禁**以及各技术栈(Vitest、Vue Test Utils、Playwright)的应用。在编写/维护测试或配置测试环境与CI门禁时阅读。通用原则遵循下方的参考技能,本文档只涵盖前端特有的领域与具体工具示例(末尾的 `## 附录: 各技术栈示例`)。
>
> 相关技能:
> - 测试策略与金字塔总览: [test-strategy](../../testing/test-strategy/SKILL.md)
> - 单元测试写法: [unit-testing](../../testing/unit-testing/SKILL.md)
> - 集成测试写法: [integration-testing](../../testing/integration-testing/SKILL.md)
> - E2E自动化: [e2e-testing](../../testing/e2e-testing/SKILL.md)
> - 表单校验库: [forms-validation](../forms-validation/SKILL.md)
> - 错误监控: [error-monitoring](../error-monitoring/SKILL.md)

## 1. 核心原则

测试金字塔(单元 > 组件 > E2E的比例,大约70/25/5)、**AAA(准备-执行-断言)**结构与测试独立性、**仅在信任边界处模拟**外部依赖(网络、时间、存储)而真正执行被测对象、单元/组件**禁止真实调用**、通过fake timer·clock注入·seed**消除非确定性** — 这些通用规则全部遵循 `unit-testing`·`integration-testing`·`test-strategy`。本文档在此之上只定义前端特有的两点,**稳定选择器**与**覆盖率阈值·CI门禁**。

## 2. 规则 (前端特有)

### 2-1. 用稳定选择器查找交互元素

- 点击/输入目标用测试专用属性(`data-test`/`data-testid`)查找,而不是显示文本或DOM结构。
- 用显示文本查找会因i18n·文案变更而损坏,用CSS类/结构查找会因重构而损坏。

```text
// ❌ 금지 — 표시 텍스트/구조 기반 셀렉터
find("저장")                 // i18n·문구 변경에 깨짐
find(".btn-primary > span")  // 마크업 리팩터링에 깨짐

// ✅ 권장 — 테스트 전용 안정 속성
find('[data-testid="submit"]')
```

> 关于显示文本匹配为何对i18n变更脆弱,参见 [i18n-internationalization](../i18n-internationalization/SKILL.md)。

### 2-2. 覆盖率仅作指标,门禁放在CI

- 不要强求100%覆盖率,优先覆盖核心逻辑的分支。设定合理的阈值(分支65~75%左右)。
- 在每个PR上将lint、单元/组件、E2E作为CI门禁运行,只有通过才能合并。

```text
// ✅ 권장 — PR 게이트(개념): 정적 검사 → 단위/컴포넌트 → E2E
ci: lint → test(unit+component) → e2e
```

## 3. 常见错误 (前端特有)

- **用显示文本查找元素** → 因i18n·文案变更而损坏。用测试专用稳定属性(`data-testid` 等)查找。 → [i18n-internationalization](../i18n-internationalization/SKILL.md)
- **用CSS类/DOM结构查找元素** → 因标记重构而损坏。
- **执着于100%覆盖率** → 无意义的测试越来越多。将分支覆盖率置于合理范围,并通过CI门禁强制执行。

> 其他通用错误(全部E2E·真实调用·模拟被测对象·测试间共享状态·直接使用时间/随机数)参见 `unit-testing`·`integration-testing` 的常见错误一节。

## 4. 检查清单 (前端特有)

- [ ] 是否用**稳定属性(`data-testid` 等)**而非显示文本/结构查找交互元素?
- [ ] 覆盖率阈值是否合理(分支65~75%),且lint、测试、E2E是否作为**每个PR的CI门禁**运行?

> 通用检查(金字塔分布·按种类分离·边界模拟·禁止真实调用·AAA/独立性·固定非确定性)请一并参见 `unit-testing`·`integration-testing`·`test-strategy` 的检查清单。

## 附录: 各技术栈示例

> 以下为参考用实现示例。按相同模式添加适合你团队所用技术栈(例: React/Jest + Testing Library/Cypress、Svelte/Vitest 等)的示例。上述1~4的原则·规则是标准,附录只是其应用案例。

### Vue 3 (Vitest + Vue Test Utils)

Vue 3 + Vite项目的单元/组件/E2E测试实现示例。假定运行器为 **Vitest**(不是Jest — 使用与Vite相同的转换器,因此无配置重复,ESM可直接运行),组件使用 **Vue Test Utils**,E2E使用 **Playwright**,store使用 **Pinia**,UI使用 **Vuetify**。

#### 测试金字塔 (Vue版)

```
       /\
      /E2E\           Playwright — 핵심 플로우만 (로그인/주요 거래)
     /-----\
    / 컴포 \          Vue Test Utils — 화면 단위, 상호작용 검증
   /--------\
  /  단위    \         Vitest 단순 함수/composable/store
 /------------\
```

推荐比例: 单元70% / 组件25% / E2E 5%。

#### 安装 / 配置

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

`src/test/setup.ts` (Pinia初始化 + Vuetify 等):
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

#### 单元测试 — composable / store

**composable测试 (`useApi`)**:
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

**Pinia store测试**:
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

#### 组件测试 (Vue Test Utils)

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

> ✅ **为每个交互元素赋予 `data-test` 属性。** 文本匹配对i18n变更脆弱 → [i18n-internationalization](../i18n-internationalization/SKILL.md)。

#### E2E测试 (Playwright) — 仅核心流程

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

通过 `playwright.config.ts` 的 `webServer` 选项自动启动 `pnpm dev`。

#### AAA模式 + 独立性

在每个 `it()` 块中,从视觉上区分 **Arrange / Act / Assert** 三个区域。

- 在 `beforeEach` 中重新初始化Pinia,使一个测试不影响另一个测试。
- 时间依赖代码使用 `vi.useFakeTimers()` 或注入 `Clock`。
- 绝不对外部API进行真实调用 — 使用 `vi.mock` 或MSW(Mock Service Worker)。

#### Lint / 格式化

```bash
pnpm add -D eslint @vue/eslint-config-typescript eslint-plugin-vue prettier
```

`.eslintrc.cjs` 要点:
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

在CI中,每个PR运行 `pnpm lint && pnpm test --run && pnpm test:e2e`。
