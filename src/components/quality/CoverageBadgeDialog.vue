<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Copy, Check, Github } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import { buildBadgeUrl, buildBadgeMarkdown, buildBadgeSet } from '@/utils/coverageBadge'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  // metrics: { lineageCoverage, precision, recall, f1, lintAvg } — null 허용
  metrics: { type: Object, required: true },
  linkUrl: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const store = useHarnessStore()
const { showSuccess, showError } = useSnackbar()

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const style = ref('flat')

const badgeSet = computed(() =>
  buildBadgeSet(props.metrics, { linkUrl: props.linkUrl || undefined, style: style.value }),
)

const singleBadgeUrl = computed(() =>
  buildBadgeUrl({ label: 'lineage coverage', pct: props.metrics.lineageCoverage, style: style.value }),
)

const singleBadgeMd = computed(() =>
  buildBadgeMarkdown({
    label: 'lineage coverage',
    pct: props.metrics.lineageCoverage,
    linkUrl: props.linkUrl || undefined,
    style: style.value,
  }),
)

// 미리보기용: 마크다운 ![alt](url) → <img> 변환 (shields.io URL만 허용)
const renderPreviewHtml = (md) => {
  return md.replace(/\[?!\[([^\]]*)\]\((https:\/\/img\.shields\.io\/[^)]+)\)\]?(?:\([^)]+\))?/g,
    (_, alt, url) => `<img src="${url}" alt="${alt.replace(/"/g, '&quot;')}" />`,
  )
}

// E: PR 코멘트 게시
const prUrl = ref('')
const posting = ref(false)
const lastPostResult = ref(null)

const isValidPrUrl = computed(() => {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(prUrl.value.trim())
})

const buildPrCommentBody = () => {
  const m = props.metrics
  const stamp = new Date().toLocaleString('ko-KR')
  return `## 🤖 Harness Lineage Analysis

${badgeSet.value}

| ${t('quality.coverage.pr_table_metric')} | ${t('quality.coverage.pr_table_value')} |
|---|---|
| Lineage Coverage | ${m.lineageCoverage ?? '—'}% |
| Precision (macro) | ${m.precision ?? '—'}% |
| Recall (macro) | ${m.recall ?? '—'}% |
| F1 (macro) | ${m.f1 ?? '—'}% |
| Lint Avg | ${m.lintAvg ?? '—'}% |

_${t('quality.coverage.pr_generated_by', { stamp })}_`
}

const postToPR = async () => {
  if (!isValidPrUrl.value) {
    showError(t('quality.coverage.invalid_pr_url'))
    return
  }
  posting.value = true
  lastPostResult.value = null
  const body = buildPrCommentBody()
  const result = await store.postPRComment({ prUrl: prUrl.value.trim(), body, projectName: props.projectName })
  posting.value = false
  lastPostResult.value = result
  if (result.success) {
    showSuccess(t('quality.coverage.pr_post_done'))
  } else if (result.enabled === false) {
    showError(result.error)
  } else {
    showError(t('quality.coverage.pr_post_failed', { error: result.error }))
  }
}

const copiedKey = ref('')
const copyText = async (text, key) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    showSuccess(t('quality.coverage.clipboard_copied'))
    setTimeout(() => { copiedKey.value = '' }, 2000)
  } catch (e) {
    showSuccess(t('quality.coverage.copy_failed', { message: e.message }))
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="680" role="dialog" :aria-label="$t('quality.coverage.dialog_aria')" @update:model-value="(v) => emit('update:modelValue', v)" @keydown.esc="isOpen = false">
    <v-card class="badge-card">
      <div class="badge-head">
        <h3 class="badge-title">{{ $t('quality.coverage.title') }}</h3>
        <button type="button" class="badge-close" :aria-label="$t('common.action.close')" @click="isOpen = false">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="badge-body">
        <p class="badge-help">
          {{ $t('quality.coverage.help') }}
        </p>

        <div class="badge-style-row">
          <label class="badge-style-label">{{ $t('quality.coverage.style_label') }}</label>
          <label v-for="s in ['flat', 'flat-square', 'plastic', 'for-the-badge']" :key="s" class="badge-style-radio">
            <input type="radio" :value="s" v-model="style" /> {{ s }}
          </label>
        </div>

        <!-- Single (Lineage Coverage) -->
        <div class="badge-block">
          <div class="badge-block-head">
            <h4 class="badge-block-title">{{ $t('quality.coverage.single_title') }}</h4>
            <button type="button" class="badge-copy" :aria-label="$t('quality.coverage.copy_markdown_aria')" @click="copyText(singleBadgeMd, 'single')">
              <Check v-if="copiedKey === 'single'" :size="12" aria-hidden="true" />
              <Copy v-else :size="12" aria-hidden="true" />
              {{ copiedKey === 'single' ? $t('common.action.copied') : $t('common.action.copy') }}
            </button>
          </div>
          <div class="badge-preview">
            <img v-if="metrics.lineageCoverage != null" :src="singleBadgeUrl" :alt="`lineage coverage: ${metrics.lineageCoverage}%`" />
            <span v-else class="badge-no-data">{{ $t('quality.coverage.single_no_data') }}</span>
          </div>
          <pre class="badge-pre mono-text">{{ singleBadgeMd }}</pre>
        </div>

        <!-- Full Set -->
        <div class="badge-block">
          <div class="badge-block-head">
            <h4 class="badge-block-title">{{ $t('quality.coverage.set_title') }}</h4>
            <button type="button" class="badge-copy" :aria-label="$t('quality.coverage.copy_all_markdown_aria')" @click="copyText(badgeSet, 'set')" :disabled="!badgeSet">
              <Check v-if="copiedKey === 'set'" :size="12" aria-hidden="true" />
              <Copy v-else :size="12" aria-hidden="true" />
              {{ copiedKey === 'set' ? $t('common.action.copied') : $t('common.action.copy') }}
            </button>
          </div>
          <div class="badge-preview" v-html="renderPreviewHtml(badgeSet)"></div>
          <pre class="badge-pre mono-text">{{ badgeSet || $t('quality.coverage.set_empty') }}</pre>
        </div>

        <!-- PR 코멘트 게시 (E) -->
        <div class="badge-block">
          <div class="badge-block-head">
            <h4 class="badge-block-title">
              <Github :size="14" class="mr-1" aria-hidden="true" />
              {{ $t('quality.coverage.pr_title') }}
            </h4>
          </div>
          <p class="badge-help" style="margin: 0 0 10px;">
            {{ $t('quality.coverage.pr_help') }}
          </p>
          <div class="pr-row">
            <input
              v-model="prUrl"
              type="url"
              class="pr-input mono-text"
              placeholder="https://github.com/owner/repo/pull/123"
              :aria-label="$t('quality.coverage.pr_url_aria')"
            />
            <button type="button" class="badge-copy" :disabled="!isValidPrUrl || posting" @click="postToPR">
              <Github :size="12" class="mr-1" aria-hidden="true" />
              {{ posting ? $t('quality.coverage.posting') : $t('quality.coverage.pr_post') }}
            </button>
          </div>
          <div v-if="lastPostResult?.success && lastPostResult.commentUrl" class="pr-result pr-result--ok">
            ✓ <a :href="lastPostResult.commentUrl" target="_blank" rel="noopener">{{ $t('quality.coverage.pr_view_comment') }}</a>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.badge-card { border-radius: 16px; overflow: hidden; }
.badge-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px;
  background: linear-gradient(135deg, var(--primary-moss) 0%, #1F2D27 100%);
  color: white;
}
.badge-title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; margin: 0; }
.badge-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: white;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.badge-close:hover { background: rgba(255,255,255,0.3); }
.badge-body { padding: 20px 22px; }
.badge-help { font-size: 0.82rem; color: var(--text-main); line-height: 1.6; margin: 0 0 14px; }
.badge-style-row {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
  margin-bottom: 16px; padding: 10px 12px;
  background: var(--bg-light); border-radius: 8px;
}
.badge-style-label { font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 800; color: var(--text-main); }
.badge-style-radio { display: inline-flex; align-items: center; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.74rem; cursor: pointer; }
.badge-block { margin-bottom: 18px; padding: 14px; background: var(--bg-light); border-radius: 10px; }
.badge-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.badge-block-title { font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 800; color: var(--text-main); margin: 0; }
.badge-copy {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; background: white; border: 1px solid var(--border-light);
  border-radius: 9999px; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--accent); transition: all .12s;
}
.badge-copy:hover:not(:disabled) { background: var(--accent); color: white; border-color: var(--accent); }
.badge-copy:disabled { opacity: 0.4; cursor: not-allowed; }
.badge-preview {
  padding: 14px; background: white; border: 1px solid var(--border-light); border-radius: 8px;
  margin-bottom: 8px; min-height: 40px;
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
}
.badge-preview :deep(img) { display: inline-block; }
.badge-no-data { font-size: 0.78rem; color: var(--text-muted); font-style: italic; }
.pr-row { display: flex; gap: 8px; margin-bottom: 8px; }
.pr-input {
  flex: 1; padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--border-light);
  background: white; font-size: 0.78rem; color: var(--text-main); outline: none;
}
.pr-input:focus { border-color: var(--accent); }
.pr-result { font-size: 0.78rem; margin-top: 6px; }
.pr-result--ok { color: #2E7B33; }
.pr-result--ok a { color: var(--accent); text-decoration: underline; }

.badge-pre {
  margin: 0; padding: 10px;
  background: white; border: 1px solid var(--border-light); border-radius: 8px;
  font-size: 0.74rem; color: var(--text-main);
  overflow-x: auto; white-space: pre-wrap; word-break: break-all;
}
</style>
