<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Check, Loader2 } from 'lucide-vue-next'
import { diffLines, diffStats } from '@/utils/lineDiff'
import { useVirtualWindow } from '@/composables/useVirtualWindow'

const { t } = useI18n()

const props = defineProps({
  open: { type: Boolean, default: false },
  oldMarkdown: { type: String, default: '' },
  newMarkdown: { type: String, default: '' },
  // 'cps' | 'prd' — 헤더 / 색상 구분.
  kind: { type: String, default: 'cps' },
  applying: { type: Boolean, default: false },
  // [2026-05] 제목 override — autofix 등 재합성 외 용도에서 정확한 문구 표시.
  titleOverride: { type: String, default: '' },
})

const emit = defineEmits(['apply', 'cancel'])

// ─── [Phase 3.5d] View mode 영속화 ─────────────────────────────
// localStorage key — 'compact' (변경+근접만) / 'full' (전체) / 'auto' (크기에 따라).
const VIEW_MODE_KEY = 'harness:diff-view-mode'
const VALID_MODES = ['auto', 'compact', 'full']
const _loadMode = () => {
  if (typeof localStorage === 'undefined') return 'auto'
  const v = localStorage.getItem(VIEW_MODE_KEY)
  return VALID_MODES.includes(v) ? v : 'auto'
}
const viewMode = ref(_loadMode())
watch(viewMode, (m) => {
  if (typeof localStorage !== 'undefined' && VALID_MODES.includes(m)) {
    try { localStorage.setItem(VIEW_MODE_KEY, m) } catch {}
  }
})

// ─── Diff 계산 ─────────────────────────────────────────────
const diffRows = computed(() =>
  props.open ? diffLines(props.oldMarkdown, props.newMarkdown) : []
)
const stats = computed(() => diffStats(diffRows.value))

const title = computed(() =>
  props.titleOverride
    || (props.kind === 'prd' ? t('prd.resynth.title_prd') : t('prd.resynth.title_cps'))
)

// [Phase 3.5d] 'auto' 모드 = 200줄 초과 시 compact, 아니면 full.
const COMPACT_AUTO_THRESHOLD = 200
const effectiveMode = computed(() => {
  if (viewMode.value === 'auto') {
    return diffRows.value.length > COMPACT_AUTO_THRESHOLD ? 'compact' : 'full'
  }
  return viewMode.value
})

// compact 모드 — 변경 라인 근처 2줄 context 외 same 접기.
const compactRows = computed(() => {
  const out = []
  let sameCollapsed = 0
  diffRows.value.forEach((r, i) => {
    if (r.type === 'same') {
      const isNearChange =
        (diffRows.value[i + 1]?.type ?? 'same') !== 'same' ||
        (diffRows.value[i + 2]?.type ?? 'same') !== 'same' ||
        (i > 0 && diffRows.value[i - 1]?.type !== 'same') ||
        (i > 1 && diffRows.value[i - 2]?.type !== 'same')
      if (isNearChange) {
        if (sameCollapsed > 0) {
          out.push({ type: 'collapsed', count: sameCollapsed, idx: `c${i}` })
          sameCollapsed = 0
        }
        out.push({ ...r, idx: i })
      } else {
        sameCollapsed++
      }
    } else {
      if (sameCollapsed > 0) {
        out.push({ type: 'collapsed', count: sameCollapsed, idx: `c${i}` })
        sameCollapsed = 0
      }
      out.push({ ...r, idx: i })
    }
  })
  if (sameCollapsed > 0) {
    out.push({ type: 'collapsed', count: sameCollapsed, idx: 'cend' })
  }
  return out
})

const displayedRows = computed(() =>
  effectiveMode.value === 'compact'
    ? compactRows.value
    : diffRows.value.map((r, i) => ({ ...r, idx: i }))
)

// ─── [Phase 3.5d] Virtual scroll — displayedRows.length > VIRTUAL_THRESHOLD ──
const VIRTUAL_THRESHOLD = 500
const ROW_HEIGHT = 22
const useVirtual = computed(() => displayedRows.value.length > VIRTUAL_THRESHOLD)

const {
  containerRef,
  visibleRows,
  totalHeight,
  offsetTop,
} = useVirtualWindow(displayedRows, { rowHeight: ROW_HEIGHT, overscan: 8 })

const onApply = () => emit('apply', props.newMarkdown)
const onCancel = () => emit('cancel')
</script>

<template>
  <VDialog
    :model-value="open"
    max-width="1100"
    persistent
    @update:model-value="(v) => !v && onCancel()"
  >
    <div class="diff-modal">
      <div class="diff-modal__header">
        <div class="diff-modal__title-row">
          <h3 class="diff-modal__title">{{ title }}</h3>
          <div class="diff-stats">
            <span class="diff-stats__chip diff-stats__chip--added">+{{ stats.added }}</span>
            <span class="diff-stats__chip diff-stats__chip--removed">−{{ stats.removed }}</span>
            <span class="diff-stats__chip diff-stats__chip--same">={{ stats.same }}</span>
          </div>
        </div>
        <button class="diff-modal__close" @click="onCancel">
          <X :size="18" />
        </button>
      </div>

      <div class="diff-modal__hint">
        <span>
          {{ $t('prd.resynth.hint') }}
          <span v-if="useVirtual" class="diff-modal__virtual-badge"
            >{{ $t('prd.resynth.virtual_badge', { count: displayedRows.length }) }}</span>
        </span>
        <!-- [Phase 3.5d] 세그먼티드 토글 — 변경만 / 전체 / 자동, localStorage 영속화 -->
        <div class="diff-mode-toggle" role="group" :aria-label="$t('prd.resynth.view_mode_aria')">
          <button
            type="button"
            class="diff-mode-toggle__btn"
            :class="{ 'diff-mode-toggle__btn--active': viewMode === 'compact' }"
            @click="viewMode = 'compact'"
            :title="$t('prd.resynth.mode_compact_title')"
          >{{ $t('prd.resynth.mode_compact') }}</button>
          <button
            type="button"
            class="diff-mode-toggle__btn"
            :class="{ 'diff-mode-toggle__btn--active': viewMode === 'full' }"
            @click="viewMode = 'full'"
            :title="$t('prd.resynth.mode_full_title')"
          >{{ $t('prd.resynth.mode_full') }}</button>
          <button
            type="button"
            class="diff-mode-toggle__btn"
            :class="{ 'diff-mode-toggle__btn--active': viewMode === 'auto' }"
            @click="viewMode = 'auto'"
            :title="$t('prd.resynth.mode_auto_title', { count: diffRows.length })"
          >{{ $t('prd.resynth.mode_auto') }}</button>
        </div>
      </div>

      <!-- 본문 — useVirtual 일 때 absolute 배치, 아니면 일반 flow. -->
      <div
        v-if="useVirtual"
        ref="containerRef"
        class="diff-body diff-body--virtual custom-scroll"
      >
        <div class="diff-body__spacer" :style="{ height: totalHeight + 'px' }">
          <div
            class="diff-body__window"
            :style="{ transform: `translateY(${offsetTop}px)` }"
          >
            <div
              v-for="r in visibleRows"
              :key="r.virtualIdx"
              class="diff-row diff-row--virtual"
              :class="`diff-row--${r.type}`"
              :style="{ height: '22px', lineHeight: '22px' }"
            >
              <span v-if="r.type === 'collapsed'" class="diff-row__collapsed">
                {{ $t('prd.resynth.collapsed', { count: r.count }) }}
              </span>
              <template v-else>
                <span class="diff-row__marker">
                  {{ r.type === 'added' ? '+' : r.type === 'removed' ? '−' : ' ' }}
                </span>
                <span class="diff-row__text diff-row__text--nowrap">{{ r.text || ' ' }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="diff-body custom-scroll">
        <div v-if="diffRows.length === 0" class="diff-empty">{{ $t('prd.resynth.empty') }}</div>
        <template v-else>
          <div
            v-for="r in displayedRows"
            :key="r.idx"
            class="diff-row"
            :class="`diff-row--${r.type}`"
          >
            <span v-if="r.type === 'collapsed'" class="diff-row__collapsed">
              {{ $t('prd.resynth.collapsed', { count: r.count }) }}
            </span>
            <template v-else>
              <span class="diff-row__marker">
                {{ r.type === 'added' ? '+' : r.type === 'removed' ? '−' : ' ' }}
              </span>
              <span class="diff-row__text">{{ r.text || ' ' }}</span>
            </template>
          </div>
        </template>
      </div>

      <div class="diff-modal__footer">
        <button class="diff-btn" :disabled="applying" @click="onCancel">
          <X :size="13" class="mr-1" />{{ $t('common.action.cancel') }}
        </button>
        <button
          class="diff-btn diff-btn--apply"
          :disabled="applying"
          @click="onApply"
        >
          <Loader2 v-if="applying" :size="13" class="spin mr-1" />
          <Check v-else :size="13" class="mr-1" />
          {{ applying ? $t('prd.resynth.applying') : $t('prd.resynth.apply') }}
        </button>
      </div>
    </div>
  </VDialog>
</template>

<style scoped>
.diff-modal {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

.diff-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fafafa;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
}
.diff-modal__title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.diff-modal__title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}
.diff-stats {
  display: flex;
  gap: 6px;
}
.diff-stats__chip {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
}
.diff-stats__chip--added { background: #d4edda; color: #155724; }
.diff-stats__chip--removed { background: #f8d7da; color: #721c24; }
.diff-stats__chip--same { background: #e2e3e5; color: #383d41; }

.diff-modal__close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #888);
  display: flex;
}
.diff-modal__close:hover { color: var(--text-main); }

.diff-modal__hint {
  padding: 10px 24px;
  font-size: 0.78rem;
  color: var(--text-muted, #555);
  background: #fffaf3;
  border-bottom: 1px solid #ffe9c2;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
/* [Phase 3.5d] segmented toggle */
.diff-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--border-light, #ccc);
  border-radius: 9999px;
  background: white;
  overflow: hidden;
}
.diff-mode-toggle__btn {
  background: transparent;
  border: none;
  padding: 3px 12px;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted, #888);
  transition: background 0.12s, color 0.12s;
}
.diff-mode-toggle__btn:not(:last-child) {
  border-right: 1px solid var(--border-light, #eee);
}
.diff-mode-toggle__btn:hover {
  color: var(--accent, #8C6239);
}
.diff-mode-toggle__btn--active {
  background: var(--accent, #8C6239);
  color: white;
}
.diff-mode-toggle__btn--active:hover {
  color: white;
}

.diff-modal__virtual-badge {
  margin-left: 10px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}

.diff-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  font-family: 'Fira Code', 'Menlo', 'Consolas', monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  background: white;
}
/* [Phase 3.5d] virtual scroll 본문 — 고정 row height 보장 위해 padding 제거 */
.diff-body--virtual {
  padding: 0;
  position: relative;
}
.diff-body__spacer {
  position: relative;
  width: 100%;
}
.diff-body__window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}
.diff-row--virtual {
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 0.74rem;
}
.diff-row__text--nowrap {
  white-space: pre;
  overflow-x: auto;
  overflow-y: hidden;
}
.diff-empty {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.diff-row {
  display: flex;
  align-items: flex-start;
  padding: 1px 16px;
  white-space: pre-wrap;
  word-break: break-word;
}
.diff-row__marker {
  display: inline-block;
  width: 14px;
  flex-shrink: 0;
  font-weight: 700;
  user-select: none;
  text-align: center;
  margin-right: 8px;
  color: var(--text-muted);
}
.diff-row__text {
  flex: 1;
  min-width: 0;
}
.diff-row--added {
  background: #e8f5e9;
}
.diff-row--added .diff-row__marker { color: #2e7d32; }
.diff-row--removed {
  background: #ffebee;
}
.diff-row--removed .diff-row__marker { color: #c62828; }
.diff-row--same { color: #555; }
.diff-row--collapsed {
  text-align: center;
  color: var(--text-muted, #888);
  font-style: italic;
  padding: 6px 16px;
  background: #f8f9fa;
}
.diff-row__collapsed {
  font-size: 0.72rem;
}

.diff-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 24px;
  background: #fafafa;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
}

.diff-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
  background: white;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.diff-btn:hover:not(:disabled) {
  border-color: var(--accent, #8C6239);
  color: var(--accent, #8C6239);
}
.diff-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.diff-btn--apply {
  background: var(--accent, #8C6239);
  color: white;
  border-color: var(--accent, #8C6239);
}
.diff-btn--apply:hover:not(:disabled) {
  background: #6f4d2d;
  border-color: #6f4d2d;
}
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== Responsive ===== */
@media (max-width: 900px) {
  .diff-modal { max-height: 92vh; }
  .diff-modal__header { padding: 12px 16px; }
  .diff-modal__title { font-size: 0.95rem; }
  .diff-modal__hint { padding: 8px 16px; font-size: 0.72rem; }
  .diff-body { font-size: 0.72rem; padding: 6px 0; }
  .diff-row { padding: 1px 12px; }
  .diff-modal__footer { padding: 10px 16px; }
}

@media (max-width: 600px) {
  /* 헤더 — 제목 + stats + 닫기 버튼이 wrap */
  .diff-modal__header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    position: relative;
  }
  .diff-modal__title-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .diff-modal__title { font-size: 0.88rem; }
  .diff-modal__close {
    position: absolute;
    top: 10px;
    right: 12px;
  }
  /* hint — 줄바꿈 + 토글이 wrap */
  .diff-modal__hint {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .diff-mode-toggle {
    align-self: flex-end;
  }
  .diff-mode-toggle__btn {
    padding: 4px 10px;
    font-size: 0.66rem;
  }
  .diff-modal__virtual-badge {
    display: inline-block;
    margin-left: 0;
    margin-top: 4px;
  }
  /* footer — 버튼 풀폭 */
  .diff-modal__footer {
    padding: 10px 12px;
  }
  .diff-btn {
    flex: 1 1 auto;
    justify-content: center;
    padding: 8px 14px;
    font-size: 0.74rem;
  }
}
</style>
