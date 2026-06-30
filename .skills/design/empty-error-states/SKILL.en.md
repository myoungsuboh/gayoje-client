---
name: Empty · Error · Loading State UI
description: A standard for consistently designing abnormal states such as empty, error, and loading to prevent user confusion. Read it when building async screens or deciding per-state UI. Keywords: skeleton, loading, error, empty, retry, spinner, placeholder.
rules:
  - "Every async UI region explicitly handles all four states: loading, success, error, and empty."
  - "The loading state uses a Skeleton UI identical to the actual content layout to prevent layout jumps."
  - "The error state includes a retry button and distinguishes full-page errors from partial (inline) errors."
  - "The empty state is composed of a reason, a call to action, and an illustration — not just 'No data'."
  - "When applying optimistic updates (Optimistic UI), always implement rollback scenarios and error recovery."
tags:
  - "skeleton"
  - "loading"
  - "error"
  - "empty"
  - "retry"
  - "spinner"
  - "placeholder"
---

# 🗂️ Empty · Error · Loading State UI

> Handle the loading, success, error, and empty states of async screens consistently. Read this when building async components or deciding per-state display.

## 1. Core Principles
- Every async UI region explicitly handles all four states: loading, success, error, and empty.
- The loading state uses a Skeleton UI identical to the actual content layout to prevent layout jumps.
- The error state includes a retry button and distinguishes full-page errors from partial (inline) errors.
- The empty state is composed of a reason, a call to action, and an illustration — not just 'No data'.
- When applying optimistic updates (Optimistic UI), always implement rollback scenarios and error recovery.

## 2. Rules

### 2-1. State Matrix
Every async component must handle four states.

| State | Display | Key Element |
|------|------|-----------|
| Loading | Skeleton / Spinner | Preserve content shape |
| Success | Actual content | — |
| Error | Error message | Retry button |
| Empty | Empty state UI | Reason + call to action |

### 2-2. Skeleton UI Pattern
```html
<!-- ❌ 금지 — 단순 스피너만 두면 로딩 후 레이아웃이 점프함 -->
<div class="spinner">Loading...</div>

<!-- ✅ 권장 — 실제 카드와 동일한 구조 유지 -->
<div class="card skeleton" aria-busy="true" aria-label="콘텐츠 불러오는 중">
  <div class="skeleton-line" style="width: 60%; height: 20px;"></div>
  <div class="skeleton-line" style="width: 90%; height: 16px;"></div>
  <div class="skeleton-block" style="height: 120px;"></div>
</div>
```

### 2-3. Error State Hierarchy
Distinguish full-page errors from partial (inline) errors.

Inline error (partial failure):
```
⚠️ [항목 이름]을 불러오지 못했습니다.
   [다시 시도] 버튼
```

Full-page error:
```
😞 페이지를 불러올 수 없어요.
   인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.
   [다시 시도] [홈으로]
```

### 2-4. Empty State UI Composition
```
[일러스트 또는 아이콘]

[제목] 아직 {항목}이 없어요

[설명] {항목}을 추가하면 여기에 표시됩니다.

[CTA 버튼] + 첫 {항목} 만들기
```

Handling by empty state type:
- **First-time use**: include onboarding guidance
- **No search results**: suggest revising the search term
- **No permission**: explain how to request permission
- **No filter results**: provide a filter reset button

## 3. Common Mistakes
- Using only a spinner for loading → the layout jumps when content arrives.
- Treating all errors as full-page → even partial failures block the entire screen.
- Showing only 'No data' for empty states → the user doesn't know the next action.
- Not implementing rollback after an optimistic update → failures still look like success.

## 4. Checklist
- [ ] Were all four states — loading, success, error, empty — handled for each async region?
- [ ] Was a Skeleton with the same structure as the content used for loading?
- [ ] Does the error have a retry button, and are inline/full errors distinguished?
- [ ] Was a reason and a call to action (CTA) included in the empty state?
- [ ] Were rollback and error recovery implemented for optimistic updates?
