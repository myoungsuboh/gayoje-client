/**
 * Lineage 매칭 품질 측정 + 정답 라벨 관리.
 *
 * 모듈 레벨 shared state — 부모/자식 컴포넌트가 동일 인스턴스 공유
 * (useLineageAnalysis와 동일 패턴).
 *
 * 책임:
 *   - truth 라벨 로드/캐시 (n8n + localStorage 폴백은 store에서 처리)
 *   - itemType별 truth Map 관리
 *   - 활성 탭의 precision/recall/F1 계산
 *   - 라벨링 다이얼로그 상태
 */
import { ref, computed, watch } from 'vue'
import { useHarnessStore } from '@/store/harness'
import { evaluateLineage } from '@/utils/lineageQuality'

// 탭 키 ↔ itemType 매핑
export const TAB_TO_ITEM_TYPE = {
  aggregates: 'aggregate',
  apis: 'api',
  services: 'service',
  stories: 'story',
}

// ─── 모듈 레벨 state ─────────────────────────────────────────
const truthByType = ref({})
const truthDialogOpen = ref(false)
const truthDialogItem = ref(null)
const truthDialogType = ref('')

// 캐시된 lineageData/activeTab refs — 첫 호출 시 등록되고 이후 재사용
let _lineageDataRef = null
let _lineageActiveTabRef = null
let _watchInstalled = false

const formatPct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`

const lineageQualityCurrent = computed(() => {
  if (!_lineageDataRef?.value) return null
  const t = TAB_TO_ITEM_TYPE[_lineageActiveTabRef?.value]
  if (!t) return null
  const items = _lineageDataRef.value[_lineageActiveTabRef.value] || []
  const truthMap = truthByType.value[t]
  if (!truthMap || truthMap.size === 0) return null
  const truth = Array.from(truthMap.entries()).map(([id, expectedFiles]) => ({ id, expectedFiles }))
  return evaluateLineage(items, truth, { mode: 'endsWith' })
})

export const useLineageQuality = (lineageDataRef, lineageActiveTabRef) => {
  const store = useHarnessStore()

  // 첫 호출 시 refs 등록
  if (!_lineageDataRef) _lineageDataRef = lineageDataRef
  if (!_lineageActiveTabRef) _lineageActiveTabRef = lineageActiveTabRef

  const loadAllTruth = async () => {
    if (!store.projectName) return
    const result = await store.fetchLineageTruth({ projectName: store.projectName })
    if (!result.success) return
    const next = {}
    for (const t of Object.values(TAB_TO_ITEM_TYPE)) next[t] = new Map()
    for (const t of (result.items || [])) {
      if (next[t.itemType]) next[t.itemType].set(String(t.itemId), t.expectedFiles || [])
    }
    truthByType.value = next
  }

  const openTruthDialog = (item, tabKey) => {
    const itemType = TAB_TO_ITEM_TYPE[tabKey]
    if (!itemType) return
    truthDialogItem.value = item
    truthDialogType.value = itemType
    truthDialogOpen.value = true
  }

  const onTruthSaved = ({ itemId, expectedFiles }) => {
    const t = truthDialogType.value
    if (!truthByType.value[t]) truthByType.value[t] = new Map()
    if (expectedFiles.length === 0) truthByType.value[t].delete(String(itemId))
    else truthByType.value[t].set(String(itemId), expectedFiles)
    truthByType.value = { ...truthByType.value }
  }

  const hasTruth = (item, tabKey) => {
    const t = TAB_TO_ITEM_TYPE[tabKey]
    if (!t) return false
    return truthByType.value[t]?.has(String(item.id)) || false
  }

  // watch 한 번만 설치 — module-level이라 중복 등록 방지
  if (!_watchInstalled && _lineageDataRef) {
    _watchInstalled = true
    watch(() => [store.projectName, _lineageDataRef.value], () => {
      if (_lineageDataRef.value) loadAllTruth()
    }, { immediate: true })
  }

  return {
    truthByType,
    truthDialogOpen,
    truthDialogItem,
    truthDialogType,
    loadAllTruth,
    openTruthDialog,
    onTruthSaved,
    hasTruth,
    lineageQualityCurrent,
    formatPct,
    TAB_TO_ITEM_TYPE,
  }
}
