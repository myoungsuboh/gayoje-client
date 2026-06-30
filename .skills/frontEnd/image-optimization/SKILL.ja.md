---
name: 画像最適化 (Image Optimization)
description: WebP/AVIFフォーマット・遅延読み込み・レスポンシブ画像(srcset)・CDN配信で読み込み性能とCLSを改善する標準。画像を追加する、またはLCP/CLSを改善するときに読む。キーワード: WebP, AVIF, lazy loading, srcset, picture, preload, fetchpriority, CLS, CDN。
rules:
  - "本番画像はWebP(またはAVIF)に変換し、<picture>フォールバックを用意する。"
  - "ビューポート外の画像は遅延読み込み(loading='lazy')する。"
  - "ヒーロー・LCP画像はpreload + loading='eager' + fetchpriority='high'で即座に読み込む。"
  - "srcset/sizesでデバイスのDPR・ビューポートに合った解像度を提供する。"
  - "すべての画像にwidth/height(またはaspect-ratio)を明記してCLSを防ぐ。"
tags:
  - "WebP"
  - "AVIF"
  - "lazy loading"
  - "srcset"
  - "picture"
  - "preload"
  - "fetchpriority"
  - "CLS"
  - "CDN"
  - "webp"
  - "avif"
  - "lazy"
  - "loading"
  - "cdn"
  - "image"
---

# 🖼️ 画像最適化

> 画像フォーマット・読み込み戦略・レスポンシブ・CDNを標準化し、読み込み速度とCLSを改善する。画像を追加する、または性能(LCP・CLS)を改善するときに読む。

## 1. 基本原則
- 本番画像はWebP(またはAVIF)に変換し、`<picture>`フォールバックを用意する。
- ビューポート外の画像は遅延読み込み(`loading="lazy"`)する。
- ヒーロー・LCP画像はpreload + `loading="eager"` + `fetchpriority="high"`で即座に読み込む。
- `srcset`/`sizes`でデバイスのDPR・ビューポートに合った解像度を提供する。
- すべての画像に`width`/`height`(またはaspect-ratio)を明記してCLSを防ぐ。

## 2. ルール

### 2-1. フォーマット選択
| フォーマット | 用途 | 効果 |
|---|---|---|
| WebP | 写真・複雑なグラフィック | JPEG比25〜35%減 |
| AVIF | 最新ブラウザ・高圧縮 | WebP比20%減 |
| SVG | アイコン・ロゴ・イラスト | 拡大しても無損失 |

### 2-2. レスポンシブ + LCP画像
```html
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg"
       srcset="hero-480w.jpg 480w, hero-800w.jpg 800w"
       sizes="(max-width: 600px) 480px, 800px"
       width="800" height="450"
       loading="eager" fetchpriority="high" alt="Hero" />
</picture>
```

### 2-3. 遅延読み込み(その他の画像)
```html
<!-- ❌ 禁止 — width/heightなし(CLS発生) + デフォルトの即時読み込み -->
<img src="photo.jpg" alt="..." />

<!-- ✅ 推奨 — lazy + サイズ明記 -->
<img src="photo.webp" loading="lazy" width="400" height="300" alt="..." />
```

### 2-4. CDN配信
- `Cache-Control: public, max-age=31536000, immutable`(コンテンツハッシュURL)。
- `Vary: Accept`(WebP/AVIFネゴシエーション)。
- リサイズCDN(Cloudflare Images・imgix)の活用を検討する。

## 3. よくある間違い
- `width`/`height`の欠落 → CLS発生。
- すべての画像をeager読み込み → 初期読み込みの遅延。
- ヒーロー画像をlazy処理 → LCP悪化。
- 元のJPEG/PNGをそのまま配信 → 帯域の浪費。

## 4. チェックリスト
- [ ] 本番画像をWebP/AVIFに変換し、フォールバックを用意したか
- [ ] ビューポート外の画像をlazy読み込みしているか
- [ ] ヒーロー/LCP画像をpreload + eager + fetchpriorityで処理したか
- [ ] srcset/sizesで解像度を分岐したか
- [ ] すべての画像にwidth/heightを明記してCLSを防いだか
