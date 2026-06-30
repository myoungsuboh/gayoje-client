<script setup>
/**
 * 7-step Workflow Diagram — 메인 화면의 핵심 시각화.
 *
 * [디자인 리프레시 — 2026-05-18]
 * 사용자 피드백 "메인 디자인이 최악". 이전엔 정적 카드 + 단조로운 색.
 * 이번엔 큰 둥근 노드 + 흐름 애니메이션 + 단계별 색상 코딩 강화 + 깊이감.
 *
 * [깜빡임 fix]
 * 이전: visibleStep = activeStep || hoveredStep || STEPS[0] → hover 떠나면 1번
 * 으로 회귀해 카드가 깜빡. 이제 viewedStep 을 ref 로 sticky — hover 들어올 때만
 * 갱신, hover 떠나도 마지막 본 상태 유지.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Mic, FileText, Sparkles, Layers, Code, ShieldCheck, Package,
  ArrowRight,
} from 'lucide-vue-next'

const router = useRouter()

const STEPS = [
  {
    id: 'meeting',
    no: 1,
    label: '녹음',
    sub: '회의록 입력',
    icon: Mic,
    color: '#8C6239',
    bgGradient: 'linear-gradient(135deg, #8C6239 0%, #6E4E2E 100%)',
    desc: '음성 파일 / 텍스트 / Notion 페이지로 회의 내용을 입력합니다. AI 가 자동으로 한국어 전사.',
    output: '✓ Meeting Log v1.1 ~ vN',
    route: '/plan',
  },
  {
    id: 'cps',
    no: 2,
    label: '정리',
    sub: '핵심 추출',
    icon: Sparkles,
    color: '#A37449',
    bgGradient: 'linear-gradient(135deg, #A37449 0%, #8C6239 100%)',
    desc: 'AI 가 회의록에서 핵심 문제(Problem)와 해결책(Solution)을 추출. 회의록이 갱신되면 영향받은 섹션만 자동 재생성.',
    output: '✓ Context · Problem · Solution',
    route: '/plan?tab=cps',
  },
  {
    id: 'prd',
    no: 3,
    label: '기획',
    sub: '기획서(PRD)',
    icon: FileText,
    color: '#BB7E4E',
    bgGradient: 'linear-gradient(135deg, #BB7E4E 0%, #A37449 100%)',
    desc: 'CPS 를 Epic → Story → Acceptance Criteria 트리로 분해. 개발 가능한 PRD 자동 생성 — 티켓팅 바로 가능.',
    output: '✓ Epic · Story · AC',
    route: '/plan?tab=prd',
  },
  {
    id: 'design',
    no: 4,
    label: '설계',
    sub: '시스템 명세',
    icon: Layers,
    color: '#2563EB',
    bgGradient: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
    desc: 'PRD 기반으로 SPACK(API/Entity/Policy) + DDD(Aggregate) + Architecture(Service/DB) 한 번에 생성.',
    output: '✓ SPACK + DDD + Architecture',
    route: '/design',
  },
  {
    id: 'code',
    no: 5,
    label: '코드',
    sub: '에이전트 연결',
    icon: Code,
    color: '#0891B2',
    bgGradient: 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)',
    desc: 'AI 에이전트(Claude Code / Cursor) 에 명세 패키지를 던지면 코드가 자동 작성. GitHub 저장소에 push.',
    output: '✓ GitHub Repo 연결',
    route: '/code',
  },
  {
    id: 'lint',
    no: 6,
    label: '점검',
    sub: '명세 준수 검증',
    icon: ShieldCheck,
    color: '#16A34A',
    bgGradient: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
    desc: 'AI 작성 코드가 SPACK/DDD/Architecture 명세를 잘 지켰는지 4영역 자동 검사. 위반 사항은 Fix Spec 으로 자동 변환.',
    output: '✓ Compliance % + 위반 목록',
    route: '/lint',
  },
  {
    id: 'handoff',
    no: 7,
    label: '인수',
    sub: '산출물 전달',
    icon: Package,
    color: '#9333EA',
    bgGradient: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)',
    desc: '모든 산출물 (명세 + Repo + Lint 결과 + 코딩 규칙) 을 ZIP 한 파일로 묶어 다음 팀에 전달.',
    output: '✓ Handoff ZIP',
    route: '/deliverables',
  },
]

// [깜빡임 fix] hover 들어올 때만 갱신, leave 시 유지 → 첫 노드(STEPS[0]) 초기값
// 으로 시작해서 사용자가 다른 노드 hover 하면 그 노드 유지. 마우스가 카드 영역으로
// 이동해도 viewedStep 이 유지되어 active 표시 안 깜빡임.
const viewedStep = ref(STEPS[0])

const onNodeEnter = (step) => { viewedStep.value = step }
const onNodeClick = (step) => {
  // 같은 노드 click → 페이지 이동. 다른 노드 click → 그 노드로 view 전환.
  if (viewedStep.value.id === step.id) {
    router.push(step.route)
  } else {
    viewedStep.value = step
  }
}
const goToStep = (step) => { router.push(step.route) }
</script>

<template>
  <section class="workflow-section">
    <div class="workflow-header">
      <span class="workflow-pill mono-text">HOW IT WORKS</span>
      <h3 class="workflow-title serif-text">AI 시니어가 7단계로 일합니다</h3>
      <p class="workflow-sub">회의록 하나 던지면 — 코드까지 끊김 없이.</p>
    </div>

    <!-- 7-step 트랙 — 큰 둥근 노드 + 흐름 라인 -->
    <div class="workflow-rail">
      <div class="workflow-line" aria-hidden="true"></div>
      <div class="workflow-line-flow" aria-hidden="true"></div>
      <div class="workflow-nodes">
        <button
          v-for="step in STEPS"
          :key="step.id"
          type="button"
          class="step-bubble"
          :class="{ 'step-bubble--active': viewedStep.id === step.id }"
          :style="{
            '--step-color': step.color,
            '--step-gradient': step.bgGradient,
          }"
          :aria-label="`${step.no}단계 — ${step.label}: ${step.sub}`"
          @mouseenter="onNodeEnter(step)"
          @focus="onNodeEnter(step)"
          @click="onNodeClick(step)"
        >
          <span class="step-bubble-no mono-text">{{ step.no }}</span>
          <span class="step-bubble-icon">
            <component :is="step.icon" :size="22" />
          </span>
          <span class="step-bubble-label">{{ step.label }}</span>
        </button>
      </div>
    </div>

    <!-- 상세 카드 — viewedStep 의 색상으로 깊이감 + 그라데이션 -->
    <div
      class="step-detail"
      :style="{
        '--step-color': viewedStep.color,
        '--step-gradient': viewedStep.bgGradient,
      }"
    >
      <div class="step-detail-glow" aria-hidden="true"></div>
      <div class="step-detail-meta">
        <span class="step-detail-num mono-text">STEP {{ viewedStep.no }} / 7</span>
        <span class="step-detail-sub">{{ viewedStep.sub }}</span>
      </div>
      <h4 class="step-detail-title serif-text">
        <span class="step-detail-icon">
          <component :is="viewedStep.icon" :size="22" />
        </span>
        {{ viewedStep.label }} — {{ viewedStep.sub }}
      </h4>
      <p class="step-detail-desc">{{ viewedStep.desc }}</p>
      <div class="step-detail-output mono-text">{{ viewedStep.output }}</div>
      <button class="step-detail-cta" @click="goToStep(viewedStep)">
        <span>이 단계로 이동</span>
        <ArrowRight :size="14" class="ml-2" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.workflow-section {
  width: 100%;
  padding: 80px 24px 64px;
  max-width: 1100px;
  margin: 0 auto;
}

.workflow-header {
  text-align: center;
  margin-bottom: 56px;
}

.workflow-pill {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, rgba(140, 98, 57, 0.08), rgba(140, 98, 57, 0.04));
  color: var(--accent);
  padding: 6px 16px;
  border-radius: 9999px;
  margin-bottom: 18px;
  border: 1px solid rgba(140, 98, 57, 0.12);
}

.workflow-title {
  font-size: clamp(2rem, 4.5vw, 2.75rem);
  font-weight: 900;
  color: var(--text-main);
  margin: 0 0 12px;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.workflow-sub {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 1.05rem;
  color: var(--text-muted);
  margin: 0;
  font-weight: 500;
}

/* ── 트랙: 흐름 라인 + 노드 ─────────────────────────── */

.workflow-rail {
  position: relative;
  padding: 16px 0 24px;
  margin-bottom: 56px;
}

/* 정적 회색 라인 — 7개 노드를 가로지름 */
.workflow-line {
  position: absolute;
  left: 5%;
  right: 5%;
  top: 50%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--border-light) 8%,
    var(--border-light) 92%,
    transparent 100%
  );
  transform: translateY(-50%);
  z-index: 0;
}

/* 위에 흐르는 그라데이션 — 단계 흐름 시각화 (정적 그라데이션, 모션은 절제) */
.workflow-line-flow {
  position: absolute;
  left: 8%;
  right: 8%;
  top: 50%;
  height: 2px;
  background: linear-gradient(
    90deg,
    #8C6239 0%,
    #A37449 14%,
    #BB7E4E 28%,
    #2563EB 42%,
    #0891B2 57%,
    #16A34A 71%,
    #9333EA 100%
  );
  transform: translateY(-50%);
  opacity: 0.32;
  z-index: 0;
  filter: blur(1px);
}

.workflow-nodes {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1;
}

.step-bubble {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 92px;
  padding: 14px 6px 12px;
  border: none;
  background: white;
  border-radius: 18px;
  cursor: pointer;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease,
    background 0.3s ease;
  flex-shrink: 0;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 4px 12px rgba(0, 0, 0, 0.04);
  /* CSS 변수 — 노드별로 색상 주입 */
  --step-color: var(--accent);
  --step-gradient: linear-gradient(135deg, var(--accent), var(--accent));
}
.step-bubble:hover,
.step-bubble:focus-visible {
  transform: translateY(-6px);
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.05),
    0 12px 28px rgba(0, 0, 0, 0.1);
  outline: none;
}
.step-bubble--active {
  background: var(--step-gradient);
  transform: translateY(-4px) scale(1.04);
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.08),
    0 20px 40px rgba(0, 0, 0, 0.12),
    0 0 0 4px rgba(255, 255, 255, 0.9) inset;
}

.step-bubble-no {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  transition: color 0.2s ease;
}
.step-bubble--active .step-bubble-no { color: rgba(255, 255, 255, 0.92); }

.step-bubble-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--step-color) 12%, white);
  color: var(--step-color);
  margin: 4px 0 2px;
  transition: background 0.25s ease, color 0.25s ease;
}
.step-bubble--active .step-bubble-icon {
  background: rgba(255, 255, 255, 0.22);
  color: white;
}

.step-bubble-label {
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text-main);
  transition: color 0.2s ease;
}
.step-bubble--active .step-bubble-label { color: white; }

/* ── 상세 카드 — 깊이감 + 그라데이션 ────────────────── */

.step-detail {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  padding: 36px 40px 32px;
  background: white;
  border-radius: 24px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 24px 60px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  border-top: 3px solid var(--step-color, var(--accent));
  transition: border-color 0.4s ease;
  --step-color: var(--accent);
  --step-gradient: linear-gradient(135deg, var(--accent), var(--accent));
}

/* 상단 우측에 컬러 글로우 — 깊이감 강조 */
.step-detail-glow {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: var(--step-gradient);
  filter: blur(80px);
  opacity: 0.18;
  pointer-events: none;
  transition: opacity 0.4s ease;
}

.step-detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}
.step-detail-num {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--step-color);
  text-transform: uppercase;
}
.step-detail-sub {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 4px 12px;
  border-radius: 9999px;
}

.step-detail-title {
  display: flex;
  align-items: center;
  font-size: 1.55rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0 0 14px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  position: relative;
  z-index: 1;
}
.step-detail-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--step-gradient);
  color: white;
  margin-right: 14px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.step-detail-desc {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.96rem;
  color: var(--text-main);
  line-height: 1.7;
  margin: 0 0 18px;
  position: relative;
  z-index: 1;
}

.step-detail-output {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--primary-moss, #2E4036);
  background: rgba(46, 64, 54, 0.08);
  padding: 6px 14px;
  border-radius: 9999px;
  margin-bottom: 22px;
  position: relative;
  z-index: 1;
}

.step-detail-cta {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border: none;
  background: var(--step-gradient);
  color: white;
  border-radius: 9999px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--step-color) 30%, transparent);
  position: relative;
  z-index: 1;
}
.step-detail-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--step-color) 40%, transparent);
}

/* ── 반응형 ────────────────────────────────────────── */

@media (max-width: 900px) {
  .step-bubble { width: 76px; padding: 12px 4px 10px; }
  .step-bubble-icon { width: 34px; height: 34px; }
  .step-bubble-label { font-size: 0.72rem; }
}

@media (max-width: 640px) {
  .workflow-section { padding: 56px 16px 40px; }
  .workflow-title { font-size: 1.6rem; }
  .workflow-rail { overflow-x: auto; padding-bottom: 36px; }
  .workflow-nodes { gap: 12px; min-width: 560px; padding: 0 4px; }
  .workflow-line, .workflow-line-flow { left: 16px; right: 16px; }
  .step-detail { padding: 26px 24px; }
  .step-detail-title { font-size: 1.25rem; }
  .step-detail-icon { width: 34px; height: 34px; margin-right: 10px; }
}

.mono-text { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
.serif-text { font-family: 'Playfair Display', 'Pretendard Variable', serif; }
.ml-2 { margin-left: 8px; }
</style>
