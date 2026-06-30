---
name: Next.js App Router & Rendering Strategies
description: Routing patterns for the Next.js App Router (app/ directory) — Server Components (RSC), Client Components, SSR/SSG/ISR rendering strategies, Route Handlers, and the Metadata API. Read when designing a Next.js project or adding pages and layouts. Keywords: app-router, layout, page, server-component, use-client, generateMetadata, fetch-cache, revalidate.
rules:
  - "Write components as Server Components by default; only add 'use client' when browser APIs, events, useState, or useEffect are required."
  - "Fetch data directly in Server Components; use SWR or TanStack Query in Client Components only when client-side state synchronization is needed."
  - "Define shared UI (nav, footer) in layout.tsx and express dynamic routes as [param] directories."
  - "Export dynamic metadata with generateMetadata and static metadata with the metadata object."
  - "Specify the cache option ('force-cache', 'no-store') and next.revalidate on every fetch to prevent unintended caching."
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

> Standardize routing, Server Components, and rendering strategies for Next.js 13+ App Router projects. Keep the 'use client' boundary minimal to maximize server rendering benefits.

## 1. Core Principles

- Default to Server Components — add 'use client' only when necessary.
- Fetch data in Server Components and pass it down as props — the simplest and most efficient approach.
- Define shared UI in layouts to eliminate duplication.
- Be explicit about fetch caching options to prevent stale data.

## 2. Rules

### 2-1. Server vs Client Component Boundary

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

### 2-2. File System Routing

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

### 2-3. Metadata

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

### 2-4. Fetch Caching Strategies

```tsx
// SSG — cache at build time (static content)
fetch(url, { cache: 'force-cache' })

// SSR — fresh data on every request
fetch(url, { cache: 'no-store' })

// ISR — revalidate every n seconds
fetch(url, { next: { revalidate: 3600 } })
```

## 3. Common Mistakes

- Adding 'use client' to the entire page loses server rendering benefits — apply it only to the smallest scope that needs interactivity.
- Defining event handlers (onClick, etc.) directly in Server Components causes a build error.
- Omitting `children` in layout.tsx prevents child pages from rendering.

## 4. Checklist

- [ ] Are components without interaction, browser APIs, or useState written as Server Components?
- [ ] Does every fetch call specify cache/revalidate options explicitly?
- [ ] Are dynamic routes expressed as [param] directory structures?
- [ ] Is page metadata defined with metadata or generateMetadata?
