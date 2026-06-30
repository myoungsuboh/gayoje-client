<script setup>
/**
 * 공통 가이드 모달 shell — Plan/Design/Deliverables/Lint/MCP 가이드의 동일 골격을
 * 한 곳으로 통합 (2026-05-27 리팩토링).
 *
 * 이전: UserGuideModal / McpGuideModal / DesignGuideModal / DeliverablesGuideModal /
 * LintGuideModal 5개가 동일한 스텝 네비게이션 + localStorage "다시 안보기" + ESC/화살표
 * 단축키 + CSS 를 각자 복붙 (각 600~700줄). 차이는 steps 데이터 + illustration SVG 뿐.
 *
 * 이후: 각 모달은 steps 배열 + illustration SVG (slot) + 헤더 텍스트(props) 만 정의하고
 * 골격/로직/스타일은 이 컴포넌트가 담당.
 *
 * Props:
 *   modelValue   — 표시 여부 (v-model)
 *   steps        — [{ no, icon, title, subtitle, desc, tip, illustration }]
 *   seenKey      — guideSeen 베이스 키 (모달 열림 시 계정 스코프로 seen 저장)
 *   pill         — 헤더 좌상단 pill 텍스트 (예: "DESIGN GUIDE")
 *   headline     — 헤더 제목
 *   sub          — 헤더 부제
 *   finishLabel  — 마지막 스텝 완료 버튼 텍스트 (default "시작하기")
 *
 * Slots:
 *   illustration — slotProps { step, illustration } — 각 모달의 SVG. currentStep 의
 *                  illustration 키로 v-if 분기. (.step-illust wrapper 는 이 컴포넌트 제공)
 *
 * Emits:
 *   update:modelValue — 닫힘 신호
 *   finish            — 마지막 스텝 완료. 추가 동작이 필요한 모달(예: MCP → /profile
 *                       이동)이 이 이벤트로 처리. 닫기는 이 컴포넌트가 이미 수행.
 */
import { ref, computed, watch, onBeforeUnmount, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, ChevronLeft, ChevronRight, Lightbulb, Check } from 'lucide-vue-next'
import { markGuideSeen } from '@/utils/guideSeen'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  steps: { type: Array, required: true },
  seenKey: { type: String, required: true },
  pill: { type: String, default: 'GUIDE' },
  headline: { type: String, default: '' },
  sub: { type: String, default: '' },
  // 미지정('') 시 공통 기본 라벨(common.guide.finish_default) 사용.
  finishLabel: { type: String, default: '' },
  // 마지막 스텝 완료 버튼 아이콘 (lucide 컴포넌트). 미지정 시 Check.
  // 예: MCP 가이드는 ArrowUpRight ("연결하러 가기").
  finishIcon: { type: [Object, Function], default: null },
})

const _CheckIcon = markRaw(Check)
const resolvedFinishIcon = computed(() => props.finishIcon || _CheckIcon)
const resolvedFinishLabel = computed(() => props.finishLabel || t('common.guide.finish_default'))
const emit = defineEmits(['update:modelValue', 'finish'])

const stepIndex = ref(0)
// 스텝 전환 방향 — 가로 슬라이드 애니메이션용. next=왼쪽으로 밀림, prev=오른쪽.
const slideName = ref('slide-left')

const currentStep = computed(() => props.steps[stepIndex.value] || {})
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value === props.steps.length - 1)

const next = () => { if (!isLast.value) { slideName.value = 'slide-left'; stepIndex.value++ } }
const prev = () => { if (!isFirst.value) { slideName.value = 'slide-right'; stepIndex.value-- } }
const goTo = (idx) => {
  slideName.value = idx > stepIndex.value ? 'slide-left' : 'slide-right'
  stepIndex.value = idx
}

// [2026-05-30] 가로 스와이프로 스텝 넘기기 — 모바일에서 자연스러운 페이징.
// 세로 스크롤(콘텐츠)과 충돌하지 않도록 |Δx| > |Δy| 일 때만 스텝 전환.
let _touchX = 0
let _touchY = 0
const SWIPE_THRESHOLD = 50
const onTouchStart = (e) => {
  const t = e.changedTouches?.[0]
  if (!t) return
  _touchX = t.screenX
  _touchY = t.screenY
}
const onTouchEnd = (e) => {
  const t = e.changedTouches?.[0]
  if (!t) return
  const dx = t.screenX - _touchX
  const dy = t.screenY - _touchY
  if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) next()
    else prev()
  }
}

const close = () => emit('update:modelValue', false)

// 마지막 스텝 완료 — finish emit (모달별 추가 동작) + 닫기.
const finish = () => {
  emit('finish')
  emit('update:modelValue', false)
}

// 모달이 열리는 순간 seen 기록 (계정당 최초 1회 자동 표시).
// 어떤 경로로 닫아도(X/배경/ESC/완료) 다음 진입엔 자동으로 뜨지 않는다 —
// 다시 보려면 각 페이지의 가이드 버튼. 열릴 때마다 첫 step 으로 리셋.
watch(() => props.modelValue, (open) => {
  if (open) {
    stepIndex.value = 0
    markGuideSeen(props.seenKey)
  }
}, { immediate: true })

// 키보드 단축키 — ESC 닫기 / 좌우 화살표 네비.
const onKeydown = (e) => {
  if (!props.modelValue) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeydown)
}
// 컴포넌트 unmount 시 리스너 해제 — 이전 5개 모달은 누락했던 정리 (메모리 누수 방지).
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <transition name="guide-fade">
    <div v-if="modelValue" class="guide-overlay" @click.self="close">
      <div class="guide-modal" role="dialog" aria-labelledby="base-guide-title">
        <button type="button" class="guide-close" @click="close" :aria-label="$t('common.action.close')">
          <X :size="18" />
        </button>

        <!-- Header -->
        <div class="guide-header">
          <span class="section-pill">{{ pill }}</span>
          <h3 id="base-guide-title" class="serif-text guide-headline">{{ headline }}</h3>
          <p v-if="sub" class="guide-sub">{{ sub }}</p>
        </div>

        <!-- Step body — 가로 스와이프로 스텝 전환 (모바일 페이징) -->
        <div class="step-body" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <transition :name="slideName" mode="out-in">
            <div class="step-pane" :key="stepIndex">
              <!-- Illustration — 각 모달이 slot 으로 SVG 주입 (currentStep.illustration 분기) -->
              <div class="step-illust">
                <slot name="illustration" :step="currentStep" :illustration="currentStep.illustration" />
              </div>

              <!-- Text content -->
              <div class="step-text">
                <div class="step-meta">
                  <span class="step-no mono-text">{{ currentStep.no }}</span>
                  <span class="step-subtitle mono-text">{{ currentStep.subtitle }}</span>
                </div>
                <h4 class="step-title serif-text">
                  <component :is="currentStep.icon" v-if="currentStep.icon" :size="20" class="step-icon" />
                  {{ currentStep.title }}
                </h4>
                <p class="step-desc">{{ currentStep.desc }}</p>
                <div v-if="currentStep.tip" class="step-tip">
                  <Lightbulb :size="14" class="tip-icon" />
                  <span>{{ currentStep.tip }}</span>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Footer -->
        <div class="guide-footer">
          <div class="step-dots">
            <button
              v-for="(s, i) in steps"
              :key="s.no"
              type="button"
              class="dot"
              :class="{ 'dot--active': i === stepIndex }"
              :aria-label="$t('common.guide.step_aria', { index: i + 1, title: s.title })"
              @click="goTo(i)"
            />
          </div>

          <div class="nav-row">
            <button
              type="button"
              class="nav-btn nav-btn--ghost"
              :disabled="isFirst"
              @click="prev"
            >
              <ChevronLeft :size="14" class="mr-1" />
              {{ $t('common.guide.prev') }}
            </button>
            <button
              v-if="!isLast"
              type="button"
              class="nav-btn nav-btn--primary"
              @click="next"
            >
              {{ $t('common.guide.next') }}
              <ChevronRight :size="14" class="ml-1" />
            </button>
            <button
              v-else
              type="button"
              class="nav-btn nav-btn--primary"
              @click="finish"
            >
              <component :is="resolvedFinishIcon" :size="14" class="mr-1" />
              {{ resolvedFinishLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.guide-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(20, 18, 14, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}

.guide-modal {
  position: relative;
  width: 100%; max-width: 720px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 32px);
}

.guide-close {
  position: absolute; top: 14px; right: 14px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 9999px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
  z-index: 1;
}
.guide-close:hover { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }

.guide-header {
  padding: 28px 32px 16px;
  border-bottom: 1px solid var(--border-light);
}

.section-pill {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.6rem; font-weight: 700;
  background: var(--accent); color: white;
  padding: 3px 12px; border-radius: 9999px;
  letter-spacing: 0.08em;
}

.guide-headline {
  margin: 10px 0 4px;
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--text-main);
  line-height: 1.3;
}

.guide-sub {
  margin: 0;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.step-body {
  flex: 1;
  padding: 28px 32px;
  overflow-y: auto;
  overflow-x: hidden;
}
/* [2026-05-30] grid 를 .step-body 에서 .step-pane 으로 이동 — 스와이프 전환 시
   transition 이 감싸는 단일 노드(.step-pane)가 grid 레이아웃을 담당하도록. */
.step-pane {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: center;
}

/* 가로 슬라이드 전환 — next(왼쪽으로), prev(오른쪽으로) */
.slide-left-enter-active, .slide-left-leave-active,
.slide-right-enter-active, .slide-right-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.slide-left-enter-from { transform: translateX(36px); opacity: 0; }
.slide-left-leave-to { transform: translateX(-36px); opacity: 0; }
.slide-right-enter-from { transform: translateX(-36px); opacity: 0; }
.slide-right-leave-to { transform: translateX(36px); opacity: 0; }

.step-illust { display: flex; align-items: center; justify-content: center; }
/* slot 으로 주입된 SVG — scoped 경계를 넘기 위해 :deep. 각 모달은 svg 만 넣으면 됨. */
.step-illust :deep(svg) { width: 100%; max-width: 280px; height: auto; display: block; }

.step-text { display: flex; flex-direction: column; gap: 12px; }
.step-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.step-no {
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--accent);
  letter-spacing: 0.04em;
}
.step-subtitle {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 10px;
  background: rgba(140, 98, 57, 0.06);
  border-radius: 9999px;
}

.step-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 1.2rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0;
  line-height: 1.3;
}
.step-icon { color: var(--accent); flex-shrink: 0; }

.step-desc {
  margin: 0;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.86rem;
  font-weight: 500;
  color: var(--text-main);
  line-height: 1.65;
}

.step-tip {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px;
  background: rgba(46, 64, 54, 0.06);
  border: 1px solid rgba(46, 64, 54, 0.15);
  border-radius: 10px;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.76rem;
  color: var(--primary-moss, #2E4036);
  line-height: 1.5;
}
.tip-icon { flex-shrink: 0; margin-top: 2px; color: var(--primary-moss, #2E4036); }

.guide-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 32px 22px;
  border-top: 1px solid var(--border-light);
  background: #fafbfc;
  gap: 16px; flex-wrap: wrap;
}

.step-dots { display: flex; gap: 8px; }
.dot {
  width: 8px; height: 8px;
  border-radius: 9999px;
  border: none;
  background: var(--border-light);
  cursor: pointer;
  transition: all 0.15s;
}
.dot--active { background: var(--accent); width: 24px; }
.dot:hover:not(.dot--active) { background: var(--text-muted); }

.nav-row { display: flex; gap: 8px; }

.nav-btn {
  display: inline-flex; align-items: center;
  padding: 8px 16px;
  border-radius: 9999px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem; font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}
.nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.nav-btn--ghost {
  background: white;
  color: var(--text-main);
  border-color: var(--border-light);
}
.nav-btn--ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.nav-btn--primary { background: var(--text-main); color: white; }
.nav-btn--primary:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }

.guide-fade-enter-active, .guide-fade-leave-active { transition: opacity 0.2s ease; }
.guide-fade-enter-from, .guide-fade-leave-to { opacity: 0; }

@media (max-width: 720px) {
  .guide-modal { border-radius: 16px; }
  .guide-header { padding: 22px 22px 14px; }
  .guide-headline { font-size: 1.15rem; }
  .step-body {
    padding: 20px 22px;
  }
  .step-pane {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .step-illust :deep(svg) { max-width: 220px; }
  .step-title { font-size: 1.05rem; }
  .step-desc { font-size: 0.82rem; }
  .guide-footer {
    padding: 14px 22px 18px;
    flex-direction: column;
    align-items: stretch;
  }
  .step-dots { justify-content: center; }
  .nav-row { justify-content: center; }
}

@media (max-width: 480px) {
  .guide-header { padding: 18px 18px 12px; }
  .step-body { padding: 16px 18px; }
  .guide-footer { padding: 12px 18px 16px; }
  .step-illust :deep(svg) { max-width: 180px; }
}
</style>
