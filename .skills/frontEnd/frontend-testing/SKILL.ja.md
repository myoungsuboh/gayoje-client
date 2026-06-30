---
name: フロントエンドテスト標準 (Frontend Testing)
description: フロントエンドテストのスタック適用標準 — 安定セレクタ(data-testid)とフロントのカバレッジ閾値・CIゲート、Vitest/Testing Library/Playwrightの実装例を扱う。汎用概念(ピラミッド・AAA・隔離・モッキング境界・非決定性)はunit-testing・integration-testing・test-strategyに委ねる。テストを作成・整備したり、テスト環境・CIゲートを構成するときに読む。キーワード: testing, component, e2e, data-test, stable selector, coverage, flaky, vitest, playwright.
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

# 🧪 フロントエンドテスト標準 (Frontend Testing)

> フロントエンドテストの**安定セレクタ**・**カバレッジ閾値/CIゲート**と、スタック別(Vitest・Vue Test Utils・Playwright)の適用を統一する。テストを作成・整備したり、テスト環境・CIゲートを構成するときに読む。汎用原則は下記の参照スキルに従い、本書はフロント固有の分野と具体的なツール例(末尾の `## 付録: スタック別の例`)のみを扱う。
>
> 関連スキル:
> - テスト戦略・ピラミッド全般: [test-strategy](../../testing/test-strategy/SKILL.md)
> - 単体テストの書き方: [unit-testing](../../testing/unit-testing/SKILL.md)
> - 統合テストの書き方: [integration-testing](../../testing/integration-testing/SKILL.md)
> - E2E自動化: [e2e-testing](../../testing/e2e-testing/SKILL.md)
> - フォーム検証ライブラリ: [forms-validation](../forms-validation/SKILL.md)
> - エラーモニタリング: [error-monitoring](../error-monitoring/SKILL.md)

## 1. 中核原則

テストピラミッド(単体 > コンポーネント > E2Eの比率、おおよそ70/25/5)、**AAA(準備-実行-検証)**構造とテストの独立性、外部依存(ネットワーク・時刻・ストレージ)を**信頼境界でのみモック**し検証対象は本当に実行すること、単体/コンポーネントの**実呼び出し禁止**、fake timer・clock注入・seedによる**非決定性の排除** — これら汎用ルールはすべて `unit-testing`・`integration-testing`・`test-strategy` に従う。本書はその上で、フロントエンドに固有の二点、**安定セレクタ**と**カバレッジ閾値・CIゲート**のみを定義する。

## 2. ルール (フロント固有)

### 2-1. インタラクション要素は安定セレクタで探す

- クリック・入力対象は、表示テキストやDOM構造ではなく、テスト専用属性(`data-test`/`data-testid`)で探す。
- 表示テキストで探すとi18n・文言変更で壊れ、CSSクラス/構造で探すとリファクタリングで壊れる。

```text
// ❌ 금지 — 표시 텍스트/구조 기반 셀렉터
find("저장")                 // i18n·문구 변경에 깨짐
find(".btn-primary > span")  // 마크업 리팩터링에 깨짐

// ✅ 권장 — 테스트 전용 안정 속성
find('[data-testid="submit"]')
```

> 表示テキストのマッチングがi18n変更に弱い理由は [i18n-internationalization](../i18n-internationalization/SKILL.md) を参照。

### 2-2. カバレッジは指標としてのみ、ゲートはCIに置く

- カバレッジ100%を強制せず、中核ロジックの分岐を優先的にカバーする。合理的な閾値(分岐65〜75%程度)を定める。
- リント・単体/コンポーネント・E2EをPRごとにCIゲートとして実行し、通過しないとマージできないようにする。

```text
// ✅ 권장 — PR 게이트(개념): 정적 검사 → 단위/컴포넌트 → E2E
ci: lint → test(unit+component) → e2e
```

## 3. よくある誤り (フロント固有)

- **表示テキストで要素を探す** → i18n・文言変更で壊れる。テスト専用の安定属性(`data-testid` など)で探す。 → [i18n-internationalization](../i18n-internationalization/SKILL.md)
- **CSSクラス/DOM構造で要素を探す** → マークアップのリファクタリングで壊れる。
- **カバレッジ100%への強迫観念** → 意味のないテストが増える。分岐カバレッジを合理的な範囲に置き、CIゲートで強制する。

> その他の一般的な誤り(全部E2E・実呼び出し・検証対象のモック・テスト間の状態共有・時刻/乱数の直接使用)は `unit-testing`・`integration-testing` のよくある誤りの節を見る。

## 4. チェックリスト (フロント固有)

- [ ] インタラクション要素を表示テキスト/構造ではなく**安定属性(`data-testid` など)**で探しているか
- [ ] カバレッジ閾値が合理的な水準(分岐65〜75%)で、リント・テスト・E2Eが**PRごとのCIゲート**として実行されているか

> 汎用チェック(ピラミッド分布・種類の分離・境界モック・実呼び出し禁止・AAA/独立性・非決定性の固定)は `unit-testing`・`integration-testing`・`test-strategy` のチェックリストも併せて見る。

## 付録: スタック別の例

> 以下は参考用の実装例だ。チームが使うスタック(例: React/Jest + Testing Library/Cypress、Svelte/Vitest など)に合わせた例を同じパターンで追加する。上記1〜4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Vue 3 (Vitest + Vue Test Utils)

Vue 3 + Viteプロジェクトの単体/コンポーネント/E2Eテストの実装例。ランナーは **Vitest**(Jestではない — Viteと同じトランスフォーマを使うため設定の重複がなく、ESMがそのまま動く)、コンポーネントは **Vue Test Utils**、E2Eは **Playwright**、ストアは **Pinia**、UIは **Vuetify** を想定する。

#### テストピラミッド (Vue版)

```
       /\
      /E2E\           Playwright — 핵심 플로우만 (로그인/주요 거래)
     /-----\
    / 컴포 \          Vue Test Utils — 화면 단위, 상호작용 검증
   /--------\
  /  단위    \         Vitest 단순 함수/composable/store
 /------------\
```

推奨比率: 単体70% / コンポーネント25% / E2E 5%。

#### インストール / 設定

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

`src/test/setup.ts` (Pinia初期化 + Vuetify など):
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

#### 単体テスト — composable / store

**composableテスト (`useApi`)**:
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

**Pinia storeテスト**:
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

#### コンポーネントテスト (Vue Test Utils)

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

> ✅ **すべてのインタラクション要素に `data-test` 属性を付与する。** テキストマッチングはi18n変更に弱い → [i18n-internationalization](../i18n-internationalization/SKILL.md)。

#### E2Eテスト (Playwright) — 中核フローのみ

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

`playwright.config.ts` の `webServer` オプションで `pnpm dev` を自動起動。

#### AAAパターン + 独立性

各 `it()` ブロックの中で、**Arrange / Act / Assert** の三区域を視覚的に区別する。

- あるテストが他のテストに影響を与えないよう、`beforeEach` でPiniaを再初期化する。
- 時刻に依存するコードは `vi.useFakeTimers()` または `Clock` 注入を使う。
- 外部APIは絶対に実呼び出ししないこと — `vi.mock` またはMSW(Mock Service Worker)を使う。

#### リンティング / フォーマッティング

```bash
pnpm add -D eslint @vue/eslint-config-typescript eslint-plugin-vue prettier
```

`.eslintrc.cjs` の要点:
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

CIで `pnpm lint && pnpm test --run && pnpm test:e2e` をPRごとに実行する。
