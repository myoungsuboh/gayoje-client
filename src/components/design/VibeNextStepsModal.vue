<script setup>
/**
 * VibeNextStepsModal — vibe.zip 다운로드 직후 "이제 뭐 하면 되나" 3단계 안내 (D4).
 *
 * [배경 — '딸깍' UX]
 * 다운로드 후 사용자는 0_START_HERE.md 를 열어봐야 다음 행동을 알 수 있었다(온보딩 공백).
 * 받자마자 앱 안에서 "압축 풀기 → 폴더 열기 → '시작해줘'" 3단계를 도구 맞춤으로 보여주고,
 * 마지막 한 마디는 복사 버튼으로 딸깍 가능하게 한다.
 *
 * props: project(폴더명), tool(선택한 도구 id — claude/cursor/antigravity/other)
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PartyPopper, Copy, Check, X } from 'lucide-vue-next'
import { AGENT_TOOLS } from '@/utils/designExport'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: String, default: '' },
  tool: { type: String, default: 'other' },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

// 도구별 2단계 안내 i18n 키 (미지의 tool 은 other 로 fallback)
const step2Key = computed(() => {
  const known = ['claude', 'cursor', 'antigravity']
  return `design.arch.next.s2_${known.includes(props.tool) ? props.tool : 'other'}`
})

// [2026-06] 복사 버튼이 '시작해줘' 한 단어만 복사 → "고장났나?" 인상 + 자동 인식이
// 안 되는 도구에선 그 한 마디로 에이전트가 뭘 할지 모름. 어디서든 동작하는
// 풀 스타터 문장을 복사한다 (자동 인식 도구에선 중복이지만 무해).
const autoFile = computed(() => (AGENT_TOOLS[props.tool] || AGENT_TOOLS.other).autoFile)
const fullPrompt = computed(() => t('design.arch.next.full_prompt', { autoFile: autoFile.value }))
// [i18n 2026-06-25] 사용자가 입력하는 한 마디 — locale 별 (START_LINE const 대체).
const startLine = computed(() => t('design.vibe.start_line'))

const copied = ref(false)
let copyTimer = null
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(fullPrompt.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch { /* 클립보드 미지원 환경 — 사용자가 직접 타이핑 */ }
}
watch(() => props.modelValue, (open) => { if (open) copied.value = false })

const close = () => emit('update:modelValue', false)
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <div class="vns-modal">
      <div class="vns-head">
        <span class="vns-icon"><PartyPopper :size="22" /></span>
        <div class="vns-head-text">
          <h3 class="vns-title">{{ $t('design.arch.next.title') }}</h3>
          <p class="vns-sub">{{ $t('design.arch.next.sub') }}</p>
        </div>
        <button type="button" class="vns-close" @click="close" :aria-label="$t('design.action.close')">
          <X :size="18" />
        </button>
      </div>

      <ol class="vns-steps">
        <li class="vns-step">
          <span class="vns-num">1</span>
          <div class="vns-step-body">
            <span v-html="$t('design.arch.next.s1', { project })"></span>
          </div>
        </li>
        <li class="vns-step">
          <span class="vns-num">2</span>
          <div class="vns-step-body">
            <span v-html="$t(step2Key, { project })"></span>
          </div>
        </li>
        <li class="vns-step">
          <span class="vns-num">3</span>
          <div class="vns-step-body">
            <span>{{ $t('design.arch.next.s3') }}</span>
            <div class="vns-copy-row">
              <code class="vns-start-line">{{ fullPrompt }}</code>
              <button type="button" class="vns-copy-btn" :class="{ 'vns-copy-btn--done': copied }" @click="copyPrompt">
                <component :is="copied ? Check : Copy" :size="13" />
                {{ copied ? $t('design.arch.next.copied') : $t('design.arch.next.copy') }}
              </button>
            </div>
            <p class="vns-s3-hint">💡 {{ $t('design.arch.next.s3_hint', { autoFile, start: startLine }) }}</p>
          </div>
        </li>
      </ol>

      <p class="vns-after">{{ $t('design.arch.next.after') }}</p>

      <div class="vns-actions">
        <VBtn variant="flat" color="accent" height="40" class="rounded-pill px-5 font-bold" elevation="0" @click="close">
          {{ $t('design.arch.next.done') }}
        </VBtn>
      </div>
    </div>
  </VDialog>
</template>

<style scoped>
.vns-modal {
  background: var(--bg-card, #fff);
  border-radius: 18px;
  /* 표준 모달 elevation (cf. BaseGuideModal) — DesignStaleModal 과 동일 결함 보정. */
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  padding: 24px 24px 18px;
}
.vns-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.vns-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
  background: #fff8e1; color: #b8860b;
}
.vns-head-text { flex: 1; min-width: 0; }
.vns-title { font-size: 1.08rem; font-weight: 800; color: var(--text-main, #2A2421); margin: 0 0 3px; line-height: 1.35; word-break: keep-all; }
.vns-sub { font-size: 0.78rem; color: var(--text-muted, #6F665F); margin: 0; line-height: 1.5; word-break: keep-all; }
.vns-close { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px; border-radius: 8px; flex-shrink: 0; }
.vns-close:hover { background: rgba(0,0,0,0.05); color: var(--text-main); }

.vns-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.vns-step { display: flex; gap: 12px; align-items: flex-start; }
.vns-num {
  flex-shrink: 0;
  width: 24px; height: 24px; border-radius: 9999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent, #8C6239); color: #fff;
  font-size: 0.76rem; font-weight: 800;
  margin-top: 1px;
}
.vns-step-body { flex: 1; min-width: 0; font-size: 0.86rem; line-height: 1.6; color: var(--text-main, #2A2421); word-break: keep-all; }
.vns-step-body :deep(code) {
  font-size: 0.78rem; background: rgba(140,98,57,0.08); color: var(--accent, #8C6239);
  padding: 1px 6px; border-radius: 5px; word-break: break-all;
}

.vns-copy-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.vns-start-line {
  flex: 1; min-width: 200px;
  font-size: 0.78rem; font-weight: 600; line-height: 1.55;
  background: #fffdf6; border: 1.5px dashed rgba(184,134,11,0.45); color: var(--text-main);
  padding: 9px 14px; border-radius: 10px;
  word-break: keep-all; overflow-wrap: anywhere; white-space: normal;
}
.vns-s3-hint { margin: 7px 0 0; font-size: 0.72rem; color: var(--text-muted, #6F665F); line-height: 1.5; word-break: keep-all; }
.vns-copy-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--accent, #8C6239); color: #fff; border: none;
  border-radius: 9999px; padding: 7px 14px;
  font-family: inherit; font-size: 0.76rem; font-weight: 700; cursor: pointer;
  transition: background .15s;
}
.vns-copy-btn:hover { background: #6E4E2E; }
.vns-copy-btn--done { background: #16a34a; }

.vns-after {
  margin: 16px 0 0; padding: 10px 14px;
  background: rgba(140,98,57,0.06); border-radius: 10px;
  font-size: 0.76rem; line-height: 1.6; color: var(--text-muted, #6F665F); word-break: keep-all;
}
.vns-actions { display: flex; justify-content: flex-end; margin-top: 14px; }

@media (max-width: 480px) {
  .vns-modal { padding: 18px 16px 14px; }
  .vns-actions :deep(.v-btn) { width: 100%; }
}
</style>
