---
name: 웹 바이탈 & 성능 예산 (Web Vitals)
description: Core Web Vitals(LCP·INP·CLS) 측정·목표·성능 예산·모니터링 표준. 성능 기준(릴리스 게이트)을 정하거나 LCP/INP/CLS를 개선·회귀 감지할 때 읽는다. 키워드: web-vitals, LCP, INP, CLS, Lighthouse CI, performance budget, RUM, P75.
rules:
  - "LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1을 릴리스 기준으로 삼는다."
  - "번들 예산(예: 초기 JS ≤ 200kB gzip)을 정하고 CI에서 초과 시 경고한다."
  - "렌더 블로킹 리소스(동기 CSS·JS)를 최소화한다."
  - "web-vitals/RUM으로 실사용자 데이터를 P75 기준으로 모니터링한다."
  - "Lighthouse CI를 파이프라인에 넣어 회귀를 자동 감지한다."
tags:
  - "web-vitals"
  - "LCP"
  - "INP"
  - "CLS"
  - "Lighthouse CI"
  - "performance budget"
  - "RUM"
  - "P75"
  - "lighthouse"
  - "performance"
  - "bundle"
  - "rum"
---

# 🚀 웹 바이탈 & 성능 예산

> Core Web Vitals를 측정·관리하고 성능 예산을 릴리스 게이트로 삼는다. 성능 기준을 정하거나 회귀를 감지할 때 읽는다.

## 1. 핵심 원칙
- LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1을 릴리스 기준으로 삼는다.
- 번들 예산(예: 초기 JS ≤ 200kB gzip)을 정하고 CI에서 초과 시 경고한다.
- 렌더 블로킹 리소스(동기 CSS·JS)를 최소화한다.
- `web-vitals`/RUM으로 실사용자 데이터를 P75 기준으로 모니터링한다.
- Lighthouse CI를 파이프라인에 넣어 회귀를 자동 감지한다.

## 2. 규칙

### 2-1. 목표 지표
| 지표 | 좋음 | 개선 필요 |
|---|---|---|
| LCP | ≤ 2.5s | > 4.0s |
| INP | ≤ 200ms | > 500ms |
| CLS | ≤ 0.1 | > 0.25 |

### 2-2. 실사용자 측정 (RUM)
```js
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP(sendToAnalytics)
onINP(sendToAnalytics)
onCLS(sendToAnalytics)
```

### 2-3. 성능 예산 + Lighthouse CI
```json
{ "budgets": [
  { "resourceType": "script", "budget": 200 },
  { "resourceType": "total",  "budget": 800 }
] }
```
```yaml
# ✅ CI에서 회귀 자동 감지 (lighthouse-ci)
- run: lhci autorun --assert.preset=lighthouse:recommended
```

### 2-4. LCP 최적화
- 히어로 이미지 `<link rel="preload" as="image">` (상세: `image-optimization`).
- 서버 응답(TTFB) < 600ms.
- 웹폰트 `font-display: swap`.
- 렌더 블로킹 스크립트 `defer`/`async`.

## 3. 흔한 실수
- Lab(Lighthouse) 점수만 보고 실사용자(RUM) P75를 안 본다.
- 예산을 정해두고 CI에서 강제하지 않는다.
- 이미지/임베드에 크기 미지정 → CLS 악화.
- 모든 스크립트를 동기 로드 → LCP/INP 악화.

## 4. 체크리스트
- [ ] LCP·INP·CLS 목표를 릴리스 기준으로 합의했는가
- [ ] web-vitals/RUM으로 P75를 모니터링하는가
- [ ] 번들/리소스 예산을 정하고 CI에서 강제하는가
- [ ] Lighthouse CI로 회귀를 자동 감지하는가
- [ ] LCP 요소(preload·TTFB·폰트·스크립트)를 최적화했는가
