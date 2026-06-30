/**
 * Legacy facade — 기존 컴포넌트가 `useHarnessStore` 단일 store + `API_BASE` 만
 * import 하던 패턴을 유지하기 위한 어댑터.
 *
 * 내부적으로는 도메인별 store (project / lint / repos / lineage) 로 위임.
 * 새 코드는 가능하면 도메인 store 를 직접 사용 (`useProjectStore` 등) 권장.
 */
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { detectRepoRole } from '@/utils/harnessHelpers'
import { useLineageStore } from './lineage'
import { useLintStore } from './lint'
import { useProjectStore } from './project'
import { useReposStore } from './repos'

export { API_BASE } from './api'

export const useHarnessStore = defineStore('harness', () => {
  const project = useProjectStore()
  const lint = useLintStore()
  const repos = useReposStore()
  const lineage = useLineageStore()

  // ─── Project state (passthrough) ──
  const projectName = computed({
    get: () => project.projectName,
    set: (v) => project.setProjectName(v),
  })
  const githubUrl = computed({
    get: () => project.githubUrl,
    set: (v) => project.setGithubUrl(v),
  })
  const currentTab = computed({
    get: () => project.currentTab,
    set: (v) => project.setCurrentTab(v),
  })
  const selectedBenchmarkIndex = computed({
    get: () => project.selectedBenchmarkIndex,
    set: (v) => project.setSelectedBenchmark(v),
  })
  const isRegisteringLog = computed({
    get: () => project.isRegisteringLog,
    set: (v) => { project.isRegisteringLog = v },
  })
  const isDeletingProject = computed(() => project.isDeletingProject)

  // [Phase F] 팀 작업 컨텍스트 passthrough.
  const activeTeamId = computed(() => project.activeTeamId)
  const activeTeamName = computed(() => project.activeTeamName)
  // 영속화 state 의 소유자 email passthrough — 사용자 단위 캐시 키 스코프용.
  const ownerEmail = computed(() => project.ownerEmail)
  const setActiveTeamId = project.setActiveTeamId
  const setProjectContext = project.setProjectContext

  const setProjectName = project.setProjectName
  const setGithubUrl = project.setGithubUrl
  const setCurrentTab = project.setCurrentTab
  const setSelectedBenchmark = project.setSelectedBenchmark

  const deleteProject = async (name) => {
    const result = await project.deleteProject(name)
    if (result.success && result.target) {
      // delete 성공 시 해당 프로젝트의 lint 캐시도 함께 정리
      lint.clearProjectLintCache(result.target)
    }
    return result
  }

  // ─── Lint passthrough ──
  const isLinting = computed(() => lint.isLinting)
  const isGeneratingFixSpec = computed(() => lint.isGeneratingFixSpec)
  const runLint = lint.runLint
  const cancelLint = lint.cancelLint
  const getCachedLint = lint.getCachedLint
  const clearProjectLintCache = lint.clearProjectLintCache
  const fetchLastLintResult = lint.fetchLastLintResult
  const generateFixSpec = lint.generateFixSpec

  // ─── Repos passthrough ──
  const fetchProjectRepos = repos.fetchProjectRepos
  const addProjectRepo = repos.addProjectRepo
  const deleteProjectRepo = repos.deleteProjectRepo
  const autoRegisterRepo = repos.autoRegisterRepo
  const fetchRepoMeta = repos.fetchRepoMeta
  const getCachedRepoMeta = repos.getCachedRepoMeta
  const clearRepoMetaCache = repos.clearRepoMetaCache

  // ─── Lineage passthrough ──
  const isAnalyzingLineage = computed(() => lineage.isAnalyzingLineage)
  const analyzeLineage = lineage.analyzeLineage
  const cancelAnalyzeLineage = lineage.cancelAnalyzeLineage
  const fetchLastLineage = lineage.fetchLastLineage
  const getCachedLineage = lineage.getCachedLineage
  const clearLineageCache = lineage.clearLineageCache
  const saveLineageTruth = lineage.saveLineageTruth
  const fetchLineageTruth = lineage.fetchLineageTruth
  const deleteLineageTruth = lineage.deleteLineageTruth
  const importLineageTruth = lineage.importLineageTruth
  const suggestLineageTruth = lineage.suggestLineageTruth
  const postPRComment = lineage.postPRComment

  return {
    // project
    projectName, githubUrl, currentTab, selectedBenchmarkIndex,
    isRegisteringLog, isDeletingProject, ownerEmail,
    activeTeamId, activeTeamName, setActiveTeamId, setProjectContext,
    setProjectName, setGithubUrl, setCurrentTab, setSelectedBenchmark,
    deleteProject,

    // lint
    isLinting, isGeneratingFixSpec,
    runLint, cancelLint,
    getCachedLint, clearProjectLintCache, fetchLastLintResult,
    generateFixSpec,

    // repos
    fetchProjectRepos, addProjectRepo, deleteProjectRepo, autoRegisterRepo,
    detectRepoRole,
    fetchRepoMeta, getCachedRepoMeta, clearRepoMetaCache,

    // lineage
    isAnalyzingLineage,
    analyzeLineage, cancelAnalyzeLineage,
    fetchLastLineage, getCachedLineage, clearLineageCache,
    saveLineageTruth, fetchLineageTruth, deleteLineageTruth,
    importLineageTruth, suggestLineageTruth, postPRComment,
  }
})
