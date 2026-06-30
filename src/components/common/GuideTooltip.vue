<script setup>
/**
 * GuideTooltip — ⓘ 아이콘 hover/long-press 시 가이드 popover 노출.
 *
 * 사용:
 *   <GuideTooltip target="meeting-log-template" />
 *   <GuideTooltip target="run-lint" placement="bottom" />
 *
 * 동작:
 *   - 데스크탑: 마우스 hover → popover 노출 (200ms delay).
 *   - 모바일/터치: 탭 → popover toggle.
 *   - ESC / 바깥 클릭 → 닫힘.
 *   - target key 가 guides 네임스페이스에 없으면 경고 로그 + 렌더 안 함 (typo 빨리 발견).
 *
 * [2026-05] popover 는 <Teleport to="body"> 로 body 레벨에 렌더링 + position
 * fixed 사용 — v-tab / scroll container 의 overflow:hidden 에 가려지는 버그
 * fix. trigger 좌표는 getBoundingClientRect 로 매 프레임 갱신.
 *
 * 가이드 컨텐츠(title/desc)는 i18n `guides` 네임스페이스(src/locales/{ko,en}/guides.json)
 * 에서 lookup, gif 자산은 src/utils/guides.js 의 GUIDE_GIFS. 파일 없어도 텍스트로 동작.
 */
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info, X } from 'lucide-vue-next'
import { GUIDE_GIFS } from '@/utils/guides'

const { t, te } = useI18n()

const props = defineProps({
  target: { type: String, required: true },
  placement: { type: String, default: 'top' },  // top / bottom / left / right
  // 아이콘 크기. 옆에 두는 텍스트와 어울리는 크기로 조정 가능.
  size: { type: Number, default: 13 },
})

// 존재 여부는 원문(ko) 키 기준 — 로케일 독립적인 canonical 집합. 콘텐츠는 t() 로
// 현재 로케일 렌더(없으면 ko fallback). locale 변경 시 t() 가 재평가되어 반응.
const exists = computed(() => te(`guides.${props.target}.title`, 'ko'))
const guide = computed(() => exists.value
  ? {
      title: t(`guides.${props.target}.title`),
      desc: t(`guides.${props.target}.desc`),
      gif: GUIDE_GIFS[props.target] || null,
    }
  : null)
if (typeof window !== 'undefined' && !exists.value) {
  console.warn(`[GuideTooltip] unknown target: "${props.target}". guides.json (ko/en) 에 추가하세요.`)
}

const isOpen = ref(false)
const videoFailed = ref(false)
const triggerRef = ref(null)
const popoverPos = ref({ top: 0, left: 0, transform: '' })
const POPOVER_WIDTH = 280
const POPOVER_GAP = 8  // 트리거 ~ popover 간격
const EDGE_MARGIN = 8  // 화면 끝까지 최소 여백

let _showTimer = null
const SHOW_DELAY_MS = 250

const computePosition = () => {
  if (!triggerRef.value || typeof window === 'undefined') return
  const rect = triggerRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  // popover 의 실제 너비는 모바일에서 줄어들 수 있어 동적으로 계산.
  const popW = Math.min(POPOVER_WIDTH, vw - EDGE_MARGIN * 2)

  let top = 0, left = 0, transform = ''

  if (props.placement === 'bottom') {
    top = rect.bottom + POPOVER_GAP
    left = rect.left + rect.width / 2
    transform = 'translateX(-50%)'
  } else if (props.placement === 'left') {
    top = rect.top + rect.height / 2
    left = rect.left - POPOVER_GAP
    transform = 'translate(-100%, -50%)'
  } else if (props.placement === 'right') {
    top = rect.top + rect.height / 2
    left = rect.right + POPOVER_GAP
    transform = 'translateY(-50%)'
  } else {
    // top (default)
    top = rect.top - POPOVER_GAP
    left = rect.left + rect.width / 2
    transform = 'translate(-50%, -100%)'
  }

  // 화면 가장자리 보정 — popover 가 viewport 밖으로 나가지 않도록.
  // bottom/top placement 는 가로 중앙 정렬 → 좌우 가장자리 clamp.
  if (props.placement === 'top' || props.placement === 'bottom') {
    const halfW = popW / 2
    if (left - halfW < EDGE_MARGIN) {
      left = EDGE_MARGIN + halfW
    } else if (left + halfW > vw - EDGE_MARGIN) {
      left = vw - EDGE_MARGIN - halfW
    }
  }

  popoverPos.value = { top, left, transform }
}

const open = () => {
  if (_showTimer) clearTimeout(_showTimer)
  _showTimer = setTimeout(() => {
    isOpen.value = true
    nextTick(computePosition)
  }, SHOW_DELAY_MS)
}
const close = () => {
  if (_showTimer) { clearTimeout(_showTimer); _showTimer = null }
  isOpen.value = false
}
const toggle = (e) => {
  e.preventDefault()
  e.stopPropagation()
  if (isOpen.value) close()
  else {
    isOpen.value = true
    nextTick(computePosition)
  }
}

// 바깥 클릭 / ESC 로 닫힘
const onKeydown = (e) => { if (e.key === 'Escape' && isOpen.value) close() }
const onDocClick = (e) => {
  if (!isOpen.value) return
  const el = e.target
  // 클릭이 트리거 영역(root) 또는 popover 영역 안이면 유지, 외부면 close.
  if (el?.closest?.('.guide-tooltip-root') || el?.closest?.('.guide-tooltip-popover')) return
  close()
}
// 스크롤·resize 시 popover 위치 재계산. trigger 가 움직이면 따라가야 함.
const onScroll = () => { if (isOpen.value) computePosition() }
const onResize = () => { if (isOpen.value) computePosition() }

watch(isOpen, (open) => {
  if (!open) videoFailed.value = false
  if (typeof window === 'undefined') return
  if (open) {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('click', onDocClick, true)
    // capture 단계 + passive 로 성능 손실 최소화.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
  } else {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('click', onDocClick, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onResize)
  }
})
onBeforeUnmount(() => {
  if (_showTimer) clearTimeout(_showTimer)
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('click', onDocClick, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})

const placementClass = computed(() => `guide-tooltip-popover--${props.placement}`)
const popoverStyle = computed(() => ({
  position: 'fixed',
  top: `${popoverPos.value.top}px`,
  left: `${popoverPos.value.left}px`,
  transform: popoverPos.value.transform,
}))
</script>

<template>
  <span
    v-if="guide"
    class="guide-tooltip-root"
    @mouseenter="open"
    @mouseleave="close"
  >
    <button
      ref="triggerRef"
      type="button"
      class="guide-tooltip-trigger"
      :aria-label="$t('common.tooltip.help_aria', { title: guide.title })"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <Info :size="size" />
    </button>

    <Teleport to="body">
      <transition name="guide-tooltip-fade">
        <div
          v-if="isOpen"
          class="guide-tooltip-popover"
          :class="placementClass"
          :style="popoverStyle"
          role="tooltip"
          @mouseenter="open"
          @mouseleave="close"
        >
          <div class="guide-tooltip-header">
            <span class="guide-tooltip-title">{{ guide.title }}</span>
            <button type="button" class="guide-tooltip-close" :aria-label="$t('common.action.close')" @click="close">
              <X :size="12" />
            </button>
          </div>

          <!-- GIF / webm 영상 — 파일 경로가 있고 로드에 성공했을 때만 표시 -->
          <video
            v-if="guide.gif && !videoFailed"
            class="guide-tooltip-gif"
            :src="guide.gif"
            autoplay
            loop
            muted
            playsinline
            @error="videoFailed = true"
          />

          <p class="guide-tooltip-desc">{{ guide.desc }}</p>
        </div>
      </transition>
    </Teleport>
  </span>
</template>

<style scoped>
.guide-tooltip-root {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: 4px;
  line-height: 1;
}

.guide-tooltip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: help;
  border-radius: 9999px;
  transition: color 0.15s, background 0.15s;
}
.guide-tooltip-trigger:hover,
.guide-tooltip-trigger:focus-visible {
  color: var(--accent);
  background: rgba(140, 98, 57, 0.08);
  outline: none;
}
</style>

<!-- [2026-05] popover 는 <Teleport to="body"> 로 body 레벨에 렌더링되므로
     scoped 스타일이 적용 안 됨. 전역 스타일로 별도 선언. -->
<style>
.guide-tooltip-popover {
  z-index: 10000;
  width: 280px;
  background: #1F1A14;
  color: #F5EEE3;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  line-height: 1.55;
  text-align: left;
  pointer-events: auto;
  max-width: calc(100vw - 16px);
}

.guide-tooltip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.guide-tooltip-title {
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #F5EEE3;
}

.guide-tooltip-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  padding: 0;
  border: none;
  background: rgba(255,255,255,0.08);
  color: #F5EEE3;
  border-radius: 9999px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}
.guide-tooltip-close:hover {
  opacity: 1;
  background: rgba(255,255,255,0.18);
}

.guide-tooltip-gif {
  width: 100%;
  max-height: 200px;
  border-radius: 8px;
  margin: 6px 0 10px;
  display: block;
}

.guide-tooltip-desc {
  margin: 0;
  color: rgba(245, 238, 227, 0.88);
  word-break: keep-all;
  overflow-wrap: break-word;
}

/* Transition — transform 은 inline style 로 들어가므로 enter/leave 에서
   별도로 translate offset 추가 가능. 여기선 단순 fade + 작은 offset. */
.guide-tooltip-fade-enter-active,
.guide-tooltip-fade-leave-active {
  transition: opacity 0.15s ease;
}
.guide-tooltip-fade-enter-from,
.guide-tooltip-fade-leave-to {
  opacity: 0;
}
</style>
