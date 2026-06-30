<script setup>
/**
 * AiRecommendationDialog
 *
 * RuleGeneratorTab 의 2단계 AI 추천 UI — view-only 컴포넌트.
 *  - 1단계: 카탈로그 소스 선택 (category vs library) + 카테고리/폴더 필터
 *  - 2단계: 추천 결과 + 등록 선택
 *
 * 비즈니스 로직 (catalog builder, Claude API 호출, skill 등록) 은 parent 유지.
 * 이 컴포넌트는 props/emits 로만 통신하며 상태 변화 트리거만 emit.
 */
import { Sparkles, FolderOpen, CheckSquare, Square, Save, Zap, Check } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },        // v-model — 다이얼로그 open
  aiSourceMode: { type: String, default: 'category' },
  aiCategories: { type: Array, default: () => [] },
  aiAutoStackCategories: { type: Array, default: () => [] },  // tech stack 자동감지 (read-only 배지)
  aiSelectedLibraryFolderIds: { type: Array, default: () => [] },
  aiRecommendations: { type: Array, default: () => [] },
  aiSelectedIds: { type: Array, default: () => [] },
  aiExcludedCount: { type: Number, default: 0 },
  aiError: { type: String, default: '' },
  isAiRecommending: { type: Boolean, default: false },
  isAiRegistering: { type: Boolean, default: false },
  categoryMap: { type: Object, required: true },         // CATEGORY_MAP — Object.keys 만 사용
  stackOnlyCategories: { type: Array, default: () => [] },  // 칩에서 숨길 스택 전용 카테고리 목록
  stackLabels: { type: Object, default: () => ({}) },    // { FrontEndReact: 'React / Next.js', ... }
  libraryFolders: { type: Array, default: () => [] },    // [{ id, name, color, skillCount }]
})

const emit = defineEmits([
  'update:modelValue',
  'update:aiSourceMode',
  'update:aiCategories',
  'update:aiSelectedLibraryFolderIds',
  'update:aiSelectedIds',
  'update:aiRecommendations',
  'recommend',          // parent.requestAiRecommendation
  'cancel-recommend',   // 추천 진행 중 취소 — parent.cancelAiRecommendation (요청 abort + 닫기)
  'toggle-selection',   // (id) — parent.toggleAiSelection
  'register',           // parent.registerSelectedAiSkills
  'switch-to-library',  // 라이브러리 모드 클릭 — parent 에서 store.load() 트리거
])

// [2026-06-13] 추천 진행 중에는 닫기를 막고(우발적 닫힘 방지·결과 유실 방지),
// '취소'만 in-flight 요청을 abort 하고 닫는다.
const close = () => {
  if (props.isAiRecommending) return
  emit('update:modelValue', false)
}
function onCancelClick() {
  if (props.isAiRecommending) emit('cancel-recommend')
  else emit('update:modelValue', false)
}

// 전체 선택/해제 토글 — parent 의 aiSelectedIds 를 update.
function toggleSelectAllResults() {
  const all = props.aiSelectedIds.length === props.aiRecommendations.length
  emit('update:aiSelectedIds', all ? [] : props.aiRecommendations.map(r => r.id))
}

// "← 다시 추천" — recommendations / selectedIds 를 비움.
function resetToStep1() {
  emit('update:aiRecommendations', [])
  emit('update:aiSelectedIds', [])
}

// [2026-06-13] 카테고리 9개로 확장 — 체크박스 대신 칩 토글로 전환.
function toggleCategory(cat) {
  const next = props.aiCategories.includes(cat)
    ? props.aiCategories.filter(c => c !== cat)
    : [...props.aiCategories, cat]
  emit('update:aiCategories', next)
}
function toggleLibraryFolder(id) {
  const next = props.aiSelectedLibraryFolderIds.includes(id)
    ? props.aiSelectedLibraryFolderIds.filter(f => f !== id)
    : [...props.aiSelectedLibraryFolderIds, id]
  emit('update:aiSelectedLibraryFolderIds', next)
}
</script>

<template>
  <VDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="760" scrollable persistent>
    <VCard class="ai-dialog">
      <VCardTitle class="d-flex align-center gap-2 pa-5">
        <Sparkles :size="20" class="text-accent" />
        <span class="font-bold">{{ $t('rule.ai_reco.title') }}</span>
        <span class="rg-badge ml-1">{{ $t('rule.ai_reco.badge') }}</span>
        <VSpacer />
        <VBtn icon="mdi-close" variant="text" size="small" :disabled="isAiRecommending" @click="close" />
      </VCardTitle>
      <VDivider />

      <VCardText class="pa-5">
        <!-- 1단계: 카테고리 선택 + 추천 요청 -->
        <div v-if="aiRecommendations.length === 0">
          <p class="text-sm text-muted mb-4" v-html="$t('rule.ai_reco.intro_html')"></p>

          <!-- [FE-4b 2026-05] 카탈로그 소스 선택 — 기본 카테고리 vs 내 라이브러리 -->
          <div class="section-title mb-2">{{ $t('rule.ai_reco.catalog_section') }}</div>
          <div class="d-flex gap-2 mb-4">
            <VBtn
              :variant="aiSourceMode === 'category' ? 'flat' : 'tonal'"
              :color="aiSourceMode === 'category' ? 'accent' : 'default'"
              height="34"
              class="rounded-pill px-4 font-bold text-xs"
              elevation="0"
              @click="emit('update:aiSourceMode', 'category')"
            >
              {{ $t('rule.ai_reco.source_category') }}
            </VBtn>
            <VBtn
              :variant="aiSourceMode === 'library' ? 'flat' : 'tonal'"
              :color="aiSourceMode === 'library' ? 'accent' : 'default'"
              height="34"
              class="rounded-pill px-4 font-bold text-xs"
              elevation="0"
              @click="emit('switch-to-library')"
            >
              <FolderOpen :size="13" class="mr-1" />{{ $t('rule.ai_reco.source_library') }}
            </VBtn>
          </div>

          <!-- category 모드: CATEGORY_MAP 카테고리 칩 토글 -->
          <template v-if="aiSourceMode === 'category'">
            <div class="section-title mb-2">{{ $t('rule.ai_reco.filter_category_section') }}</div>
            <p class="text-xs text-muted mb-3">
              {{ $t('rule.ai_reco.filter_category_hint') }}
            </p>
            <div class="chip-grid mb-3">
              <button
                v-for="cat in Object.keys(categoryMap).filter(c => !stackOnlyCategories.includes(c))"
                :key="cat"
                type="button"
                class="filter-chip"
                :class="{ active: aiCategories.includes(cat) }"
                :aria-pressed="aiCategories.includes(cat)"
                @click="toggleCategory(cat)"
              >
                <Check v-if="aiCategories.includes(cat)" :size="13" class="chip-check" />
                {{ cat }}
              </button>
            </div>
            <!-- 자동감지된 스택 카테고리 — read-only 정보 배지 -->
            <div v-if="aiAutoStackCategories.length > 0" class="auto-stack-badge mb-4">
              <Zap :size="12" class="auto-stack-icon" />
              <span class="auto-stack-text">{{ $t('rule.ai_reco.auto_stack_detected') }}:</span>
              <span
                v-for="cat in aiAutoStackCategories"
                :key="cat"
                class="auto-stack-chip"
              >{{ stackLabels[cat] || cat }}</span>
            </div>
          </template>

          <!-- library 모드: 내 라이브러리 폴더 선택 -->
          <template v-else>
            <div class="section-title mb-2">{{ $t('rule.ai_reco.filter_folder_section') }}</div>
            <p class="text-xs text-muted mb-3">
              {{ $t('rule.ai_reco.filter_folder_hint') }}
            </p>
            <div v-if="libraryFolders.length === 0" class="text-xs text-muted mb-4">
              {{ $t('rule.ai_reco.no_library_folders') }}
            </div>
            <div v-else class="chip-grid mb-4">
              <button
                v-for="folder in libraryFolders"
                :key="folder.id"
                type="button"
                class="filter-chip"
                :class="{ active: aiSelectedLibraryFolderIds.includes(folder.id) }"
                :aria-pressed="aiSelectedLibraryFolderIds.includes(folder.id)"
                @click="toggleLibraryFolder(folder.id)"
              >
                <Check v-if="aiSelectedLibraryFolderIds.includes(folder.id)" :size="13" class="chip-check" />
                <span
                  v-else
                  class="rg-folder-dot mr-1"
                  :style="{ background: folder.color || '#6b7280' }"
                />
                {{ folder.name }}
                <span class="chip-count">{{ folder.skillCount ?? 0 }}</span>
              </button>
            </div>
          </template>

          <div v-if="aiError" class="msg-bar error-bar rounded-lg">✕ {{ aiError }}</div>

          <div class="d-flex justify-end mt-4">
            <VBtn variant="text" class="mr-2" @click="onCancelClick">{{ $t('rule.ai_reco.cancel') }}</VBtn>
            <VBtn
              color="accent" variant="flat" elevation="0"
              class="rounded-lg font-bold px-5"
              :loading="isAiRecommending"
              @click="emit('recommend')"
            >
              <Sparkles :size="14" class="mr-2" />{{ $t('rule.ai_reco.get_recommendations') }}
            </VBtn>
          </div>
        </div>

        <!-- 2단계: 추천 결과 -->
        <div v-else>
          <div class="d-flex align-center justify-space-between mb-3">
            <div>
              <div class="section-title mb-1">{{ $t('rule.ai_reco.result_section') }}</div>
              <p class="text-xs text-muted">
                {{ $t('rule.ai_reco.result_count', { count: aiRecommendations.length }) }}
                <span v-if="aiExcludedCount > 0" class="text-accent ml-2">
                  {{ $t('rule.ai_reco.excluded_note', { count: aiExcludedCount }) }}
                </span>
              </p>
            </div>
            <VBtn
              variant="text" size="small"
              @click="toggleSelectAllResults"
            >
              {{ aiSelectedIds.length === aiRecommendations.length ? $t('rule.ai_reco.deselect_all') : $t('rule.ai_reco.select_all') }}
            </VBtn>
          </div>

          <div class="ai-rec-list custom-scroll">
            <div
              v-for="rec in aiRecommendations"
              :key="rec.id"
              class="ai-rec-item"
              :class="{ checked: aiSelectedIds.includes(rec.id) }"
              @click="emit('toggle-selection', rec.id)"
            >
              <div class="d-flex align-start gap-3">
                <div class="mt-1">
                  <CheckSquare v-if="aiSelectedIds.includes(rec.id)" :size="18" style="color: var(--accent);" />
                  <Square v-else :size="18" style="color: var(--text-muted); opacity: 0.5;" />
                </div>
                <div class="flex-grow-1">
                  <div class="d-flex align-center gap-2 mb-1">
                    <span class="font-bold text-sm">{{ rec.name }}</span>
                    <span class="cat-badge">{{ rec.categoryDir }}</span>
                    <!-- [2026-06-13] 기반 규칙 — 모든 프로젝트 공통이라 PRD 무관 상시 추천 -->
                    <span v-if="rec.foundational" class="found-badge">{{ $t('rule.ai_reco.foundational_badge') }}</span>
                    <span v-if="rec.confidence != null" class="conf-badge">{{ Math.round(rec.confidence * 100) }}%</span>
                  </div>
                  <p v-if="rec.description" class="text-xs text-muted mb-2" style="line-height:1.5;">{{ rec.description }}</p>
                  <p v-if="rec.reason" class="text-xs reason-text">
                    <Zap :size="11" class="mr-1" style="color: var(--accent);" />
                    <span>{{ rec.reason }}</span>
                  </p>
                  <div class="id-badge mt-2">{{ rec.id }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="aiError" class="msg-bar error-bar rounded-lg mt-3">✕ {{ aiError }}</div>

          <div class="d-flex justify-space-between align-center mt-4">
            <VBtn variant="text" @click="resetToStep1">{{ $t('rule.ai_reco.back_to_reco') }}</VBtn>
            <div>
              <VBtn variant="text" class="mr-2" @click="close">{{ $t('common.action.close') }}</VBtn>
              <VBtn
                color="accent" variant="flat" elevation="0"
                class="rounded-lg font-bold px-5"
                :loading="isAiRegistering"
                :disabled="aiSelectedIds.length === 0"
                @click="emit('register')"
              >
                <Save :size="14" class="mr-2" />{{ $t('rule.ai_reco.register', { count: aiSelectedIds.length }) }}
              </VBtn>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* AI 추천 다이얼로그 */
.ai-dialog { border-radius: 18px !important; }
.ai-rec-list {
  max-height: 480px; overflow-y: auto;
  padding: 4px;
  display: flex; flex-direction: column; gap: 8px;
}
.ai-rec-item {
  padding: 12px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  transition: all 0.2s;
}
.ai-rec-item:hover { background: var(--bg-light); }
.ai-rec-item.checked {
  background: rgba(140,98,57,0.07);
  border-color: rgba(140,98,57,0.4);
}
.cat-badge {
  font-size: 0.6rem; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  background: rgba(140,98,57,0.1); color: var(--accent);
  font-family: 'IBM Plex Mono', monospace;
  text-transform: lowercase;
}
.conf-badge {
  font-size: 0.6rem; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  background: rgba(34,197,94,0.12); color: #16a34a;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}
.found-badge {
  font-size: 0.6rem; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  background: rgba(140, 98, 57, 0.12); color: var(--accent, #8C6239);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}
.reason-text {
  display: flex; align-items: flex-start;
  color: var(--text-muted); font-style: italic;
  line-height: 1.5;
  background: rgba(140,98,57,0.04);
  padding: 6px 10px; border-radius: 6px;
  border-left: 2px solid var(--accent);
}
.reason-text span { flex: 1; }

/* id-badge — AI 추천 항목에서 사용 */
.id-badge {
  font-size: 0.6rem; font-weight: 700; color: var(--text-muted);
  background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;
  font-family: 'IBM Plex Mono', monospace;
}

/* [2026-06-13] 카테고리/폴더 필터 칩 — 체크박스 대체 (9개+ 카테고리 대응) */
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 14px;
  border-radius: 20px;
  border: 1.5px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.16s ease;
  user-select: none;
  line-height: 1;
}
.filter-chip:hover {
  border-color: rgba(140, 98, 57, 0.45);
  color: var(--text-main);
}
.filter-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.chip-check { flex-shrink: 0; }

/* 자동감지 스택 배지 */
.auto-stack-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
}
.auto-stack-icon { color: var(--accent); flex-shrink: 0; }
.auto-stack-text { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; }
.auto-stack-chip {
  font-size: 0.72rem; font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 12px;
  padding: 2px 9px;
}

.chip-count {
  font-size: 0.68rem;
  font-weight: 700;
  opacity: 0.7;
  margin-left: 2px;
}

/* 공통 스타일 — section-title, rg-badge, msg-bar, rg-folder-dot, custom-scroll */
.section-title { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
.rg-badge {
  font-size: 0.58rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 20px;
  background: rgba(140,98,57,0.1); color: var(--accent);
}
.msg-bar { text-align: center; font-size: 0.8rem; font-weight: 700; padding: 8px 20px; flex-shrink: 0; }
.error-bar { background: rgba(239,68,68,0.12); color: #dc2626; }
.rg-folder-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(140,98,57,0.2); border-radius: 10px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(140,98,57,0.4); }
</style>
