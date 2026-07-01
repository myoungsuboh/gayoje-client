/**
 * Project store — 현재 선택된 projectName / githubUrl / 탭 인덱스, 프로젝트 삭제.
 *
 * 영속화: 단순 사용자 선택 상태(projectName/githubUrl/탭/벤치마크) 만 localStorage 에.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios, { setTeamContext } from '@/utils/axios'
import { API_BASE } from './api'
import { T_DEFAULT_MS } from '@/utils/timeouts'

export const useProjectStore = defineStore('project', () => {
  // 신규 유저는 OWNS 한 프로젝트가 없음 — default 를 비우고 사용자가 ProjectLookup
  // 에서 명시적으로 선택/생성하도록. 비우지 않으면 신규 유저 첫 진입 시 모든
  // read API 가 403 폭주 (멀티테넌트 격리 정상 동작이지만 UX 안 좋음).
  const projectName = ref('')
  const githubUrl = ref('')
  const currentTab = ref(0)
  const selectedBenchmarkIndex = ref(0)
  const isRegisteringLog = ref(false)
  const isDeletingProject = ref(false)
  // [Phase F] 현재 작업 컨텍스트의 팀 id. null/'' = 개인 프로젝트.
  // 팀 프로젝트를 열면 set, 개인 프로젝트로 전환하면 clear → axios 가 모든
  // 프로젝트 API 호출에 team_id 를 자동 첨부 (개인 호출엔 미첨부).
  const activeTeamId = ref('')
  // 헤더 배지 표시용 — 팀 이름 (id 와 함께 set/clear).
  const activeTeamName = ref('')
  // [2026-05-18 보안] 영속화된 state 의 소유자 email — 사용자 전환 시 격리.
  // 같은 브라우저에서 로그아웃 안 거치고 다른 사용자 로그인 시 이전 사용자의
  // projectName 이 새 사용자에게 보이던 UX 문제 + BE 의 ownership guard 가
  // 403 폭주하는 사고를 막음.
  const ownerEmail = ref('')

  // [Phase F 안전장치] setProjectName 은 "개인 프로젝트 선택" 의미로만 쓰인다
  // (팀 선택은 setProjectContext 전용). 따라서 호출 시 팀 컨텍스트를 해제해,
  // 팀 컨텍스트가 남은 채 개인 프로젝트 호출에 team_id 가 새는 것을 차단한다.
  const setProjectName = (n) => {
    projectName.value = n
    if (activeTeamId.value) {
      activeTeamId.value = ''
      activeTeamName.value = ''
      setTeamContext('')
    }
  }
  const setGithubUrl = (u) => { githubUrl.value = u }
  const setCurrentTab = (t) => { currentTab.value = t }
  const setSelectedBenchmark = (i) => { selectedBenchmarkIndex.value = i }
  const setActiveTeamId = (id, name = '') => {
    activeTeamId.value = id || ''
    activeTeamName.value = id ? (name || '') : ''
    setTeamContext(activeTeamId.value)
  }

  /**
   * [Phase F] 프로젝트 + 팀 컨텍스트를 함께 전환.
   * 개인 프로젝트 선택 시 teamId 생략/null → 팀 컨텍스트 해제.
   * 팀 프로젝트 선택 시 teamId 지정 → 이후 모든 프로젝트 API 가 team_id 첨부.
   */
  const setProjectContext = (name, teamId = '', teamName = '') => {
    projectName.value = name
    activeTeamId.value = teamId || ''
    activeTeamName.value = teamId ? (teamName || '') : ''
    setTeamContext(activeTeamId.value)
  }

  /**
   * 사용자 전환 감지. ownerEmail 이 현재 user email 과 다르면 state 비움.
   */
  const assertOwner = (currentEmail) => {
    const cur = (currentEmail || '').toLowerCase().trim()
    const stored = (ownerEmail.value || '').toLowerCase().trim()
    if (!cur) return
    if (!stored) {
      ownerEmail.value = cur
      return
    }
    if (stored !== cur) {
      projectName.value = ''
      githubUrl.value = ''
      currentTab.value = 0
      selectedBenchmarkIndex.value = 0
      activeTeamId.value = ''
      activeTeamName.value = ''
      setTeamContext('')
      ownerEmail.value = cur
    }
  }

  /**
   * 전체 reset — logout 시 호출. localStorage 정리와 별도로 in-memory state 도 비움.
   */
  const resetAll = () => {
    projectName.value = ''
    githubUrl.value = ''
    currentTab.value = 0
    selectedBenchmarkIndex.value = 0
    isRegisteringLog.value = false
    isDeletingProject.value = false
    activeTeamId.value = ''
    activeTeamName.value = ''
    setTeamContext('')
    ownerEmail.value = ''
  }

  const deleteProject = async (name) => {
    isDeletingProject.value = true
    const target = name || projectName.value
    try {
      const body = { projectName: target }
      // [Phase F] 팀 프로젝트 컨텍스트면 team_id 동봉 — BE 가 팀 멤버십 검증.
      if (activeTeamId.value) body.team_id = activeTeamId.value
      const response = await axios.delete(`${API_BASE}/deleteProject`, {
        data: body,
        timeout: T_DEFAULT_MS,
      })
      isDeletingProject.value = false
      return { success: true, data: response.data, target }
    } catch (error) {
      isDeletingProject.value = false
      return { success: false, error: error.message || 'Delete failed' }
    }
  }

  return {
    projectName, githubUrl, currentTab, selectedBenchmarkIndex,
    isRegisteringLog, isDeletingProject, ownerEmail, activeTeamId, activeTeamName,
    setProjectName, setGithubUrl, setCurrentTab, setSelectedBenchmark,
    setActiveTeamId, setProjectContext,
    deleteProject,
    assertOwner, resetAll,
  }
}, {
  persist: {
    key: 'gayoje_project_state_v1',
    // [2026-05-18 보안] ownerEmail 도 함께 persist — hydration 시 격리.
    // [Phase F] activeTeamId/Name 도 persist — 새로고침 후 팀 컨텍스트 유지.
    pick: ['projectName', 'githubUrl', 'currentTab', 'selectedBenchmarkIndex', 'ownerEmail', 'activeTeamId', 'activeTeamName'],
    // [Phase F] 새로고침 복원 후 axios 미러에 팀 컨텍스트 재주입.
    afterRestore: (ctx) => {
      setTeamContext(ctx.store.activeTeamId || '')
    },
  },
})
