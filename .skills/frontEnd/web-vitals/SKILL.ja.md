---
name: ウェブバイタル & パフォーマンス予算 (Web Vitals)
description: Core Web Vitals(LCP·INP·CLS)の測定·目標·パフォーマンス予算·モニタリング標準。パフォーマンス基準(リリースゲート)を定めたり、LCP/INP/CLS を改善·回帰検知する際に読む。キーワード: web-vitals, LCP, INP, CLS, Lighthouse CI, performance budget, RUM, P75。
rules:
  - "LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 をリリース基準とする。"
  - "バンドル予算(例: 初期 JS ≤ 200kB gzip)を定め、CI で超過時に警告する。"
  - "レンダーブロッキングリソース(同期 CSS·JS)を最小化する。"
  - "web-vitals/RUM で実ユーザーデータを P75 基準でモニタリングする。"
  - "Lighthouse CI をパイプラインに入れて回帰を自動検知する。"
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

# 🚀 ウェブバイタル & パフォーマンス予算

> Core Web Vitals を測定·管理し、パフォーマンス予算をリリースゲートとする。パフォーマンス基準を定めたり回帰を検知する際に読む。

## 1. 核心原則
- LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 をリリース基準とする。
- バンドル予算(例: 初期 JS ≤ 200kB gzip)を定め、CI で超過時に警告する。
- レンダーブロッキングリソース(同期 CSS·JS)を最小化する。
- `web-vitals`/RUM で実ユーザーデータを P75 基準でモニタリングする。
- Lighthouse CI をパイプラインに入れて回帰を自動検知する。

## 2. ルール

### 2-1. 目標指標
| 指標 | 良好 | 改善が必要 |
|---|---|---|
| LCP | ≤ 2.5s | > 4.0s |
| INP | ≤ 200ms | > 500ms |
| CLS | ≤ 0.1 | > 0.25 |

### 2-2. 実ユーザー測定 (RUM)
```js
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP(sendToAnalytics)
onINP(sendToAnalytics)
onCLS(sendToAnalytics)
```

### 2-3. パフォーマンス予算 + Lighthouse CI
```json
{ "budgets": [
  { "resourceType": "script", "budget": 200 },
  { "resourceType": "total",  "budget": 800 }
] }
```
```yaml
# ✅ CI で回帰を自動検知 (lighthouse-ci)
- run: lhci autorun --assert.preset=lighthouse:recommended
```

### 2-4. LCP 最適化
- ヒーロー画像 `<link rel="preload" as="image">` (詳細: `image-optimization`)。
- サーバー応答(TTFB) < 600ms。
- ウェブフォント `font-display: swap`。
- レンダーブロッキングスクリプト `defer`/`async`。

## 3. よくある間違い
- Lab(Lighthouse)スコアだけを見て実ユーザー(RUM)P75 を見ない。
- 予算を定めておきながら CI で強制しない。
- 画像/埋め込みにサイズ未指定 → CLS 悪化。
- すべてのスクリプトを同期ロード → LCP/INP 悪化。

## 4. チェックリスト
- [ ] LCP·INP·CLS の目標をリリース基準として合意したか
- [ ] web-vitals/RUM で P75 をモニタリングしているか
- [ ] バンドル/リソース予算を定め、CI で強制しているか
- [ ] Lighthouse CI で回帰を自動検知しているか
- [ ] LCP 要素(preload·TTFB·フォント·スクリプト)を最適化したか
