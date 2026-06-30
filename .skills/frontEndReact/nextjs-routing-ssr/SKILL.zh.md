---
name: Next.js App Router & Rendering Strategies
description: Next.js App Router(app/ 目录)的路由模式 — Server Components (RSC)、Client Components、SSR/SSG/ISR 渲染策略、Route Handlers 以及 Metadata API。在设计 Next.js 项目或添加页面和布局时阅读。关键词: app-router, layout, page, server-component, use-client, generateMetadata, fetch-cache, revalidate。
rules:
  - "默认将组件写成 Server Components；仅在需要浏览器 API、事件、useState 或 useEffect 时才添加 'use client'。"
  - "在 Server Components 中直接获取数据；仅当需要客户端状态同步时才在 Client Components 中使用 SWR 或 TanStack Query。"
  - "在 layout.tsx 中定义共享 UI(导航、页脚)，并将动态路由表示为 [param] 目录。"
  - "用 generateMetadata 导出动态元数据，用 metadata 对象导出静态元数据。"
  - "在每个 fetch 上指定 cache 选项('force-cache', 'no-store')和 next.revalidate，以防止意外缓存。"
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

> 为 Next.js 13+ App Router 项目规范化路由、Server Components 和渲染策略。将 'use client' 边界保持最小，以最大化服务端渲染的收益。

## 1. 核心原则

- 默认使用 Server Components — 仅在必要时才添加 'use client'。
- 在 Server Components 中获取数据并作为 props 向下传递 — 最简单也最高效的方式。
- 在布局中定义共享 UI 以消除重复。
- 明确指定 fetch 的缓存选项以防止数据陈旧。

## 2. 规则

### 2-1. Server 与 Client 组件的边界

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

### 2-2. 文件系统路由

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

### 2-3. 元数据

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

### 2-4. Fetch 缓存策略

```tsx
// SSG — cache at build time (static content)
fetch(url, { cache: 'force-cache' })

// SSR — fresh data on every request
fetch(url, { cache: 'no-store' })

// ISR — revalidate every n seconds
fetch(url, { next: { revalidate: 3600 } })
```

## 3. 常见错误

- 给整个页面添加 'use client' 会丧失服务端渲染的收益 — 只在需要交互的最小范围内应用它。
- 在 Server Components 中直接定义事件处理器(onClick 等)会导致构建错误。
- 在 layout.tsx 中省略 `children` 会导致子页面无法渲染。

## 4. 检查清单

- [ ] 没有交互、浏览器 API 或 useState 的组件是否写成了 Server Components?
- [ ] 每个 fetch 调用是否明确指定了 cache/revalidate 选项?
- [ ] 动态路由是否表示为 [param] 目录结构?
- [ ] 页面元数据是否用 metadata 或 generateMetadata 定义?
