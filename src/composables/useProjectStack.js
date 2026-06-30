/**
 * useProjectStack — 프로젝트의 기술 스택(FE/BE/DB)을 architecture(설계)에서 읽어온다.
 *
 * [배경 — Rule Generator 재설계 C1]
 * 코딩 규칙은 스택에 종속적이다(React 규칙 ≠ Vue 규칙). 스택은 design 단계의
 * architecture(ArchService/ArchDatabase 노드의 `tech_stack`)에서 정해지는데,
 * Rule Generator(plan 탭)는 지금까지 그 스택을 전혀 읽지 않았다. 이 컴포저블이
 * getArchitecture 를 호출해 노드들의 tech_stack 을 모아 'STEP 1 스택' 으로 노출한다.
 *
 * 주의: getNodeProp 은 node[key] ?? node.properties[key] 를 보므로 평탄/중첩 모두 처리.
 * (BE 저장 키는 `tech_stack` — FE ArchitectureTab 이 `tech` 를 읽던 건 별도 버그)
 */
import { ref, computed } from 'vue'
import axios from '@/utils/axios'
import { API_BASE } from '@/store/harness'
import { getNodeProp } from '@/utils/nodeUtils'

export function useProjectStack() {
  const services = ref([])
  const databases = ref([])
  const isLoading = ref(false)
  const loaded = ref(false)

  async function fetchStack(projectName) {
    const pName = projectName || ''
    if (!pName) return
    isLoading.value = true
    try {
      const res = await axios.get(`${API_BASE}/getArchitecture`, { params: { projectName: pName } })
      const raw = res?.data?.result ?? res?.data ?? {}
      // _as_array(graph) 가 [graph] 로 감쌀 수도, graph 객체 그대로일 수도 — 둘 다 처리.
      const g = Array.isArray(raw) ? (raw[0] ?? {}) : raw
      services.value = Array.isArray(g.services) ? g.services : []
      databases.value = Array.isArray(g.databases) ? g.databases : []
      loaded.value = true
    } catch (e) {
      console.error('getArchitecture(stack) 오류:', e)
    } finally {
      isLoading.value = false
    }
  }

  // 노드들의 tech_stack 을 모아 중복 제거. 예: ["Vue.js", "Spring Boot", "PostgreSQL"]
  const techStack = computed(() => {
    const seen = new Set()
    const out = []
    for (const n of [...services.value, ...databases.value]) {
      const t = getNodeProp(n, 'tech_stack')
      const v = (t == null ? '' : String(t)).trim()
      if (v && !seen.has(v)) { seen.add(v); out.push(v) }
    }
    return out
  })

  // architecture 데이터는 있는데 tech_stack 이 하나도 안 채워진 경우 — '미정' 안내용.
  const hasArchitecture = computed(() => services.value.length > 0 || databases.value.length > 0)

  return { services, databases, techStack, hasArchitecture, isLoading, loaded, fetchStack }
}
