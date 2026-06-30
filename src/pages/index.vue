<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Mic, FileText, ArrowRight, MessageCircle, Plus, LogIn,
  Rocket, Zap, Cpu, Layers, Code2, ShieldCheck, Package,
  Sparkles, ArrowLeftRight, Hash, ChevronRight,
  Lightbulb, MessagesSquare, Compass, Quote, Wallet, Check, X,
} from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'

const { t, locale } = useI18n()
const router = useRouter()
const store = useHarnessStore()

const isLoggedIn = computed(() => {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('harness_token')
})

const primaryCta = computed(() => isLoggedIn.value
  ? { label: t('home.landing.cta.dashboard'), route: '/home', icon: ArrowRight }
  : { label: t('home.landing.cta.start'), route: '/login', icon: Sparkles }
)
// 로그인 사용자가 인트로(/) 에서 대시보드(/home) 로 갈 때는 router.replace 사용.
// router.push 면 인트로가 history 에 남아 대시보드에서 뒤로가기 시 다시 인트로
// 가 노출되는 문제 → replace 로 인트로 entry 를 대시보드로 대체.
const goPrimary = () => {
  if (isLoggedIn.value) router.replace(primaryCta.value.route)
  else router.push(primaryCta.value.route)
}

// STEP 라벨(회의록 정리/시스템 그리기/…) 은 common.nav 탭 이름과 동일 → 재사용.
// en 필드(Plan/Design/…) 는 모노 라벨로 그대로 둔다. desc 는 home.landing.flow 에서.
const STEPS = computed(() => [
  { id: 'plan', no: '01', label: t('common.nav.tab_plan'), en: 'Plan', icon: Mic, desc: t('home.landing.flow.desc_plan') },
  { id: 'design', no: '02', label: t('common.nav.tab_design'), en: 'Design', icon: Layers, desc: t('home.landing.flow.desc_design') },
  { id: 'code', no: '03', label: t('common.nav.tab_code'), en: 'Code', icon: Code2, desc: t('home.landing.flow.desc_code') },
  { id: 'lint', no: '04', label: t('common.nav.tab_lint'), en: 'Lint', icon: ShieldCheck, desc: t('home.landing.flow.desc_lint') },
  { id: 'deliverables', no: '05', label: t('common.nav.tab_deliverables'), en: 'Deliverables', icon: Package, desc: t('home.landing.flow.desc_deliverables') },
])

const FAQS = computed(() => [
  { q: t('home.landing.faq.q1'), a: t('home.landing.faq.a1') },
  { q: t('home.landing.faq.q2'), a: t('home.landing.faq.a2') },
  // [2026-06-15] 비용(q7)을 앞으로 — 처음 사용자의 1순위 관심사.
  { q: t('home.landing.faq.q7'), a: t('home.landing.faq.a7') },
  { q: t('home.landing.faq.q3'), a: t('home.landing.faq.a3') },
  { q: t('home.landing.faq.q4'), a: t('home.landing.faq.a4') },
  { q: t('home.landing.faq.q5'), a: t('home.landing.faq.a5') },
  { q: t('home.landing.faq.q6'), a: t('home.landing.faq.a6') },
  // [2026-06-12] Obsidian vault export — 기획 자산화 차별점 노출.
  { q: t('home.landing.faq.q8'), a: t('home.landing.faq.a8') },
])
const openFaq = ref(0)
const toggleFaq = (i) => { openFaq.value = openFaq.value === i ? -1 : i }

// ─── 문제 제기 (Pain) — VRL 리디자인 ─────────────────────────────
const PAINS = computed(() => [
  { icon: Lightbulb, title: t('home.landing.pain.p1_title'), desc: t('home.landing.pain.p1_desc') },
  { icon: MessagesSquare, title: t('home.landing.pain.p2_title'), desc: t('home.landing.pain.p2_desc') },
  { icon: Compass, title: t('home.landing.pain.p3_title'), desc: t('home.landing.pain.p3_desc') },
])

const RESULTS = computed(() => [
  { tag: t('home.landing.results.item1.tag'), icon: Zap, title: t('home.landing.results.item1.title'), desc: t('home.landing.results.item1.desc'), num: '4~6', unit: t('home.landing.results.unit_min') },
  { tag: t('home.landing.results.item2.tag'), icon: Rocket, title: t('home.landing.results.item2.title'), desc: t('home.landing.results.item2.desc'), num: '0', unit: t('home.landing.results.unit_line') },
  { tag: t('home.landing.results.item3.tag'), icon: Cpu, title: t('home.landing.results.item3.title'), desc: t('home.landing.results.item3.desc'), num: '100', unit: '%' },
  { tag: t('home.landing.results.item4.tag'), icon: Wallet, title: t('home.landing.results.item4.title'), desc: t('home.landing.results.item4.desc'), num: '$0', unit: '' },
])

// ─── 하단 고정 CTA — 첫 화면(히어로)을 지나면 등장 ─────────────────
// 히어로엔 이미 CTA 가 있어, 첫 화면에서 고정 CTA 까지 보이면 버튼이 둘이라 어색함.
// → 히어로가 화면에서 벗어난 뒤(다음 섹션부터)에만 고정 CTA 노출.
const heroRef = ref(null)
const showStickyCta = ref(false)

let _io = null
let _heroIo = null
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  _io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in-view')
        _io.unobserve(e.target)
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' })
  document.querySelectorAll('.home-root .reveal').forEach((el) => _io.observe(el))

  if (heroRef.value) {
    _heroIo = new IntersectionObserver(([e]) => { showStickyCta.value = !e.isIntersecting }, { threshold: 0 })
    _heroIo.observe(heroRef.value)
  }
})
onBeforeUnmount(() => {
  _io?.disconnect()
  _heroIo?.disconnect()
})
</script>

<template>
  <div class="home-root">
    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  HERO                                                              -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="hero" ref="heroRef">
      <div class="hero-aura" aria-hidden="true"></div>
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-inner">
        <span class="eyebrow reveal">
          HARNESS
          <span class="eyebrow-sep">/</span>
          IDEA → PLAN → CURSOR
        </span>
        <h1 class="hero-headline reveal">
          <span class="hero-row">{{ $t('home.landing.hero.headline_1') }}</span>
          <span class="hero-row">
            <span class="highlight">{{ $t('home.landing.hero.headline_2') }}</span>
          </span>
        </h1>
        <p class="hero-tagline reveal" v-html="$t('home.landing.hero.tagline')"></p>
        <div class="hero-actions reveal">
          <button class="btn btn--brand" @click="goPrimary">
            <component :is="primaryCta.icon" :size="16" class="mr-2" />
            <span>{{ primaryCta.label }}</span>
            <ArrowRight :size="14" class="ml-2" />
          </button>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  PAIN (WHY) — 문제 제기                                            -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section section--alt reveal">
      <div class="section-head">
        <span class="eyebrow">WHY</span>
        <h2 class="section-headline">
          {{ $t('home.landing.pain.headline_1') }}
          <span class="highlight">{{ $t('home.landing.pain.headline_2') }}</span>
        </h2>
        <p class="section-sub">{{ $t('home.landing.pain.sub') }}</p>
      </div>
      <div class="pain-grid">
        <article v-for="(p, i) in PAINS" :key="i" class="pain-card">
          <div class="pain-icon"><component :is="p.icon" :size="26" /></div>
          <h3 class="pain-title">{{ p.title }}</h3>
          <p class="pain-desc">{{ p.desc }}</p>
        </article>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  VS — 그냥 시키면 vs Harness 로 (VRL 오마주: 그대로 vs 앞서감)            -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section reveal">
      <div class="section-head">
        <span class="eyebrow">COMPARE</span>
        <h2 class="section-headline">
          {{ $t('home.landing.vs.headline_1') }}
          <span class="highlight">{{ $t('home.landing.vs.headline_2') }}</span>
        </h2>
        <p class="section-sub">{{ $t('home.landing.vs.sub') }}</p>
      </div>
      <div class="vs-grid">
        <article class="vs-card vs-card--bad">
          <h3 class="vs-title"><X :size="18" class="vs-ic" /> {{ $t('home.landing.vs.bad_title') }}</h3>
          <ul class="vs-list">
            <li>{{ $t('home.landing.vs.bad_1') }}</li>
            <li>{{ $t('home.landing.vs.bad_2') }}</li>
            <li>{{ $t('home.landing.vs.bad_3') }}</li>
            <li>{{ $t('home.landing.vs.bad_4') }}</li>
          </ul>
        </article>
        <article class="vs-card vs-card--good">
          <h3 class="vs-title"><Check :size="18" class="vs-ic" /> {{ $t('home.landing.vs.good_title') }}</h3>
          <ul class="vs-list">
            <li>{{ $t('home.landing.vs.good_1') }}</li>
            <li>{{ $t('home.landing.vs.good_2') }}</li>
            <li>{{ $t('home.landing.vs.good_3') }}</li>
            <li>{{ $t('home.landing.vs.good_4') }}</li>
          </ul>
        </article>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  BEFORE / AFTER 슬라이더 — 정리 안 된 메모 ↔ AI 가 정리한 기획               -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section section--compare reveal">
      <div class="section-head">
        <span class="eyebrow">
          BEFORE · AFTER
        </span>
        <h2 class="section-headline">
          <span>{{ $t('home.landing.compare.headline_1') }}</span>
          <span class="highlight">{{ $t('home.landing.compare.headline_2') }}</span>
        </h2>
        <p class="section-sub" v-html="$t('home.landing.compare.sub')"></p>
      </div>

      <!-- 한눈 비교: 정리 안 된 메모 → (AI) → 구조화된 기획. 둘 다 보여 변화가 즉시 보임. -->
      <div class="transform">
        <div class="transform-card transform-card--before">
          <div class="compare-tag compare-tag--before">{{ $t('home.landing.compare.tag_before') }}</div>
          <div class="raw-log">
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line1') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line2') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line3') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line4') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line5') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line6') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line7') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line8') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line9') }}</span></div>
            <div class="raw-line"><span class="raw-text">{{ $t('home.landing.compare.raw.line10') }}</span></div>
          </div>
        </div>

        <div class="transform-arrow" aria-hidden="true">
          <span class="transform-arrow-circle"><ArrowRight :size="22" /></span>
          <!-- [2026-06-12] 하드코딩 한국어 → i18n (영/일/중 사용자에게 "AI 정리"가 그대로 노출됐었음) -->
          <span class="transform-arrow-label">{{ $t('home.landing.compare.arrow_label') }}</span>
        </div>

        <div class="transform-card transform-card--after">
          <div class="compare-tag compare-tag--after">{{ $t('home.landing.compare.tag_after') }}</div>
          <div class="spec-list">
            <div class="spec-row spec-row--epic">
              <span class="spec-chip spec-chip--epic">{{ $t('home.landing.compare.chip.plan') }}</span>
              <span class="spec-name"><strong>{{ $t('home.landing.compare.spec.name_epic') }}</strong></span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.draft') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--story">{{ $t('home.landing.compare.chip.feature') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_check') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.must') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--story">{{ $t('home.landing.compare.chip.feature') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_streak') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.later') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--policy">{{ $t('home.landing.compare.chip.noti') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_noti') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.must') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--api">{{ $t('home.landing.compare.chip.login') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_login') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.must') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--ddd">{{ $t('home.landing.compare.chip.data') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_data') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.must') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--story">{{ $t('home.landing.compare.chip.feature') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_share') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.later') }}</span>
            </div>
            <div class="spec-row">
              <span class="spec-chip spec-chip--ui">{{ $t('home.landing.compare.chip.screen') }}</span>
              <span class="spec-name">{{ $t('home.landing.compare.spec.name_stats') }}</span>
              <span class="spec-trail">{{ $t('home.landing.compare.trail.later') }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  RESULTS                                                           -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section reveal">
      <div class="section-head">
        <span class="eyebrow">
          RESULTS
        </span>
        <h2 class="section-headline">
          <span>{{ $t('home.landing.results.headline_1') }}</span><br />
          <span class="highlight">{{ $t('home.landing.results.headline_2') }}</span>
        </h2>
      </div>
      <div class="result-grid">
        <article v-for="(r, i) in RESULTS" :key="i" class="result-card">
          <span class="result-tag">{{ r.tag }}</span>
          <div class="result-icon"><component :is="r.icon" :size="56" /></div>
          <h3 class="result-title">{{ r.title }}</h3>
          <p class="result-desc">{{ r.desc }}</p>
          <div class="result-num">{{ r.num }}<span class="result-unit" v-if="r.unit">{{ r.unit }}</span></div>
        </article>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  FLOW (5 steps)                                                    -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section reveal">
      <div class="section-head">
        <span class="eyebrow">
          FLOW
        </span>
        <h2 class="section-headline">
          <span>{{ $t('home.landing.flow.headline_1') }}</span><br />
          <span class="highlight">{{ $t('home.landing.flow.headline_2') }}</span>
        </h2>
        <p class="section-sub">{{ $t('home.landing.flow.sub') }}</p>
      </div>
      <div class="flow-grid">
        <article v-for="s in STEPS" :key="s.id" class="flow-card">
          <span class="flow-no">{{ s.no }}</span>
          <div class="flow-icon"><component :is="s.icon" :size="26" /></div>
          <h3 class="flow-title">
            {{ s.label }}
            <span v-if="locale !== 'en'" class="flow-en">{{ s.en }}</span>
          </h3>
          <p class="flow-desc">{{ s.desc }}</p>
        </article>
      </div>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  FAQ                                                               -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="section reveal">
      <div class="section-head">
        <span class="eyebrow">
          FAQ
        </span>
        <h2 class="section-headline">
          <span class="highlight">{{ $t('home.landing.faq.headline') }}</span>
        </h2>
        <p class="section-sub">{{ $t('home.landing.faq.sub') }}</p>
      </div>
      <ul class="faq-list">
        <li
          v-for="(f, i) in FAQS"
          :key="i"
          class="faq-item"
          :class="{ 'faq-item--open': openFaq === i }"
        >
          <button class="faq-q" type="button" @click="toggleFaq(i)" :aria-expanded="openFaq === i">
            <span>{{ f.q }}</span>
            <span class="faq-plus"><Plus :size="18" /></span>
          </button>
          <div class="faq-a-wrap" :class="{ 'faq-a-wrap--open': openFaq === i }">
            <p class="faq-a" v-html="f.a"></p>
          </div>
        </li>
      </ul>
    </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!--  FINALE                                                            -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <section class="manifesto reveal">
      <div class="manifesto-inner">
        <Quote :size="44" class="manifesto-quote" aria-hidden="true" />
        <h2 class="manifesto-headline">
          {{ $t('home.landing.manifesto.headline_1') }}<br />
          <span class="highlight">{{ $t('home.landing.manifesto.headline_2') }}</span>
        </h2>
        <p class="manifesto-body" v-html="$t('home.landing.manifesto.body')"></p>
      </div>
    </section>

    <section class="finale reveal">
      <div class="finale-inner">
        <h2 class="finale-headline">
          <span>{{ $t('home.landing.finale.headline_1') }}</span><br />
          <span>{{ $t('home.landing.finale.headline_2') }}</span><br />
          <span class="highlight">{{ $t('home.landing.finale.headline_3') }}</span>
        </h2>
        <p class="finale-sub">{{ $t('home.landing.finale.sub') }}</p>
        <div class="finale-actions">
          <button class="btn btn--brand btn--lg" @click="goPrimary">
            <Sparkles :size="18" class="mr-2" />
            <span>{{ primaryCta.label }}</span>
            <ArrowRight :size="16" class="ml-2" />
          </button>
        </div>
      </div>
    </section>

    <!-- Sticky bottom CTA -->
    <transition name="cta-pop">
      <button v-if="showStickyCta" class="sticky-cta" type="button" @click="goPrimary" :aria-label="primaryCta.label">
        <component :is="primaryCta.icon" :size="16" class="mr-2" />
        <span>{{ primaryCta.label }}</span>
      </button>
    </transition>
  </div>
</template>

<style scoped>
/* ═════════════ TOKENS (system: warm cream + brown) ═════════════ */
.home-root {
  --bg: #FCFAEE;
  --bg-card: #FFFFFF;
  --bg-card-hover: #FAF6EB;
  --line: rgba(140, 98, 57, 0.1);
  --line-strong: rgba(140, 98, 57, 0.22);
  --text-main: #2A2421;
  --text-muted: #6F665F;
  --text-dim: #A89B91;
  --brand: #8C6239;
  --brand-dim: #6E4E2E;
  --brand-soft: rgba(140, 98, 57, 0.08);
  --brand-glow: rgba(140, 98, 57, 0.28);
  --moss: #2E4036;
  --cream: #FCFAEE;

  /* [2026-06-06] 더블 스크롤 수정 — 풀블리드 랜딩(로그인 전 '/')은 '문서' 스크롤
     하나만 쓴다. 기존 height:100%+overflow-y:auto 는 셸(content-wrapper h-100) 안에서만
     동작하는 설정인데, 랜딩은 v-main 직속(풀블리드)이라 height:100% 가 뷰포트로 풀리지
     않아 콘텐츠 높이(≈7700px)가 돼 버리고 그 위에서 html 이 따로 스크롤 → 스크롤바 2개.
     자체 overflow 컨테이너를 제거해 데스크탑(html)·모바일(문서 스크롤 전환) 모두 단일
     스크롤러로 통일한다. (sticky CTA·reveal 은 뷰포트 IntersectionObserver 라 영향 없음) */
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text-main);
  position: relative;
}

/* Pretendard for the whole page */
.home-root :deep(*) {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
}

/* [2026-06-12] 조판 품질 — 헤드라인은 줄 길이 균형(balance), 본문은 마지막 줄에
   한 단어만 남는 고아(orphan) 방지(pretty). 사용자 피드백 "글자 정렬이 어수선함"의
   줄바꿈 축. 미지원 브라우저는 무시되는 점진적 향상. */
.hero-headline, .section-headline, .finale-headline, .manifesto-headline { text-wrap: balance; }
.hero-tagline, .section-sub, .pain-desc, .result-desc, .flow-desc, .faq-a,
.manifesto-body, .finale-sub, .vs-list li { text-wrap: pretty; }

/* ═════════════ COMMON ATOMS ═════════════ */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); }
.reveal.in-view { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .reveal, .reveal.in-view { transition: none; opacity: 1; transform: none; }
}

.eyebrow {
  display: inline-flex; align-items: center; gap: 12px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.74rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--brand);
}
.eyebrow-line { display: inline-block; width: 26px; height: 2px; background: var(--brand); border-radius: 2px; }
.eyebrow-sep { color: var(--text-dim); margin: 0 2px; }

.highlight {
  display: inline;
  color: var(--brand-dim);
  font-weight: 800;
  background-image: linear-gradient(transparent 70%, rgba(233, 193, 92, 0.55) 70%);
  background-repeat: no-repeat;
  padding: 0 0.04em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 26px;
  border-radius: 9999px;
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: 0.92rem; font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all .22s cubic-bezier(.16,1,.3,1);
  white-space: nowrap;
}
.btn--brand {
  background: var(--brand); color: var(--cream);
  box-shadow: 0 10px 30px -8px var(--brand-glow);
}
.btn--brand:hover { background: var(--brand-dim); transform: translateY(-2px); box-shadow: 0 16px 36px -8px var(--brand-glow); }
.btn--lg { padding: 18px 36px; font-size: 1rem; }

/* ═════════════ HERO ═════════════ */
.hero {
  position: relative;
  min-height: clamp(640px, 88vh, 840px);
  display: flex; align-items: center; justify-content: center;
  padding: 80px 32px 64px;
  overflow: hidden;
}
.hero-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(140, 98, 57, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(140, 98, 57, 0.05) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%);
}
.hero-aura {
  position: absolute;
  width: 1000px; height: 1000px;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, var(--brand-glow) 0%, rgba(140, 98, 57, 0.06) 38%, transparent 64%);
  opacity: 0.7;
  pointer-events: none;
}
.hero-inner {
  position: relative; z-index: 1;
  max-width: 980px; width: 100%;
  text-align: center;
  display: flex; flex-direction: column; align-items: center;
}
.hero-inner .eyebrow { margin-bottom: 32px; }
.hero-headline {
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: clamp(2.8rem, 8vw, 6rem);
  font-weight: 800;
  line-height: 1.18;
  letter-spacing: -0.02em;
  margin: 0 0 28px;
  color: var(--text-main);
}
.hero-row { display: block; }
.hero-row .highlight {
  padding: 0 22px 6px;
  margin-top: 8px;
}
.hero-tagline {
  font-size: clamp(0.96rem, 1.5vw, 1.12rem);
  line-height: 1.78;
  color: var(--text-muted);
  margin: 0 0 40px;
  max-width: 580px;
}
.hero-tagline strong { color: var(--text-main); font-weight: 700; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }

/* ═════════════ SECTION SHARED ═════════════ */
.section {
  position: relative;
  max-width: 1180px; margin: 0 auto;
  padding: 100px 32px;
}
.section-head { text-align: center; max-width: 760px; margin: 0 auto 56px; }
.section-head .eyebrow { margin-bottom: 18px; }
.section-headline {
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: clamp(2.4rem, 5.6vw, 4rem);
  font-weight: 800;
  line-height: 1.16;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  color: var(--text-main);
}
.section-headline .highlight { padding: 0 18px 4px; margin-top: 6px; }
.section-sub {
  font-size: 1rem;
  color: var(--text-muted);
  margin: 14px 0 0;
  line-height: 1.74;
}

/* ═════════════ BEFORE / AFTER 슬라이더 ═════════════ */
.section--compare { padding-top: 80px; }

.compare-frame {
  position: relative;
  display: flex;
  max-width: 1080px;
  margin: 0 auto;
  height: 520px;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 22px;
  overflow: hidden;
  user-select: none;
  cursor: ew-resize;
  box-shadow: 0 24px 60px -20px rgba(140, 98, 57, 0.18);
}

/* Side-by-side panes — width controlled by slider position */
.pane {
  flex-grow: 0;
  flex-shrink: 0;
  overflow: hidden;
  min-width: 0;
}
.pane--before { background: rgba(140, 98, 57, 0.025); }
.pane--after { background: var(--bg-card); }
.pane-inner {
  height: 100%;
  padding: 30px 36px;
  min-width: 0;
  overflow: hidden;
}

.compare-tag {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 9999px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.02em;
  margin-bottom: 18px;
  white-space: nowrap;
}
.compare-tag--before {
  background: rgba(140, 98, 57, 0.08);
  color: var(--brand);
  border: 1px solid rgba(140, 98, 57, 0.18);
}
.compare-tag--after {
  background: var(--brand);
  color: var(--cream);
}

.pane-inner .mono { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }

/* BEFORE — 정리 안 된 메모 (raw log) */
.raw-log { display: flex; flex-direction: column; gap: 9px; padding-right: 12px; }
.raw-line {
  display: flex; gap: 10px; align-items: baseline;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(140, 98, 57, 0.08);
  font-size: 0.84rem;
  line-height: 1.6;
}
.raw-time {
  font-size: 0.66rem; color: var(--text-muted);
  flex-shrink: 0; min-width: 38px;
}
.raw-name {
  font-size: 0.74rem; font-weight: 800; color: var(--brand);
  flex-shrink: 0; min-width: 62px;
}
.raw-text { color: var(--text-main); flex: 1; }

/* AFTER — Spec rows (full-width, distributed content) */
.spec-list { display: flex; flex-direction: column; gap: 8px; }
.spec-row {
  display: flex; align-items: center; gap: 14px;
  padding: 11px 14px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.04);
  border: 1px solid rgba(140, 98, 57, 0.06);
  font-size: 0.82rem;
}
.spec-row--epic {
  background: rgba(140, 98, 57, 0.1);
  border-color: rgba(140, 98, 57, 0.2);
}
.spec-chip {
  padding: 4px 10px;
  border-radius: 6px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.64rem; font-weight: 700;
  letter-spacing: 0.01em;
  flex-shrink: 0;
  min-width: 52px;
  text-align: center;
}
.spec-chip--epic { background: var(--brand); color: var(--cream); }
.spec-chip--story { background: rgba(140, 98, 57, 0.18); color: var(--brand); }
.spec-chip--api { background: var(--moss); color: var(--cream); }
.spec-chip--ddd { background: rgba(46, 64, 54, 0.14); color: var(--moss); }
.spec-chip--policy { background: rgba(140, 98, 57, 0.12); color: var(--brand); }
.spec-chip--ui { background: rgba(46, 64, 54, 0.1); color: var(--moss); }
.spec-name {
  flex: 1;
  color: var(--text-main);
  font-weight: 500;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spec-name strong { font-weight: 800; color: var(--text-main); }
.spec-name em { color: var(--moss); font-style: normal; font-weight: 700; }
.spec-trail {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 5px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--brand);
  font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

/* Divider + handle */
.compare-divider {
  position: absolute;
  top: 0; bottom: 0;
  width: 2px;
  background: var(--brand);
  z-index: 3;
  transform: translateX(-1px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.4),
    0 0 24px rgba(140, 98, 57, 0.5);
}
.compare-handle {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 48px; height: 48px;
  border-radius: 50%;
  border: 2px solid var(--cream);
  background: var(--brand);
  color: var(--cream);
  cursor: ew-resize;
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow:
    0 8px 24px rgba(140, 98, 57, 0.4),
    0 0 0 4px rgba(140, 98, 57, 0.15);
  transition: transform .15s ease, box-shadow .15s ease;
  touch-action: none;
}
.compare-handle:hover, .compare-handle:focus-visible {
  outline: none;
  transform: translate(-50%, -50%) scale(1.08);
  box-shadow:
    0 12px 32px rgba(140, 98, 57, 0.5),
    0 0 0 6px rgba(140, 98, 57, 0.22);
}
.compare-frame--dragging .compare-handle { transform: translate(-50%, -50%) scale(1.05); }

.compare-hint {
  text-align: center;
  margin: 18px 0 0;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.66rem; font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.7;
}

/* ═════════════ RESULTS ═════════════ */
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}
.result-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 36px 32px 32px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  transition: all .25s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 6px 20px -8px rgba(140, 98, 57, 0.08);
}
.result-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--line-strong);
  transform: translateY(-4px);
  box-shadow: 0 16px 36px -10px rgba(140, 98, 57, 0.18);
}
.result-tag {
  position: absolute; top: 18px; right: 18px;
  padding: 4px 12px;
  background: var(--brand);
  color: var(--cream);
  border-radius: 9999px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.66rem; font-weight: 800;
  letter-spacing: 0.06em;
}
.result-icon {
  width: 92px; height: 92px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(140, 98, 57, 0.12) 0%, rgba(140, 98, 57, 0.04) 100%);
  border: 1px solid rgba(140, 98, 57, 0.18);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--brand);
  margin: 12px 0 26px;
}
.result-title {
  font-size: 1.4rem; font-weight: 800;
  margin: 0 0 12px;
  letter-spacing: -0.02em;
  color: var(--text-main);
}
.result-desc {
  font-size: 0.92rem;
  line-height: 1.72;
  color: var(--text-muted);
  margin: 0 0 28px;
  flex: 1;
}
.result-num {
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: 3.6rem; font-weight: 900;
  line-height: 1;
  letter-spacing: -0.05em;
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.result-unit { font-size: 0.5em; font-weight: 800; margin-left: 4px; color: var(--text-muted); }

/* ═════════════ FLOW (5 steps) ═════════════ */
.flow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.flow-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 32px 26px 28px;
  transition: all .25s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 4px 16px -6px rgba(140, 98, 57, 0.06);
}
.flow-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--brand);
  transform: translateY(-4px);
  box-shadow: 0 14px 30px -10px rgba(140, 98, 57, 0.18);
}
.flow-no {
  position: absolute; top: 18px; right: 22px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.72rem; font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--brand);
  opacity: 0.75;
}
.flow-icon {
  width: 54px; height: 54px;
  border-radius: 14px;
  background: var(--brand-soft);
  border: 1px solid rgba(140, 98, 57, 0.18);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--brand);
  margin-bottom: 22px;
}
.flow-title {
  font-size: 1.18rem; font-weight: 800;
  margin: 0 0 12px;
  letter-spacing: -0.018em;
  color: var(--text-main);
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.flow-en {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important;
  font-size: 0.66rem; font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 0.06em;
}
.flow-desc {
  font-size: 0.88rem;
  line-height: 1.74;
  color: var(--text-muted);
  margin: 0;
}

/* ═════════════ FAQ ═════════════ */
.faq-list { list-style: none; padding: 0; margin: 0 auto; max-width: 860px; display: flex; flex-direction: column; gap: 12px; }
.faq-item {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.faq-item:hover { border-color: var(--line-strong); }
.faq-item--open {
  border-color: var(--brand);
  background: var(--bg-card);
  box-shadow: 0 8px 28px -10px rgba(140, 98, 57, 0.2);
}
.faq-q {
  width: 100%; text-align: left;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 22px 26px;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-main);
  font-family: inherit;
  font-size: 1rem; font-weight: 700;
  letter-spacing: -0.01em;
}
.faq-plus {
  flex-shrink: 0;
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  transition: all .3s cubic-bezier(.16,1,.3,1);
}
.faq-item--open .faq-plus {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--cream);
  transform: rotate(45deg);
}
.faq-a-wrap {
  max-height: 0; opacity: 0;
  overflow: hidden;
  transition: max-height .4s cubic-bezier(.16,1,.3,1), opacity .3s ease;
}
.faq-a-wrap--open { max-height: 400px; opacity: 1; }
.faq-a {
  padding: 0 26px 24px;
  font-size: 0.92rem;
  line-height: 1.78;
  color: var(--text-muted);
  margin: 0;
}

/* ═════════════ FINALE ═════════════ */
.finale {
  position: relative;
  padding: 140px 32px 200px;
  overflow: hidden;
}
.finale::before {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 30% 50%, rgba(140, 98, 57, 0.1), transparent 60%),
    radial-gradient(ellipse 50% 50% at 80% 50%, rgba(46, 64, 54, 0.08), transparent 60%);
  pointer-events: none;
}
.finale-inner {
  position: relative; z-index: 1;
  max-width: 980px; margin: 0 auto;
  display: grid; grid-template-columns: 1fr;
  text-align: left;
  gap: 32px;
}
.finale-headline {
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: clamp(2.6rem, 6.2vw, 4.6rem);
  font-weight: 800;
  line-height: 1.18;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}
.finale-headline .highlight {
  padding: 0 22px 6px;
  margin-top: 10px;
}
.finale-sub {
  font-size: 1.05rem;
  line-height: 1.74;
  color: var(--text-muted);
  margin: 0;
  max-width: 560px;
}
.finale-actions { display: flex; gap: 12px; }

/* ═════════════ STICKY CTA ═════════════ */
.sticky-cta {
  position: fixed;
  bottom: 28px; left: 50%;
  transform: translateX(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 28px;
  border-radius: 9999px;
  border: 1.5px solid var(--cream);
  background: var(--brand);
  color: var(--cream);
  font-family: 'Pretendard Variable', sans-serif !important;
  font-size: 0.92rem; font-weight: 800;
  letter-spacing: -0.01em;
  cursor: pointer;
  z-index: 50;
  box-shadow:
    0 12px 32px -6px rgba(140, 98, 57, 0.35),
    0 6px 16px var(--brand-glow),
    0 0 0 4px rgba(140, 98, 57, 0.12);
  transition: all .22s cubic-bezier(.16,1,.3,1);
}
.sticky-cta:hover {
  background: var(--brand-dim);
  transform: translateX(-50%) translateY(-2px);
  box-shadow:
    0 18px 40px -6px rgba(140, 98, 57, 0.4),
    0 10px 24px var(--brand-glow),
    0 0 0 4px rgba(140, 98, 57, 0.18);
}

/* ═════════════ RESPONSIVE ═════════════ */
@media (max-width: 768px) {
  .hero { padding: 64px 20px 56px; min-height: 580px; }
  .hero-actions { width: 100%; flex-direction: column; }
  .hero-actions .btn { width: 100%; }

  .section { padding: 72px 20px; }

  .compare-frame { height: 580px; }
  .compare-pane { padding: 22px 20px; }
  .raw-line { font-size: 0.78rem; gap: 6px; padding: 4px 0; }
  .raw-name { min-width: 50px; font-size: 0.7rem; }
  .raw-time { min-width: 32px; font-size: 0.6rem; }
  .ai-row { font-size: 0.78rem; padding: 7px 10px; }
  .ai-row--ac { font-size: 0.72rem; }
  .compare-handle { width: 42px; height: 42px; }

  .result-card { padding: 28px 24px 24px; }
  .result-icon { width: 76px; height: 76px; }
  .result-num { font-size: 2.8rem; }

  .flow-card { padding: 24px 22px; }

  .faq-q { padding: 18px 22px; font-size: 0.92rem; }
  .faq-plus { width: 28px; height: 28px; }
  .faq-a { padding: 0 22px 20px; font-size: 0.86rem; }

  .finale { padding: 96px 20px 160px; }
  .finale-actions .btn { width: 100%; }

  .sticky-cta { bottom: 16px; padding: 12px 22px; font-size: 0.84rem; }
}

/* ═════════════ VRL 리디자인 오버라이드 (뒤에 와서 우선 적용) ═════════════ */
/* 핵심어 강조 — 바탕 칠 대신 글자 하단을 스치는 은은한 골드 밑줄(부드럽게) */
.home-root .highlight {
  background: linear-gradient(transparent 70%, rgba(233, 193, 92, 0.6) 70%) !important;
  background-repeat: no-repeat !important;
  color: var(--brand-dim) !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 0.04em !important;
  font-weight: 800 !important;
}
/* 대형 타이포 — 굵기·자간을 낮춰 부드럽고 우아하게(공격성 ↓) */
.home-root .hero-headline { font-size: clamp(2.7rem, 7.2vw, 5.4rem); letter-spacing: -0.02em; font-weight: 800; }
.home-root .section-headline { font-size: clamp(2.3rem, 6vw, 4.2rem); letter-spacing: -0.022em; font-weight: 800; }
.home-root .section { padding-top: 108px; padding-bottom: 108px; }

/* 교차 배경 */
.section--alt { background: #F6F0E0; }

/* PAIN (문제 제기) */
.pain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; max-width: 1180px; margin: 0 auto; }
.pain-card {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 22px;
  padding: 34px 30px; transition: all .25s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 6px 20px -10px rgba(140, 98, 57, 0.12);
}
.pain-card:hover { transform: translateY(-4px); border-color: var(--line-strong); box-shadow: 0 18px 38px -12px rgba(140, 98, 57, 0.2); }
.pain-icon {
  width: 56px; height: 56px; border-radius: 16px;
  background: var(--brand-soft); border: 1px solid rgba(140, 98, 57, 0.16);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--brand); margin-bottom: 22px;
}
.pain-title { font-size: 1.24rem; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.02em; color: var(--text-main); }
.pain-desc { font-size: 0.94rem; line-height: 1.74; color: var(--text-muted); margin: 0; }

/* MANIFESTO (브라운 풀블리드) */
.manifesto { position: relative; padding: 120px 32px; background: var(--brand); color: var(--cream); overflow: hidden; }
.manifesto-inner { position: relative; max-width: 880px; margin: 0 auto; text-align: center; }
.manifesto-quote { color: #E9C15C; opacity: 0.9; margin-bottom: 14px; }
.manifesto-headline {
  font-size: clamp(2.2rem, 5.4vw, 3.8rem); font-weight: 800;
  line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 26px; color: var(--cream);
}
.manifesto-headline .highlight {
  background: linear-gradient(transparent 70%, rgba(233, 193, 92, 0.7) 70%) !important;
  color: var(--cream) !important;
  box-shadow: none !important;
}
.manifesto-body { font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.85; color: rgba(252, 250, 238, 0.86); margin: 0 auto; max-width: 680px; }
.manifesto-body strong { color: #E9C15C; }

@media (max-width: 768px) {
  .home-root .section { padding-top: 76px; padding-bottom: 76px; }
  .manifesto { padding: 84px 20px; }
}

/* ═════════════ Before/After 한눈 비교 (슬라이더 → 좌→우) ═════════════ */
.transform { display: flex; align-items: stretch; max-width: 1080px; margin: 0 auto; }
.transform-card {
  flex: 1; min-width: 0;
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 22px; padding: 24px 26px;
  box-shadow: 0 18px 48px -26px rgba(140, 98, 57, 0.24);
}
.transform-card--before { background: rgba(140, 98, 57, 0.035); }
.transform-arrow {
  flex-shrink: 0; align-self: center;
  display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 0 16px;
}
.transform-arrow-circle {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--brand); color: var(--cream);
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 10px 24px -6px var(--brand-glow);
}
.transform-arrow-label {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; font-weight: 800;
  letter-spacing: 0.06em; color: var(--brand); white-space: nowrap;
}

/* 하단 고정 CTA 등장 트랜지션 */
.cta-pop-enter-active, .cta-pop-leave-active { transition: opacity .3s ease, transform .35s cubic-bezier(.16,1,.3,1); }
.cta-pop-enter-from, .cta-pop-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }

/* RESULTS — 짝수(4) 카드 균형 */
.home-root .result-grid { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 1080px) { .home-root .result-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .transform { flex-direction: column; }
  .transform-arrow { flex-direction: row; padding: 16px 0; }
  .transform-arrow-circle { transform: rotate(90deg); }
  .home-root .result-grid { grid-template-columns: 1fr; }
}

/* ═════════════ VS — 그냥 시키면 vs Harness 로 ═════════════ */
.vs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; margin: 0 auto; }
.vs-card {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 22px; padding: 30px 30px;
}
.vs-card--bad { background: rgba(111, 102, 95, 0.045); }
.vs-card--good {
  border: 2px solid var(--brand);
  background: rgba(140, 98, 57, 0.05);
  box-shadow: 0 20px 48px -24px var(--brand-glow);
}
.vs-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 1.22rem; font-weight: 800; letter-spacing: -0.02em;
  margin: 0 0 20px;
}
.vs-card--bad .vs-title { color: var(--text-muted); }
.vs-card--good .vs-title { color: var(--brand-dim); }
.vs-ic { flex-shrink: 0; }
.vs-card--bad .vs-ic { color: var(--text-dim); }
.vs-card--good .vs-ic {
  color: var(--cream); background: var(--brand);
  border-radius: 50%; padding: 3px; width: 24px; height: 24px;
}
.vs-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 13px; }
.vs-list li { position: relative; padding-left: 16px; font-size: 0.95rem; line-height: 1.6; }
.vs-list li::before { content: ''; position: absolute; left: 2px; top: 9px; width: 5px; height: 5px; border-radius: 50%; }
.vs-card--bad .vs-list li { color: var(--text-muted); }
.vs-card--bad .vs-list li::before { background: var(--text-dim); }
.vs-card--good .vs-list li { color: var(--text-main); font-weight: 500; }
.vs-card--good .vs-list li::before { background: var(--brand); }
@media (max-width: 768px) { .vs-grid { grid-template-columns: 1fr; } }
</style>
