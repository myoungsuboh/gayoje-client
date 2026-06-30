---
name: 웹 접근성 — WCAG 2.1 AA (스택 중립)
description: WCAG 2.1 AA 기준의 스택 중립 접근성 권위(SoT). 새 화면·컴포넌트를 만들거나 키보드 탐색·색 대비·스크린리더 지원을 점검할 때 읽는다. 키워드 aria-label, role, alt, tabindex, wcag, focus-trap, 색 대비.
rules:
  - "모든 인터랙티브 요소는 키보드(Tab·Enter·Escape·방향키)만으로 조작 가능해야 한다."
  - "이미지에는 의미 있는 alt를, 장식용 이미지에는 alt='' 을 쓴다. 아이콘 버튼·링크에는 접근 가능한 이름을 제공한다."
  - "색만으로 정보를 전달하지 않는다(색 + 아이콘/텍스트 병행)."
  - "모달·드로어 등 오버레이는 focus trap 을 구현하고 Esc로 닫힌다."
tags:
  - "aria-label"
  - "aria-hidden"
  - "aria-live"
  - "role="
  - "alt="
  - "tabindex"
  - "wcag"
  - "focus-trap"
  - "aria-describedby"
---

# ♿ 웹 접근성 — WCAG 2.1 AA

> WCAG 2.1 AA 기준으로 누구나 쓸 수 있는 UI를 만드는 스택 중립 기준(SoT)이다. 새 화면·컴포넌트를 만들거나 접근성을 점검할 때 읽는다.
>
> Vue/Vuetify 구현(컴포넌트 마크업, Focus Trap, axe/Playwright, reduced-motion)은 `accessibility-a11y` 참조.

## 1. 핵심 원칙

POUR — 모든 접근성 기준은 이 네 가지로 환원된다.

| 원칙 | 의미 | 주요 기준 |
|------|------|-----------|
| Perceivable | 감지 가능 | alt text, 색 대비, 캡션 |
| Operable | 조작 가능 | 키보드, 충분한 시간, 발작 위험 없음 |
| Understandable | 이해 가능 | 언어 선언, 일관된 탐색, 오류 안내 |
| Robust | 견고 | 시맨틱 HTML, ARIA 올바른 사용 |

핵심 규약(상세는 §2):
- 모든 인터랙티브 요소는 키보드(Tab·Enter·Escape·방향키)만으로 조작 가능해야 한다.
- 이미지에는 의미 있는 alt를, 장식용 이미지에는 `alt=""` 을 쓴다. 아이콘 버튼·링크에는 접근 가능한 이름을 제공한다.
- 색만으로 정보를 전달하지 않는다(색 + 아이콘/텍스트 병행).
- 모달·드로어 등 오버레이는 focus trap 을 구현하고 Esc로 닫힌다.

## 2. 규칙

### 2-1. 시맨틱 마크업
```html
<!-- ❌ 금지 — 의미 없는 div, 스크린리더가 버튼임을 모름 -->
<div class="btn" onclick="...">저장</div>

<!-- ✅ 권장 — 시맨틱 태그로 역할 전달 -->
<button type="button">저장</button>
```
- `<div>` 대신 `<button>`, `<nav>`, `<main>`, `<header>`, `<footer>` 시맨틱 태그를 쓴다.
- 제목 계층 구조를 유지한다 (`h1` → `h2` → `h3`, 건너뛰기 금지).
- `lang="ko"` (또는 해당 언어)를 선언한다.

### 2-2. 키보드 탐색
```css
/* ❌ 금지 — 포커스가 보이지 않음 */
:focus { outline: none; }

/* ✅ 권장 — 포커스 스타일 유지 */
:focus-visible { outline: 2px solid var(--color-focus-ring); }
```
```html
<!-- 모달 focus trap 예시 -->
<dialog role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">...</h2>
  <!-- 포커스 가능 요소들 -->
  <button>닫기</button>
</dialog>
```
- 양수 `tabindex`(`tabindex="5"`)는 탭 순서를 망가뜨리므로 금지한다.

### 2-3. ARIA 사용 원칙
```html
<!-- ❌ 금지 — 아이콘만, 이름 없음 -->
<button><svg .../></button>

<!-- ✅ 권장 — 접근 가능한 이름 제공 -->
<button aria-label="닫기"><svg aria-hidden="true" .../></button>
```
- HTML 시맨틱으로 해결되면 ARIA는 추가하지 않는다.
- `aria-live="polite"` — 동적 콘텐츠 변경 알림 (로딩 완료, 오류 등).
- `aria-expanded`, `aria-controls` — 아코디언·드롭다운 상태 전달.

### 2-4. 색 대비 기준

이 표가 색 대비 수치의 단일 정의 출처(SoT)다.

| 텍스트 유형 | 최소 대비 |
|-------------|-----------|
| 일반 텍스트 | 4.5 : 1 |
| 대형 텍스트 (18pt 일반 / 14pt Bold) | 3 : 1 |
| 비텍스트 UI (아이콘·입력 테두리) | 3 : 1 |

## 3. 흔한 실수
- `outline: none` 으로 포커스 표시 제거 → 키보드 사용자가 위치를 잃는다.
- 아이콘 버튼에 이름 미제공 → 스크린리더가 "버튼"으로만 읽는다.
- 제목 계층 건너뛰기(h1 → h4) → 문서 구조가 깨진다.
- 색만으로 정보 전달 → 색맹·저시력 사용자가 구분 못 한다.

## 4. 체크리스트
- [ ] 모든 인터랙티브 요소를 키보드만으로 조작할 수 있는가
- [ ] 포커스 스타일이 보이는가 (outline 제거 안 했는가)
- [ ] 이미지 alt / 아이콘 버튼 접근 가능한 이름을 제공했는가
- [ ] 본문 4.5:1, 대형/비텍스트 3:1 색 대비를 만족하는가
- [ ] 모달이 focus trap + Esc 닫기를 구현했는가
- [ ] 제목 계층(h1→h2→h3)과 `lang` 선언이 올바른가
