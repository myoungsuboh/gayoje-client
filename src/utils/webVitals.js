/**
 * Web Vitals 측정 — native PerformanceObserver만 사용 (외부 라이브러리 X).
 *
 * 측정 지표:
 *   LCP (Largest Contentful Paint) — 가장 큰 콘텐츠 렌더 시점 (good < 2500ms)
 *   FCP (First Contentful Paint)   — 첫 콘텐츠 렌더 (good < 1800ms)
 *   CLS (Cumulative Layout Shift)  — 레이아웃 이동 누적값 (good < 0.1)
 *   INP (Interaction to Next Paint)— 상호작용 응답성 (good < 200ms, P98 기반 근사)
 *   TTFB (Time to First Byte)      — navigation 응답 시작 (good < 800ms)
 *
 * 정책:
 *   - 페이지당 1회 측정 → localStorage 누적 (route + timestamp + values)
 *   - 최대 200건 보관 (FIFO 회전)
 *   - SSR/server-rendered 환경에서는 안전하게 no-op
 *   - 환경변수 VITE_WEB_VITALS=true 일 때만 활성 (옵션, 기본 활성)
 *
 * 호출:
 *   import { startVitals } from '@/utils/webVitals'
 *   startVitals({ onMetric: (m) => console.log(m) })
 */

const STORAGE_KEY = 'gayoje_web_vitals_v1'
const MAX_RECORDS = 200

// 지표별 thresholds
export const VITALS_THRESHOLDS = {
  LCP:  { good: 2500, needs: 4000 },
  FCP:  { good: 1800, needs: 3000 },
  CLS:  { good: 0.1,  needs: 0.25 },
  INP:  { good: 200,  needs: 500  },
  TTFB: { good: 800,  needs: 1800 },
}

export const rateMetric = (name, value) => {
  const t = VITALS_THRESHOLDS[name]
  if (!t || value == null) return 'unknown'
  if (value <= t.good) return 'good'
  if (value <= t.needs) return 'needs-improvement'
  return 'poor'
}

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

const saveHistory = (list) => {
  try {
    const trimmed = list.slice(-MAX_RECORDS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {}
}

export const getVitalsHistory = () => loadHistory()
export const clearVitalsHistory = () => { try { localStorage.removeItem(STORAGE_KEY) } catch {} }

const recordMetric = (name, value, route) => {
  const list = loadHistory()
  list.push({
    name,
    value: Math.round(value * 1000) / 1000,
    rating: rateMetric(name, value),
    route: route || (typeof location !== 'undefined' ? location.pathname : ''),
    at: Date.now(),
  })
  saveHistory(list)
}

let _started = false

export const startVitals = ({ onMetric, route } = {}) => {
  if (_started) return
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return
  _started = true

  const emit = (name, value) => {
    recordMetric(name, value, route)
    if (typeof onMetric === 'function') {
      onMetric({ name, value, rating: rateMetric(name, value), at: Date.now() })
    }
  }

  // ─── LCP ─────────────────────────────────────────────────
  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) emit('LCP', last.renderTime || last.loadTime || last.startTime)
    })
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true })
    // 페이지 hide 시 최종 LCP 기록
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { lcpObs.takeRecords() } catch {}
        try { lcpObs.disconnect() } catch {}
      }
    }, { once: true })
  } catch {}

  // ─── FCP ─────────────────────────────────────────────────
  try {
    const fcpObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') {
          emit('FCP', e.startTime)
          try { fcpObs.disconnect() } catch {}
          break
        }
      }
    })
    fcpObs.observe({ type: 'paint', buffered: true })
  } catch {}

  // ─── CLS ─────────────────────────────────────────────────
  try {
    let cls = 0
    let sessionValue = 0
    let sessionEntries = []
    const clsObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue
        const first = sessionEntries[0]
        const last = sessionEntries[sessionEntries.length - 1]
        if (sessionEntries.length && (e.startTime - last.startTime < 1000) && (e.startTime - first.startTime < 5000)) {
          sessionValue += e.value
          sessionEntries.push(e)
        } else {
          sessionValue = e.value
          sessionEntries = [e]
        }
        if (sessionValue > cls) cls = sessionValue
      }
    })
    clsObs.observe({ type: 'layout-shift', buffered: true })
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { clsObs.takeRecords() } catch {}
        emit('CLS', cls)
        try { clsObs.disconnect() } catch {}
      }
    }, { once: true })
  } catch {}

  // ─── INP (근사: event-timing의 최대값) ───────────────────
  try {
    let maxDuration = 0
    const inpObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.interactionId && e.duration > maxDuration) {
          maxDuration = e.duration
        }
      }
    })
    inpObs.observe({ type: 'event', durationThreshold: 16, buffered: true })
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { inpObs.takeRecords() } catch {}
        if (maxDuration > 0) emit('INP', maxDuration)
        try { inpObs.disconnect() } catch {}
      }
    }, { once: true })
  } catch {}

  // ─── TTFB (Navigation Timing) ────────────────────────────
  try {
    const navs = performance.getEntriesByType('navigation')
    const nav = navs && navs[0]
    if (nav && nav.responseStart >= 0) emit('TTFB', nav.responseStart)
  } catch {}
}
