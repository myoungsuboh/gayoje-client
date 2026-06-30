---
name: UX Writing & Microcopy
description: A guide to writing buttons, labels, error messages, and empty-state text in a user-centered way to maintain clear and consistent UI language. Read it when writing copy for a new screen or deciding button, error, loading, and empty-state text. Keywords: placeholder, label, aria-label, empty-state, error-message, t(, $t(, i18n.
rules:
  - "Button text uses action-oriented phrases starting with a verb (e.g., 'Save', 'Delete', 'Get started')."
  - "Error messages provide both the cause and the solution, and never expose technical terms (500 Error, null, undefined)."
  - "Loading states state that something is in progress, like 'Loading...' or 'Saving...', so the user knows there is a response."
  - "Empty states provide a reason + a call to action, and never show only 'No data'."
  - "Text targeted for internationalization (i18n) is never hardcoded and must be managed with translation keys."
tags:
  - "placeholder"
  - "label"
  - "aria-label"
  - "empty-state"
  - "error-message"
  - "t("
  - "$t("
  - "i18n"
---

# ✍️ UX Writing & Microcopy

> Unify all UI text in a user-centered way. Read it when writing copy for a new screen or deciding button, error, loading, and empty-state text.

## 1. Core Principles
- Button text uses action-oriented phrases starting with a verb (e.g., 'Save', 'Delete', 'Get started').
- Error messages provide both the cause and the solution, and never expose technical terms (500 Error, null, undefined).
- Loading states state that something is in progress, like 'Loading...' or 'Saving...', so the user knows there is a response.
- Empty states provide a reason + a call to action, and never show only 'No data'.
- Text targeted for internationalization (i18n) is never hardcoded and must be managed with translation keys.

## 2. Rules

### 2-1. Buttons & Labels
| ❌ Bad example | ✅ Good example |
|---------|---------|
| OK | Save |
| Cancel | Go back |
| Delete | Delete account |
| Error | Failed to save |

- **Specificity**: Make clear what the button does
- **Consistency**: Use the same word for the same action (don't mix "Save" vs "Save it")
- **Conciseness**: 3–4 words at most

### 2-2. Error Message Patterns
```
❌ 나쁜 예: "Error 422: Validation failed"
✅ 좋은 예: "이메일 형식이 올바르지 않습니다. 예: example@domain.com"

❌ 나쁜 예: "네트워크 오류"
✅ 좋은 예: "연결에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요."
```

Error message structure:
1. **What** went wrong (cause)
2. **How** to resolve it (action)
3. A help link if needed

### 2-3. Empty State Template
```
[이유] 아직 {항목}이 없어요.
[유도] {첫 번째 항목}을 만들어 시작해 보세요.
[행동] [+ {항목} 만들기] 버튼
```

### 2-4. Writing Placeholders
- Use input examples (`예: hello@example.com`) — format hints
- Don't repeat the label (`Enter name` → the label is already `Name`, so show only an example)
- Show secondary hints below the label with `<small>` or `helper-text`

## 3. Common Mistakes
- Ambiguous buttons like 'OK' / 'Cancel' → you can't tell what will happen.
- Mixing 'Save' and 'Save it' for the same action → consistency breaks.
- Exposing technical error codes (500, null) as-is → the user doesn't know how to fix it.
- Showing only 'No data' in an empty state → it fails to prompt the next action.
- Hardcoding text → internationalization and copy changes become difficult.

## 4. Checklist
- [ ] Does the button start with a verb and describe a specific action?
- [ ] Did you use the same word consistently for the same action?
- [ ] Does the error message have a cause + solution and avoid technical terms?
- [ ] Does the empty state have a reason + a call to action?
- [ ] Did you manage i18n-targeted text with translation keys?
