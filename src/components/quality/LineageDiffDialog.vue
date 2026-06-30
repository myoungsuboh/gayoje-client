<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, GitCompare, Plus, Minus, RotateCw } from 'lucide-vue-next'
import { formatRelativeKr } from '@/utils/github'
import { diffLineage } from '@/utils/lineageDiff'
import { getLineageHistory, getLineageById } from '@/composables/useLineageAnalysis'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  currentData: { type: Object, default: null },
  currentSavedAt: { type: [Number, String], default: null },
})
const emit = defineEmits(['update:modelValue'])

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const history = ref([])           // [{ id, savedAt, data }]  data 는 lazy fetch
const fromIdx = ref(0)
const toIdx = ref(-1)
const isLoadingHistory = ref(false)

// BE 가 단일 진실원 — list 응답엔 본문(data) 미포함이라 별도 fetch.
// 10개 정도 작은 양이라 일괄 fetch (다이얼로그 오픈 시 한 번).
const reloadHistory = async () => {
  if (!props.projectName) { history.value = []; return }
  isLoadingHistory.value = true
  try {
    const meta = await getLineageHistory(props.projectName)
    // 본문 일괄 fetch — 작은 응답이라 N+1 허용. 더 커지면 ?include_data=true 추가.
    const items = await Promise.all(meta.map(async (m) => {
      const detail = await getLineageById(props.projectName, m.id)
      return detail ? { id: m.id, savedAt: m.saved_at, data: detail.data } : null
    }))
    history.value = items.filter(i => i && i.data)
  } catch (_) {
    history.value = []
  } finally {
    isLoadingHistory.value = false
  }
}

watch(() => [props.modelValue, props.projectName], ([open]) => {
  if (open) reloadHistory()
}, { immediate: true })

// "to" 옵션: 현재 + 히스토리 / "from" 옵션: 히스토리만
const fromOptions = computed(() => history.value.map((h, i) => ({
  idx: i, label: `#${i + 1} · ${formatRelativeKr(h.savedAt)}`,
})))

const fromData = computed(() => history.value[fromIdx.value]?.data || null)
const toData = computed(() => {
  if (toIdx.value === -1) return props.currentData
  return history.value[toIdx.value]?.data || null
})

const diff = computed(() => {
  if (!fromData.value || !toData.value) return null
  return diffLineage(fromData.value, toData.value)
})

const categories = ['aggregates', 'apis', 'services', 'stories']
const categoryLabel = { aggregates: 'Aggregate', apis: 'API', services: 'Service', stories: 'Story' }
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="820" role="dialog" :aria-label="$t('quality.diff.dialog_aria')" @update:model-value="(v) => emit('update:modelValue', v)" @keydown.esc="isOpen = false">
    <v-card class="diff-card">
      <div class="diff-head">
        <h3 class="diff-title">
          <GitCompare :size="18" class="mr-2" aria-hidden="true" />
          {{ $t('quality.diff.title') }}
        </h3>
        <button type="button" class="diff-close" :aria-label="$t('common.action.close')" @click="isOpen = false">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="diff-body">
        <div v-if="isLoadingHistory" class="diff-empty">
          <p>{{ $t('quality.diff.loading') }}</p>
        </div>
        <div v-else-if="!history.length" class="diff-empty">
          <p>{{ $t('quality.diff.empty') }}</p>
        </div>

        <template v-else-if="history.length">
          <!-- 비교 선택 -->
          <div class="diff-picker">
            <div class="diff-side">
              <label class="diff-side-label">{{ $t('quality.diff.from_label') }}</label>
              <select v-model.number="fromIdx" class="diff-select" :aria-label="$t('quality.diff.from_select_aria')">
                <option v-for="o in fromOptions" :key="o.idx" :value="o.idx">{{ o.label }}</option>
              </select>
            </div>
            <div class="diff-arrow" aria-hidden="true"><RotateCw :size="20" /></div>
            <div class="diff-side">
              <label class="diff-side-label">{{ $t('quality.diff.to_label') }}</label>
              <select v-model.number="toIdx" class="diff-select" :aria-label="$t('quality.diff.to_select_aria')">
                <option :value="-1">{{ $t('quality.diff.option_current') }}</option>
                <option v-for="o in fromOptions" :key="o.idx" :value="o.idx">{{ o.label }}</option>
              </select>
            </div>
          </div>

          <!-- 요약 -->
          <div v-if="diff" class="diff-summary">
            <div class="diff-stat diff-stat--add">
              <Plus :size="14" aria-hidden="true" />
              <strong>+{{ diff.summary.addedCount }}</strong> {{ $t('quality.diff.added') }}
            </div>
            <div class="diff-stat diff-stat--remove">
              <Minus :size="14" aria-hidden="true" />
              <strong>-{{ diff.summary.removedCount }}</strong> {{ $t('quality.diff.removed') }}
            </div>
            <div class="diff-stat diff-stat--change">
              <RotateCw :size="14" aria-hidden="true" />
              <strong>{{ diff.summary.changedCount }}</strong> {{ $t('quality.diff.changed') }}
            </div>
            <div class="diff-stat diff-stat--neutral">
              <strong>{{ diff.summary.unchangedCount }}</strong> {{ $t('quality.diff.unchanged') }}
            </div>
            <div class="diff-impl-stat mono-text">
              {{ $t('quality.diff.impl_files', { added: diff.summary.implsAdded, removed: diff.summary.implsRemoved }) }}
            </div>
          </div>

          <!-- 카테고리별 상세 -->
          <div v-if="diff" class="diff-categories custom-scroll">
            <div v-for="cat in categories" :key="cat" class="diff-cat">
              <div v-if="diff.added[cat].length || diff.removed[cat].length || diff.changed[cat].length" class="diff-cat-head">
                <span class="diff-cat-name">{{ categoryLabel[cat] }}</span>
              </div>

              <!-- Added -->
              <div v-for="item in diff.added[cat]" :key="`a-${item.id || item.name}`" class="diff-row diff-row--add">
                <Plus :size="12" class="diff-row-icon" aria-hidden="true" />
                <span class="diff-row-name">{{ item.name || item.id }}</span>
                <span class="diff-row-impl mono-text">+{{ (item.implementations || []).length }} impl</span>
              </div>

              <!-- Removed -->
              <div v-for="item in diff.removed[cat]" :key="`r-${item.id || item.name}`" class="diff-row diff-row--remove">
                <Minus :size="12" class="diff-row-icon" aria-hidden="true" />
                <span class="diff-row-name">{{ item.name || item.id }}</span>
                <span class="diff-row-impl mono-text">-{{ (item.implementations || []).length }} impl</span>
              </div>

              <!-- Changed -->
              <div v-for="item in diff.changed[cat]" :key="`c-${item.id}`" class="diff-row diff-row--change">
                <RotateCw :size="12" class="diff-row-icon" aria-hidden="true" />
                <div class="diff-row-main">
                  <div class="diff-row-name">{{ item.name || item.id }}</div>
                  <div class="diff-row-detail mono-text">
                    {{ item.before.count }} → {{ item.after.count }}
                    <span v-if="item.addedFiles.length" class="diff-files diff-files--add">
                      +{{ item.addedFiles.length }} ({{ item.addedFiles.slice(0, 2).join(', ') }}{{ item.addedFiles.length > 2 ? '…' : '' }})
                    </span>
                    <span v-if="item.removedFiles.length" class="diff-files diff-files--remove">
                      -{{ item.removedFiles.length }} ({{ item.removedFiles.slice(0, 2).join(', ') }}{{ item.removedFiles.length > 2 ? '…' : '' }})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="diff.summary.addedCount + diff.summary.removedCount + diff.summary.changedCount === 0" class="diff-no-change">
              {{ $t('quality.diff.no_change') }}
            </div>
          </div>
        </template>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.diff-card { border-radius: 16px; overflow: hidden; }
.diff-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px;
  background: linear-gradient(135deg, #3D2E1E 0%, #1A1208 100%);
  color: white;
}
.diff-title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; margin: 0; display: inline-flex; align-items: center; }
.diff-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: white;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.diff-close:hover { background: rgba(255,255,255,0.3); }
.diff-body { padding: 20px 22px 22px; }
.diff-empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.diff-picker {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: end;
  margin-bottom: 16px;
}
.diff-side-label { display: block; font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.06em; margin-bottom: 4px; text-transform: uppercase; }
.diff-select { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-light); background: white; font-family: 'Pretendard Variable', sans-serif; font-size: 0.82rem; color: var(--text-main); }
.diff-arrow { display: flex; align-items: center; padding-bottom: 6px; color: var(--accent); }
.diff-summary {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  margin-bottom: 14px; padding: 12px 14px;
  background: var(--bg-light); border-radius: 10px;
  font-size: 0.82rem;
}
.diff-stat { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 9999px; font-weight: 700; font-family: 'Outfit', sans-serif; font-size: 0.78rem; }
.diff-stat--add { background: rgba(91,161,96,0.15); color: #2E7B33; }
.diff-stat--remove { background: rgba(192,57,43,0.12); color: #A0291F; }
.diff-stat--change { background: rgba(224,138,60,0.15); color: #B46723; }
.diff-stat--neutral { background: rgba(140,98,57,0.08); color: var(--text-muted); }
.diff-impl-stat { margin-left: auto; font-size: 0.74rem; color: var(--text-muted); }

.diff-categories { max-height: 420px; overflow-y: auto; padding-right: 4px; }
.diff-cat { margin-bottom: 14px; }
.diff-cat-head {
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800;
  color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase;
  padding: 6px 0; margin-bottom: 4px;
  border-bottom: 1px solid var(--border-light);
}
.diff-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; font-size: 0.82rem; }
.diff-row + .diff-row { margin-top: 2px; }
.diff-row--add { background: rgba(91,161,96,0.06); }
.diff-row--remove { background: rgba(192,57,43,0.06); }
.diff-row--change { background: rgba(224,138,60,0.06); align-items: flex-start; }
.diff-row-icon { flex-shrink: 0; }
.diff-row--add .diff-row-icon { color: #2E7B33; }
.diff-row--remove .diff-row-icon { color: #A0291F; }
.diff-row--change .diff-row-icon { color: #B46723; margin-top: 3px; }
.diff-row-main { flex: 1; min-width: 0; }
.diff-row-name { font-weight: 700; color: var(--text-main); }
.diff-row-impl { font-size: 0.74rem; color: var(--text-muted); margin-left: auto; }
.diff-row-detail { font-size: 0.74rem; color: var(--text-muted); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 6px; }
.diff-files { padding: 1px 7px; border-radius: 4px; }
.diff-files--add { background: rgba(91,161,96,0.1); color: #2E7B33; }
.diff-files--remove { background: rgba(192,57,43,0.1); color: #A0291F; }
.diff-no-change { padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }

.custom-scroll::-webkit-scrollbar { width: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
</style>
