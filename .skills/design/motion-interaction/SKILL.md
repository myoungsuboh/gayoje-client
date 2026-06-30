---
name: 모션 & 마이크로인터랙션
description: 목적 있는 애니메이션·마이크로인터랙션으로 피드백·전환·상태 변화를 시각화하고 prefers-reduced-motion을 존중하는 구현 표준. 전환 효과·애니메이션을 넣거나 모션 타이밍·성능을 정할 때 읽는다. 키워드: transition, animation, prefers-reduced-motion, transform, opacity, keyframes, ease.
rules:
  - "모든 애니메이션은 prefers-reduced-motion: reduce 미디어 쿼리에서 비활성화하거나 최소화한다."
  - "전환 시간은 100~300ms를 기본으로 하고, 복잡한 레이아웃 전환은 500ms 이하를 유지한다."
  - "ease-in은 요소 퇴장, ease-out은 등장, ease-in-out은 상태 전환에 사용한다."
  - "애니메이션은 UX 목적(피드백·계층·관계) 없이 장식용으로만 사용하지 않는다."
  - "성능을 위해 transform·opacity만 애니메이트하고, layout을 유발하는 width·height·top 애니메이션을 피한다."
tags:
  - "transition"
  - "animation"
  - "prefers-reduced-motion"
  - "transform"
  - "opacity"
  - "keyframes"
  - "ease"
---

# 🎬 모션 & 마이크로인터랙션

> 목적 있는 모션으로 피드백·전환·상태를 시각화하고 접근성·성능을 지킨다. 애니메이션을 넣거나 전환 타이밍을 정할 때 읽는다.

## 1. 핵심 원칙
- 모든 애니메이션은 prefers-reduced-motion: reduce 미디어 쿼리에서 비활성화하거나 최소화한다.
- 전환 시간은 100~300ms를 기본으로 하고, 복잡한 레이아웃 전환은 500ms 이하를 유지한다.
- ease-in은 요소 퇴장, ease-out은 등장, ease-in-out은 상태 전환에 사용한다.
- 애니메이션은 UX 목적(피드백·계층·관계) 없이 장식용으로만 사용하지 않는다.
- 성능을 위해 transform·opacity만 애니메이트하고, layout을 유발하는 width·height·top 애니메이션을 피한다.

## 2. 규칙

### 2-1. 접근 가능한 모션
```css
/* 기본 전환 */
.btn { transition: background-color 150ms ease-out, transform 150ms ease-out; }

/* ✅ 권장 — 모션 감소 요청 시 비활성화 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2-2. 전환 타이밍 가이드
| 유형 | 시간 | 용도 |
|------|------|------|
| 즉각 피드백 | 100ms | 버튼 hover/active |
| 간단한 전환 | 150~200ms | 드롭다운, 툴팁 |
| 콘텐츠 전환 | 250~300ms | 모달 열기, 탭 전환 |
| 복잡한 레이아웃 | 400~500ms | 사이드바, 패널 |

### 2-3. 마이크로인터랙션 패턴
로딩 피드백:
```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

성공/오류 피드백:
- 성공: 그린 체크마크 + 간결한 텍스트, 2~3초 후 자동 닫힘
- 오류: 레드 테두리 + shake 애니메이션(transform: translateX), 수동 닫기

### 2-4. GPU 가속 (Composited Layer)
transform·opacity만 애니메이트하면 GPU composite 레이어에서 처리되어 메인 스레드 블로킹이 없다.
```css
/* ✅ 좋음 */ .card:hover { transform: translateY(-4px); opacity: 0.9; }
/* ❌ 나쁨 */ .card:hover { top: -4px; height: 200px; } /* layout 유발 */
```

## 3. 흔한 실수
- prefers-reduced-motion 미처리 → 모션 민감 사용자에게 불편·어지러움을 준다.
- width·height·top·left 애니메이트 → layout reflow로 끊김이 발생한다.
- 목적 없는 장식용 모션 남발 → 인터페이스가 산만하고 느리게 느껴진다.
- 전환 시간 과도(500ms 초과) → 반응이 둔하게 느껴진다.

## 4. 체크리스트
- [ ] prefers-reduced-motion: reduce에서 모션을 비활성화/최소화했는가
- [ ] 전환 시간이 용도별 가이드(100~500ms) 범위 안에 있는가
- [ ] 등장/퇴장/전환에 맞는 easing(ease-out/in/in-out)을 사용했는가
- [ ] transform·opacity만 애니메이트하고 layout 유발 속성을 피했는가
- [ ] 모든 모션에 UX 목적(피드백·계층·관계)이 있는가
