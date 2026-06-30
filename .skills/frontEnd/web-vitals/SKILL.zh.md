---
name: 网页核心指标 & 性能预算 (Web Vitals)
description: Core Web Vitals(LCP·INP·CLS)的测量·目标·性能预算·监控标准。在制定性能标准(发布门禁)或改进·检测 LCP/INP/CLS 回归时阅读。关键词: web-vitals, LCP, INP, CLS, Lighthouse CI, performance budget, RUM, P75。
rules:
  - "将 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 作为发布标准。"
  - "制定打包预算(例: 初始 JS ≤ 200kB gzip)并在 CI 超出时发出警告。"
  - "最小化渲染阻塞资源(同步 CSS·JS)。"
  - "用 web-vitals/RUM 以 P75 基准监控真实用户数据。"
  - "将 Lighthouse CI 纳入流水线以自动检测回归。"
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

# 🚀 网页核心指标 & 性能预算

> 测量·管理 Core Web Vitals，并将性能预算作为发布门禁。在制定性能标准或检测回归时阅读。

## 1. 核心原则
- 将 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 作为发布标准。
- 制定打包预算(例: 初始 JS ≤ 200kB gzip)并在 CI 超出时发出警告。
- 最小化渲染阻塞资源(同步 CSS·JS)。
- 用 `web-vitals`/RUM 以 P75 基准监控真实用户数据。
- 将 Lighthouse CI 纳入流水线以自动检测回归。

## 2. 规则

### 2-1. 目标指标
| 指标 | 良好 | 需改进 |
|---|---|---|
| LCP | ≤ 2.5s | > 4.0s |
| INP | ≤ 200ms | > 500ms |
| CLS | ≤ 0.1 | > 0.25 |

### 2-2. 真实用户测量 (RUM)
```js
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP(sendToAnalytics)
onINP(sendToAnalytics)
onCLS(sendToAnalytics)
```

### 2-3. 性能预算 + Lighthouse CI
```json
{ "budgets": [
  { "resourceType": "script", "budget": 200 },
  { "resourceType": "total",  "budget": 800 }
] }
```
```yaml
# ✅ 在 CI 中自动检测回归 (lighthouse-ci)
- run: lhci autorun --assert.preset=lighthouse:recommended
```

### 2-4. LCP 优化
- 主视觉图片 `<link rel="preload" as="image">` (详情: `image-optimization`)。
- 服务器响应(TTFB) < 600ms。
- 网页字体 `font-display: swap`。
- 渲染阻塞脚本 `defer`/`async`。

## 3. 常见错误
- 只看 Lab(Lighthouse)分数而不看真实用户(RUM)P75。
- 制定了预算却不在 CI 中强制执行。
- 图片/嵌入未指定尺寸 → CLS 恶化。
- 所有脚本同步加载 → LCP/INP 恶化。

## 4. 检查清单
- [ ] 是否已就 LCP·INP·CLS 目标作为发布标准达成一致
- [ ] 是否用 web-vitals/RUM 监控 P75
- [ ] 是否制定了打包/资源预算并在 CI 中强制执行
- [ ] 是否用 Lighthouse CI 自动检测回归
- [ ] 是否已优化 LCP 要素(preload·TTFB·字体·脚本)
