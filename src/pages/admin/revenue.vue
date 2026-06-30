<script setup>
/**
 * Admin Revenue — 일/월/년 수익 대시보드.
 *
 * [표시 항목]
 * 카드 (요약): 현재 MRR / 순이익 / 활성 구독자 / ARPU
 * 등급 분포 표: tier × subscribers × tokens
 * 차트: 연간 12개월 — 매출/원가/순이익 라인 (Chart.js)
 * 표: 월별 상세
 * 인프라 비용 관리: 이번달 admin 입력
 *
 * [2026-05 정확화]
 * - 매출: SubscriptionChange 이력 기반 — 각 달 말일 시점 실제 구독했던 사용자만.
 * - LLM 원가: 현재 달만 추적 가능 (월간 reset 정책). 과거 달은 "—" 표시.
 *   * BE 응답의 llm_cost_tracked 플래그로 분기.
 * - 차트의 원가 라인도 과거 달은 LLM 제외, 인프라만 표시.
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { formatInt } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, TrendingUp, Users, Coins, Wallet, Loader2, AlertCircle,
  RefreshCw, ChevronLeft, ChevronRight, Save, Info, Plus, Trash2, Printer,
  Repeat, Image as ImageIcon,
} from 'lucide-vue-next'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { verifyToken } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import {
  fetchRevenueSummaryApi, fetchRevenueYearlyApi, fetchRevenueDailyApi,
  fetchInfraCostApi, upsertInfraCostApi,
} from '@/utils/revenue'
import { getTierLabel, getTierMeta, isPaidTier } from '@/utils/subscription'

// Chart.js 등록 — global 1회.
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
)

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}

// ─── 상태 ─────────────────────────────────────────
const summary = ref(null)
const yearly = ref(null)
const daily = ref(null)               // [2026-05-18] 일별 매출
const dailyRange = ref(30)            // 최근 N일 (30 / 60 / 90)
const isLoading = ref(true)
const errorMsg = ref('')

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

// 인프라 비용 폼 (항목별)
// 카테고리 프리셋 — datalist 제안용. 직접 입력도 허용(자유 문자열, DB 저장값).
const INFRA_CATEGORIES = [
  '서버 운영비', 'LLM API 비용', '데이터베이스', '도메인·SSL',
  '지적재산·등록비', '결제 수수료', '기타',
]
// fixed: '고정 비용'(매월 반복) 표식 — 폼 단위 transient. '일괄 적용' 시 대상 월들에 전파.
const newInfraItem = () => ({ category: '서버 운영비', amount_krw: 0, note: '', fixed: false })
const infraCost = ref(null)
const infraForm = ref({ items: [newInfraItem()], note: '' })
const infraSubmitting = ref(false)
const fixedThroughMonth = ref(12)   // 고정 항목을 몇 월까지 적용할지
const applyingFixed = ref(false)
const infraTotal = computed(() =>
  (infraForm.value.items || []).reduce((s, it) => s + Math.max(0, Number(it.amount_krw) || 0), 0),
)
const addInfraItem = () => { infraForm.value.items.push(newInfraItem()) }
const removeInfraItem = (i) => {
  infraForm.value.items.splice(i, 1)
  if (infraForm.value.items.length === 0) infraForm.value.items.push(newInfraItem())
}

// 폼 항목 → 저장 형태(빈 항목 제외). fixed(고정비) 플래그도 보존해 BE 에 영속화.
const _normItems = (items) => (items || [])
  .map((it) => ({
    category: (it.category || '').trim() || '기타',
    amount_krw: Math.max(0, Number(it.amount_krw) || 0),
    note: (it.note || '').trim(),
    fixed: !!it.fixed,
  }))
  .filter((it) => it.amount_krw > 0 || it.note)

// 고정 항목을 base 에 병합 — 같은 카테고리는 교체, 없으면 추가.
const _mergeFixed = (base, fixed) => {
  const out = base.map((b) => ({ ...b }))
  for (const f of fixed) {
    const idx = out.findIndex((b) => b.category === f.category)
    if (idx >= 0) out[idx] = { ...f }
    else out.push({ ...f })
  }
  return out
}

// 월별 상세 표에서 월 클릭 → 그 달 로드 + 인프라 관리로 스크롤.
const selectInfraMonth = (m) => {
  selectedMonth.value = m
  nextTick(() => {
    document.querySelector('.rv-section--infra')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// 고정 항목 일괄 적용 — 현재 달부터 지정 월까지 매월 병합 저장.
const applyFixedToMonths = async () => {
  const fixed = _normItems((infraForm.value.items || []).filter((it) => it.fixed))
  if (!fixed.length) { showError?.(t('admin.revenue.infra_fixed_none')); return }
  const fromM = selectedMonth.value
  const toM = Math.min(12, Math.max(fromM, Number(fixedThroughMonth.value) || fromM))
  applyingFixed.value = true
  let applied = 0
  try {
    for (let m = fromM; m <= toM; m++) {
      let base = []
      let note = ''
      if (m === fromM) {
        base = _normItems(infraForm.value.items)   // 현재 달은 화면 항목(미저장 포함) 기준
        note = (infraForm.value.note || '').trim()
      } else {
        const r = await fetchInfraCostApi(selectedYear.value, m)
        if (r.success && r.data) {
          if (Array.isArray(r.data.items) && r.data.items.length) {
            base = r.data.items.map((it) => ({ category: it.category || '기타', amount_krw: Number(it.amount_krw) || 0, note: it.note || '', fixed: !!it.fixed }))
          } else if (Number(r.data.amount_krw) > 0) {
            // 옛 데이터(항목 없이 lump 금액만) — 덮어쓰지 않도록 1개 항목으로 보존
            base = [{ category: '기존 비용', amount_krw: Number(r.data.amount_krw) || 0, note: r.data.note || '', fixed: false }]
          }
          note = r.data.note || ''
        }
      }
      const merged = _mergeFixed(base, fixed)
      const ur = await upsertInfraCostApi({
        year: selectedYear.value, month: m,
        amount_krw: merged.reduce((s, it) => s + it.amount_krw, 0),
        note, items: merged,
      })
      if (ur.success) applied++
    }
  } finally {
    applyingFixed.value = false
  }
  await loadInfraCost()
  await Promise.all([loadSummary(), loadYearly()])
  showSuccess?.(t('admin.revenue.infra_fixed_done', { from: fromM, to: toM, count: applied }))
}

const fmt = (n) => {
  if (n == null) return '-'
  return formatInt(n)
}

const fmtKRW = (n) => {
  if (n == null) return '-'
  return `₩${formatInt(n)}`
}

// ─── 데이터 로드 ───────────────────────────────────
const loadSummary = async () => {
  const r = await fetchRevenueSummaryApi()
  if (r.success) summary.value = r.data
  else errorMsg.value = r.error
}

const loadYearly = async () => {
  const r = await fetchRevenueYearlyApi(selectedYear.value)
  if (r.success) yearly.value = r.data
}

const loadDaily = async () => {
  const r = await fetchRevenueDailyApi(dailyRange.value)
  if (r.success) daily.value = r.data
}

const loadInfraCost = async () => {
  const r = await fetchInfraCostApi(selectedYear.value, selectedMonth.value)
  if (r.success && r.data) {
    infraCost.value = r.data
    const items = Array.isArray(r.data.items) ? r.data.items : []
    if (items.length > 0) {
      infraForm.value = {
        items: items.map((it) => ({
          category: it.category || '기타',
          amount_krw: Number(it.amount_krw) || 0,
          note: it.note || '',
          fixed: !!it.fixed,
        })),
        note: r.data.note || '',
      }
    } else {
      // 옛 데이터(뭉텅이 금액) → 단일 '기타' 항목으로 표시 (하위호환)
      infraForm.value = {
        items: [{ category: '기타', amount_krw: Number(r.data.amount_krw) || 0, note: '', fixed: false }],
        note: r.data.note || '',
      }
    }
  } else {
    infraCost.value = null
    infraForm.value = { items: [newInfraItem()], note: '' }
  }
}

const reload = async () => {
  isLoading.value = true
  errorMsg.value = ''
  await Promise.all([loadSummary(), loadYearly(), loadDaily(), loadInfraCost()])
  isLoading.value = false
}

const reloadDaily = async () => {
  await loadDaily()
}

// ─── 인프라 비용 저장 ─────────────────────────────
const saveInfraCost = async () => {
  infraSubmitting.value = true
  // 빈 항목(금액 0 + 메모 없음)은 제외. 카테고리 비면 '기타'. fixed 플래그 보존.
  const items = _normItems(infraForm.value.items)
  const r = await upsertInfraCostApi({
    year: selectedYear.value,
    month: selectedMonth.value,
    amount_krw: infraTotal.value, // BE 가 합계로 재계산하지만 일관성 위해 함께 전달
    note: (infraForm.value.note || '').trim(),
    items,
  })
  infraSubmitting.value = false
  if (!r.success) {
    showError?.(r.error || t('admin.revenue.toast_infra_save_failed'))
    return
  }
  infraCost.value = r.data
  showSuccess?.(t('admin.revenue.toast_infra_saved', { year: selectedYear.value, month: selectedMonth.value }))
  // 수익 요약/연간 모두 갱신 (인프라 비용 반영)
  await Promise.all([loadSummary(), loadYearly()])
}

// ─── 명세서 인쇄 (새 창에 자기완결 HTML — 스코프 CSS 충돌 회피) ──────────
const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
))
const printInfraReceipt = () => {
  const y = selectedYear.value
  const m = selectedMonth.value
  const items = (infraForm.value.items || []).filter(
    (it) => (Number(it.amount_krw) || 0) > 0 || (it.note || '').trim(),
  )
  if (items.length === 0) {
    showError?.(t('admin.revenue.infra_no_items'))
    return
  }
  const total = infraTotal.value
  const today = new Date().toISOString().slice(0, 10)
  const L = {
    title: t('admin.revenue.infra_receipt_title'),
    period: t('admin.revenue.infra_receipt_period'),
    item: t('admin.revenue.infra_receipt_item'),
    amount: t('admin.revenue.infra_receipt_amount'),
    memo: t('admin.revenue.infra_receipt_memo'),
    total: t('admin.revenue.infra_total'),
    issued: t('admin.revenue.infra_receipt_issued'),
    issuer: t('admin.revenue.infra_receipt_issuer'),
  }
  const rows = items.map((it, i) => (
    `<tr><td class="c">${i + 1}</td><td>${_esc(it.category)}</td>`
    + `<td class="r">₩${fmt(it.amount_krw)}</td><td>${_esc(it.note)}</td></tr>`
  )).join('')
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">`
    + `<title>${_esc(L.title)} ${y}-${String(m).padStart(2, '0')}</title><style>`
    + `*{font-family:'Pretendard',-apple-system,sans-serif;box-sizing:border-box}`
    + `body{margin:0;padding:48px;color:#2A2421;background:#fff}.doc{max-width:720px;margin:0 auto}`
    + `.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #8C6239;padding-bottom:14px}`
    + `.brand{font-size:22px;font-weight:800;color:#8C6239}.doc-title{font-size:15px;font-weight:700;color:#6F665F}`
    + `.period{font-size:13px;color:#6F665F;margin:16px 0 18px}`
    + `table{width:100%;border-collapse:collapse;font-size:13px}`
    + `th{background:#F7F2E3;color:#6F665F;font-weight:700;text-align:left;padding:10px 12px;border-bottom:1px solid #e6ddc9}`
    + `td{padding:10px 12px;border-bottom:1px solid #f0ead9}`
    + `td.c,th.c{text-align:center;width:44px}td.r,th.r{text-align:right;white-space:nowrap}`
    + `tfoot td{font-weight:800;font-size:15px;border-top:2px solid #8C6239;border-bottom:none}`
    + `.foot{margin-top:28px;font-size:12px;color:#A89B91;display:flex;justify-content:space-between}`
    + `@media print{body{padding:24px}}`
    + `</style></head><body><div class="doc">`
    + `<div class="head"><div class="brand">Harness</div><div class="doc-title">${_esc(L.title)}</div></div>`
    + `<div class="period">${_esc(L.period)}: <b>${y}-${String(m).padStart(2, '0')}</b></div>`
    + `<table><thead><tr><th class="c">#</th><th>${_esc(L.item)}</th><th class="r">${_esc(L.amount)}</th><th>${_esc(L.memo)}</th></tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `<tfoot><tr><td></td><td>${_esc(L.total)}</td><td class="r">₩${fmt(total)}</td><td></td></tr></tfoot></table>`
    + `<div class="foot"><span>${_esc(L.issued)}: ${today}</span><span>${_esc(L.issuer)}</span></div>`
    + `</div></body></html>`
  const w = window.open('', '_blank', 'width=820,height=920')
  if (!w) {
    showError?.(t('admin.revenue.infra_popup_blocked'))
    return
  }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch (e) { /* noop */ } }, 350)
}

// ─── 명세서 이미지(PNG) 다운로드 (캔버스 — 의존성 없이 한글 렌더) ──────────
const downloadInfraReceiptPng = () => {
  const items = (infraForm.value.items || []).filter(
    (it) => (Number(it.amount_krw) || 0) > 0 || (it.note || '').trim(),
  )
  if (items.length === 0) { showError?.(t('admin.revenue.infra_no_items')); return }
  const y = selectedYear.value
  const m = selectedMonth.value
  const total = infraTotal.value
  const today = new Date().toISOString().slice(0, 10)
  const FONT = "'Pretendard', 'Malgun Gothic', sans-serif"
  const W = 760, PAD = 40, rowH = 40, topH = 132, theadH = 40, totalH = 48, footH = 64
  const H = topH + theadH + items.length * rowH + totalH + footH
  const scale = Math.min(3, (window.devicePixelRatio || 1) * 2)
  const cv = document.createElement('canvas')
  cv.width = Math.round(W * scale); cv.height = Math.round(H * scale)
  const ctx = cv.getContext('2d')
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
  // 헤더
  ctx.fillStyle = '#8C6239'; ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'left'
  ctx.fillText('Harness', PAD, 56)
  ctx.fillStyle = '#6F665F'; ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'right'
  ctx.fillText(t('admin.revenue.infra_receipt_title'), W - PAD, 54)
  ctx.strokeStyle = '#8C6239'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(PAD, 72); ctx.lineTo(W - PAD, 72); ctx.stroke()
  ctx.fillStyle = '#6F665F'; ctx.font = `400 13px ${FONT}`; ctx.textAlign = 'left'
  ctx.fillText(`${t('admin.revenue.infra_receipt_period')}: ${y}-${String(m).padStart(2, '0')}`, PAD, 104)
  const noX = PAD, itemX = PAD + 34, amountRX = 540, memoX = 558, memoMaxX = W - PAD, itemMaxX = amountRX - 96
  const trunc = (txt, maxW) => {
    txt = String(txt || '')
    if (ctx.measureText(txt).width <= maxW) return txt
    while (txt.length && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1)
    return txt + '…'
  }
  let ty = topH
  ctx.fillStyle = '#F7F2E3'; ctx.fillRect(PAD, ty, W - PAD * 2, theadH)
  ctx.fillStyle = '#6F665F'; ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'left'
  ctx.fillText('#', noX + 4, ty + 26)
  ctx.fillText(t('admin.revenue.infra_receipt_item'), itemX, ty + 26)
  ctx.textAlign = 'right'; ctx.fillText(t('admin.revenue.infra_receipt_amount'), amountRX, ty + 26)
  ctx.textAlign = 'left'; ctx.fillText(t('admin.revenue.infra_receipt_memo'), memoX, ty + 26)
  ty += theadH
  ctx.font = `400 13px ${FONT}`
  items.forEach((it, i) => {
    ctx.fillStyle = '#2A2421'; ctx.textAlign = 'left'
    ctx.fillText(String(i + 1), noX + 4, ty + 25)
    ctx.fillText(trunc(it.category, itemMaxX - itemX), itemX, ty + 25)
    ctx.textAlign = 'right'; ctx.fillText('₩' + fmt(it.amount_krw), amountRX, ty + 25)
    ctx.textAlign = 'left'; ctx.fillStyle = '#6F665F'
    ctx.fillText(trunc(it.note, memoMaxX - memoX), memoX, ty + 25)
    ctx.strokeStyle = '#f0ead9'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, ty + rowH); ctx.lineTo(W - PAD, ty + rowH); ctx.stroke()
    ty += rowH
  })
  ctx.strokeStyle = '#8C6239'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, ty); ctx.lineTo(W - PAD, ty); ctx.stroke()
  ctx.fillStyle = '#2A2421'; ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'left'
  ctx.fillText(t('admin.revenue.infra_total'), itemX, ty + 31)
  ctx.textAlign = 'right'; ctx.fillText('₩' + fmt(total), amountRX, ty + 31)
  ty += totalH
  ctx.fillStyle = '#A89B91'; ctx.font = `400 11px ${FONT}`; ctx.textAlign = 'left'
  ctx.fillText(`${t('admin.revenue.infra_receipt_issued')}: ${today}`, PAD, ty + 28)
  ctx.textAlign = 'right'; ctx.fillText(t('admin.revenue.infra_receipt_issuer'), W - PAD, ty + 28)
  cv.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `infra-${y}-${String(m).padStart(2, '0')}.png`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

// ─── 월 / 년 변경 시 재조회 ────────────────────────
watch([selectedYear, selectedMonth], () => {
  loadInfraCost()
})
watch(selectedYear, () => {
  loadYearly()
})

const goPrevYear = () => { selectedYear.value -= 1 }
const goNextYear = () => { selectedYear.value += 1 }

// ─── Chart.js 데이터 ──────────────────────────────
const chartData = computed(() => {
  if (!yearly.value?.months) return null
  const labels = yearly.value.months.map(m => t('admin.revenue.chart_month_suffix', { month: m.month }))
  return {
    labels,
    datasets: [
      {
        label: t('admin.revenue.chart_mrr'),
        data: yearly.value.months.map(m => m.mrr_krw),
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13, 148, 136, 0.15)',
        fill: true,
        tension: 0.3,
      },
      {
        // 원가 = LLM(추적 가능한 달만) + 인프라. 과거 달의 LLM 은 추적 불가이므로
        // tracked=false 면 인프라만 표시 (LLM 비공개).
        label: t('admin.revenue.chart_cost'),
        data: yearly.value.months.map(m =>
          m.llm_cost_tracked ? m.llm_cost_krw + m.infra_cost_krw : m.infra_cost_krw,
        ),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.10)',
        fill: false,
        tension: 0.3,
      },
      {
        label: t('admin.revenue.chart_profit'),
        data: yearly.value.months.map(m => m.profit_krw),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.15)',
        fill: false,
        tension: 0.3,
        borderDash: [5, 5],
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top', labels: { font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ₩${formatInt(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value) => `₩${formatInt(value)}`,
        font: { size: 10 },
      },
    },
    x: { ticks: { font: { size: 10 } } },
  },
}

// [2026-05-18] 일별 매출 차트 — Payment 노드 기반 실 매출
const dailyChartData = computed(() => {
  if (!daily.value?.days) return null
  const days = daily.value.days
  // 라벨: 'MM-DD' (월-일만, 공간 절약)
  const labels = days.map(d => (d.date || '').slice(5))
  return {
    labels,
    datasets: [
      {
        label: t('admin.revenue.chart_daily_net'),
        data: days.map(d => d.net_revenue),
        borderColor: '#15803D',
        backgroundColor: 'rgba(21, 128, 61, 0.12)',
        borderWidth: 2, tension: 0.25, fill: true,
        pointRadius: 2, pointHoverRadius: 4,
      },
      {
        label: t('admin.revenue.chart_daily_gross'),
        data: days.map(d => d.gross_paid),
        borderColor: '#8C6239',
        backgroundColor: 'rgba(140, 98, 57, 0.06)',
        borderWidth: 1.5, tension: 0.25, fill: false,
        pointRadius: 1, pointHoverRadius: 3, borderDash: [3, 3],
      },
      {
        label: t('admin.revenue.chart_daily_refund'),
        data: days.map(d => d.total_refunded),
        borderColor: '#B91C1C',
        backgroundColor: 'rgba(185, 28, 28, 0.08)',
        borderWidth: 1.5, tension: 0.25, fill: false,
        pointRadius: 1, pointHoverRadius: 3,
      },
    ],
  }
})

// ─── 진입 시 권한 + 로드 ───────────────────────────
onMounted(async () => {
  const r = await verifyToken()
  if (!r.valid || !r.user?.is_admin) {
    router.replace('/plan')
    return
  }
  await reload()
})
</script>

<template>
  <div class="page-root revenue-page">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <header class="page-header">
      <h1 class="page-title">
        <TrendingUp :size="22" class="mr-2" />{{ $t('admin.revenue.title') }}
      </h1>
      <p class="page-sub text-muted" v-html="$t('admin.revenue.subtitle_html')"></p>
    </header>

    <!-- 로딩 / 에러 -->
    <div v-if="isLoading" class="rv-loading">
      <Loader2 :size="20" class="spin mr-2" />
      <span>{{ $t('admin.revenue.loading') }}</span>
    </div>
    <div v-else-if="errorMsg" class="rv-error">
      <AlertCircle :size="16" class="mr-2" />{{ errorMsg }}
      <button class="rv-retry" @click="reload"><RefreshCw :size="12" /> {{ $t('admin.revenue.retry') }}</button>
    </div>

    <template v-else>
      <!-- 요약 카드 4개 -->
      <div class="rv-summary-grid">
        <div class="rv-card rv-card--revenue">
          <div class="rv-card-label"><Wallet :size="14" class="mr-1" />{{ $t('admin.revenue.card_revenue') }}</div>
          <div class="rv-card-value">{{ fmtKRW(summary?.actual_revenue_krw) }}</div>
          <div class="rv-card-sub">
            {{ $t('admin.revenue.card_revenue_sub_payments', { count: fmt(summary?.payment_count) }) }}
            <span v-if="summary?.actual_refund_krw > 0">{{ $t('admin.revenue.card_revenue_sub_refund', { amount: fmtKRW(summary.actual_refund_krw) }) }}</span>
            <br />
            <span class="text-muted">{{ $t('admin.revenue.card_revenue_sub_mrr', { amount: fmtKRW(summary?.mrr_krw) }) }}</span>
          </div>
        </div>
        <div class="rv-card" :class="summary?.profit_krw >= 0 ? 'rv-card--profit' : 'rv-card--loss'">
          <div class="rv-card-label"><TrendingUp :size="14" class="mr-1" />{{ $t('admin.revenue.card_profit') }}</div>
          <div class="rv-card-value">{{ fmtKRW(summary?.profit_krw) }}</div>
          <div class="rv-card-sub">
            {{ $t('admin.revenue.card_profit_sub', { llm: fmtKRW(summary?.llm_cost_krw), infra: fmtKRW(summary?.infra_cost_krw) }) }}
          </div>
        </div>
        <div class="rv-card rv-card--subs">
          <div class="rv-card-label"><Users :size="14" class="mr-1" />{{ $t('admin.revenue.card_subs') }}</div>
          <div class="rv-card-value">{{ fmt(summary?.total_subscribers) }} <small>{{ $t('admin.revenue.card_subs_unit') }}</small></div>
          <div class="rv-card-sub">{{ $t('admin.revenue.card_subs_sub', { total: fmt(summary?.total_users), rate: summary?.total_users ? Math.round((summary.total_subscribers / summary.total_users) * 100) : 0 }) }}
          </div>
        </div>
        <div class="rv-card rv-card--arpu">
          <div class="rv-card-label"><Coins :size="14" class="mr-1" />{{ $t('admin.revenue.card_arpu') }}</div>
          <div class="rv-card-value">{{ fmtKRW(summary?.arpu_krw) }}</div>
          <div class="rv-card-sub">{{ $t('admin.revenue.card_arpu_sub') }}</div>
        </div>
      </div>

      <!-- 등급 분포 -->
      <section class="rv-section">
        <h2 class="rv-section-title">{{ $t('admin.revenue.tier_dist') }}</h2>
        <table class="rv-table">
          <thead>
            <tr>
              <th>{{ $t('admin.revenue.col_tier') }}</th>
              <th class="num">{{ $t('admin.revenue.col_subscribers') }}</th>
              <th class="num">{{ $t('admin.revenue.col_period_tokens') }}</th>
              <th class="num">{{ $t('admin.revenue.col_token_cost') }}</th>
              <th class="num">{{ $t('admin.revenue.col_tier_revenue') }}</th>
              <th class="num" :title="$t('admin.revenue.tier_margin_hint')">{{ $t('admin.revenue.col_tier_margin') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in summary?.breakdown || []" :key="b.tier">
              <td>
                <span
                  class="rv-tier-pill"
                  :style="isPaidTier(b.tier) ? { background: getTierMeta(b.tier).gradient, color: '#fff' } : null"
                >{{ getTierLabel(b.tier) }}</span>
              </td>
              <td class="num">{{ fmt(b.subscribers) }}</td>
              <td class="num">{{ fmt(b.total_tokens) }}</td>
              <!-- LLM 원가는 BE(단일 출처) 값 사용. 무배포창 대비 단가 폴백(1,250원/M). -->
              <td class="num">{{ fmtKRW(b.llm_cost_krw ?? Math.round(b.total_tokens * 1250 / 1_000_000)) }}</td>
              <td class="num">{{ fmtKRW(b.revenue_krw) }}</td>
              <td class="num" :class="(b.profit_krw ?? 0) >= 0 ? 'rv-profit' : 'rv-loss'">{{ fmtKRW(b.profit_krw) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 연간 차트 -->
      <!-- [2026-05-18] 일별 매출 차트 — Payment 노드 기반 실 매출 -->
      <section class="rv-section">
        <div class="rv-section-header">
          <h2 class="rv-section-title">{{ $t('admin.revenue.daily_title') }}</h2>
          <div class="rv-daily-nav">
            <button
              v-for="opt in [30, 60, 90]" :key="opt"
              class="rv-range-btn"
              :class="{ 'rv-range-btn--active': dailyRange === opt }"
              @click="dailyRange = opt; reloadDaily()"
            >{{ $t('admin.revenue.range_recent', { days: opt }) }}</button>
          </div>
        </div>
        <div v-if="daily" class="rv-daily-summary">
          <span class="rv-daily-stat">
            <strong>{{ fmtKRW(daily.total_net_revenue) }}</strong>
            <small>{{ $t('admin.revenue.daily_net', { start: daily.start_date, end: daily.end_date }) }}</small>
          </span>
          <span class="rv-daily-stat">
            <strong>{{ $t('admin.revenue.daily_pay_count', { count: fmt(daily.total_pay_count) }) }}</strong>
            <small>{{ $t('admin.revenue.daily_gross') }}</small>
          </span>
          <span v-if="daily.total_refunded > 0" class="rv-daily-stat rv-daily-stat--refund">
            <strong>-{{ fmtKRW(daily.total_refunded) }}</strong>
            <small>{{ $t('admin.revenue.daily_refund') }}</small>
          </span>
        </div>
        <div class="rv-chart-box">
          <Line v-if="dailyChartData" :data="dailyChartData" :options="chartOptions" />
        </div>
      </section>

      <section class="rv-section">
        <div class="rv-section-header">
          <h2 class="rv-section-title">{{ $t('admin.revenue.yearly_title') }}</h2>
          <div class="rv-year-nav">
            <button class="rv-nav-btn" @click="goPrevYear" :title="$t('admin.revenue.prev_year')"><ChevronLeft :size="14" /></button>
            <span class="rv-year-label">{{ $t('admin.revenue.year_label', { year: selectedYear }) }}</span>
            <button class="rv-nav-btn" @click="goNextYear" :disabled="selectedYear >= now.getFullYear()" :title="$t('admin.revenue.next_year')"><ChevronRight :size="14" /></button>
          </div>
        </div>
        <div class="rv-chart-box">
          <Line v-if="chartData" :data="chartData" :options="chartOptions" />
        </div>
      </section>

      <!-- 월별 표 -->
      <section class="rv-section">
        <h2 class="rv-section-title">{{ $t('admin.revenue.monthly_detail', { year: selectedYear }) }}</h2>
        <table class="rv-table">
          <thead>
            <tr>
              <th>{{ $t('admin.revenue.col_month') }}</th>
              <th class="num">{{ $t('admin.revenue.col_mrr') }}</th>
              <th class="num">{{ $t('admin.revenue.col_llm_cost') }}</th>
              <th class="num">{{ $t('admin.revenue.col_infra') }}</th>
              <th class="num">{{ $t('admin.revenue.col_profit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in yearly?.months || []"
              :key="m.month"
              class="rv-row--click"
              :class="{ 'rv-row--current': m.month === selectedMonth }"
              :title="$t('admin.revenue.infra_month_select')"
              @click="selectInfraMonth(m.month)"
            >
              <td>{{ $t('admin.revenue.month_label', { month: m.month }) }}</td>
              <td class="num">{{ fmtKRW(m.mrr_krw) }}</td>
              <td class="num">
                <span v-if="m.llm_cost_tracked">{{ fmtKRW(m.llm_cost_krw) }}</span>
                <span v-else class="text-muted" :title="$t('admin.revenue.llm_untracked_title')">—</span>
              </td>
              <td class="num">{{ fmtKRW(m.infra_cost_krw) }}</td>
              <td class="num" :class="m.profit_krw >= 0 ? 'rv-profit' : 'rv-loss'">
                {{ fmtKRW(m.profit_krw) }}
              </td>
            </tr>
            <tr class="rv-row--total">
              <td><strong>{{ $t('admin.revenue.total') }}</strong></td>
              <td class="num"><strong>{{ fmtKRW(yearly?.total_mrr_krw) }}</strong></td>
              <td class="num"><strong>{{ fmtKRW(yearly?.total_llm_cost_krw) }}</strong></td>
              <td class="num"><strong>{{ fmtKRW(yearly?.total_infra_cost_krw) }}</strong></td>
              <td class="num" :class="yearly?.total_profit_krw >= 0 ? 'rv-profit' : 'rv-loss'">
                <strong>{{ fmtKRW(yearly?.total_profit_krw) }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 인프라 비용 입력 -->
      <section class="rv-section rv-section--infra">
        <h2 class="rv-section-title">{{ $t('admin.revenue.infra_title') }}</h2>
        <div class="rv-info-note">
          <Info :size="12" class="mr-1" />
          {{ $t('admin.revenue.infra_note') }}
        </div>
        <!-- 기간 (년/월) -->
        <div class="rv-infra-period">
          <label class="rv-form-field">
            <span>{{ $t('admin.revenue.infra_year') }}</span>
            <input v-model.number="selectedYear" type="number" min="2020" max="2100" class="rv-input" />
          </label>
          <label class="rv-form-field">
            <span>{{ $t('admin.revenue.infra_month') }}</span>
            <input v-model.number="selectedMonth" type="number" min="1" max="12" class="rv-input" />
          </label>
        </div>

        <!-- 비용 항목 편집 (항목별 분리) -->
        <div class="rv-infra-items">
          <div class="rv-infra-row rv-infra-row--head">
            <span class="rv-fixed-col">{{ $t('admin.revenue.infra_fixed') }}</span>
            <span>{{ $t('admin.revenue.infra_category') }}</span>
            <span>{{ $t('admin.revenue.infra_item_amount') }}</span>
            <span>{{ $t('admin.revenue.infra_item_memo') }}</span>
            <span></span>
          </div>
          <div v-for="(it, i) in infraForm.items" :key="i" class="rv-infra-row" :class="{ 'rv-infra-row--fixed': it.fixed }">
            <label class="rv-fixed-toggle" :title="$t('admin.revenue.infra_fixed_hint')">
              <input type="checkbox" v-model="it.fixed" />
            </label>
            <input
              v-model="it.category"
              list="infra-cat-list"
              class="rv-input"
              :placeholder="$t('admin.revenue.infra_category_placeholder')"
            />
            <input v-model.number="it.amount_krw" type="number" min="0" step="1000" class="rv-input rv-input--num" />
            <input
              v-model="it.note"
              type="text"
              maxlength="200"
              class="rv-input"
              :placeholder="$t('admin.revenue.infra_item_memo_placeholder')"
            />
            <button
              class="rv-row-del"
              type="button"
              :title="$t('admin.revenue.infra_remove_item')"
              @click="removeInfraItem(i)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
          <datalist id="infra-cat-list">
            <option v-for="c in INFRA_CATEGORIES" :key="c" :value="c" />
          </datalist>
          <button class="rv-add-item" type="button" @click="addInfraItem">
            <Plus :size="14" class="mr-1" /> {{ $t('admin.revenue.infra_add_item') }}
          </button>
        </div>

        <!-- 고정비 일괄 적용 -->
        <div class="rv-infra-fixed-bar">
          <Repeat :size="15" class="rv-fixed-bar-icon" />
          <div class="rv-fixed-bar-text">
            <span class="rv-fixed-bar-label">{{ $t('admin.revenue.infra_fixed_apply') }}</span>
            <span class="rv-fixed-bar-hint">{{ $t('admin.revenue.infra_fixed_apply_hint') }}</span>
          </div>
          <div class="rv-fixed-bar-range">
            <strong>{{ $t('admin.revenue.month_label', { month: selectedMonth }) }}</strong>
            <span class="rv-fixed-bar-arrow">→</span>
            <input
              v-model.number="fixedThroughMonth"
              type="number"
              :min="selectedMonth"
              max="12"
              class="rv-input rv-input--mini"
            />
            <span>{{ $t('admin.revenue.infra_fixed_through') }}</span>
          </div>
          <button class="rv-apply-fixed" type="button" :disabled="applyingFixed" @click="applyFixedToMonths">
            <Loader2 v-if="applyingFixed" :size="13" class="spin mr-1" />
            <Repeat v-else :size="13" class="mr-1" />
            {{ $t('admin.revenue.infra_fixed_btn') }}
          </button>
        </div>

        <!-- 월 메모 + 합계 + 액션 -->
        <div class="rv-infra-footer">
          <label class="rv-form-field rv-form-field--note">
            <span>{{ $t('admin.revenue.infra_month_memo') }}</span>
            <input
              v-model="infraForm.note"
              type="text"
              maxlength="500"
              class="rv-input"
              :placeholder="$t('admin.revenue.infra_month_memo_placeholder')"
            />
          </label>
          <div class="rv-infra-total">
            {{ $t('admin.revenue.infra_total') }} <strong>{{ fmtKRW(infraTotal) }}</strong>
          </div>
          <div class="rv-infra-actions">
            <button class="rv-print-btn" type="button" @click="downloadInfraReceiptPng">
              <ImageIcon :size="13" class="mr-1" /> {{ $t('admin.revenue.infra_save_png') }}
            </button>
            <button class="rv-print-btn" type="button" @click="printInfraReceipt">
              <Printer :size="13" class="mr-1" /> {{ $t('admin.revenue.infra_print') }}
            </button>
            <button class="rv-save-btn" :disabled="infraSubmitting" @click="saveInfraCost">
              <Loader2 v-if="infraSubmitting" :size="13" class="spin mr-1" />
              <Save v-else :size="13" class="mr-1" />
              {{ $t('common.action.save') }}
            </button>
          </div>
        </div>
        <div v-if="infraCost" class="rv-infra-status text-muted">
          {{ $t('admin.revenue.infra_last_saved', { date: infraCost.updated_at?.slice(0, 10), by: infraCost.updated_by }) }}
          <span v-if="infraCost.note"> · "{{ infraCost.note }}"</span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.revenue-page { padding: 24px var(--page-pad-x, 32px); max-width: 1400px; margin: 0 auto; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.8rem; cursor: pointer;
  margin-bottom: 18px;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.page-header { margin-bottom: 24px; }
.page-title { display: flex; align-items: center; font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px; }
.page-sub { font-size: 0.85rem; margin: 0; line-height: 1.6; }

.rv-loading, .rv-error {
  display: flex; align-items: center;
  padding: 24px; font-size: 0.85rem;
}
.rv-error { background: #fef2f2; color: #b91c1c; border-radius: 10px; }
.rv-retry {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 4px;
  background: white; border: 1px solid #fca5a5; color: #b91c1c;
  padding: 4px 10px; border-radius: 6px;
  font-size: 0.75rem; cursor: pointer;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── 요약 카드 ─── */
.rv-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.rv-card {
  background: white;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 14px 16px;
}
.rv-card--revenue { border-top: 3px solid #0d9488; }
.rv-card--profit { border-top: 3px solid #10b981; }
.rv-card--loss { border-top: 3px solid #dc2626; }
.rv-card--subs { border-top: 3px solid #7c3aed; }
.rv-card--arpu { border-top: 3px solid #b45309; }

.rv-card-label {
  display: flex; align-items: center;
  font-size: 0.72rem; font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rv-card-value {
  font-size: 1.5rem; font-weight: 800;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  margin: 4px 0 2px;
}
.rv-card-value small { font-size: 0.7rem; font-weight: 500; color: var(--text-muted); margin-left: 2px; }
.rv-card-sub {
  font-size: 0.7rem; color: var(--text-muted);
}

/* ─── 섹션 / 표 ─── */
.rv-section {
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.rv-section-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.rv-section-title {
  font-size: 0.95rem; font-weight: 800;
  color: var(--text-main);
  margin: 0 0 12px;
}
.rv-section-header .rv-section-title { margin: 0; }

.rv-year-nav {
  display: inline-flex; align-items: center; gap: 8px;
}
.rv-nav-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  background: rgba(0,0,0,0.05); border: none; border-radius: 6px;
  cursor: pointer;
}
.rv-nav-btn:hover:not(:disabled) { background: rgba(0,0,0,0.08); }
.rv-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rv-year-label { font-weight: 800; font-size: 0.9rem; min-width: 70px; text-align: center; }

/* [2026-05-18] 일별 매출 차트 */
.rv-daily-nav { display: inline-flex; gap: 4px; }
.rv-range-btn {
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  padding: 4px 10px; border-radius: 6px;
  font-size: 0.72rem; font-weight: 700; cursor: pointer;
  color: var(--text-muted);
}
.rv-range-btn:hover { background: rgba(0,0,0,0.04); }
.rv-range-btn--active {
  background: var(--accent, #8C6239); color: white;
  border-color: var(--accent, #8C6239);
}

.rv-daily-summary {
  display: flex; gap: 24px; flex-wrap: wrap;
  padding: 10px 14px; margin: 8px 0 12px;
  background: var(--bg-light, #F7F5EB); border-radius: 8px;
}
.rv-daily-stat { display: flex; flex-direction: column; }
.rv-daily-stat strong {
  font-size: 1.05rem; font-weight: 800; color: #15803D;
  font-variant-numeric: tabular-nums;
}
.rv-daily-stat small {
  font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;
}
.rv-daily-stat--refund strong { color: #B91C1C; }

.rv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.rv-table th, .rv-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.06));
}
.rv-table th { font-weight: 700; color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
.rv-table td.num, .rv-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.rv-row--current { background: rgba(140, 98, 57, 0.08); box-shadow: inset 3px 0 0 var(--accent, #8C6239); }
.rv-row--click { cursor: pointer; transition: background 0.12s ease; }
.rv-row--click:hover { background: rgba(140, 98, 57, 0.05); }
.rv-row--total { background: var(--bg-light, #F7F5EB); }
.rv-row--total td { border-bottom: none; border-top: 2px solid var(--border-light, rgba(0,0,0,0.12)); }
.rv-profit { color: #047857; }
.rv-loss { color: #b91c1c; }

.rv-tier-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  background: rgba(0,0,0,0.05);
  font-size: 0.72rem;
  font-weight: 700;
}

/* ─── 차트 ─── */
.rv-chart-box {
  height: 320px;
  position: relative;
}

/* ─── 인프라 폼 ─── */
.rv-info-note {
  display: inline-flex; align-items: center;
  background: #f0f9ff;
  border-left: 3px solid #0ea5e9;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  color: #075985;
  margin-bottom: 12px;
}
.rv-infra-form {
  display: flex; flex-wrap: wrap; gap: 10px;
  align-items: flex-end;
}
.rv-form-field {
  display: flex; flex-direction: column; gap: 4px;
  min-width: 90px;
}
.rv-form-field--amount { min-width: 140px; }
.rv-form-field--note { flex: 1; min-width: 200px; }
.rv-form-field span {
  font-size: 0.72rem; font-weight: 700; color: var(--text-muted);
}
.rv-input {
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.85rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  outline: none;
  background: white;
}
.rv-input:focus { border-color: var(--accent, #8C6239); }
.rv-save-btn {
  display: inline-flex; align-items: center;
  background: var(--accent, #8C6239); color: white;
  border: none; border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.8rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
  height: 36px;
}
.rv-save-btn:hover:not(:disabled) { transform: translateY(-1px); }
.rv-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── 인프라 비용 항목 편집 ─── */
.rv-infra-period { display: flex; gap: 10px; margin-bottom: 14px; }
.rv-infra-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.rv-infra-row {
  display: grid;
  grid-template-columns: 52px 1.1fr 0.9fr 1.4fr 36px;
  gap: 8px; align-items: center;
}
.rv-infra-row--head { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 0 2px; }
.rv-infra-row--fixed > .rv-input { background: #FBF7EC; border-color: rgba(140, 98, 57, 0.35); }
.rv-input--num { text-align: right; }
.rv-input--mini { width: 56px; text-align: center; padding: 6px 4px; }

/* 고정 체크박스 */
.rv-fixed-col { text-align: center; }
.rv-fixed-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  height: 34px; cursor: pointer;
}
.rv-fixed-toggle input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent, #8C6239); }

/* 고정비 일괄 적용 바 */
.rv-infra-fixed-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px;
  margin-bottom: 14px; padding: 12px 14px;
  background: #FBF7EC; border: 1px dashed rgba(140, 98, 57, 0.4); border-radius: 10px;
}
.rv-fixed-bar-icon { color: var(--accent, #8C6239); flex-shrink: 0; }
.rv-fixed-bar-text { display: flex; flex-direction: column; gap: 1px; }
.rv-fixed-bar-label { font-size: 0.82rem; font-weight: 800; color: var(--text-main); }
.rv-fixed-bar-hint { font-size: 0.7rem; color: var(--text-muted); }
.rv-fixed-bar-range {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.82rem; color: var(--text-main); font-variant-numeric: tabular-nums;
}
.rv-fixed-bar-range strong { color: var(--accent, #8C6239); }
.rv-fixed-bar-arrow { color: var(--text-muted); font-weight: 700; }
.rv-apply-fixed {
  margin-left: auto;
  display: inline-flex; align-items: center;
  background: var(--accent, #8C6239); color: white;
  border: none; border-radius: 8px;
  padding: 8px 16px; height: 36px;
  font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.rv-apply-fixed:hover:not(:disabled) { transform: translateY(-1px); }
.rv-apply-fixed:disabled { opacity: 0.5; cursor: not-allowed; }
.rv-row-del {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px; background: white; color: #b91c1c; cursor: pointer;
}
.rv-row-del:hover { background: #fef2f2; border-color: #fca5a5; }
.rv-add-item {
  align-self: flex-start;
  display: inline-flex; align-items: center;
  margin-top: 2px; padding: 7px 14px;
  border: 1px dashed var(--accent, #8C6239); border-radius: 8px;
  background: transparent; color: var(--accent, #8C6239);
  font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.rv-add-item:hover { background: rgba(140, 98, 57, 0.06); }
.rv-infra-footer {
  display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px;
  padding-top: 12px; border-top: 1px solid var(--border-light, rgba(0,0,0,0.08));
}
.rv-infra-total { font-size: 0.85rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.rv-infra-total strong { font-size: 1.15rem; color: var(--text-main); margin-left: 4px; }
.rv-infra-actions { margin-left: auto; display: flex; gap: 8px; }
.rv-print-btn {
  display: inline-flex; align-items: center;
  background: white; color: var(--accent, #8C6239);
  border: 1px solid var(--accent, #8C6239); border-radius: 8px;
  padding: 8px 16px; height: 36px;
  font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.rv-print-btn:hover { background: rgba(140, 98, 57, 0.06); }

.rv-infra-status {
  margin-top: 8px;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

/* 모바일 반응형 */
@media (max-width: 768px) {
  .revenue-page { padding: 16px; }
  .rv-summary-grid { grid-template-columns: 1fr 1fr; }
  .rv-chart-box { height: 260px; }
  .rv-infra-period { flex-direction: column; }
  .rv-infra-row--head { display: none; }
  .rv-infra-row {
    grid-template-columns: 38px 1fr auto;
    column-gap: 8px; row-gap: 6px;
    padding: 8px; border: 1px solid var(--border-light, rgba(0,0,0,0.08)); border-radius: 8px;
  }
  .rv-infra-row > :nth-child(1) { grid-row: 1 / span 2; }
  .rv-infra-row > :nth-child(2),
  .rv-infra-row > :nth-child(3),
  .rv-infra-row > :nth-child(4) { grid-column: 2; }
  .rv-infra-row > :nth-child(5) { grid-column: 3; grid-row: 1; }
  .rv-infra-actions { width: 100%; }
  .rv-apply-fixed { margin-left: 0; width: 100%; justify-content: center; }
  .rv-fixed-bar-range { flex: 1; }
  .rv-form-field { width: 100%; }
  .rv-table { font-size: 0.72rem; }
  .rv-table th, .rv-table td { padding: 6px 8px; }
}
</style>
