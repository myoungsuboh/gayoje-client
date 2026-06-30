<script setup>
/**
 * NotionExportDialog — CPS/PRD/설계를 Notion 허브 페이지로 공유.
 *
 * 흐름: 문서 선택 → 공유 → BE 가 처음이면 need_parent 반환 → NotionPageList 로
 * 저장 위치(상위 페이지) 선택 → parent_page_id 와 함께 재호출 → 결과 + 허브 링크.
 * 연결 여부는 호출 측(진입 버튼)이 미리 게이팅 — 여기선 export 만 담당.
 */
import { ref, computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { Share2, ExternalLink, Loader2, X, Check, MinusCircle, AlertCircle } from 'lucide-vue-next'
import { exportToNotionApi, notionErrorMessage } from '@/utils/notion'
import { useNotionStore } from '@/store/notion'
import { useSnackbar } from '@/composables/useSnackbar'
import NotionPageList from '@/components/plan/NotionPageList.vue'

const { t } = useI18n()
const { showSuccess, showError } = useSnackbar()
const notion = useNotionStore()
const { xs } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  teamId: { type: String, default: '' },
  docs: { type: Array, default: () => ['cps', 'prd', 'design'] },
})
const emit = defineEmits(['update:modelValue'])

const ALL_DOCS = ['cps', 'prd', 'design']

const selected = ref([])
const phase = ref('select') // 'select' | 'picking' | 'done'
const loading = ref(false)
const results = ref([])
const hubUrl = ref(null)
const parentPageId = ref(null)

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      const init = (props.docs && props.docs.length ? props.docs : ALL_DOCS).filter((d) =>
        ALL_DOCS.includes(d),
      )
      selected.value = init.length ? init : [...ALL_DOCS]
      phase.value = 'select'
      results.value = []
      hubUrl.value = null
      parentPageId.value = null
      // [2026-06-12] v-dialog 는 한 번 마운트되면 닫혀도 unmount 안 됨 — 이전
      // 공유에서 loading 이 stuck 됐다면(예: BE 가 timeout 직전 응답, 사용자가
      // 답답해서 X 로 닫음) 다음에 열어도 "공유 중..." 그대로. 명시적 리셋으로
      // 사용자의 stuck 탈출 경로 보장.
      loading.value = false
    } else if (notion.reset) {
      notion.reset()
    }
  },
  { immediate: true },
)

const toggleDoc = (d) => {
  const i = selected.value.indexOf(d)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(d)
}

const statusIcon = (s) =>
  ({ created: Check, updated: Check, skipped: MinusCircle, failed: AlertCircle, need_parent: AlertCircle }[s] || MinusCircle)

const doExport = async () => {
  if (selected.value.length === 0) {
    showError(t('plan.notion.export_empty_docs'))
    return
  }
  loading.value = true
  // [2026-06-12] try/finally 로 loading 보장 — exportToNotionApi 는 자체 catch 로
  // throw 하지 않지만, 향후 변경에 대비한 방어. v-dialog 마운트 유지 특성과 합쳐
  // loading 이 stuck 되는 회귀의 표면을 최소화한다.
  let r
  try {
    r = await exportToNotionApi({
      projectName: props.projectName,
      docs: [...selected.value],
      parentPageId: parentPageId.value,
      teamId: props.teamId || null,
    })
  } finally {
    loading.value = false
  }
  if (!r.success) {
    showError(notionErrorMessage(r.code) || r.error)
    return
  }
  const needParent = (r.results || []).some((x) => x.status === 'need_parent')
  if (needParent && !parentPageId.value) {
    phase.value = 'picking'
    // Import 다이얼로그와 같은 notion store 공유 — 잔존 선택/결과/에러 제거 후 로드
    if (notion.reset) notion.reset()
    if (notion.search) notion.search('')
    return
  }
  results.value = r.results || []
  hubUrl.value = r.hub_url || null
  phase.value = 'done'
  const ok = results.value.filter((x) => x.status === 'created' || x.status === 'updated').length
  const total = results.value.length
  showSuccess(
    ok === total
      ? t('plan.notion.export_done')
      : t('plan.notion.export_done_partial', { ok, total }),
  )
}

const onPickParent = (page) => {
  parentPageId.value = page.id
  doExport()
}

const close = () => {
  open.value = false
}
</script>

<template>
  <v-dialog
    v-model="open"
    :max-width="xs ? undefined : 560"
    :fullscreen="xs"
    scrim="rgba(20,16,12,0.5)"
    role="dialog"
    :aria-label="$t('plan.notion.export_title')"
    @keydown.esc="close"
  >
    <div class="nxe-modal">
      <!-- Header -->
      <div class="nxe-header">
        <Share2 :size="18" class="nxe-header-icon" />
        <h3 class="nxe-title">{{ $t('plan.notion.export_title') }}</h3>
        <button type="button" class="nxe-close" :aria-label="$t('common.action.close')" @click="close">
          <X :size="16" />
        </button>
      </div>

      <!-- Phase: select -->
      <div v-if="phase === 'select'" class="nxe-body">
        <p class="nxe-sub" v-html="$t('plan.notion.export_sub_html', { project: projectName })" />
        <div class="nxe-docs-label">{{ $t('plan.notion.export_docs_label') }}</div>
        <div class="nxe-docs">
          <label v-for="d in ALL_DOCS" :key="d" class="nxe-doc" :class="{ 'nxe-doc--on': selected.includes(d) }">
            <input type="checkbox" :value="d" :checked="selected.includes(d)" @change="toggleDoc(d)" />
            <span>{{ $t(`plan.notion.export_doc_${d}`) }}</span>
          </label>
        </div>
        <button type="button" class="nxe-primary" :disabled="loading || selected.length === 0" @click="doExport">
          <Loader2 v-if="loading" :size="15" class="rotate-anim mr-1" />
          <Share2 v-else :size="15" class="mr-1" />
          {{ loading ? $t('plan.notion.export_btn_loading') : $t('plan.notion.export_btn') }}
        </button>
      </div>

      <!-- Phase: picking (first export — choose parent) -->
      <div v-else-if="phase === 'picking'" class="nxe-body">
        <button type="button" class="nxe-back" @click="phase = 'select'">← {{ $t('common.action.back') }}</button>
        <div class="nxe-pick-title">{{ $t('plan.notion.export_pick_parent_title') }}</div>
        <p class="nxe-pick-sub">{{ $t('plan.notion.export_pick_parent_sub') }}</p>
        <div class="nxe-picker">
          <NotionPageList :active="phase === 'picking'" @select="onPickParent" />
        </div>
        <div v-if="loading" class="nxe-picking-loading">
          <Loader2 :size="15" class="rotate-anim mr-1" />{{ $t('plan.notion.export_btn_loading') }}
        </div>
      </div>

      <!-- Phase: done -->
      <div v-else class="nxe-body">
        <div class="nxe-results">
          <div
            v-for="r in results"
            :key="r.doc"
            class="nxe-result"
            :class="`nxe-result--${r.status}`"
          >
            <component :is="statusIcon(r.status)" :size="14" class="nxe-result-icon" />
            <span class="nxe-result-doc">{{ $t(`plan.notion.export_doc_${r.doc}`) }}</span>
            <span class="nxe-result-status">{{ $t(`plan.notion.export_status_${r.status}`) }}</span>
            <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="nxe-result-link">
              <ExternalLink :size="12" />
            </a>
          </div>
        </div>
        <a v-if="hubUrl" :href="hubUrl" target="_blank" rel="noopener" class="nxe-primary nxe-primary--link">
          <ExternalLink :size="15" class="mr-1" />{{ $t('plan.notion.export_open_hub') }}
        </a>
        <button type="button" class="nxe-ghost" @click="close">{{ $t('common.action.close') }}</button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.nxe-modal {
  background: var(--bg-card, #fff);
  border-radius: 16px;
  font-family: 'Pretendard Variable', sans-serif;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  overflow: hidden;
}
.nxe-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-light, #e5e2dd);
}
.nxe-header-icon { color: var(--accent, #8C6239); }
.nxe-title { flex: 1; margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-main); }
.nxe-close {
  background: transparent; border: none; cursor: pointer; padding: 4px;
  color: var(--text-muted); border-radius: 6px;
}
.nxe-close:hover { background: rgba(0, 0, 0, 0.05); }
.nxe-body { padding: 18px; overflow-y: auto; }
.nxe-sub { font-size: 0.85rem; color: var(--text-muted); margin: 0 0 16px; line-height: 1.6; }
.nxe-sub :deep(strong) { color: var(--text-main); font-weight: 700; }
.nxe-docs-label { font-size: 0.78rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
.nxe-docs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.nxe-doc {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border: 1px solid var(--border-light, #e5e2dd);
  border-radius: 10px; cursor: pointer; font-size: 0.85rem; color: var(--text-main);
  transition: all 0.12s;
}
.nxe-doc:hover { border-color: var(--accent, #8C6239); }
.nxe-doc--on { border-color: var(--accent, #8C6239); background: rgba(140, 98, 57, 0.06); font-weight: 600; }
.nxe-doc input { accent-color: var(--accent, #8C6239); width: 16px; height: 16px; }

.nxe-primary {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%; padding: 12px; border-radius: 10px;
  background: var(--accent, #8C6239); color: #fff; border: 1px solid var(--accent, #8C6239);
  font-size: 0.88rem; font-weight: 700; cursor: pointer; transition: all 0.15s; text-decoration: none;
}
.nxe-primary:hover:not(:disabled) { background: #75502E; border-color: #75502E; }
.nxe-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.nxe-primary--link { margin-top: 4px; }
.nxe-ghost {
  width: 100%; margin-top: 10px; padding: 10px; border-radius: 10px;
  background: none; border: 1px solid var(--border-light, #e5e2dd); color: var(--text-muted);
  font-size: 0.85rem; cursor: pointer;
}
.nxe-ghost:hover { border-color: var(--accent, #8C6239); color: var(--accent, #8C6239); }

.nxe-back {
  background: none; border: none; cursor: pointer; padding: 0 0 8px;
  color: var(--text-muted); font-size: 0.8rem; font-weight: 600;
}
.nxe-back:hover { color: var(--accent, #8C6239); }
.nxe-pick-title { font-size: 0.9rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px; }
.nxe-pick-sub { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 12px; line-height: 1.55; }
.nxe-picker {
  height: 48vh; min-height: 280px; border: 1px solid var(--border-light, #e5e2dd);
  border-radius: 10px; overflow: hidden; display: flex;
}
.nxe-picker :deep(.notion-list-pane) { flex: 1; border-right: none; border-bottom: none; }
.nxe-picking-loading {
  display: flex; align-items: center; justify-content: center;
  margin-top: 10px; font-size: 0.8rem; color: var(--text-muted);
}

.nxe-results { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.nxe-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px; font-size: 0.83rem;
  background: var(--bg-light, #F7F5EB);
}
.nxe-result-icon { flex-shrink: 0; }
.nxe-result--created .nxe-result-icon, .nxe-result--updated .nxe-result-icon { color: #15803D; }
.nxe-result--skipped .nxe-result-icon { color: #9ca3af; }
.nxe-result--failed .nxe-result-icon { color: #b91c1c; }
.nxe-result--need_parent .nxe-result-icon { color: #b45309; }
.nxe-result-doc { flex: 1; font-weight: 600; color: var(--text-main); }
.nxe-result-status { font-size: 0.72rem; color: var(--text-muted); }
.nxe-result-link { color: var(--accent, #8C6239); display: inline-flex; }

@media (max-width: 600px) {
  .nxe-modal { border-radius: 0; max-height: 100dvh; min-height: 100dvh; }
  .nxe-picker { height: 56vh; }
}
</style>
