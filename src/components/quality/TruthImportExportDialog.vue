<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload, Download, X, CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import { downloadText } from '@/utils/download'
import {
  truthArrayFromMap,
  exportTruthToCsv,
  exportTruthToJson,
  importTruthFromCsv,
  importTruthFromJson,
} from '@/utils/lineageTruthIO'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  truthByType: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue', 'imported'])

const store = useHarnessStore()
const { showSuccess, showError } = useSnackbar()

const tab = ref('export') // 'export' | 'import'
const importText = ref('')
const importFormat = ref('csv') // 'csv' | 'json'
const overrideExisting = ref(false)
const previewItems = ref([])
const previewErrors = ref([])
const previewSkipped = ref(0)
const importing = ref(false)

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const exportItems = computed(() => truthArrayFromMap(props.truthByType))
const exportCsv = computed(() => exportTruthToCsv(exportItems.value))
const exportJson = computed(() => exportTruthToJson(exportItems.value))

watch([importText, importFormat], () => {
  if (!importText.value) { previewItems.value = []; previewErrors.value = []; previewSkipped.value = 0; return }
  const r = importFormat.value === 'json'
    ? importTruthFromJson(importText.value)
    : importTruthFromCsv(importText.value)
  previewItems.value = r.items
  previewErrors.value = r.errors
  previewSkipped.value = r.skipped
})

const handleExportCsv = () => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  downloadText(exportCsv.value, `${store.projectName}_lineage_truth_${stamp}.csv`, 'text/csv')
  showSuccess(t('quality.truth_io.csv_downloaded', { count: exportItems.value.length }))
}
const handleExportJson = () => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  downloadText(exportJson.value, `${store.projectName}_lineage_truth_${stamp}.json`, 'application/json')
  showSuccess(t('quality.truth_io.json_downloaded', { count: exportItems.value.length }))
}

const onFilePick = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  const text = await file.text()
  importText.value = text
  if (file.name.toLowerCase().endsWith('.json')) importFormat.value = 'json'
  else importFormat.value = 'csv'
  event.target.value = '' // reset input
}

const handleImport = async () => {
  if (!previewItems.value.length) {
    showError(t('quality.truth_io.no_valid_items'))
    return
  }
  importing.value = true
  const result = await store.importLineageTruth({
    projectName: store.projectName,
    items: previewItems.value,
    override: overrideExisting.value,
  })
  importing.value = false
  if (result.success) {
    showSuccess(t('quality.truth_io.import_done', { written: result.written, skipped: result.skipped }))
    emit('imported', { written: result.written, skipped: result.skipped })
    isOpen.value = false
    importText.value = ''
  } else {
    showError(result.error || t('quality.truth_io.import_failed'))
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="720" role="dialog" :aria-label="$t('quality.truth_io.dialog_aria')" @update:model-value="(v) => emit('update:modelValue', v)" @keydown.esc="isOpen = false">
    <v-card class="iox-card">
      <div class="iox-head">
        <h3 class="iox-title">{{ $t('quality.truth_io.title') }}</h3>
        <button type="button" class="iox-close" :aria-label="$t('common.action.close')" @click="isOpen = false">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="iox-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'export'" class="iox-tab" :class="{ active: tab === 'export' }" @click="tab = 'export'">
          <Download :size="14" aria-hidden="true" /> {{ $t('quality.truth_io.tab_export') }}
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'import'" class="iox-tab" :class="{ active: tab === 'import' }" @click="tab = 'import'">
          <Upload :size="14" aria-hidden="true" /> {{ $t('quality.truth_io.tab_import') }}
        </button>
      </div>

      <!-- EXPORT -->
      <div v-if="tab === 'export'" class="iox-body">
        <p class="iox-help" v-html="$t('quality.truth_io.export_help_html', { count: exportItems.length })"></p>

        <div class="iox-action-row">
          <button type="button" class="iox-btn iox-btn--primary" :disabled="!exportItems.length" @click="handleExportCsv">
            <Download :size="13" class="mr-1" aria-hidden="true" /> {{ $t('quality.truth_io.export_csv') }}
          </button>
          <button type="button" class="iox-btn iox-btn--primary" :disabled="!exportItems.length" @click="handleExportJson">
            <Download :size="13" class="mr-1" aria-hidden="true" /> {{ $t('quality.truth_io.export_json') }}
          </button>
        </div>

        <details class="iox-preview">
          <summary>{{ $t('quality.truth_io.preview_csv') }}</summary>
          <pre class="iox-pre mono-text">{{ exportCsv || $t('quality.truth_io.preview_empty') }}</pre>
        </details>
      </div>

      <!-- IMPORT -->
      <div v-else class="iox-body">
        <p class="iox-help">
          {{ $t('quality.truth_io.import_help') }}
        </p>

        <div class="iox-format-row">
          <label class="iox-format-label">
            <input type="radio" value="csv" v-model="importFormat" /> CSV
          </label>
          <label class="iox-format-label">
            <input type="radio" value="json" v-model="importFormat" /> JSON
          </label>
          <label class="iox-file-pick">
            <input type="file" accept=".csv,.json,.txt" @change="onFilePick" hidden />
            <Upload :size="13" class="mr-1" aria-hidden="true" /> {{ $t('quality.truth_io.file_pick') }}
          </label>
          <label class="iox-override-label">
            <input type="checkbox" v-model="overrideExisting" /> {{ $t('quality.truth_io.override_existing') }}
          </label>
        </div>

        <textarea
          v-model="importText"
          class="iox-textarea mono-text"
          rows="6"
          :placeholder="importFormat === 'csv' ? 'itemType,itemId,expectedFiles\napi,api-1,a.ts;b.ts' : '[{ \&quot;itemType\&quot;: \&quot;api\&quot;, ... }]'"
          :aria-label="$t('quality.truth_io.import_textarea_aria')"
        />

        <div v-if="previewItems.length || previewErrors.length" class="iox-preview-block">
          <div class="iox-preview-stats">
            <span class="stat stat-ok"><CheckCircle2 :size="13" aria-hidden="true" /> {{ $t('quality.truth_io.stat_valid', { count: previewItems.length }) }}</span>
            <span v-if="previewSkipped > 0" class="stat stat-warn"><AlertTriangle :size="13" aria-hidden="true" /> {{ $t('quality.truth_io.stat_skipped', { count: previewSkipped }) }}</span>
          </div>
          <ul v-if="previewErrors.length" class="iox-error-list">
            <li v-for="(e, i) in previewErrors.slice(0, 5)" :key="i">{{ $t('quality.truth_io.error_line', { line: e.line, reason: e.reason }) }}</li>
            <li v-if="previewErrors.length > 5">{{ $t('quality.truth_io.error_more', { count: previewErrors.length - 5 }) }}</li>
          </ul>
          <details v-if="previewItems.length" class="iox-preview">
            <summary>{{ $t('quality.truth_io.valid_preview', { count: previewItems.length }) }}</summary>
            <ul class="iox-item-list mono-text">
              <li v-for="(it, i) in previewItems.slice(0, 20)" :key="i">
                <strong>{{ it.itemType }}</strong>:{{ it.itemId }} → {{ $t('quality.truth_io.valid_item_files', { count: it.expectedFiles.length }) }}
              </li>
              <li v-if="previewItems.length > 20">{{ $t('quality.truth_io.valid_item_more', { count: previewItems.length - 20 }) }}</li>
            </ul>
          </details>
        </div>

        <div class="iox-action-row">
          <button type="button" class="iox-btn iox-btn--cancel" @click="isOpen = false">{{ $t('common.action.cancel') }}</button>
          <button type="button" class="iox-btn iox-btn--primary" :disabled="!previewItems.length || importing" @click="handleImport">
            <Upload :size="13" class="mr-1" aria-hidden="true" />
            {{ importing ? $t('quality.truth_io.importing') : $t('quality.truth_io.import_submit', { count: previewItems.length }) }}
          </button>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.iox-card { border-radius: 16px; overflow: hidden; }
.iox-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px;
  background: linear-gradient(135deg, var(--accent) 0%, #6B4A2A 100%);
  color: white;
}
.iox-title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; margin: 0; }
.iox-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: white;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.iox-close:hover { background: rgba(255,255,255,0.3); }
.iox-tabs {
  display: flex; gap: 4px; padding: 12px 22px 0;
  background: var(--bg-light);
  border-bottom: 1px solid var(--border-light);
}
.iox-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; background: transparent; border: none;
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 800;
  color: var(--text-muted); cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.iox-tab:hover { color: var(--text-main); }
.iox-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.iox-body { padding: 20px 22px 22px; }
.iox-help { font-size: 0.82rem; color: var(--text-main); line-height: 1.6; margin: 0 0 16px; }
.iox-action-row {
  display: flex; gap: 8px; justify-content: flex-end;
  margin-top: 16px; flex-wrap: wrap;
}
.iox-btn {
  display: inline-flex; align-items: center;
  padding: 9px 18px; border: none; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: all .15s;
}
.iox-btn--primary { background: var(--accent); color: white; }
.iox-btn--primary:hover:not(:disabled) { transform: translateY(-1px); }
.iox-btn--primary:disabled { opacity: 0.45; cursor: not-allowed; }
.iox-btn--cancel { background: var(--bg-light); color: var(--text-main); border: 1px solid var(--border-light); }

.iox-format-row {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
  margin-bottom: 12px; padding: 10px 12px;
  background: var(--bg-light); border-radius: 8px;
  font-size: 0.78rem;
}
.iox-format-label, .iox-override-label {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--text-main); cursor: pointer;
}
.iox-file-pick {
  display: inline-flex; align-items: center; padding: 5px 12px;
  background: white; border: 1px solid var(--border-light); border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 700;
  color: var(--accent); cursor: pointer; transition: all .12s;
}
.iox-file-pick:hover { background: var(--accent); color: white; border-color: var(--accent); }
.iox-textarea {
  width: 100%; min-height: 120px; padding: 12px;
  border: 1.5px solid var(--border-light); border-radius: 10px;
  background: white; font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem;
  color: var(--text-main); outline: none; resize: vertical; box-sizing: border-box;
}
.iox-textarea:focus { border-color: var(--accent); }
.iox-preview-block {
  margin-top: 14px; padding: 12px 14px;
  background: var(--bg-light); border-radius: 10px;
}
.iox-preview-stats { display: flex; gap: 14px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.stat { display: inline-flex; align-items: center; gap: 5px; font-size: 0.78rem; font-weight: 700; }
.stat-ok { color: #2E7B33; }
.stat-warn { color: #B46723; }
.iox-error-list {
  list-style: disc; padding-left: 20px; margin: 0 0 8px;
  font-size: 0.74rem; color: #B46723;
}
.iox-item-list {
  list-style: none; padding: 8px 0 0; margin: 0;
  font-size: 0.74rem; color: var(--text-muted);
  max-height: 180px; overflow-y: auto;
}
.iox-item-list li { padding: 2px 0; }
.iox-preview { margin-top: 12px; }
.iox-preview summary {
  font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 800;
  color: var(--accent); cursor: pointer;
}
.iox-pre {
  margin: 8px 0 0; padding: 10px;
  background: white; border: 1px solid var(--border-light); border-radius: 8px;
  font-size: 0.74rem; color: var(--text-main);
  max-height: 200px; overflow: auto; white-space: pre-wrap;
}
</style>
