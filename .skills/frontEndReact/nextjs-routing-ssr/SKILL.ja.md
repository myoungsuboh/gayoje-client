---
name: Next.js App Router & Rendering Strategies
description: Next.js App Router(app/ ディレクトリ)のルーティングパターン — Server Components (RSC)、Client Components、SSR/SSG/ISR レンダリング戦略、Route Handlers、Metadata API。Next.js プロジェクトを設計するか、ページやレイアウトを追加する際に読む。キーワード: app-router, layout, page, server-component, use-client, generateMetadata, fetch-cache, revalidate。
rules:
  - "コンポーネントはデフォルトで Server Components として記述し、ブラウザ API・イベント・useState・useEffect が必要な場合にのみ 'use client' を追加する。"
  - "データは Server Components で直接フェッチし、クライアント側の状態同期が必要な場合にのみ Client Components で SWR または TanStack Query を使用する。"
  - "共有 UI(ナビゲーション、フッター)は layout.tsx に定義し、動的ルートは [param] ディレクトリとして表現する。"
  - "動的メタデータは generateMetadata で、静的メタデータは metadata オブジェクトでエクスポートする。"
  - "意図しないキャッシュを防ぐため、すべての fetch で cache オプション('force-cache', 'no-store')と next.revalidate を指定する。"
tags:
  - "app-router"
  - "layout"
  - "page"
  - "server-component"
  - "use-client"
  - "generateMetadata"
  - "fetch-cache"
  - "revalidate"
  - "RSC"
  - "SSR"
---

# ▲ Next.js App Router & Rendering Strategies

> Next.js 13+ App Router プロジェクトのルーティング、Server Components、レンダリング戦略を標準化する。サーバーレンダリングの利点を最大化するため、'use client' の境界を最小限に保つ。

## 1. 核心原則

- デフォルトを Server Components とする — 必要な場合にのみ 'use client' を追加する。
- Server Components でデータをフェッチし、props として下に渡す — 最もシンプルで効率的な方法。
- 共有 UI をレイアウトに定義して重複を排除する。
- 古いデータを防ぐため、fetch のキャッシュオプションを明示する。

## 2. ルール

### 2-1. Server vs Client コンポーネントの境界

```tsx
// app/dashboard/page.tsx — Server Component (default)
// No 'use client' → rendered on the server, can fetch data directly

async function DashboardPage() {
  const data = await fetch('https://api.example.com/stats', {
    next: { revalidate: 60 }  // ISR: revalidate every 60 seconds
  }).then(r => r.json())

  return <StatsDisplay data={data} />
}

// app/dashboard/interactive-chart.tsx — Client Component
'use client'
import { useState } from 'react'

export function InteractiveChart({ initialData }) {
  const [filter, setFilter] = useState('week')
  // ...
}
```

### 2-2. ファイルシステムルーティング

```
app/
  layout.tsx          # Root layout (html, body)
  page.tsx            # / route
  dashboard/
    layout.tsx        # Shared layout for /dashboard/*
    page.tsx          # /dashboard
    [id]/
      page.tsx        # /dashboard/:id (dynamic route)
  api/
    users/
      route.ts        # /api/users Route Handler
```

### 2-3. メタデータ

```tsx
// Static metadata
export const metadata = {
  title: 'Dashboard',
  description: 'Project status dashboard',
}

// Dynamic metadata
export async function generateMetadata({ params }) {
  const product = await getProduct(params.id)
  return { title: product.name }
}
```

### 2-4. Fetch キャッシュ戦略

```tsx
// SSG — cache at build time (static content)
fetch(url, { cache: 'force-cache' })

// SSR — fresh data on every request
fetch(url, { cache: 'no-store' })

// ISR — revalidate every n seconds
fetch(url, { next: { revalidate: 3600 } })
```

## 3. よくある間違い

- ページ全体に 'use client' を追加するとサーバーレンダリングの利点が失われる — インタラクティビティが必要な最小スコープにのみ適用する。
- Server Components にイベントハンドラ(onClick など)を直接定義するとビルドエラーになる。
- layout.tsx で `children` を省略すると子ページがレンダリングされない。

## 4. チェックリスト

- [ ] インタラクション、ブラウザ API、useState を持たないコンポーネントは Server Components として記述されているか?
- [ ] すべての fetch 呼び出しが cache/revalidate オプションを明示しているか?
- [ ] 動的ルートは [param] ディレクトリ構造として表現されているか?
- [ ] ページのメタデータは metadata または generateMetadata で定義されているか?
