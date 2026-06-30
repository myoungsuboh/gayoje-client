<script setup>
/**
 * NextStepRouter — "이제 뭘 하면 되나요?" 분기점.
 *
 * [왜 필요한가 — 제품의 빈칸]
 * 제품은 설계 명세(SPACK·DDD·Architecture)까지 자동 생성하지만, 거기서 '실제
 * 코드'로 넘어가는 다리가 어디에도 없다. Code/Lint/Deliverables 는 모두 이미
 * 존재하는 GitHub repo 를 전제로 한다 (이 Code 페이지도 'repo 불러와 탐색'만).
 * 그래서 명세를 손에 쥔 사용자가 "그래서 이제 뭘?" 에서 이탈한다 — 이게 진짜
 * 진입 장벽. 이 카드가 그 빈칸을 사용자 유형별 다음 행동으로 메운다.
 *
 * [3 갈래]
 *  ① 직접 만들기   — Cursor·Claude Code 쓰는 '바이브 코딩 관심층' (= B2C 핵심 페르소나).
 *                    AgentExportPanel 을 mount: 명세 → CLAUDE.md·.cursorrules·번들 export.
 *  ② 개발자에 맡기기 — 외주·팀에 넘기는 비개발자 발주자
 *  ③ 이미 코드 있음 — 점검·인수만 (= 아래 기존 repo 브라우저)
 *
 * [probe] 어느 갈래를 누르는지 = '내 사용자가 누구인지' 신호. 지금은 분석
 * 백엔드가 없어 localStorage 집계 + TODO 훅만 둔다. 진짜 측정은 이벤트
 * 엔드포인트가 생길 때 trackChoice 안에서 전송하면 된다 (번들 vs 발주서
 * 우선순위 근거 데이터).
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Compass, Sparkles, Users, FolderGit2, ChevronDown, ArrowRight } from 'lucide-vue-next'
import AgentExportPanel from '@/components/code/AgentExportPanel.vue'

const router = useRouter()

// 반복 사용자(매일 repo 브라우징)를 위해 접기 상태를 기억.
const COLLAPSE_KEY = 'harness_nextstep_collapsed_v1'
const _initCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}
const collapsed = ref(_initCollapsed())
const toggleCollapsed = () => {
  collapsed.value = !collapsed.value
  try { localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0') } catch { /* ignore */ }
}

const active = ref(null) // 'self' | 'outsource' | 'have' | null

const trackChoice = (id) => {
  try {
    const key = 'harness_nextstep_choice'
    const tally = JSON.parse(localStorage.getItem(key) || '{}')
    tally[id] = (tally[id] || 0) + 1
    tally._last = id
    tally._at = new Date().toISOString()
    localStorage.setItem(key, JSON.stringify(tally))
  } catch { /* ignore */ }
  // TODO(analytics): 백엔드 이벤트 엔드포인트 생기면 여기서 전송 —
  //   사용자층 분포(바이브 코더 / 외주 / 보유)가 번들·발주서 우선순위의 근거.
}

const pick = (id) => {
  const next = active.value === id ? null : id
  active.value = next
  if (next) trackChoice(next)
}

const goDeliverables = () => router.push('/deliverables')

// 펼친 상세는 카드 안에 흐름 배치로 이어 붙는다(카드 헤더와 한 박스로 연결).
// 토글 외에 바깥 클릭·Esc 로도 빠르게 접을 수 있게 한다.
const rootEl = ref(null)
const onDocClick = (e) => {
  if (!active.value || !rootEl.value) return
  if (!rootEl.value.contains(e.target)) active.value = null
}
const onKey = (e) => { if (e.key === 'Escape') active.value = null }
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <section ref="rootEl" class="ns-card" :aria-label="$t('code.next_step.aria_label')">
    <header class="ns-head">
      <div class="ns-head-text">
        <span class="ns-badge"><Compass :size="13" /> {{ $t('code.next_step.badge') }}</span>
        <p v-if="!collapsed" class="ns-sub" v-html="$t('code.next_step.intro')"></p>
      </div>
      <button type="button" class="ns-collapse" :aria-expanded="String(!collapsed)" @click="toggleCollapsed">
        {{ collapsed ? $t('code.next_step.expand') : $t('code.next_step.collapse') }}
        <ChevronDown :size="14" :class="{ 'ns-chev--up': !collapsed }" />
      </button>
    </header>

    <div v-if="!collapsed" class="ns-options">
      <!-- ① 직접 만들기 (바이브 코더) -->
      <div class="ns-opt" :class="{ 'ns-opt--active': active === 'self' }">
        <button type="button" class="ns-opt-btn" :aria-expanded="String(active === 'self')" @click="pick('self')">
          <span class="ns-opt-icon ns-opt-icon--self"><Sparkles :size="18" /></span>
          <span class="ns-opt-label">
            <strong>{{ $t('code.next_step.self.title') }}</strong>
            <small>{{ $t('code.next_step.self.desc') }}</small>
          </span>
          <ChevronDown :size="16" class="ns-opt-chev" :class="{ 'ns-chev--up': active === 'self' }" />
        </button>
        <div v-if="active === 'self'" class="ns-panel">
          <ol class="ns-steps">
            <li v-html="$t('code.next_step.self.step1')"></li>
            <li v-html="$t('code.next_step.self.step2')"></li>
            <li v-html="$t('code.next_step.self.step3')"></li>
          </ol>
          <AgentExportPanel />
        </div>
      </div>

      <!-- ② 개발자에게 맡기기 (외주·팀) -->
      <div class="ns-opt" :class="{ 'ns-opt--active': active === 'outsource' }">
        <button type="button" class="ns-opt-btn" :aria-expanded="String(active === 'outsource')" @click="pick('outsource')">
          <span class="ns-opt-icon ns-opt-icon--outsource"><Users :size="18" /></span>
          <span class="ns-opt-label">
            <strong>{{ $t('code.next_step.outsource.title') }}</strong>
            <small>{{ $t('code.next_step.outsource.desc') }}</small>
          </span>
          <ChevronDown :size="16" class="ns-opt-chev" :class="{ 'ns-chev--up': active === 'outsource' }" />
        </button>
        <div v-if="active === 'outsource'" class="ns-panel">
          <ol class="ns-steps">
            <li v-html="$t('code.next_step.outsource.step1')"></li>
            <li v-html="$t('code.next_step.outsource.step2')"></li>
            <li v-html="$t('code.next_step.outsource.step3')"></li>
          </ol>
          <p class="ns-soon" v-html="$t('code.next_step.outsource.soon')"></p>
          <button type="button" class="ns-cta" @click="goDeliverables">
            {{ $t('code.next_step.outsource.cta') }} <ArrowRight :size="14" />
          </button>
        </div>
      </div>

      <!-- ③ 이미 코드가 있음 (= 아래 기존 브라우저) -->
      <div class="ns-opt" :class="{ 'ns-opt--active': active === 'have' }">
        <button type="button" class="ns-opt-btn" :aria-expanded="String(active === 'have')" @click="pick('have')">
          <span class="ns-opt-icon ns-opt-icon--have"><FolderGit2 :size="18" /></span>
          <span class="ns-opt-label">
            <strong>{{ $t('code.next_step.have.title') }}</strong>
            <small>{{ $t('code.next_step.have.desc') }}</small>
          </span>
          <ChevronDown :size="16" class="ns-opt-chev" :class="{ 'ns-chev--up': active === 'have' }" />
        </button>
        <div v-if="active === 'have'" class="ns-panel">
          <p class="ns-have-desc" v-html="$t('code.next_step.have.body')"></p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ns-card {
  background: linear-gradient(135deg, #fff 0%, rgba(140, 98, 57, 0.05) 100%);
  border: 1px solid rgba(140, 98, 57, 0.16);
  border-radius: 16px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.ns-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.ns-head-text { min-width: 0; }
.ns-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 9999px;
  background: var(--accent, #8C6239); color: white;
  font-size: 0.7rem; font-weight: 800; letter-spacing: 0.01em;
}
.ns-sub {
  font-size: 0.82rem; line-height: 1.6;
  color: var(--text-muted, #6F665F); margin: 9px 0 0; max-width: 680px;
}
.ns-sub strong { color: var(--text-main, #2A2421); font-weight: 800; }
.ns-collapse {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 8px;
  background: transparent; border: 1px solid rgba(140, 98, 57, 0.2);
  color: var(--accent, #8C6239);
  font-family: inherit; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all .15s;
}
.ns-collapse:hover { background: rgba(140, 98, 57, 0.08); }

.ns-options {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  align-items: start; /* 펼친 카드만 세로로 늘어나고, 같은 행 다른 카드는 위로 정렬 */
  margin-top: 16px;
}
.ns-opt {
  position: relative; /* 펼친 패널(absolute)의 기준점 */
  display: flex; flex-direction: column;
  background: white; border: 1px solid rgba(140, 98, 57, 0.12);
  border-radius: 12px; overflow: visible;   /* 펼친 패널(absolute)이 카드 아래로 나가도 잘리지 않게 */
  transition: border-color .15s, box-shadow .15s;
}
.ns-opt--active { border-color: var(--accent, #8C6239); box-shadow: 0 10px 26px -12px rgba(140, 98, 57, 0.45); z-index: 30; }
/* 헤더가 펼친 패널과 한 박스로 이어져 보이게 — active 카드 하단 모서리는 직각. */
.ns-opt--active .ns-opt-btn { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.ns-opt-btn {
  display: flex; align-items: center; gap: 11px;
  width: 100%; padding: 14px 15px; min-height: 76px; box-sizing: border-box;
  background: transparent; border: none; cursor: pointer; text-align: left;
  font-family: inherit;
  border-radius: 11px;   /* overflow:visible 대비 — hover 배경이 카드 모서리를 넘지 않게 */
}
.ns-opt-btn:hover { background: rgba(140, 98, 57, 0.04); }
.ns-opt-icon {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 10px;
}
.ns-opt-icon--self { background: rgba(124, 58, 237, 0.12); color: #7c3aed; }
.ns-opt-icon--outsource { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.ns-opt-icon--have { background: rgba(22, 163, 74, 0.12); color: #16a34a; }
.ns-opt-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ns-opt-label strong { font-size: 0.84rem; font-weight: 800; color: var(--text-main, #2A2421); }
.ns-opt-label small { font-size: 0.7rem; line-height: 1.35; color: var(--text-muted, #6F665F); }
.ns-opt-chev { flex-shrink: 0; color: var(--text-dim, #A89B91); transition: transform .2s; }
.ns-chev--up { transform: rotate(180deg); }

.ns-panel {
  /* [2026-06] 흐름에서 빼 카드 아래로 띄운다(overlay) — 펼쳐도 아래 LOAD/EXPLORER 를 밀지 않게.
     ns-opt(position:relative) 기준. .ns-opt overflow:visible 과 세트(안 그러면 잘린다). */
  position: absolute; top: 100%; left: -1px; right: -1px;
  z-index: 25;
  padding: 12px 15px 15px;
  background: #fff;
  border: 1px solid var(--accent, #8C6239);
  border-top: 1px dashed rgba(140, 98, 57, 0.18);
  border-radius: 0 0 12px 12px;
  box-shadow: 0 16px 34px -14px rgba(140, 98, 57, 0.4);   /* 떠 있는 느낌 — 헤더와 한 덩어리로 */
  max-height: min(62vh, 540px);                            /* 길어도(직접 만들기) 화면을 다 덮지 않게 */
  overflow-y: auto;
  animation: ns-panel-in .18s cubic-bezier(.16, 1, .3, 1); /* 갑툭튀 방지 — 부드럽게 내려오며 등장 */
}
@keyframes ns-panel-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ns-steps {
  margin: 12px 0 0; padding-left: 18px;
  display: flex; flex-direction: column; gap: 7px;
}
.ns-steps li { font-size: 0.76rem; line-height: 1.5; color: var(--text-main, #2A2421); }
.ns-steps em { font-style: normal; color: var(--accent, #8C6239); font-weight: 700; }
.ns-have-desc { margin: 12px 0 0; font-size: 0.78rem; line-height: 1.6; color: var(--text-main, #2A2421); }
.ns-soon {
  margin: 11px 0 0; padding: 7px 10px;
  background: rgba(140, 98, 57, 0.06); border-radius: 7px;
  font-size: 0.7rem; line-height: 1.45; color: var(--text-muted, #6F665F);
}
.ns-soon code {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.68rem;
  background: rgba(0, 0, 0, 0.05); padding: 1px 4px; border-radius: 4px;
}
.ns-cta {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 12px; padding: 9px 16px; border-radius: 9999px;
  background: var(--accent, #8C6239); color: white; border: none;
  font-family: inherit; font-size: 0.74rem; font-weight: 800;
  cursor: pointer; transition: background .15s, transform .15s;
}
.ns-cta:hover { background: #6E4E2E; transform: translateY(-1px); }

/* 펼친 상세는 카드 안에 흐름 배치로 이어 붙는다 — 카드 헤더와 한 박스로 연결돼
   보이도록(별도 띄움·그림자 분리 없음). 선택된 카드만 세로로 늘어나고, 같은 행의
   다른 카드는 위로 정렬된다(.ns-options align-items: start). */

/* 태블릿: 2열 */
@media (max-width: 860px) {
  .ns-options { grid-template-columns: repeat(2, 1fr); }
}
/* 모바일: 1열 */
@media (max-width: 560px) {
  .ns-options { grid-template-columns: 1fr; }
  /* 좁은 화면은 overlay 대신 흐름 유지 — 떠 있으면 답답하고 다음 카드를 가린다. */
  .ns-panel {
    position: static; left: 0; right: 0;
    max-height: none; overflow-y: visible;
    box-shadow: none; border: none;
    border-top: 1px dashed rgba(140, 98, 57, 0.18);
    border-radius: 0; animation: none;
  }
  .ns-opt--active .ns-opt-btn { border-radius: 11px; }
}
</style>
