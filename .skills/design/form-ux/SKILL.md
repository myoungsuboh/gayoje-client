---
name: 폼 UX & 입력 패턴
description: 접근 가능하고 오류 예방 중심으로 입력 폼을 설계하는 범용 표준 — 항상 보이는 레이블, 검증 타이밍(onBlur/onSubmit), 필드 직속 오류 표시와 aria 연결, autocomplete, 멀티스텝, 제출 상태 처리. 특정 프레임워크에 종속되지 않는다. 입력 폼을 새로 만들거나 검증·오류 표시 UX를 정할 때 읽는다. 키워드: form, input, label, validation timing, aria-describedby, aria-invalid, onBlur, onSubmit, required, autocomplete, multi-step, submitting.
rules:
  - "레이블은 항상 보이게: 모든 입력 필드에는 시각적으로 항상 보이는 레이블을 제공하고, placeholder만으로 레이블을 대체하지 않는다(입력 시작과 동시에 맥락이 사라진다)."
  - "검증은 타이밍이 중요: 실시간 검증은 사용자가 필드를 벗어난 후(blur) 시작하고, 입력 중(change)에는 오류를 띄워 타이핑을 방해하지 않는다. 제출 시에는 전체 오류를 일괄 표시한다."
  - "오류는 필드 직속 + 프로그램적으로 연결: 오류 메시지는 해당 필드 바로 아래에 두고, 필드와 메시지를 프로그램적으로 연결(aria-describedby)해 스크린리더가 읽게 한다. 오류 상태는 aria-invalid로 노출한다."
  - "필수 항목은 명시적으로: 필수 입력은 레이블에 표시하고, 폼 어딘가에 그 표식의 의미('* 는 필수 항목')를 한 번 안내한다. 시각 표식만이 아니라 보조기술용 표식(aria-required 등)도 함께 둔다."
  - "중복 제출 방지: 제출 중에는 제출 버튼을 비활성화하고 진행 상태(로딩)를 표시해 중복 제출을 막는다."
  - "프레임워크 중립: 위 개념은 모두 HTML 표준 요소·ARIA로 표현 가능하다. 특정 프레임워크의 바인딩 문법은 구현 세부일 뿐, 표준은 아래 규칙이다."
tags:
  - "form"
  - "input"
  - "label"
  - "validation timing"
  - "aria-describedby"
  - "aria-invalid"
  - "onBlur"
  - "onSubmit"
  - "required"
  - "autocomplete"
  - "multi-step"
  - "submitting"
  - "<form"
  - "<input"
  - "<label"
---

# 📝 폼 UX & 입력 패턴

> 접근 가능하고 오류를 예방하는 폼을 설계한다. 입력 폼을 만들거나 검증·오류 표시 방식을 정할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이며, 아래 원칙·규칙은 HTML 표준 의미론(시맨틱·ARIA)을 기준으로 한다. 검증의 서버측 강제는 `forms-validation`(클라이언트측 검증 보조)·서버 입력 검증 표준을, 접근성 세부 기준은 `accessibility-wcag`를 함께 본다.

## 1. 핵심 원칙
- **레이블은 항상 보이게**: 모든 입력 필드에는 시각적으로 항상 보이는 레이블을 제공하고, placeholder만으로 레이블을 대체하지 않는다(입력 시작과 동시에 맥락이 사라진다).
- **검증은 타이밍이 중요**: 실시간 검증은 사용자가 필드를 벗어난 후(blur) 시작하고, 입력 중(change)에는 오류를 띄워 타이핑을 방해하지 않는다. 제출 시에는 전체 오류를 일괄 표시한다.
- **오류는 필드 직속 + 프로그램적으로 연결**: 오류 메시지는 해당 필드 바로 아래에 두고, 필드와 메시지를 프로그램적으로 연결(`aria-describedby`)해 스크린리더가 읽게 한다. 오류 상태는 `aria-invalid`로 노출한다.
- **필수 항목은 명시적으로**: 필수 입력은 레이블에 표시하고, 폼 어딘가에 그 표식의 의미("* 는 필수 항목")를 한 번 안내한다. 시각 표식만이 아니라 보조기술용 표식(`aria-required` 등)도 함께 둔다.
- **중복 제출 방지**: 제출 중에는 제출 버튼을 비활성화하고 진행 상태(로딩)를 표시해 중복 제출을 막는다.
- **프레임워크 중립**: 위 개념은 모두 HTML 표준 요소·ARIA로 표현 가능하다. 특정 프레임워크의 바인딩 문법은 구현 세부일 뿐, 표준은 아래 규칙이다.

## 2. 규칙

### 2-1. 레이블 & 입력 필드
필드마다 보이는 `<label for>`를 두고, 힌트·오류를 `aria-describedby`로 연결한다. placeholder는 레이블이 아니라 보조 예시로만 쓴다.

```html
<!-- ❌ 금지 — placeholder로 레이블 대체 (입력 시 사라져 맥락 상실) -->
<input type="email" placeholder="이메일" />

<!-- ✅ 권장 — 항상 보이는 레이블 + aria 연결 -->
<label for="email">
  이메일 <span aria-hidden="true">*</span>
  <span class="sr-only">(필수)</span>
</label>
<input
  id="email"
  type="email"
  autocomplete="email"
  aria-describedby="email-hint email-error"
  aria-invalid="true"
  aria-required="true"
/>
<span id="email-hint" class="hint">예: hello@example.com</span>
<span id="email-error" role="alert" class="error">올바른 이메일 형식을 입력해 주세요.</span>
```

### 2-2. 유효성 검사 타이밍
| 시점 | 규칙 |
|------|------|
| 입력 중 (change) | 오류 표시 안 함 — 사용자 방해 |
| 포커스 이탈 (blur) | 해당 필드 오류 표시 시작 |
| 제출 시 (submit) | 전체 오류 일괄 표시 + 첫 오류 필드로 포커스 이동 |
| 오류 수정 후 | 그 필드는 change에서 실시간 검사로 전환 |

> 무엇을 검증할지(필수·길이·형식·도메인 규칙)와 서버측 강제는 이 스킬의 범위가 아니다 — `forms-validation` / 서버 입력 검증 표준을 따른다. 여기서는 "언제·어떻게 보여줄지"만 다룬다.

### 2-3. 자동완성(autocomplete) 활성화
입력 의미에 맞는 표준 `autocomplete` 토큰을 지정해 브라우저 자동완성·자동입력을 돕는다.

```html
<input type="text"     autocomplete="name" />
<input type="email"    autocomplete="email" />
<input type="tel"      autocomplete="tel" />
<input type="text"     autocomplete="street-address" />
<input type="password" autocomplete="current-password" />
```

### 2-4. 멀티스텝 폼 패턴
- 진행률 표시 (1/3 단계 또는 진행바)
- 각 단계의 입력값 유지 (이전 단계 복귀 시)
- 제출 전 요약 화면 제공
- 긴 폼은 섹션별 자동 저장(Auto-save) 고려

### 2-5. 제출 상태 처리
제출이 진행 중인 동안 제출 버튼을 비활성화(`disabled`)하고, 버튼 레이블/인디케이터로 진행 상태를 알린다. 비활성화 자체로 중복 제출을 막고, 상태 텍스트로 진행 중임을 전달한다.

```html
<!-- ✅ 권장 — 제출 중 disabled로 중복 제출 방지 + 진행 상태 안내 -->
<!-- isSubmitting = true 인 동안 -->
<button type="submit" disabled aria-busy="true">저장 중...</button>

<!-- isSubmitting = false 인 평상시 -->
<button type="submit">저장하기</button>
```

> 프레임워크에서는 `isSubmitting` 상태에 따라 `disabled` 속성과 버튼 내용을 바인딩하면 된다. 구체 문법은 [부록](#부록-스택별-예시) 참고.

## 3. 흔한 실수
- **placeholder를 레이블 대신 사용** → 입력 시작과 동시에 맥락이 사라진다.
- **입력 중(change)부터 오류 표시** → 타이핑을 방해한다. blur부터 표시한다.
- **오류 메시지를 aria로 연결하지 않음** → 스크린리더가 오류를 못 읽는다. `aria-describedby` + `aria-invalid`로 연결한다.
- **제출 버튼 비활성화 누락** → 중복 제출이 발생한다.
- **필수 표식을 시각 기호로만 표시** → 보조기술 사용자가 필수 여부를 모른다. `aria-required` 등으로도 노출한다.

## 4. 체크리스트
- [ ] 모든 입력에 항상 보이는 레이블이 있고 `for`/`aria`로 연결했는가
- [ ] 검증을 blur부터 표시하고 입력 중(change)에는 막았는가
- [ ] 오류 메시지를 필드 바로 아래에 두고 `aria-describedby`/`aria-invalid`로 연결했는가
- [ ] 필수 항목을 시각 표식 + 보조기술용 표식으로 표시하고 안내 문구를 넣었는가
- [ ] 제출 중 버튼을 비활성화하고 진행 상태를 표시했는가
- [ ] 무엇을 검증할지·서버측 강제는 `forms-validation` 표준을 따르는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 팀이 쓰는 스택(React/JSX, Angular, 순수 HTML 등)에 맞는 예시를 같은 패턴으로 추가한다.

### Vue

제출 상태 처리(2-5)를 Vue로 바인딩한 예시. `isSubmitting` 상태에 `:disabled`를 묶고, `v-if`/`v-else`로 버튼 레이블을 전환한다.

```html
<!-- ✅ 권장 — 제출 중 버튼 비활성화 + 로딩 표시로 중복 제출 방지 -->
<button type="submit" :disabled="isSubmitting">
  <span v-if="isSubmitting">저장 중...</span>
  <span v-else>저장하기</span>
</button>
```
