import { ref, onMounted, watch } from 'vue'
import axios from '@/utils/axios'

/**
 * useGraphNodeEdit — 검수 모드(editable) 그래프 노드의 summary 인라인 수정 공통 로직.
 *
 * [2026-06 공통화] CpsTab 의 인라인 노드편집과 PrdNodeEditor.vue 가 동일하게 구현하던
 * "노드 목록 GET → 단일 노드 summary PATCH(낙관적잠금 없음) → 토스트/emit" CRUD 사이클을
 * 추출. 외형(template/CSS)은 각 host 가 그대로 보유하므로 UI 는 불변 — host 는 endpoint·
 * i18n/snackbar·emit 콜백만 주입한다. 실제 통신은 utils/axios(인터셉터 포함) 그대로 사용.
 *
 * onMounted + watch(projectName/editable) 로 목록을 자동 로드한다(기존 동작 보존).
 *
 * @param {object} opts
 * @param {() => string}  opts.getProjectName  현재 프로젝트명 (reactive 라 getter)
 * @param {() => boolean} opts.getEditable     검수 모드 여부 (false 면 fetch no-op)
 * @param {string} opts.nodesPath              '/api/v2/cps/nodes' | '/api/v2/prd/nodes'
 *                                             (GET 목록 + `${nodesPath}/{id}` PATCH 공통 베이스)
 * @param {() => void}        [opts.onSummaryEmpty]     빈 summary 저장 시도 시
 * @param {() => void}        [opts.onSummaryTooLarge]  2000자 초과 시
 * @param {(node) => void}    [opts.onSaveOk]           저장 성공 시 (node.label 등 사용)
 * @param {() => void}        [opts.onSaveFail]         저장 실패 시
 * @param {() => void}        [opts.onSaved]            저장 성공 후 부모 알림 (보통 emit('saved'))
 * @param {string}            [opts.logLabel]           console.error 접두사 (기본 'nodes')
 * @returns {{
 *   graphNodes: import('vue').Ref<Array>, isLoadingNodes: import('vue').Ref<boolean>,
 *   editingNodeId: import('vue').Ref<*>, editingNodeSummary: import('vue').Ref<string>,
 *   isSavingNode: import('vue').Ref<boolean>, fetchGraphNodes: () => Promise<void>,
 *   startEditNode: (node) => void, cancelEditNode: () => void,
 *   saveEditNode: (node) => Promise<void>,
 * }}
 */
export function useGraphNodeEdit({
  getProjectName,
  getEditable,
  nodesPath,
  onSummaryEmpty,
  onSummaryTooLarge,
  onSaveOk,
  onSaveFail,
  onSaved,
  logLabel = 'nodes',
} = {}) {
  const graphNodes = ref([])  // [{ id, label, summary }]
  const isLoadingNodes = ref(false)
  const editingNodeId = ref(null)
  const editingNodeSummary = ref('')
  const isSavingNode = ref(false)

  const fetchGraphNodes = async () => {
    if (!getProjectName?.() || !getEditable?.()) return
    isLoadingNodes.value = true
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? ''
      const { data } = await axios.get(`${base}${nodesPath}`, {
        params: { project_name: getProjectName() },
      })
      graphNodes.value = data?.nodes || []
    } catch (err) {
      console.error(`${logLabel} 조회 실패:`, err)
      graphNodes.value = []
    } finally {
      isLoadingNodes.value = false
    }
  }

  onMounted(fetchGraphNodes)
  // projectName/editable 이 바뀌면(검수 진입·프로젝트 전환) 목록 재조회 — 기존 watch 동작 동일.
  watch(() => [getProjectName?.(), getEditable?.()], fetchGraphNodes)

  const startEditNode = (node) => {
    editingNodeId.value = node.id
    editingNodeSummary.value = node.summary || ''
  }
  const cancelEditNode = () => {
    editingNodeId.value = null
    editingNodeSummary.value = ''
  }
  const saveEditNode = async (node) => {
    if (!editingNodeSummary.value.trim()) {
      onSummaryEmpty?.()
      return
    }
    if (editingNodeSummary.value.length > 2000) {
      onSummaryTooLarge?.()
      return
    }
    isSavingNode.value = true
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? ''
      await axios.patch(`${base}${nodesPath}/${encodeURIComponent(node.id)}`, {
        project_name: getProjectName(),
        summary: editingNodeSummary.value,
      })
      // 낙관적 갱신 — 응답 대기 없이 로컬 목록의 summary 즉시 반영(기존 동작 보존).
      const idx = graphNodes.value.findIndex(n => n.id === node.id)
      if (idx >= 0) graphNodes.value[idx].summary = editingNodeSummary.value
      onSaveOk?.(node)
      cancelEditNode()
      onSaved?.()
    } catch (err) {
      console.error(`${logLabel} 수정 실패:`, err)
      onSaveFail?.()
    } finally {
      isSavingNode.value = false
    }
  }

  return {
    graphNodes,
    isLoadingNodes,
    editingNodeId,
    editingNodeSummary,
    isSavingNode,
    fetchGraphNodes,
    startEditNode,
    cancelEditNode,
    saveEditNode,
  }
}
