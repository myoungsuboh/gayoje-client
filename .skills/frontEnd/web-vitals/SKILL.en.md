---
name: Web Vitals & Performance Budget (Web Vitals)
description: Standards for measuring, targeting, budgeting, and monitoring Core Web Vitals (LCP·INP·CLS). Read it when setting performance criteria (release gates) or improving / detecting regressions in LCP/INP/CLS. Keywords: web-vitals, LCP, INP, CLS, Lighthouse CI, performance budget, RUM, P75.
rules:
  - "Adopt LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 as the release criteria."
  - "Set a bundle budget (e.g. initial JS ≤ 200kB gzip) and warn in CI when it is exceeded."
  - "Minimize render-blocking resources (synchronous CSS·JS)."
  - "Monitor real-user data at the P75 level using web-vitals/RUM."
  - "Add Lighthouse CI to the pipeline to automatically detect regressions."
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

# 🚀 Web Vitals & Performance Budget

> Measure and manage Core Web Vitals and use the performance budget as a release gate. Read it when setting performance criteria or detecting regressions.

## 1. Core Principles
- Adopt LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 as the release criteria.
- Set a bundle budget (e.g. initial JS ≤ 200kB gzip) and warn in CI when it is exceeded.
- Minimize render-blocking resources (synchronous CSS·JS).
- Monitor real-user data at the P75 level using `web-vitals`/RUM.
- Add Lighthouse CI to the pipeline to automatically detect regressions.

## 2. Rules

### 2-1. Target Metrics
| Metric | Good | Needs improvement |
|---|---|---|
| LCP | ≤ 2.5s | > 4.0s |
| INP | ≤ 200ms | > 500ms |
| CLS | ≤ 0.1 | > 0.25 |

### 2-2. Real-User Measurement (RUM)
```js
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP(sendToAnalytics)
onINP(sendToAnalytics)
onCLS(sendToAnalytics)
```

### 2-3. Performance Budget + Lighthouse CI
```json
{ "budgets": [
  { "resourceType": "script", "budget": 200 },
  { "resourceType": "total",  "budget": 800 }
] }
```
```yaml
# ✅ Automatically detect regressions in CI (lighthouse-ci)
- run: lhci autorun --assert.preset=lighthouse:recommended
```

### 2-4. LCP Optimization
- Hero image `<link rel="preload" as="image">` (details: `image-optimization`).
- Server response (TTFB) < 600ms.
- Web fonts `font-display: swap`.
- Render-blocking scripts `defer`/`async`.

## 3. Common Mistakes
- Looking only at the Lab (Lighthouse) score and not real-user (RUM) P75.
- Setting a budget but not enforcing it in CI.
- Not specifying dimensions for images/embeds → worse CLS.
- Loading every script synchronously → worse LCP/INP.

## 4. Checklist
- [ ] Have the LCP·INP·CLS targets been agreed upon as release criteria?
- [ ] Is P75 monitored via web-vitals/RUM?
- [ ] Is a bundle/resource budget set and enforced in CI?
- [ ] Are regressions detected automatically with Lighthouse CI?
- [ ] Have the LCP elements (preload·TTFB·fonts·scripts) been optimized?
