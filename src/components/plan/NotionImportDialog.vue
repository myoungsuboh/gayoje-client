<script setup>
/**
 * NotionImportDialog — 워크스페이스 페이지 검색 + 미리보기 + 회의록으로 가져오기.
 *
 * Props:
 *   - modelValue: 열림 상태 (v-model)
 *   - projectName: 가져온 페이지를 어떤 프로젝트의 미팅으로 등록할지
 *   - nextVersion: 다음 부여할 버전 (예: 'v1.1')
 *
 * Emits:
 *   - update:modelValue  — 닫기
 *   - imported({ taskId, version, pageId, title }) — import 성공. 호출자가 jobsStore 와 연동.
 *   - notion-disconnected — 토큰 만료 등으로 BE 가 unlink 한 경우. 호출자가 profile 안내.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { Loader2, X, FileText, ExternalLink, Wand2, RotateCcw, ShieldAlert, ShieldX, ShieldCheck } from 'lucide-vue-next'
import { useNotionStore } from '@/store/notion'
import { md } from '@/utils/markdown'
import { importNotionPageApi, notionErrorMessage, classificationLabel } from '@/utils/notion'
import { useSnackbar } from '@/composables/useSnackbar'
import NotionPageList from '@/components/plan/NotionPageList.vue'
import NotionImportGuide from '@/components/plan/NotionImportGuide.vue'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  nextVersion: { type: String, default: 'v1.1' },
})
const emit = defineEmits(['update:modelValue', 'imported', 'notion-disconnected'])

const { xs } = useDisplay()

const notion = useNotionStore()
const { showSuccess, showError, showWarning } = useSnackbar()

const isImporting = ref(false)

// ─── 정형화 / 편집 state ────────────────────────────────────────
// editedContent 가 비어있으면 '아직 변환 안 함' 상태 → 우측에 원본 preview 표시
// editedContent 가 채워지면 '정형화 완료' 상태 → textarea 로 편집 가능
const editedContent = ref('')

// [2026-05-19 UX] 변환 완료 후 기본은 markdown 미리보기 (rendered). 사용자가
// 편집 필요시만 'edit' 모드로 토글. textarea 가 기본이라 "꼭 편집해야 하나?"
// 혼란 + 시각적으로 어수선했던 문제 해소.
const viewMode = ref('preview')  // 'preview' | 'edit'
const editedHtml = computed(() => editedContent.value ? md.render(editedContent.value) : '')

const normalizedKey = computed(() =>
  notion.selectedPageId ? `${notion.selectedPageId}::${props.nextVersion}` : null
)
const hasNormalized = computed(() =>
  !!normalizedKey.value && !!notion.normalizedCache[normalizedKey.value]
)

// [2026-05-21] "수정됨" 인디케이터 — 사용자가 textarea 에 변경을 가했는지 추적.
// AI 정형화 결과 (normalized_markdown) 와 현재 editedContent 비교. 다르면 chip 노출
// → 사용자가 "내 편집이 진짜 반영되나?" 확신 가능. import 시 editedContent 그대로 전달.
const normalizedOriginal = computed(() =>
  normalizedKey.value ? (notion.normalizedCache[normalizedKey.value]?.normalized_markdown || '') : '',
)
const isEdited = computed(() =>
  hasNormalized.value && editedContent.value.length > 0 && editedContent.value !== normalizedOriginal.value,
)
const editDiffChars = computed(() => {
  if (!isEdited.value) return 0
  return Math.abs(editedContent.value.length - normalizedOriginal.value.length)
})

// 3-Tier 분류 결과 — 정형화 응답에 포함됨 (ACCEPT/WARN 케이스).
// BLOCK 은 error.classification 으로 별도 보관 (notion.normalizeError.classification).
const classification = computed(() => {
  if (hasNormalized.value) {
    return notion.normalizedCache[normalizedKey.value]?.classification || null
  }
  // BLOCK 응답 케이스 — store error 에 classification 메타가 들어있음
  return notion.normalizeError?.classification || null
})

const tierStyle = computed(() => {
  const tier = classification.value?.tier
  // [2026-05-19 UX] ACCEPT/WARN/BLOCK 약어 → 한 줄 풀이 + emoji 로 즉시 인지.
  if (tier === 'ACCEPT') return { cls: 'tier-accept', icon: ShieldCheck, label: t('plan.notion.tier_accept') }
  if (tier === 'WARN') return { cls: 'tier-warn', icon: ShieldAlert, label: t('plan.notion.tier_warn') }
  if (tier === 'BLOCK') return { cls: 'tier-block', icon: ShieldX, label: t('plan.notion.tier_block') }
  return null
})

const isBlocked = computed(() =>
  notion.normalizeError?.code === 'NOTION_CONTENT_NOT_SUPPORTED'
)

// 페이지 변경 시 textarea 자동 초기화 (이전 캐시 있으면 재로드).
watch(() => notion.selectedPageId, (pageId) => {
  viewMode.value = 'preview'  // 페이지 바뀌면 미리보기로 reset
  if (!pageId) {
    editedContent.value = ''
    return
  }
  const cached = notion.normalizedCache[`${pageId}::${props.nextVersion}`]
  editedContent.value = cached ? cached.normalized_markdown : ''
})

// ─── lifecycle ──────────────────────────────────────────────────
// 다이얼로그 열리면 첫 검색 (빈 query → 최근 수정 페이지 목록)
watch(() => props.modelValue, async (open) => {
  if (open) {
    notion.reset()
    const r = await notion.search('')
    if (!r.success && r.code === 'NOTION_NOT_LINKED') {
      emit('notion-disconnected')
      close()
    } else if (!r.success && r.code === 'NOTION_TOKEN_REVOKED') {
      emit('notion-disconnected')
      close()
    }
  }
})

// ─── 선택 ──────────────────────────────────────────────────────
const onSelectPage = async (page) => {
  if (notion.selectedPageId === page.id) return
  // 새 페이지 선택 시 이전 페이지의 정형화/분류 에러 클리어 — chip / 배너 잔존 방지.
  notion.normalizeError = null
  const r = await notion.selectAndPreview(page.id)
  if (!r.success) {
    const friendly = notionErrorMessage(r.code) || r.error
    showError(friendly || t('plan.notion.preview_load_fail'))
    if (r.code === 'NOTION_TOKEN_REVOKED') {
      emit('notion-disconnected')
      close()
    }
  }
  // [2026-05-19 revert] 자동 AI 분석 트리거 제거 (사용자 요청).
  // 사용자가 우측 "AI 분석" 버튼을 직접 눌렀을 때만 LLM 호출 → 의도 명확 +
  // 토큰 소비 컨트롤. (AI 분석은 토큰을 소모하므로 명시적 의도 우선.)
}

// ─── 정형화 ────────────────────────────────────────────────────
const onNormalize = async () => {
  if (!notion.selectedPageId || !props.projectName) return
  // '다시 변환' 클릭 시 (이미 정형화 결과 있음) → 캐시 무시하고 LLM 재호출.
  // 첫 '변환하기' → 캐시 hit 가능 (다이얼로그 재진입 케이스 등에서 비용 절약).
  const r = await notion.normalizeSelected({
    projectName: props.projectName,
    version: props.nextVersion,
    force: hasNormalized.value,
  })
  if (!r.success) {
    if (r.code === 'NOTION_TOKEN_REVOKED') {
      const friendly = notionErrorMessage(r.code) || r.error
      showError(friendly || t('plan.notion.normalize_fail'))
      emit('notion-disconnected')
      close()
      return
    }
    if (r.code === 'NOTION_CONTENT_NOT_SUPPORTED') {
      // BLOCK — 다이얼로그 안의 배너로 이미 표시. 토스트 노이즈 줄이려 short snack.
      showWarning(t('plan.notion.blocked_warn'), { timeout: 4000 })
      return
    }
    if (r.code === 'QUOTA_EXCEEDED' || r.status === 402) {
      // axios interceptor 가 이미 UpgradePromptDialog 띄움 — 중복 토스트 억제.
      return
    }
    const friendly = notionErrorMessage(r.code) || r.error
    showError(friendly || t('plan.notion.normalize_fail'))
    return
  }
  editedContent.value = r.result.normalized_markdown
  if (r.result.truncated) {
    showWarning(t('plan.notion.truncated_warn'), { timeout: 6000 })
  }
  // WARN 케이스 → 다이얼로그 안의 배너로 이미 표시. 추가 토스트 노출 X (이중 알림 회피).
}

const onRevertEdit = () => {
  // 편집 후 원래 정형화 결과로 되돌리기.
  if (normalizedKey.value && notion.normalizedCache[normalizedKey.value]) {
    editedContent.value = notion.normalizedCache[normalizedKey.value].normalized_markdown
  }
}

// ─── preview 렌더 ──────────────────────────────────────────────
const previewHtml = computed(() => {
  const md_ = notion.selectedPreview?.markdown
  if (!md_) return ''
  return md.render(md_)
})

// ─── import 실행 ──────────────────────────────────────────────
// 정형화된 (혹은 편집된) textarea 내용이 있으면 그걸 전달, 없으면 원본으로 폴백.
const canImport = computed(() => {
  if (!notion.selectedPageId || !props.projectName || isImporting.value) return false
  // 정형화 결과가 있어야 등록 가능. 정형화 전엔 미리보기만 가능 (사용자 워크플로 명확화).
  return hasNormalized.value && editedContent.value.trim().length > 0
})

const onImport = async () => {
  if (!canImport.value) return
  if (!props.projectName) {
    showWarning(t('plan.notion.select_project_first'))
    return
  }
  isImporting.value = true
  const result = await importNotionPageApi({
    pageId: notion.selectedPageId,
    projectName: props.projectName,
    version: props.nextVersion,
    meetingContent: editedContent.value,
  })
  isImporting.value = false

  if (!result.success) {
    const friendly = notionErrorMessage(result.code) || result.error
    showError(friendly || t('plan.notion.import_fail'))
    if (result.code === 'NOTION_TOKEN_REVOKED') {
      emit('notion-disconnected')
      close()
    }
    // 402 quota 초과는 axios interceptor 가 자동 UpgradePrompt → 우리는 토스트만.
    return
  }

  showSuccess(
    t('plan.notion.import_success', { title: result.title, version: props.nextVersion }),
    { timeout: 5000 },
  )
  emit('imported', {
    taskId: result.taskId,
    version: props.nextVersion,
    pageId: result.pageId,
    title: result.title,
  })
  close()
}

const close = () => {
  emit('update:modelValue', false)
  // 다음 tick 에서 메모리 회수
  nextTick(() => notion.reset())
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="980"
    persistent
    :fullscreen="xs"
    @update:model-value="(v) => !v && close()"
    @keydown.esc="close"
  >
    <v-card class="notion-dialog-card">
      <!-- Header -->
      <div class="notion-dialog-head">
        <div class="d-flex align-center">
          <span class="notion-emoji">📄</span>
          <div>
            <h3 class="notion-dialog-title">{{ $t('plan.notion.dialog_title') }}</h3>
            <p class="notion-dialog-sub">
              <template v-if="projectName">
                <span v-html="$t('plan.notion.dialog_sub_project_html', { project: projectName, version: nextVersion })"></span>
              </template>
              <template v-else>
                <span style="color: #ef4444">{{ $t('plan.notion.dialog_sub_no_project') }}</span>
              </template>
            </p>
          </div>
        </div>
        <button class="notion-close-btn" :aria-label="$t('common.action.close')" @click="close">
          <X :size="18" />
        </button>
      </div>

      <!-- Body: 좌측 검색 / 우측 preview -->
      <div class="notion-body">
        <!-- 좌측: 검색 & 리스트 (분리: NotionPageList.vue) -->
        <NotionPageList :active="modelValue" @select="onSelectPage" />

        <!-- 우측: preview / 정형화 결과 (편집 가능) -->
        <div class="notion-preview-pane">
          <div v-if="notion.isPreviewing" class="notion-empty">
            <Loader2 :size="16" class="rotate-anim mr-1" />
            {{ $t('plan.notion.previewing') }}
          </div>
          <div v-else-if="notion.previewError" class="notion-empty notion-empty--error">
            {{ notionErrorMessage(notion.previewError.code) || notion.previewError.message }}
          </div>
          <!-- 빈 상태 3-step 안내 (분리: NotionImportGuide.vue) -->
          <NotionImportGuide v-else-if="!notion.selectedPreview" :project-name="projectName" />
          <template v-else>
            <!-- ─── 1. 헤더 — 페이지 제목 + 노션 링크만 (chip 은 status row 로 분리) ─── -->
            <div class="notion-preview-head">
              <div class="notion-preview-title">
                <FileText :size="14" class="mr-2" />
                {{ notion.selectedPreview.title }}
              </div>
              <a
                v-if="notion.selectedPage?.url"
                :href="notion.selectedPage.url"
                target="_blank"
                rel="noopener"
                class="notion-preview-link"
                :title="$t('plan.notion.open_in_notion')"
              >
                <ExternalLink :size="12" />
              </a>
            </div>

            <!-- ─── 2. Status row — chip 들을 한 줄로 모아 분리 ─── -->
            <div class="notion-status-row">
              <span v-if="hasNormalized" class="notion-mode-chip">{{ $t('plan.notion.chip_ai_done') }}</span>
              <span v-else class="notion-mode-chip notion-mode-chip--raw">{{ $t('plan.notion.chip_raw') }}</span>
              <span
                v-if="tierStyle"
                class="notion-tier-chip"
                :class="tierStyle.cls"
                :title="classification.reason"
              >
                {{ tierStyle.label }}
              </span>
              <!-- [2026-05-21] 사용자가 textarea 에 변경 가하면 즉시 chip 으로 확신.
                   "내 편집이 적용되는가?" 의심 해소 + 등록 직전 변경 사항 인지 가능. -->
              <span
                v-if="isEdited"
                class="notion-edited-chip"
                :title="$t('plan.notion.edited_chip_title', { count: editDiffChars })"
              >
                {{ $t('plan.notion.edited_chip') }}
              </span>
              <span class="notion-status-row__spacer"></span>
              <span class="notion-status-row__meta">
                <template v-if="hasNormalized">
                  {{ $t('plan.notion.meta_chars', { count: editedContent.length.toLocaleString() }) }}
                </template>
                <template v-else>
                  {{ $t('plan.notion.meta_blocks_chars', { blocks: notion.selectedPreview.block_count, chars: notion.selectedPreview.char_count.toLocaleString() }) }}
                </template>
              </span>
            </div>

            <!-- ─── 3-A. AI 분석 시작 안내 — 정형화 전 (사용자 직접 트리거 유도) ─── -->
            <div
              v-if="!hasNormalized && !notion.isNormalizing"
              class="notion-action-hint notion-action-hint--start"
            >
              <div class="notion-action-hint__text">
                <span v-html="$t('plan.notion.hint_start_html')"></span>
                <span class="notion-action-hint__sub">{{ $t('plan.notion.hint_start_sub') }}</span>
              </div>
              <button
                type="button"
                class="notion-analyze-btn"
                :disabled="!projectName || isBlocked"
                :title="!projectName ? $t('plan.notion.analyze_disabled_no_project') : (isBlocked ? $t('plan.notion.analyze_disabled_blocked') : $t('plan.notion.analyze_title'))"
                @click="onNormalize"
              >
                <Wand2 :size="14" class="mr-1" />
                {{ $t('plan.notion.analyze_btn') }}
              </button>
            </div>

            <!-- ─── 3-B. 정리 중 안내 — AI 호출 진행 표시 ─── -->
            <div
              v-if="notion.isNormalizing"
              class="notion-action-hint notion-action-hint--working"
            >
              <Loader2 :size="14" class="rotate-anim mr-2" />
              <span>
                <span v-html="$t('plan.notion.working_title_html')"></span>
                <span class="notion-action-hint__sub">{{ $t('plan.notion.working_sub') }}</span>
              </span>
            </div>

            <!-- ─── 3-C. 정리 완료 안내 — 다음 액션 명확화 ─── -->
            <div
              v-if="hasNormalized && !isBlocked"
              class="notion-action-hint"
            >
              <span v-html="$t('plan.notion.hint_done_html', { version: nextVersion })"></span>
              <button type="button" class="notion-action-hint__link" @click="viewMode = 'edit'">{{ $t('plan.notion.hint_done_edit_link') }}</button>
              {{ $t('plan.notion.hint_done_suffix') }}
            </div>

            <!-- ─── 4. WARN / BLOCK 배너 (간결화) ─── -->
            <div
              v-if="hasNormalized && classification?.tier === 'WARN'"
              class="notion-tier-banner notion-tier-banner--warn"
            >
              <ShieldAlert :size="13" class="mr-2" />
              <div>
                <strong>{{ $t('plan.notion.banner_warn_title') }}</strong> —
                <em>{{ classificationLabel(classification.type) }}</em>{{ $t('plan.notion.banner_warn_html') }}
              </div>
            </div>
            <div
              v-if="isBlocked"
              class="notion-tier-banner notion-tier-banner--block"
            >
              <ShieldX :size="13" class="mr-2" />
              <div>
                <strong>{{ $t('plan.notion.banner_block_title') }}</strong> —
                <em>{{ classificationLabel(classification?.type) }}</em>{{ $t('plan.notion.banner_block_html') }}
              </div>
            </div>

            <!-- ─── 5. 미리보기 / 편집 모드 토글 (변환 완료 후만) ─── -->
            <!-- [2026-05-21] 토글 (focal) 과 보조 액션 (되돌리기 · 다시 변환) 시각 분리.
                 토글이 첫 인지 대상이 되도록 group 으로 감싸고, 보조 액션은 ghost 톤 + 옅음. -->
            <div v-if="hasNormalized" class="notion-view-toggle">
              <div class="notion-view-toggle__group" role="tablist" :aria-label="$t('plan.notion.view_mode_aria')">
                <button
                  type="button"
                  class="notion-toggle-btn"
                  :class="{ 'notion-toggle-btn--active': viewMode === 'preview' }"
                  role="tab"
                  :aria-selected="viewMode === 'preview'"
                  @click="viewMode = 'preview'"
                >
                  {{ $t('plan.notion.toggle_preview') }}
                </button>
                <button
                  type="button"
                  class="notion-toggle-btn"
                  :class="{ 'notion-toggle-btn--active': viewMode === 'edit' }"
                  role="tab"
                  :aria-selected="viewMode === 'edit'"
                  @click="viewMode = 'edit'"
                >
                  {{ $t('plan.notion.toggle_edit') }}
                </button>
              </div>
              <span class="notion-view-toggle__spacer"></span>
              <button
                v-if="viewMode === 'edit' && isEdited"
                class="notion-mini-btn"
                :title="$t('plan.notion.revert_title', { count: editedContent.length, diff: editDiffChars })"
                @click="onRevertEdit"
              >
                <RotateCcw :size="11" /> {{ $t('plan.notion.revert_btn') }}
              </button>
              <button
                class="notion-mini-btn notion-mini-btn--ghost"
                :disabled="notion.isNormalizing || !projectName"
                :title="$t('plan.notion.renormalize_title')"
                @click="onNormalize"
              >
                <Loader2 v-if="notion.isNormalizing" :size="11" class="rotate-anim" />
                <Wand2 v-else :size="11" />
                {{ $t('plan.notion.renormalize_btn') }}
              </button>
            </div>

            <!-- [2026-05-21] 편집 모드 진입 시 "저장 버튼 없음" 안내 — 사용자가
                 textarea 첫 본 후 "어디 누르면 저장되지?" 헤매지 않게. -->
            <div v-if="hasNormalized && viewMode === 'edit'" class="notion-edit-banner" role="status">
              <span class="notion-edit-banner__icon">💾</span>
              <span class="notion-edit-banner__text" v-html="$t('plan.notion.edit_banner_html', { version: nextVersion })">
              </span>
            </div>

            <!-- ─── 6. 콘텐츠 ─── -->
            <!-- 정형화 전: 원본 markdown 그대로 -->
            <div
              v-if="!hasNormalized"
              class="notion-preview-body custom-scroll markdown-body"
              v-html="previewHtml"
            ></div>
            <!-- 정형화 후 — preview 모드 (기본): rendered markdown 으로 보기 -->
            <div
              v-else-if="viewMode === 'preview'"
              class="notion-preview-body custom-scroll markdown-body"
              v-html="editedHtml"
            ></div>
            <!-- 정형화 후 — edit 모드: textarea -->
            <textarea
              v-else
              v-model="editedContent"
              class="notion-edit-textarea custom-scroll"
              spellcheck="false"
              :placeholder="$t('plan.notion.textarea_placeholder')"
            ></textarea>
          </template>
        </div>
      </div>

      <!-- Footer — auto 변환이라 안내 메시지 단순화 -->
      <div class="notion-dialog-foot">
        <span v-if="notion.isNormalizing" class="notion-foot-hint notion-foot-hint--working">
          <Loader2 :size="12" class="rotate-anim mr-1" />
          <span v-html="$t('plan.notion.foot_working_html')"></span>
        </span>
        <span v-else-if="hasNormalized && !isBlocked" class="notion-foot-hint notion-foot-hint--ready" v-html="$t('plan.notion.foot_ready_html', { version: nextVersion })">
        </span>
        <span v-else-if="isBlocked" class="notion-foot-hint notion-foot-hint--error">
          {{ $t('plan.notion.foot_error') }}
        </span>
        <span class="flex-grow-1"></span>
        <button class="notion-btn notion-btn--ghost" @click="close">{{ $t('common.action.cancel') }}</button>
        <button
          class="notion-btn notion-btn--primary notion-btn--cta"
          :disabled="!canImport"
          :title="!hasNormalized ? $t('plan.notion.import_disabled_title') : ''"
          @click="onImport"
        >
          <Loader2 v-if="isImporting" :size="14" class="rotate-anim mr-2" />
          <span v-else class="mr-1">📥</span>
          {{ $t('plan.notion.import_btn', { version: nextVersion }) }}
        </button>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.notion-dialog-card {
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-card, #fff);
  /* [2026-05-19] 사용자 보고 — 내용 길어지면 다이얼로그가 viewport 넘어 페이지
     자체가 스크롤됐음. card 자체에 max-height 걸어서 viewport 안에 맞추고,
     내부는 flex column 으로 header/body/footer 분배. */
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
}
.notion-dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-light, #e5e2dd);
}
.notion-emoji { font-size: 1.6rem; margin-right: 12px; }
.notion-dialog-title {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 0 0 2px 0;
  color: var(--text-main, #1a1a1a);
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-dialog-sub {
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
  margin: 0;
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-close-btn {
  background: transparent;
  border: none;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-muted, #6b7280);
}
.notion-close-btn:hover { background: rgba(0,0,0,0.06); }

.notion-body {
  display: grid;
  grid-template-columns: 340px 1fr;
  /* fixed height 540px 제거 — flex 안에서 늘어나도록. 좌우 컬럼 각각 자체
     scroll container 가짐. min-height: 0 은 grid item 이 scroll 가능
     하도록 필수 (안 걸면 자식이 늘어나 grid 가 viewport 초과). */
  flex: 1 1 auto;
  min-height: 0;
  gap: 0;
}

/* ─── 우측 preview ─── */
.notion-preview-pane {
  display: flex; flex-direction: column;
  min-width: 0;
  /* [2026-05-19] grid item 은 implicit min-height: auto 가 걸려 자식이
     내용만큼 늘어남 → preview-body 의 overflow-y: auto 가 작동 안 함.
     명시적으로 0 으로 깎아 scroll container 정상 동작. */
  min-height: 0;
  overflow: hidden;
}
.notion-preview-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 6px 18px;
}
.notion-preview-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-main, #1a1a1a);
  display: flex; align-items: center;
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-preview-link {
  color: var(--text-muted, #6b7280);
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
}
.notion-preview-link:hover {
  background: rgba(0,0,0,0.06);
  color: var(--accent, #8B6F47);
}
.notion-preview-meta {
  padding: 0 18px 10px 18px;
  font-size: 0.7rem;
  color: var(--text-muted, #6b7280);
  border-bottom: 1px solid var(--border-light, #e5e2dd);
}
.notion-preview-body {
  flex: 1; overflow-y: auto;
  padding: 14px 22px;
  font-size: 0.84rem;
  line-height: 1.7;
  color: var(--text-main, #1a1a1a);
  font-family: 'Pretendard Variable', sans-serif;
  /* scroll chaining 차단 — 미리보기 끝까지 스크롤해도 페이지 안 내려감. */
  overscroll-behavior: contain;
}
.notion-edit-textarea {
  flex: 1;
  width: 100%;
  padding: 14px 18px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--text-main, #1a1a1a);
  /* scroll chaining 차단. */
  overscroll-behavior: contain;
  background: #fafaf6;
  border-top: 1px dashed var(--border-light, #e5e2dd);
}
.notion-edit-textarea:focus {
  background: #fffefb;
}
.notion-mode-chip {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: var(--accent, #8B6F47);
  color: white;
  border-radius: 4px;
}
.notion-mode-chip--raw {
  background: rgba(0,0,0,0.08);
  color: var(--text-muted, #6b7280);
}

/* [2026-05-21] "수정됨" 인디케이터 — AI 정리 결과 대비 사용자가 변경한 상태.
   주황 톤으로 시선 끌되 chip 크기는 다른 메타와 통일. */
.notion-edited-chip {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(217, 119, 6, 0.12);
  color: #B46723;
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: 4px;
  cursor: help;
  white-space: nowrap;
}

/* [2026-05-21] 편집 모드 진입 안내 배너 — "어디 누르면 저장되지?" 의문 해소.
   subtle 배경 + 큰 글자 아니지만 textarea 진입 직전에 위치해 시선 자연 유도. */
.notion-edit-banner {
  display: flex; align-items: center; gap: 10px;
  margin: 0 18px 0;
  padding: 9px 14px;
  background: linear-gradient(135deg, rgba(46, 64, 54, 0.06) 0%, rgba(139, 111, 71, 0.05) 100%);
  border: 1px solid rgba(46, 64, 54, 0.15);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  font-size: 0.74rem;
  font-family: 'Pretendard Variable', sans-serif;
  color: var(--text-main, #1a1a1a);
  line-height: 1.5;
  animation: notionEditBannerFade 0.25s ease-out;
}
.notion-edit-banner__icon { font-size: 0.95rem; flex-shrink: 0; }
.notion-edit-banner__text { min-width: 0; }
.notion-edit-banner__text strong {
  color: var(--accent, #8B6F47);
  font-weight: 800;
}
@keyframes notionEditBannerFade {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .notion-edit-banner { animation: none; }
}
.notion-tier-chip {
  display: inline-flex; align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 2px 6px 2px 5px;
  font-size: 0.62rem;
  font-weight: 700;
  border-radius: 4px;
  letter-spacing: 0.02em;
  cursor: help;
}
.notion-tier-chip.tier-accept {
  background: rgba(34, 130, 80, 0.13);
  color: #1f6c43;
}
.notion-tier-chip.tier-warn {
  background: rgba(202, 138, 4, 0.15);
  color: #92580a;
}
.notion-tier-chip.tier-block {
  background: rgba(220, 38, 38, 0.13);
  color: #991b1b;
}

.notion-tier-banner {
  display: flex; align-items: flex-start;
  padding: 10px 16px;
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.55;
  font-family: 'Pretendard Variable', sans-serif;
  border-top: 1px solid var(--border-light, #e5e2dd);
  border-bottom: 1px solid var(--border-light, #e5e2dd);
}
.notion-tier-banner--warn {
  background: #fdf6e3;
  color: #5a3e07;
}
.notion-tier-banner--block {
  background: #fdf1f1;
  color: #7a1a1a;
}
.notion-tier-banner-reason {
  display: inline;
  font-style: italic;
  opacity: 0.78;
  margin-left: 4px;
}
.notion-mini-btn {
  display: inline-flex; align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 700;
  border: 1px solid var(--border-light, #e5e2dd);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-mini-btn:hover:not(:disabled) {
  background: rgba(0,0,0,0.04);
  color: var(--text-main, #1a1a1a);
}
.notion-mini-btn--primary {
  background: var(--accent, #8B6F47);
  color: white;
  border-color: transparent;
}
.notion-mini-btn--primary:hover:not(:disabled) {
  background: #6B4A2A;
}
.notion-mini-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.notion-foot-hint {
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
  font-family: 'Pretendard Variable', sans-serif;
  display: inline-flex; align-items: center;
}
.notion-foot-hint--working { color: var(--accent, #8B6F47); }
.notion-foot-hint--ready { color: #2E7B33; font-weight: 600; }
.notion-foot-hint--error { color: #C0392B; font-weight: 600; }

/* [2026-05-19] 변환 후 화면 재정리 — chip / 안내 / 토글 분리해 한 줄씩. */
.notion-status-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 18px 8px;
  flex-wrap: wrap;
}
.notion-status-row__spacer { flex: 1; }
.notion-status-row__meta {
  font-size: 0.72rem;
  color: var(--text-muted, #6b7280);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}

.notion-action-hint {
  margin: 4px 18px 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(139, 111, 71, 0.06) 0%, rgba(46, 64, 54, 0.04) 100%);
  border: 1px solid rgba(139, 111, 71, 0.18);
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-main, #1a1a1a);
}

/* [2026-05-19] AI 분석 시작 안내 — 사용자 직접 트리거 유도. */
.notion-action-hint--start {
  display: flex;
  align-items: center;
  gap: 12px;
}
.notion-action-hint__text { flex: 1; min-width: 0; }
.notion-action-hint__sub {
  display: block;
  margin-top: 4px;
  font-size: 0.72rem;
  color: var(--text-muted, #6b7280);
}
.notion-action-hint--working {
  display: flex;
  align-items: center;
  background: rgba(46, 64, 54, 0.06);
  border-color: rgba(46, 64, 54, 0.2);
  color: var(--accent, #8B6F47);
}
.notion-analyze-btn {
  display: inline-flex; align-items: center;
  padding: 9px 16px;
  background: var(--accent, #8B6F47);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  font-family: 'Pretendard Variable', sans-serif;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(139, 111, 71, 0.25);
  transition: all 0.15s;
}
.notion-analyze-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(139, 111, 71, 0.35);
}
.notion-analyze-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.notion-action-hint strong { color: var(--accent, #8B6F47); font-weight: 700; }
.notion-action-hint__link {
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: var(--accent, #8B6F47);
  text-decoration: underline;
  cursor: pointer;
}
.notion-action-hint__link:hover { text-decoration: none; }

.notion-view-toggle {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 18px 8px;
  border-bottom: 1px solid var(--border-light, #e5e2dd);
}
.notion-view-toggle__spacer { flex: 1; }
/* [2026-05-21] 보기 모드 토글을 group 안에 묶어 한 덩어리로 인지되게.
   배경 컨테이너 + 내부 segmented control 톤. 보조 액션 (되돌리기·다시 변환) 과 시각 분리. */
.notion-view-toggle__group {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  background: var(--bg-input, #f0ede6);
  border-radius: 9999px;
  border: 1px solid var(--border-light, #e5e2dd);
}
.notion-toggle-btn {
  padding: 5px 14px;
  background: transparent;
  border: none;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  font-family: 'Pretendard Variable', sans-serif;
  transition: all 0.15s cubic-bezier(.16,1,.3,1);
}
.notion-toggle-btn:hover:not(.notion-toggle-btn--active) {
  color: var(--accent, #8B6F47);
}
.notion-toggle-btn--active {
  background: white;
  color: var(--accent, #8B6F47);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 0 0 0.5px rgba(0,0,0,0.04);
}
.notion-toggle-btn:focus-visible {
  outline: 2px solid var(--accent, #8B6F47);
  outline-offset: 2px;
}
.notion-mini-btn--ghost {
  background: transparent !important;
  color: var(--text-muted, #6b7280) !important;
}
.notion-mini-btn--ghost:hover:not(:disabled) {
  background: rgba(0,0,0,0.04) !important;
  color: var(--text-main, #1a1a1a) !important;
}

/* CTA 버튼 — 등록 액션 시각적 강조. */
.notion-btn--cta {
  padding: 10px 20px !important;
  font-size: 0.86rem !important;
  font-weight: 800 !important;
  box-shadow: 0 4px 14px rgba(139, 111, 71, 0.32);
  transition: all 0.15s;
}
.notion-btn--cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(139, 111, 71, 0.4);
}
.notion-btn--cta:disabled {
  box-shadow: none;
}
.notion-preview-body :deep(h1) { font-size: 1.2rem; margin: 18px 0 10px; font-weight: 800; }
.notion-preview-body :deep(h2) { font-size: 1.05rem; margin: 14px 0 8px; font-weight: 800; }
.notion-preview-body :deep(h3) { font-size: 0.95rem; margin: 12px 0 6px; font-weight: 700; }
.notion-preview-body :deep(code) {
  background: rgba(0,0,0,0.05);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.78rem;
}
.notion-preview-body :deep(pre) {
  background: #f5f3ee;
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.76rem;
}

/* ─── empty / error ─── */
.notion-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1;
  padding: 24px;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  font-family: 'Pretendard Variable', sans-serif;
  text-align: center;
}
.notion-empty--error {
  color: #b91c1c;
}
.notion-empty-hint {
  font-size: 0.7rem;
  color: var(--text-muted, #6b7280);
  margin-top: 6px;
  opacity: 0.8;
}

/* ─── footer ─── */
.notion-dialog-foot {
  display: flex; align-items: center; justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light, #e5e2dd);
  gap: 10px;
  background: var(--bg-card, #fff);
}
.notion-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex; align-items: center;
  font-family: 'Pretendard Variable', sans-serif;
  transition: opacity 0.15s, background 0.15s;
}
.notion-btn--ghost {
  background: transparent;
  border-color: var(--border-light, #e5e2dd);
  color: var(--text-muted, #6b7280);
}
.notion-btn--ghost:hover { background: rgba(0,0,0,0.04); }
.notion-btn--primary {
  background: var(--accent, #8B6F47);
  color: white;
}
.notion-btn--primary:hover:not(:disabled) {
  background: #6B4A2A;
}
.notion-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* .rotate-anim 회전은 전역(App.vue)으로 통합됨 */

@media (max-width: 760px) {
  .notion-body {
    grid-template-columns: 1fr;
    /* 모바일: 리스트 위 150px 고정, 미리보기 아래 영역 */
    grid-template-rows: 150px minmax(0, 1fr);
  }
  /* AI 분석 시작 카드 — 좁은 폭에서 세로 stack + 버튼 full-width */
  .notion-action-hint--start {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .notion-analyze-btn {
    width: 100%;
    justify-content: center;
    padding: 11px 16px;
    font-size: 0.86rem;
  }
  /* 헤더/푸터 패딩 축소 — 모바일 viewport 확보 */
  .notion-dialog-head { padding: 12px 16px; }
  .notion-dialog-foot { padding: 10px 14px; gap: 6px; }
  .notion-btn { padding: 8px 14px; font-size: 0.76rem; }
  .notion-btn--cta { padding: 9px 14px !important; font-size: 0.8rem !important; }
  /* preview 영역 내 고정 요소 패딩 축소 — 실제 콘텐츠 영역 최대화 */
  .notion-preview-head { padding: 10px 14px 4px 14px; }
  .notion-status-row { padding: 2px 14px 6px; }
  .notion-action-hint { padding: 8px 12px; margin: 4px 12px 6px; }
  .notion-view-toggle { padding: 3px 14px 6px; }
}

/* xs — fullscreen 모드에서 card 가 viewport 전체를 채우도록 */
@media (max-width: 600px) {
  .notion-dialog-card {
    max-height: 100dvh !important;
    border-radius: 0 !important;
  }
}
</style>
