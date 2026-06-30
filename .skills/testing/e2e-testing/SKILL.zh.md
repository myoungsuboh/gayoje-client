---
name: E2E 测试标准 (End-to-End Testing)
description: 在浏览器中自动化真实用户场景的 E2E 测试的通用标准 — 只验证核心流程、稳定选择器(data-testid)、页面对象封装、专用测试数据、隔离脆弱测试、CI 重试与追踪。在自动化核心用户流程、确定选择器·模拟·CI 重试或修复脆弱测试时阅读。与具体工具(Playwright·Cypress 等)无关。
rules:
  - "只测核心流程: 聚焦业务价值大的核心场景(注册→登录→下单→支付),把分支·边界交给更快更稳定的下层(单元·集成)。"
  - "用抗变更的方式选择并封装: 用抗标记变更的专用标识符(data-testid)定位元素,把选择器·操作藏进页面对象,让测试正文只描述场景。"
  - "把不稳定因素变成确定的: 用拦截/模拟重现慢网络·服务器错误·外部响应,异步用基于条件的等待而非固定 sleep。"
  - "专用测试数据: 使用 E2E 专用账号·数据,不污染生产环境。"
  - "不要掩盖脆弱测试,要修复: 立即隔离不稳定的测试并修复根因 — 重试是安全网而非解决方案。"
tags:
  - "playwright"
  - "cypress"
  - "data-testid"
  - "page.click"
  - "page.fill"
  - "expect(page)"
  - "cy.get"
  - "cy.visit"
---

# 🎭 E2E 测试标准 (End-to-End Testing)

> 在浏览器环境中自动化真实用户场景。在自动化核心用户流程、确定选择器·API 模拟·CI 重试或修复脆弱测试时阅读。这是一个不依赖具体工具(Playwright/Cypress 等)的通用标准。测试各层之间的职责分工请一并参阅 `test-strategy` 技能。

## 1. 核心原则
- **只测核心流程**: 聚焦业务价值大的核心场景(注册→登录→下单→支付),把分支·边界交给更快更稳定的下层(单元·集成)。
- **用抗变更的方式选择并封装**: 用抗标记变更的专用标识符(`data-testid`)定位元素,把选择器·操作藏进页面对象,让测试正文只描述场景。
- **把不稳定因素变成确定的**: 用拦截/模拟重现慢网络·服务器错误·外部响应,异步用基于条件的等待而非固定 `sleep`。
- **专用测试数据**: 使用 E2E 专用账号·数据,不污染生产环境。
- **不要掩盖脆弱测试,要修复**: 立即隔离不稳定的测试并修复根因 — 重试是安全网而非解决方案。

## 2. 规则

### 2-1. 只用 E2E 覆盖核心用户流程
- 挑选用户必须从头到尾走通的核心路径,用 E2E 验证。
- 不要用 E2E 穷举所有分支·异常·边界值 — 又慢又脆。那些交给单元/集成(`test-strategy`)。

```text
// ❌ 禁止 — 用 E2E 穷举所有输入组合·异常(慢且脆弱↑)
e2e: 登录空值 / 短密码 / 特殊字符 / ... 数十个用例

// ✅ 推荐 — 只用 E2E 测核心流程,细分支放下层
e2e: "注册→登录→下单→支付" 一条线
unit/integration: 输入校验·分支用例
```

### 2-2. 用稳定的选择器选择元素
- 用测试专用标识符(如 `data-testid`)定位元素。设定一致的命名规约。
- 不要依赖 CSS 类·DOM 结构·文案·XPath 这类容易变动的东西。

```text
// ❌ 禁止 — 依赖样式/结构/文案 → 标记一变就坏
select(".btn.btn-primary")
select("div > form > button:nth-child(3)")

// ✅ 推荐 — 抗变更的专用测试标识符
select(testid="login-submit-btn")
// 命名规约示例: {页面}-{元素}-{角色}  →  "login-email-input"
```

### 2-3. 把选择器·操作封装进页面对象
- 把各页面的交互汇集到页面对象(页面模型)中。测试只调用场景。
- 不要把选择器·点击·输入直接散落在测试正文里 — 重复会堆积,UI 变更时修改点四散。

```text
// ❌ 禁止 — 选择器·操作在每个测试里重复
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...  // 又复制粘贴

// ✅ 推荐 — 页面对象隐藏操作,测试只描述意图
LoginPage.login(email, pw)
test: LoginPage.login("u@x.com", "pw"); assert dashboard
```

### 2-4. 用拦截/模拟控制外部依赖
- 慢响应·服务器错误·外部 API 等不稳定因素,通过网络拦截强制返回所需响应,使其变得确定。
- 不要直接依赖真实外部系统,使流程的成败受制于外部状态。

```text
// ❌ 禁止 — 依赖真实外部 API → 外部一抖动,测试也抖动
goto("/users")   // 把命运交给真实服务器响应

// ✅ 推荐 — 用拦截重现错误/边界响应
intercept("/api/users") → respond 500
goto("/users"); assert errorState visible
```

### 2-5. 使用专用测试账号·数据
- 使用 E2E 专用账号·种子数据,并隔离·清理测试产生的数据。
- 不要用生产账号·数据跑 E2E。

```text
// ❌ 禁止 — 用生产账号/数据执行下单·支付流程(污染·事故)
// ✅ 推荐 — 专用测试账号 + 隔离的种子数据,运行后清理
```

### 2-6. 立即隔离脆弱测试并修复
- 对间歇性失败的测试立即隔离(quarantine),并修复根因(竞争·时序·外部依赖)。
- 不要用重试掩盖,让它看起来"绿色" — 重试是安全网而非解决方案。
- 脆弱测试检测·隔离(quarantine)·重试策略的详细运营标准遵循 `flaky-test-management`。

```text
// ❌ 禁止 — 只用重试掩盖脆弱测试并搁置
// ✅ 推荐 — 隔离 → 修复原因(固定 sleep·竞争·外部依赖) → 恢复
```

### 2-7. 用基于条件的等待代替固定等待
- 使用"直到元素可见 / 直到请求结束"这类条件满足即刻继续的等待。
- `sleep(N秒)` 这类固定等待要么慢(过大)要么不稳(过小) — 不要使用。

```text
// ❌ 禁止 — 任意固定等待
sleep(3000); click(submit)

// ✅ 推荐 — 基于条件的等待(多数工具内置自动等待)
waitVisible(testid=submit); click(submit)
```

## 3. 常见错误

违反规则(§2)时出现的症状 — 看到就回到对应规则。

- **慢且常坏** → 用 E2E 穷举所有分支·边界(2-1),扛起本该下层做的活。
- **标记一变就坏** → 依赖 CSS/DOM 结构/XPath 选择器(2-2)。
- **难以维护** → 把选择器·操作在每个测试里直接散落(2-3),重复堆积。
- **间歇失败(flaky)** → 固定 `sleep`(2-7)、未控制外部依赖(2-4)、搁置脆弱测试(2-6)所致。
- **数据污染** → 用生产账号·数据跑流程(2-5)。
- **失败了也看不到原因** → CI 中没有追踪·截图·视频等追踪手段(参见附录配置)。

## 4. 检查清单
- [ ] 是否只挑核心用户场景用 E2E 处理(分支·边界放下层)
- [ ] 是否用 **稳定的专用标识符**(如 `data-testid`)选择元素(禁止 CSS/XPath)
- [ ] 是否把页面交互封装进 **页面对象**
- [ ] 是否用 **网络拦截/模拟** 确定性地重现错误·边界场景
- [ ] 是否使用 **专用测试账号·数据** 且不污染生产
- [ ] 是否用 **基于条件的等待** 代替固定 `sleep`
- [ ] 是否隔离·修复了 **脆弱测试**(没有用重试掩盖)
- [ ] 是否在 CI 中配置了 **重试·追踪·截图/视频** 等失败追踪手段

## 附录: 各栈示例

> 以下是参考用的实现示例。按团队所用的栈以相同模式补充。上面 1~4 的原则·规则才是标准,附录只是其应用案例。

### Playwright (TypeScript)

#### Page Object (2-3) + 稳定选择器 (2-2)

```typescript
// pages/LoginPage.ts
import { Page, expect } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-btn"]');
    await expect(this.page).toHaveURL("/dashboard");
  }

  async assertError(message: string) {
    await expect(this.page.getByTestId("error-message")).toContainText(message);
  }
}

// tests/auth.spec.ts
import { test } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

test("使用有效凭证登录成功", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "Password123!");
});

test("密码错误时显示错误消息", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "wrong");
  await loginPage.assertError("密码不正确");
});
```

#### 网络拦截 (2-4)

```typescript
test("API 错误时显示错误消息", async ({ page }) => {
  await page.route("/api/users", async route => {
    await route.fulfill({ status: 500, json: { error: "Internal Error" } });
  });

  await page.goto("/users");
  await expect(page.getByTestId("error-state")).toBeVisible();
});
```

#### data-testid 命名 (2-2)

```html
<!-- 格式: data-testid="{组件}-{元素}-{角色}" -->
<button data-testid="login-form-submit-btn">登录</button>
<input data-testid="login-form-email-input" />
<div data-testid="user-list-empty-state">暂无数据</div>
<div data-testid="product-card-{id}">...</div>
```

#### CI 重试·追踪配置 (失败追踪)

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,  // CI 中重试 2 次 (防止 flaky)
  reporter: [["html"], ["github"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

### Cypress 等其他栈

按团队的栈以相同模式(稳定选择器·页面对象·拦截·CI 重试/追踪)补充示例。例如:Cypress 用 `cy.visit`/`cy.get('[data-testid=...]')` 配置选择器,用 `cy.intercept` 做网络模拟,用 `cypress.config` 的 `retries` 配置重试。
