---
name: 다크모드 & 테마 시스템
description: CSS Custom Properties와 prefers-color-scheme으로 라이트/다크 모드 및 확장 가능한 테마를 구현하는 가이드. 새 화면에 색을 입히거나 테마 토글·시스템 테마 감지·다크모드 색을 정할 때 읽는다. 키워드: prefers-color-scheme, data-theme, color-scheme, dark, localStorage, currentColor, --color-.
rules:
  - "색상은 반드시 CSS Custom Properties(시맨틱 토큰)로만 참조하고, 라이트/다크 값은 해당 스코프에서 재정의한다."
  - "prefers-color-scheme 으로 시스템 테마를 자동 감지하되, 사용자 수동 선택(light/dark/system)도 지원한다."
  - "다크모드에서 순수 검정(#000000) 대신 어두운 회색 계열(#0f172a 등)을 써 눈 피로를 줄인다."
  - "이미지·동영상은 다크모드에서 과하게 밝을 때만 필터를 케이스별로 적용하고(고채도 사진은 별도 에셋 고려), SVG는 currentColor 를 쓴다."
  - "테마 선택은 localStorage에 저장하고 초기 로딩 시 깜빡임(FOUC)을 방지한다."
tags:
  - "prefers-color-scheme"
  - "data-theme"
  - "color-scheme"
  - "dark"
  - "localStorage"
  - "currentColor"
  - "--color-"
---

# 🌙 다크모드 & 테마 시스템

> 시맨틱 토큰 한 벌로 라이트/다크/확장 테마를 일관되게 구현한다. 새 화면에 색을 입히거나 테마 전환을 다룰 때 읽는다.

## 1. 핵심 원칙
- 색상은 반드시 CSS Custom Properties(시맨틱 토큰)로만 참조하고, 라이트/다크 값은 해당 스코프에서 재정의한다.
- `prefers-color-scheme` 으로 시스템 테마를 자동 감지하되, 사용자 수동 선택(light/dark/system)도 지원한다.
- 다크모드에서 순수 검정(#000000) 대신 어두운 회색 계열(#0f172a 등)을 써 눈 피로를 줄인다.
- 이미지·동영상은 다크모드에서 과하게 밝을 때만 필터를 케이스별로 적용하고(고채도 사진은 별도 에셋 고려), SVG는 `currentColor` 를 쓴다.
- 테마 선택은 localStorage에 저장하고 초기 로딩 시 깜빡임(FOUC)을 방지한다.

## 2. 규칙

### 2-1. 시맨틱 토큰 기반 테마
```css
/* ❌ 금지 — 하드코딩 색, 다크모드에서 재정의 불가 */
.card { background: #ffffff; color: #0f172a; }

/* ✅ 권장 — 시맨틱 토큰 참조 + 스코프별 재정의 */
:root {
  --color-bg-primary:   #ffffff;
  --color-text-primary: #0f172a;
  --color-surface:      #f8fafc;
  --color-border:       #e2e8f0;
}

[data-theme="dark"], @media (prefers-color-scheme: dark) {
  --color-bg-primary:   #0f172a;
  --color-text-primary: #f1f5f9;
  --color-surface:      #1e293b;
  --color-border:       #334155;
}
```

### 2-2. FOUC 방지 (깜빡임 없는 초기 로딩)
HTML `<head>` 인라인 스크립트로 클래스를 즉시 적용한다 — 렌더 전에 테마를 확정한다.
```html
<script>
  (function(){
    const t = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute(
      'data-theme',
      t === 'dark' || (!t && prefersDark) ? 'dark' : 'light'
    );
  })();
</script>
```

### 2-3. 테마 토글 구현 패턴
```js
function setTheme(value) {  // 'light' | 'dark' | 'system'
  localStorage.setItem('theme', value);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value;
  document.documentElement.setAttribute('data-theme', resolved);
}
```

### 2-4. 이미지·미디어 다크모드 처리
```css
/* 사진 이미지 — 밝기 살짝 낮춤 (필요한 경우만) */
[data-theme="dark"] img:not([data-no-darken]) {
  filter: brightness(0.85) contrast(1.05);
}
/* SVG 아이콘 — 색상 상속 */
.icon { fill: currentColor; }
```

## 3. 흔한 실수
- 색을 하드코딩 → 다크모드에서 재정의되지 않아 깨진다.
- 초기 인라인 스크립트 생략 → 새로고침 시 라이트→다크 깜빡임(FOUC).
- 다크모드에 순수 검정 사용 → 대비가 과해 눈이 피로하다.
- 모든 이미지에 일괄 필터 적용 → 고채도 사진이 탁해진다.

## 4. 체크리스트
- [ ] 모든 색을 시맨틱 토큰(`--color-*`)으로만 참조하는가
- [ ] light/dark/system 세 모드를 모두 지원하는가
- [ ] 초기 인라인 스크립트로 FOUC를 방지했는가
- [ ] 테마 선택을 localStorage에 저장하고 복원하는가
- [ ] 다크모드 색이 순수 검정이 아닌 회색 계열인가
- [ ] SVG는 currentColor, 사진은 케이스별 필터를 적용했는가
