/**
 * 프로젝트 Repository 목록 + role 그룹핑 + CRUD.
 *
 * 책임:
 *   - repos 목록 로드/캐시
 *   - 추가/수정/삭제
 *   - role별 그룹핑
 *
 * 분리 이유:
 *   - deliverables.vue 비대화 방지
 *   - meta enrichment, lineage 분석과 명확한 경계
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useHarnessStore } from '@/store/harness'

export const ROLES = [
  { value: 'frontend', label: 'Frontend', color: '#8C6239', icon: 'mdi-vuejs' },
  { value: 'backend',  label: 'Backend',  color: '#5BA160', icon: 'mdi-server' },
  { value: 'database', label: 'Database', color: '#5085C8', icon: 'mdi-database' },
  { value: 'mobile',   label: 'Mobile',   color: '#9460B8', icon: 'mdi-cellphone' },
  { value: 'infra',    label: 'Infra',    color: '#C77F4A', icon: 'mdi-cloud' },
  { value: 'other',    label: 'Other',    color: '#8A817C', icon: 'mdi-folder' },
]

export const roleColor = (role) => (ROLES.find(r => r.value === role) || ROLES[5]).color
export const roleLabel = (role) => (ROLES.find(r => r.value === role) || ROLES[5]).label

export const useProjectRepos = () => {
  const store = useHarnessStore()

  const repos = ref([])
  const isLoading = ref(false)
  const errorMsg = ref('')

  const loadRepos = async (force = false) => {
    if (!store.projectName) return { success: false, error: 'no project' }
    isLoading.value = true
    errorMsg.value = ''
    const result = await store.fetchProjectRepos({ projectName: store.projectName, force })
    isLoading.value = false
    if (result.success) {
      repos.value = result.repos
    } else {
      errorMsg.value = result.error || 'Repo 조회 실패'
    }
    return result
  }

  const addRepo = async ({ url, role, label }) => {
    isLoading.value = true
    const result = await store.addProjectRepo({
      projectName: store.projectName, url, role, label,
    })
    isLoading.value = false
    if (!result.success) errorMsg.value = result.error || '저장 실패'
    else await loadRepos(true)
    return result
  }

  const deleteRepo = async (url) => {
    isLoading.value = true
    const result = await store.deleteProjectRepo({ projectName: store.projectName, url })
    isLoading.value = false
    await loadRepos(true)
    return result
  }

  const reposByRole = computed(() => {
    const map = Object.fromEntries(ROLES.map(r => [r.value, []]))
    for (const r of repos.value) {
      const role = r.role && map[r.role] ? r.role : 'other'
      map[role].push(r)
    }
    return map
  })

  const repoRoleByUrl = computed(() => {
    const map = {}
    for (const r of repos.value) map[r.url] = r.role
    return map
  })

  onMounted(() => loadRepos())
  watch(() => store.projectName, () => loadRepos(true))

  return {
    repos,
    isLoading,
    errorMsg,
    loadRepos,
    addRepo,
    deleteRepo,
    reposByRole,
    repoRoleByUrl,
  }
}
