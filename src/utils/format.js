/**
 * 공용 포맷 헬퍼.
 *
 * 이전: formatNum 이 RepoDrawer / RepoGrid / deliverables 3곳에 중복.
 *       formatDate 도 deliverables 안에 컴포넌트-local 로 정의.
 * 공용화 → 표시 일관성 + 한 곳만 갱신.
 */

/**
 * 큰 수를 K/M 단위로 축약. 1234 → '1.2K', 1000000 → '1.0M'.
 * 값이 null/undefined 면 '—'.
 */
export const formatNum = (n) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

/**
 * ko-KR 천단위 구분 정수 포맷(축약 없음). 1234567 → '1,234,567'.
 * formatNum(K/M 축약)과 별개 — 정확한 정수 표시용. (6+ 컴포넌트의
 * `new Intl.NumberFormat('ko-KR')` 인라인 중복 통합. 호출부의 null/0 가드는 유지.)
 */
export const formatInt = (n) => new Intl.NumberFormat('ko-KR').format(n)

/**
 * 통화 포맷 — 최소 단위(USD 센트 / KRW 원) 정수를 통화 기호 문자열로.
 *
 * [2026-06 USD 전환] BE PricingConfig 가 currency('USD'|'KRW') + 최소단위 정수를 줌.
 *   - USD: 센트 → 달러. $9 (정수면 소수 없음) / $17.10 (센트 있으면 2자리).
 *   - KRW: 원 그대로. ₩9,900 (legacy fallback).
 * @param {number|null} amountMinor 최소 단위 정수 (USD=센트, KRW=원)
 * @param {string} currency 'USD' | 'KRW'
 * @returns {string} 예: '$9', '$17.10', '₩9,900'. null/undefined → '—'.
 */
export const formatCurrency = (amountMinor, currency = 'USD') => {
  if (amountMinor == null) return '—'
  const n = Number(amountMinor) || 0
  if (currency === 'KRW') {
    return `₩${n.toLocaleString('ko-KR')}`
  }
  // USD — 센트를 달러로. 정수 달러면 소수점 생략, 센트 있으면 2자리.
  const dollars = n / 100
  const hasCents = Math.round(n) % 100 !== 0
  const frac = hasCents ? 2 : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(dollars)
}

/**
 * 가격 문자열을 메인부(정수)와 소수부(.99)로 분리 — 카드 UI 에서 소수부만
 * 작게 표시하기 위함. "$9.99"가 통째로 같은 크기면 "$999" 로 잘못 읽힐 수 있어
 * (사용자 피드백) 메인을 크게·소수를 작게 두 단으로 렌더.
 *
 *   '$9.99'    → { main: '$9',     fraction: '.99' }
 *   '$19'      → { main: '$19',    fraction: ''    }
 *   '₩9,900'   → { main: '₩9,900', fraction: ''   }
 *   '무료'      → { main: '무료',    fraction: ''   }
 *
 * 뒤에 단위(예: '/mo')가 붙어도 단위는 main 에 보존. 통화 기호 무관(USD/KRW/JPY 등).
 */
export const splitPriceText = (text) => {
  if (text == null) return { main: '—', fraction: '' }
  const s = String(text)
  // 첫 .NN 을 잡고, 그 뒤 임의 텍스트(단위 등)는 main 에 보존.
  const m = s.match(/^(.*?)(\.\d{1,2})(\D.*)?$/)
  if (!m) return { main: s, fraction: '' }
  const trail = m[3] || ''
  return { main: m[1] + trail, fraction: m[2] }
}

/**
 * 한국 로케일 짧은 날짜시간 — 'YY/MM/DD HH:MM'. ms epoch 입력.
 * 값이 falsy 면 '—'.
 */
export const formatDateKr = (ms) => {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 상대 시간 — '방금/N분 전/N시간 전/N일 전', 30일 초과 시 절대 날짜(ko→ko-KR, else en-US).
 * BatchPanel(ms)·NotionPageList(ISO) 중복 통합. i18n 키는 호출부 네임스페이스 유지(keyPrefix).
 *
 * @param {number|string} value  ms epoch (isIso=false) | ISO 문자열(isIso=true)
 * @param {object} opts
 * @param {Function} opts.t           vue-i18n t
 * @param {string}   opts.locale      i18n locale 코드 ('ko' 면 ko-KR, 그 외 en-US)
 * @param {boolean}  [opts.isIso]     value 가 ISO 문자열인지 (기본 false=ms)
 * @param {string}   opts.keyPrefix   'plan.batch' | 'plan.notion' — `${keyPrefix}.rel_*`
 * @param {boolean}  [opts.showJustNow] 60초 미만 'rel_just_now' 표시 (false 면 최소 '1분 전')
 * @returns {string} 빈/무효 값이면 ''
 */
export const formatRelativeTime = (value, { t, locale, isIso = false, keyPrefix, showJustNow = true } = {}) => {
  const ms = isIso ? new Date(value).getTime() : Number(value)
  if (!ms || Number.isNaN(ms)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (showJustNow && diffSec < 60) return t(`${keyPrefix}.rel_just_now`)
  const diffMin = Math.max(1, Math.floor(diffSec / 60))
  if (diffMin < 60) return t(`${keyPrefix}.rel_minutes_ago`, { n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t(`${keyPrefix}.rel_hours_ago`, { n: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return t(`${keyPrefix}.rel_days_ago`, { n: diffDay })
  try {
    const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US'
    return new Date(ms).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}
