---
name: E2E Testing Standard (End-to-End Testing)
description: A tool-agnostic standard for E2E tests that automate real user scenarios in the browser — verify only the core flows, use stable selectors (data-testid), encapsulate with page objects, dedicated test data, flake quarantine, CI retries and traces. Read it when automating core user flows, deciding on selectors/mocking/CI retries, or hunting down flaky tests. It is independent of any specific tool (Playwright, Cypress, etc.).
rules:
  - "Core flows only: focus on the high-business-value core scenarios (signup→login→order→payment) and leave branches and edge cases to the faster, more stable lower layers (unit, integration)."
  - "Select and encapsulate to resist change: locate elements by dedicated identifiers (data-testid) that resist markup changes, and hide selectors and actions behind page objects so the test body describes only the scenario."
  - "Make unstable factors deterministic: reproduce slow networks, server errors, and external responses via intercept/mock, and wait on async with condition-based waits rather than fixed sleeps."
  - "Dedicated test data: use E2E-only accounts and data, and do not pollute production."
  - "Don't paper over flakes — fix them: quarantine unstable tests immediately and fix the cause — retries are a safety net, not a solution."
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

# 🎭 E2E Testing Standard (End-to-End Testing)

> Automate real user scenarios in a browser environment. Read it when automating core user flows, deciding on selectors/API mocking/CI retries, or hunting down flaky tests. It is a tool-agnostic standard not tied to any specific tool (Playwright/Cypress, etc.). For the division of roles across test layers, also see the `test-strategy` skill.

## 1. Core Principles
- **Core flows only**: focus on the high-business-value core scenarios (signup→login→order→payment) and leave branches and edge cases to the faster, more stable lower layers (unit, integration).
- **Select and encapsulate to resist change**: locate elements by dedicated identifiers (`data-testid`) that resist markup changes, and hide selectors and actions behind page objects so the test body describes only the scenario.
- **Make unstable factors deterministic**: reproduce slow networks, server errors, and external responses via intercept/mock, and wait on async with condition-based waits rather than fixed `sleep`.
- **Dedicated test data**: use E2E-only accounts and data, and do not pollute production.
- **Don't paper over flakes — fix them**: quarantine unstable tests immediately and fix the cause — retries are a safety net, not a solution.

## 2. Rules

### 2-1. Cover only core user flows with E2E
- Pick the core paths a user must traverse end to end and verify them with E2E.
- Do not exhaustively cover every branch, exception, and edge case with E2E — it is slow and fragile. Leave that to unit/integration (`test-strategy`).

```text
// ❌ Forbidden — exhaustively covering every input combination and exception with E2E (slow, flake↑)
e2e: login empty value / short password / special chars / ... dozens of cases

// ✅ Recommended — E2E for core flows only, detailed branches at lower layers
e2e: a single thread of "signup→login→order→payment"
unit/integration: input validation and branch cases
```

### 2-2. Select elements with stable selectors
- Locate elements by dedicated test identifiers (e.g., `data-testid`). Keep a consistent naming convention.
- Do not rely on easily changing things like CSS classes, DOM structure, text, or XPath.

```text
// ❌ Forbidden — depends on style/structure/text → breaks when markup changes
select(".btn.btn-primary")
select("div > form > button:nth-child(3)")

// ✅ Recommended — a dedicated test identifier that resists change
select(testid="login-submit-btn")
// Naming convention example: {screen}-{element}-{role}  →  "login-email-input"
```

### 2-3. Encapsulate selectors and actions in page objects
- Gather per-screen interactions into page objects (screen models). Tests call only the scenario.
- Do not scatter selectors, clicks, and inputs directly throughout the test body — duplication piles up and the points to fix scatter when the UI changes.

```text
// ❌ Forbidden — selectors and actions duplicated in every test
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...  // copy-pasted again

// ✅ Recommended — page object hides the actions, test describes only the intent
LoginPage.login(email, pw)
test: LoginPage.login("u@x.com", "pw"); assert dashboard
```

### 2-4. Control external dependencies with intercept/mock
- Make unstable factors like slow responses, server errors, and external APIs deterministic by forcing the desired response via network intercept.
- Do not depend directly on real external systems such that the success or failure of a flow hinges on external state.

```text
// ❌ Forbidden — depends on a real external API → if the external side wobbles, the test wobbles
goto("/users")   // leaves its fate to the real server response

// ✅ Recommended — reproduce error/edge responses via intercept
intercept("/api/users") → respond 500
goto("/users"); assert errorState visible
```

### 2-5. Use dedicated test accounts and data
- Use E2E-only accounts and seed data, and isolate and clean up the data the tests create.
- Do not run E2E with production accounts or data.

```text
// ❌ Forbidden — running order/payment flows with production accounts/data (pollution, incidents)
// ✅ Recommended — dedicated test account + isolated seed data, cleaned up after the run
```

### 2-6. Quarantine flaky tests immediately and fix them
- Quarantine intermittently breaking tests immediately and fix the root cause (race, timing, external dependency).
- Do not cover them with retries to make them look "green" — retries are a safety net, not a solution.
- For the detailed operational standard on flake detection, quarantine, and retry policy, follow `flaky-test-management`.

```text
// ❌ Forbidden — masking the flake with retries alone and leaving it
// ✅ Recommended — quarantine → fix the cause (fixed sleep, race, external dependency) → reinstate
```

### 2-7. Condition-based waits instead of fixed waits
- Use waits that proceed immediately once the condition is met, like "until the element is visible / until the request finishes."
- Fixed waits like `sleep(N seconds)` are either slow (too much) or unstable (too little) — do not use them.

```text
// ❌ Forbidden — arbitrary fixed wait
sleep(3000); click(submit)

// ✅ Recommended — condition-based wait (most tools have auto-waiting built in)
waitVisible(testid=submit); click(submit)
```

## 3. Common Mistakes

Symptoms that appear when you break a rule (§2) — when you see them, go back to that rule.

- **Slow and breaks often** → exhaustively covering every branch and edge case with E2E (2-1), taking on what the lower layers should do.
- **Breaks just from markup changes** → depends on CSS/DOM-structure/XPath selectors (2-2).
- **Hard to maintain** → scattering selectors and actions directly in every test (2-3), letting duplication pile up.
- **Intermittent failures (flaky)** → caused by fixed `sleep` (2-7), uncontrolled external dependencies (2-4), or unaddressed flakes (2-6).
- **Data pollution** → running flows with production accounts/data (2-5).
- **Can't see the cause even when it fails** → no tracing means (trace, screenshot, video, etc.) in CI (see the appendix configuration).

## 4. Checklist
- [ ] Did you pick only core user scenarios for E2E (branches and edges at lower layers)?
- [ ] Did you select elements by a **stable dedicated identifier** (e.g., `data-testid`) (no CSS/XPath)?
- [ ] Did you encapsulate screen interactions in **page objects**?
- [ ] Did you deterministically reproduce error/edge scenarios via **network intercept/mock**?
- [ ] Are you using **dedicated test accounts and data** without polluting production?
- [ ] Are you using **condition-based waits** instead of fixed `sleep`?
- [ ] Did you quarantine and fix **flaky tests** (without papering over them with retries)?
- [ ] Did you configure failure-tracking means in CI such as **retries, traces, screenshots/videos**?

## Appendix: Examples by Stack

> The following are reference implementation examples. Add to them with the same patterns to match the stack your team uses. The principles and rules of 1–4 above are the standard; the appendix is merely an application of them.

### Playwright (TypeScript)

#### Page Object (2-3) + stable selectors (2-2)

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

test("login succeeds with valid credentials", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "Password123!");
});

test("shows error message with wrong password", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "wrong");
  await loginPage.assertError("The password is incorrect");
});
```

#### Network intercept (2-4)

```typescript
test("shows error message on API error", async ({ page }) => {
  await page.route("/api/users", async route => {
    await route.fulfill({ status: 500, json: { error: "Internal Error" } });
  });

  await page.goto("/users");
  await expect(page.getByTestId("error-state")).toBeVisible();
});
```

#### data-testid naming (2-2)

```html
<!-- Format: data-testid="{component}-{element}-{role}" -->
<button data-testid="login-form-submit-btn">Log in</button>
<input data-testid="login-form-email-input" />
<div data-testid="user-list-empty-state">No data</div>
<div data-testid="product-card-{id}">...</div>
```

#### CI retry/trace configuration (failure tracking)

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,  // 2 retries in CI (flaky prevention)
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

### Cypress and other stacks

Add examples with the same patterns (stable selectors, page objects, intercept, CI retries/traces) to match your team's stack. For example, in Cypress you configure selectors via `cy.visit`/`cy.get('[data-testid=...]')`, network mocking via `cy.intercept`, and retries via `retries` in `cypress.config`.
