---
name: E2E 테스트 표준 (End-to-End Testing)
description: 브라우저에서 실제 사용자 시나리오를 자동화하는 E2E 테스트의 범용 표준 — 핵심 흐름만 검증, 안정 셀렉터(data-testid), 페이지 객체 캡슐화, 전용 테스트 데이터, 플레이크 격리, CI 재시도·트레이스. 핵심 사용자 흐름을 자동화하거나 셀렉터·모킹·CI 재시도를 정하거나 플레이크 테스트를 잡을 때 읽는다. 특정 도구(Playwright·Cypress 등)에 무관하다.
rules:
  - "핵심 흐름만: 비즈니스 가치가 큰 핵심 시나리오(가입→로그인→주문→결제)에 집중하고, 분기·경계는 더 빠르고 안정적인 하위 계층(단위·통합)에 맡긴다."
  - "변경에 강하게 선택·캡슐화: 요소는 마크업 변경에 강한 전용 식별자(data-testid)로 찾고, 셀렉터·동작은 페이지 객체로 감춰 테스트 본문이 시나리오만 기술하게 한다."
  - "불안정 요소를 결정적으로: 느린 네트워크·서버 오류·외부 응답은 인터셉트/모킹으로 재현하고, 비동기는 고정 sleep이 아니라 조건 기반 대기로 기다린다."
  - "전용 테스트 데이터: E2E 전용 계정·데이터를 쓰고 프로덕션을 오염시키지 않는다."
  - "플레이크는 덮지 말고 고친다: 불안정한 테스트는 즉시 격리하고 원인을 고친다 — 재시도는 안전망이지 해결책이 아니다."
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

# 🎭 E2E 테스트 표준 (End-to-End Testing)

> 실제 사용자 시나리오를 브라우저 환경에서 자동화한다. 핵심 사용자 흐름을 자동화하거나, 셀렉터·API 모킹·CI 재시도를 정하거나, 플레이크 테스트를 잡을 때 읽는다. 특정 도구(Playwright/Cypress 등)에 종속되지 않는 범용 표준이다. 테스트 계층 간 역할 분담은 `test-strategy` 스킬을 함께 본다.

## 1. 핵심 원칙
- **핵심 흐름만**: 비즈니스 가치가 큰 핵심 시나리오(가입→로그인→주문→결제)에 집중하고, 분기·경계는 더 빠르고 안정적인 하위 계층(단위·통합)에 맡긴다.
- **변경에 강하게 선택·캡슐화**: 요소는 마크업 변경에 강한 전용 식별자(`data-testid`)로 찾고, 셀렉터·동작은 페이지 객체로 감춰 테스트 본문이 시나리오만 기술하게 한다.
- **불안정 요소를 결정적으로**: 느린 네트워크·서버 오류·외부 응답은 인터셉트/모킹으로 재현하고, 비동기는 고정 `sleep`이 아니라 조건 기반 대기로 기다린다.
- **전용 테스트 데이터**: E2E 전용 계정·데이터를 쓰고 프로덕션을 오염시키지 않는다.
- **플레이크는 덮지 말고 고친다**: 불안정한 테스트는 즉시 격리하고 원인을 고친다 — 재시도는 안전망이지 해결책이 아니다.

## 2. 규칙

### 2-1. 핵심 사용자 흐름만 E2E로 다룬다
- 사용자가 끝까지 통과해야 하는 핵심 경로를 골라 E2E로 검증한다.
- 모든 분기·예외·경계값을 E2E로 망라하지 않는다 — 느리고 깨지기 쉽다. 그런 건 단위/통합에 맡긴다(`test-strategy`).

```text
// ❌ 금지 — 모든 입력 조합·예외를 E2E로 망라 (느리고 플레이크↑)
e2e: 로그인 빈값 / 짧은 비번 / 특수문자 / ... 수십 케이스

// ✅ 권장 — 핵심 흐름만 E2E, 세부 분기는 하위 계층
e2e: "가입→로그인→주문→결제" 한 줄기
unit/integration: 입력 검증·분기 케이스
```

### 2-2. 안정적인 셀렉터로 요소를 선택한다
- 테스트용 전용 식별자(예: `data-testid`)로 요소를 찾는다. 일관된 명명 규칙을 둔다.
- CSS 클래스·DOM 구조·문구·XPath처럼 쉽게 바뀌는 것에 의존하지 않는다.

```text
// ❌ 금지 — 스타일/구조/문구에 의존 → 마크업 바뀌면 깨짐
select(".btn.btn-primary")
select("div > form > button:nth-child(3)")

// ✅ 권장 — 변경에 강한 전용 테스트 식별자
select(testid="login-submit-btn")
// 명명 규칙 예: {화면}-{요소}-{역할}  →  "login-email-input"
```

### 2-3. 셀렉터·동작을 페이지 객체로 캡슐화한다
- 화면별 인터랙션을 페이지 객체(화면 모델)로 모은다. 테스트는 시나리오만 호출한다.
- 셀렉터·클릭·입력을 테스트 본문에 직접 흩뿌리지 않는다 — 중복이 쌓이고 UI 변경 시 수정 지점이 흩어진다.

```text
// ❌ 금지 — 셀렉터·동작이 테스트마다 중복
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...
test: fill(testid=email,...); fill(testid=pw,...); click(testid=submit); ...  // 또 복붙

// ✅ 권장 — 페이지 객체가 동작을 숨기고, 테스트는 의도만 기술
LoginPage.login(email, pw)
test: LoginPage.login("u@x.com", "pw"); assert dashboard
```

### 2-4. 외부 의존성은 인터셉트/모킹으로 제어한다
- 느린 응답·서버 오류·외부 API 같은 불안정 요소는 네트워크 인터셉트로 원하는 응답을 강제해 결정적으로 만든다.
- 실제 외부 시스템에 직접 의존해 흐름의 성패가 외부 상태에 좌우되게 하지 않는다.

```text
// ❌ 금지 — 실제 외부 API에 의존 → 외부가 흔들리면 테스트도 흔들림
goto("/users")   // 진짜 서버 응답에 운명을 맡김

// ✅ 권장 — 오류/경계 응답을 인터셉트로 재현
intercept("/api/users") → respond 500
goto("/users"); assert errorState visible
```

### 2-5. 전용 테스트 계정·데이터를 사용한다
- E2E 전용 계정·시드 데이터를 쓰고, 테스트가 만든 데이터는 격리·정리한다.
- 프로덕션 계정·데이터로 E2E를 돌리지 않는다.

```text
// ❌ 금지 — 운영 계정/데이터로 주문·결제 흐름 실행 (오염·사고)
// ✅ 권장 — 전용 테스트 계정 + 격리된 시드 데이터, 실행 후 정리
```

### 2-6. 플레이크 테스트는 즉시 격리하고 고친다
- 간헐적으로 깨지는 테스트는 즉시 격리(quarantine)하고 근본 원인(경합·타이밍·외부 의존)을 고친다.
- 재시도로 덮어 "초록색"처럼 보이게 만들지 않는다 — 재시도는 안전망이지 해결책이 아니다.
- 플레이크 탐지·격리(quarantine)·재시도 정책의 상세 운영 표준은 `flaky-test-management`를 따른다.

```text
// ❌ 금지 — 플레이크를 재시도로만 가리고 방치
// ✅ 권장 — 격리 → 원인(고정 sleep·경합·외부의존) 수정 → 복귀
```

### 2-7. 고정 대기 대신 조건 기반 대기
- "요소가 보일 때까지 / 요청이 끝날 때까지"처럼 조건이 충족되면 즉시 진행하는 대기를 쓴다.
- `sleep(N초)` 같은 고정 대기는 느리거나(과대) 불안정(과소)하다 — 쓰지 않는다.

```text
// ❌ 금지 — 임의 고정 대기
sleep(3000); click(submit)

// ✅ 권장 — 조건 기반 대기 (대부분 도구가 자동 대기 내장)
waitVisible(testid=submit); click(submit)
```

## 3. 흔한 실수

규칙(§2)을 어겼을 때 나타나는 증상들 — 보이면 해당 규칙으로 돌아간다.

- **느리고 잘 깨짐** → 모든 분기·경계를 E2E로 망라해(2-1) 하위 계층이 할 일을 떠안는다.
- **마크업만 바뀌어도 깨짐** → CSS/DOM 구조/XPath 셀렉터에 의존한다(2-2).
- **유지보수가 어려움** → 셀렉터·동작을 테스트마다 직접 흩뿌려(2-3) 중복이 쌓인다.
- **간헐 실패(flaky)** → 고정 `sleep`(2-7), 외부 의존 미제어(2-4), 플레이크 방치(2-6)가 원인이다.
- **데이터 오염** → 프로덕션 계정·데이터로 흐름을 돌린다(2-5).
- **실패해도 원인을 못 봄** → CI에 트레이스·스크린샷·비디오 등 추적 수단이 없다(부록 설정 참고).

## 4. 체크리스트
- [ ] 핵심 사용자 시나리오만 골라 E2E로 다뤘는가 (분기·경계는 하위 계층에)
- [ ] 요소를 **안정적인 전용 식별자**(예: `data-testid`)로 선택했는가 (CSS/XPath 금지)
- [ ] 화면 인터랙션을 **페이지 객체**로 캡슐화했는가
- [ ] 오류·경계 시나리오를 **네트워크 인터셉트/모킹**으로 결정적으로 재현했는가
- [ ] **전용 테스트 계정·데이터**를 사용하고 프로덕션을 오염시키지 않는가
- [ ] 고정 `sleep` 대신 **조건 기반 대기**를 쓰는가
- [ ] **플레이크 테스트**를 격리·수정했는가 (재시도로 덮지 않았는가)
- [ ] CI에 **재시도·트레이스·스크린샷/비디오** 등 실패 추적 수단을 설정했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택에 맞게 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Playwright (TypeScript)

#### Page Object (2-3) + 안정 셀렉터 (2-2)

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

test("유효한 자격증명으로 로그인 성공", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "Password123!");
});

test("잘못된 비밀번호로 오류 메시지 표시", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login("test@example.com", "wrong");
  await loginPage.assertError("비밀번호가 올바르지 않습니다");
});
```

#### 네트워크 인터셉트 (2-4)

```typescript
test("API 오류 시 오류 메시지 표시", async ({ page }) => {
  await page.route("/api/users", async route => {
    await route.fulfill({ status: 500, json: { error: "Internal Error" } });
  });

  await page.goto("/users");
  await expect(page.getByTestId("error-state")).toBeVisible();
});
```

#### data-testid 명명 (2-2)

```html
<!-- 형식: data-testid="{컴포넌트}-{요소}-{역할}" -->
<button data-testid="login-form-submit-btn">로그인</button>
<input data-testid="login-form-email-input" />
<div data-testid="user-list-empty-state">데이터가 없습니다</div>
<div data-testid="product-card-{id}">...</div>
```

#### CI 재시도·트레이스 설정 (실패 추적)

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,  // CI에서 2회 재시도 (flaky 방지)
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

### Cypress 등 다른 스택

팀 스택에 맞게 같은 패턴(안정 셀렉터·페이지 객체·인터셉트·CI 재시도/트레이스)으로 예시를 추가한다. 예: Cypress는 `cy.visit`/`cy.get('[data-testid=...]')`로 셀렉터를, `cy.intercept`로 네트워크 모킹을, `cypress.config`의 `retries`로 재시도를 구성한다.
