/**
 * useSkillRegistry — 스킬 레지스트리 데이터 + CRUD / 기본스킬 동기화 / AI 추천 로직.
 * RuleGeneratorTab.vue 에서 분리 (2026-05-27).
 *
 * RuleGeneratorTab 은 이미 SkillListPanel/SkillEditorPanel/AiRecommendationDialog 등
 * 7개 컴포넌트로 분리돼 있고, 남은 ~600줄은 대부분 API 오케스트레이션 로직이었음.
 * 이 컴포저블이 스킬 상태 + 모든 작업을 소유하고, 컴포넌트는 템플릿/다이얼로그 wiring 만 담당.
 *
 * @param {() => string | import('vue').Ref<string>} projectNameSource - 현재 프로젝트명 (getter 또는 ref)
 */
import { ref, computed, watch, toValue } from 'vue'
import axios from '@/utils/axios'
import { API_BASE } from '@/store/harness'
import { useConfirm } from '@/composables/useConfirm'
import { useSnackbar } from '@/composables/useSnackbar'
import { useSkillLibraryStore } from '@/store/skillLibrary'
import i18n from '@/plugins/i18n'

export function useSkillRegistry(projectNameSource) {
  const confirm = useConfirm()
  const { showSuccess, showError, showInfo } = useSnackbar()
  const skillLibraryStore = useSkillLibraryStore()

  const projectName = computed(() => toValue(projectNameSource) || '')

  // ─── 상수 ───────────────────────────────────────────────────
  const PRIORITIES = ['High', 'Medium', 'Low']
  const CATEGORY_MAP = {
    FrontEnd: 'frontEnd',
    BackEnd: 'backEnd',
    DB: 'db',
    Mobile: 'mobile',
    Design: 'design',
    Security: 'security',
    DevOps: 'devops',
    Testing: 'testing',
    AI: 'ai',
    Core: 'core',
    FrontEndReact: 'frontEndReact',
    BackEndNode: 'backEndNode',
    BackEndPython: 'backEndPython',
  }

  // Stack-specific categories — auto-injected from tech stack detection.
  // Not shown as manual-select chips in the dialog; silently merged into catalog search.
  const STACK_ONLY_CATEGORIES = ['FrontEndReact', 'BackEndNode', 'BackEndPython']

  // Human-readable labels for auto-detected stacks (shown as info badges in the dialog).
  const STACK_LABELS = {
    FrontEndReact: 'React / Next.js',
    BackEndNode: 'Node.js / NestJS',
    BackEndPython: 'Python / FastAPI',
  }

  const STACK_DETECTION_RULES = [
    // 단어경계(\b)로 substring 오탐 방지: "Reactive"→React, "preact"→React,
    // "Koala"→koa, "Flasker"→flask 같은 오탐을 막는다. next.js 의 '.' 은 \b 로 안 끊겨
    // (?:\.?js)? 로 흡수. react 는 "react"/"react.js"/"reactjs" 모두 허용.
    { patterns: [/\breact(?:\.?js)?\b/i, /\bnext\.?js\b/i, /\bgatsby\b/i, /\bremix\b/i], category: 'FrontEndReact' },
    { patterns: [/\bnode(?:\.?js)?\b/i, /\bnestjs\b/i, /\bexpress\b/i, /\bfastify\b/i, /\bkoa\b/i], category: 'BackEndNode' },
    { patterns: [/\bpython\b/i, /\bfastapi\b/i, /\bdjango\b/i, /\bflask\b/i, /\bcelery\b/i], category: 'BackEndPython' },
  ]

  function detectStackCategories(techStackList) {
    const detected = new Set()
    for (const tech of (techStackList || [])) {
      for (const { patterns, category } of STACK_DETECTION_RULES) {
        if (patterns.some(p => p.test(tech))) detected.add(category)
      }
    }
    return [...detected]
  }
  const priorityColor = { High: '#ef4444', Medium: '#f59e0b', Low: '#6b7280' }

  // ─── 상태 ───────────────────────────────────────────────────
  const skills = ref([])
  const selectedId = ref('')

  const isLoading = ref(false)
  const isSaving = ref(false)
  const isDeleting = ref(false)
  const isCheckingId = ref(false)
  const successMsg = ref('')
  const errorMsg = ref('')

  const isSelectMode = ref(false)
  const selectedSkillIds = ref([])
  const isDeletingBulk = ref(false)

  // AI 자동 추천 상태
  const aiDialog = ref(false)
  const aiCategories = ref([])
  const aiAutoStackCategories = ref([])  // tech stack 자동감지 — 칩에 안 보이고 카탈로그에 silent 합산
  const isAiRecommending = ref(false)
  const isAiRegistering = ref(false)
  const aiRecommendations = ref([])   // [{ id, name, description, reason, confidence, categoryDir }]
  const aiSelectedIds = ref([])        // 사용자가 등록 동의한 ID 목록
  const aiError = ref('')
  const aiExcludedCount = ref(0)       // 이미 등록되어 추천에서 제외된 스킬 개수

  // [FE-4b 2026-05] AI 추천 카탈로그 소스 분기. 'category' | 'library'
  const aiSourceMode = ref('category')
  const aiSelectedLibraryFolderIds = ref([])

  // [2026-06-13] 추천 진행 중 닫기/취소 시 in-flight 요청을 실제로 중단(abort)하기
  // 위한 컨트롤러. ref 가 아니어도 됨(템플릿 비노출) — 클로저 보관.
  let aiAbortController = null

  // ─── Computed ──────────────────────────────────────────────
  const selectedSkill = computed(() => skills.value.find(s => s.id === selectedId.value) || null)

  // AiRecommendationDialog 가 store 의존 없이 쓸 수 있도록 폴더 + 스킬개수를 묶어 prop 전달.
  const aiLibraryFolders = computed(() =>
    skillLibraryStore.folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      skillCount: skillLibraryStore.entriesByFolderId.get(folder.id)?.skills.length ?? 0,
    }))
  )

  async function switchAiToLibrary() {
    aiSourceMode.value = 'library'
    await skillLibraryStore.load()
  }

  // ─── API 호출 ───────────────────────────────────────────────
  async function fetchAllSkills() {
    const pName = projectName.value || 'harness'
    if (!pName) return
    isLoading.value = true
    errorMsg.value = ''
    try {
      const res = await axios.get(`${API_BASE}/getAllSkill`, {
        params: { projectName: pName }
      })
      const raw = res?.data?.result ?? res?.data ?? []
      const list = Array.isArray(raw) ? raw : (raw?.skills ?? [])

      // n8n 등에서 데이터가 없을 때 [{}] 형태로 넘어오는 경우 방지 — id 있는 항목만.
      const validList = list.filter(item => item && (item.id || item.ID))

      const mapped = validList.map(item => ({
        id: item.id || item.ID || '',
        name: item.name || item.스킬명 || '',
        scope: item.scope || item.범위 || '',
        priority: item.priority || item.우선순위 || 'Medium',
        trigger_condition: item.trigger_condition || item.trigger || '',
        instructions: Array.isArray(item.instructions) ? item.instructions : [],
        tags: Array.isArray(item.tags) ? item.tags : (Array.isArray(item.기술스택) ? item.기술스택 : []),
        applied_services: Array.isArray(item.applied_services) ? item.applied_services : (Array.isArray(item.적용서비스) ? item.적용서비스 : [])
      }))

      // 백엔드에서 동일 ID가 여러 줄 반환될 경우 UI 복제를 막기 위해 중복 제거
      const uniqueMap = new Map()
      for (const item of mapped) {
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item)
        }
      }
      const uniqueSkills = Array.from(uniqueMap.values())

      // 순서가 랜덤하게 바뀌는 것을 방지하기 위해 ID 알파벳 순으로 정렬
      uniqueSkills.sort((a, b) => a.id.localeCompare(b.id))
      skills.value = uniqueSkills

      // 첫 번째 스킬 선택
      if (skills.value.length > 0 && (!selectedId.value || !skills.value.find(s => s.id === selectedId.value))) {
        selectedId.value = skills.value[0].id
      }
      // [2026-06-12 fix] 자동 선택에도 상세 로드 — getAllSkill(목록)은 요약만
      // 반환(trigger/instructions 없음)이라, 자동 선택된 스킬이 빈 폼 + 낮은
      // 완성도 점수(50점)로 보이다가 사용자가 "한 번 더 클릭"해야(fetchSkillDetail)
      // 채워지던 버그. 목록 재조회가 메모리 상세를 요약으로 덮는 것도 이걸로 복원.
      if (selectedId.value) await fetchSkillDetail(selectedId.value)
    } catch (e) {
      // [2026-06] 신규 프로젝트는 첫 mutation(회의록/스킬 등록) 전까지 소유권 claim 전이라
      // 조회가 403(미소유)으로 떨어진다. 이건 '아직 스킬 없음'과 동일하게 취급 —
      // design/plan 페이지처럼 빈 상태로 두고 에러 배너를 띄우지 않는다.
      // (스킬 패널만 유독 403을 빨간 "불러오기 실패"로 노출하던 버그 수정.)
      if (e?.response?.status === 403) {
        skills.value = []
        errorMsg.value = ''
      } else {
        console.error('getAllSkill 오류:', e)
        errorMsg.value = '스킬 목록을 불러오는데 실패했습니다.'
      }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchSkillDetail(id) {
    const pName = projectName.value || 'harness'
    if (!pName || !id) return
    isLoading.value = true
    try {
      const res = await axios.get(`${API_BASE}/getSkill`, {
        params: { projectName: pName, id }
      })
      const raw = res?.data?.result ?? res?.data ?? []

      // 백엔드 getSkill 쿼리에 id 필터 누락 시 모든 스킬 반환 대비 방어 코드
      let data = null
      if (Array.isArray(raw)) {
        data = raw.find(item => (item.id || item.ID) === id) || raw[0]
      } else {
        data = raw
      }

      // 응답이 정상 존재할 때만 덮어쓰기 (n8n 빈 객체 응답 무시)
      if (data && Object.keys(data).length > 0 && (data.id || data.ID || data.name || data.스킬명)) {
        const idx = skills.value.findIndex(s => s.id === id)
        if (idx !== -1) {
          skills.value[idx] = {
            ...skills.value[idx],
            id: id, // 백엔드 응답과 무관하게 클릭한 고유 ID 유지 (오류 방어)
            name: data.name || data.스킬명 || skills.value[idx].name,
            scope: data.scope || data.범위 || '',
            priority: data.priority || data.우선순위 || 'Medium',
            trigger_condition: data.trigger_condition || data.trigger || '',
            instructions: Array.isArray(data.instructions) ? data.instructions : (Array.isArray(data.지시사항) ? data.지시사항 : []),
            tags: Array.isArray(data.tags) ? data.tags : (Array.isArray(data.기술스택) ? data.기술스택 : []),
            applied_services: Array.isArray(data.applied_services) ? data.applied_services : (Array.isArray(data.적용서비스) ? data.적용서비스 : [])
          }
        }
      } else {
        console.warn(`[fetchSkillDetail] ${id} 에 대한 상세 데이터가 반환되지 않았습니다.`)
      }
    } catch (e) {
      console.error('getSkill 오류:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function saveSkill() {
    const pName = projectName.value || 'harness'
    if (!pName || !selectedSkill.value) return

    // 신규 등록인 경우 중복 체크 확인
    if (selectedSkill.value.isNew && !selectedSkill.value.isIdChecked) {
      errorMsg.value = `저장하기 전에 스킬 ID 중복 체크를 진행해주세요.`
      setTimeout(() => { errorMsg.value = '' }, 3000)
      return
    }

    isSaving.value = true
    successMsg.value = ''
    errorMsg.value = ''

    const payload = {
      projectName: pName,
      skills: [{
        id: selectedSkill.value.id,
        name: selectedSkill.value.name,
        scope: selectedSkill.value.scope,
        priority: selectedSkill.value.priority,
        trigger_condition: selectedSkill.value.trigger_condition,
        instructions: selectedSkill.value.instructions,
        tags: selectedSkill.value.tags,
      }]
    }

    try {
      await axios.post(`${API_BASE}/postSkill`, payload)
      successMsg.value = `스킬이 저장되었습니다.`
      setTimeout(() => { successMsg.value = '' }, 3000)
      await fetchAllSkills()
    } catch (e) {
      console.error('postSkill 오류:', e)
      errorMsg.value = '저장에 실패했습니다.'
    } finally {
      isSaving.value = false
    }
  }

  async function deleteSkill() {
    const pName = projectName.value || 'harness'
    if (!pName || !selectedSkill.value) return
    const ok = await confirm({
      title: '스킬 삭제',
      message: '정말로 이 스킬을 삭제하시겠습니까?',
      confirmText: '삭제',
      variant: 'danger',
    })
    if (!ok) return

    isDeleting.value = true
    errorMsg.value = ''

    try {
      await axios.delete(`${API_BASE}/deleteSkill`, {
        data: { projectName: pName, id: selectedSkill.value.id }
      })

      successMsg.value = `스킬이 삭제되었습니다.`
      setTimeout(() => { successMsg.value = '' }, 3000)

      selectedId.value = ''
      await fetchAllSkills()
    } catch (e) {
      console.error('deleteSkill 오류:', e)
      errorMsg.value = '삭제에 실패했습니다.'
    } finally {
      isDeleting.value = false
    }
  }

  async function checkDuplicateId() {
    const pName = projectName.value || 'harness'
    if (!pName || !selectedSkill.value || !selectedSkill.value.isNew) return
    if (!selectedSkill.value.id.trim()) {
      errorMsg.value = '스킬 ID를 입력해주세요.'
      return
    }

    isCheckingId.value = true
    errorMsg.value = ''
    successMsg.value = ''

    try {
      const dupRes = await axios.get(`${API_BASE}/getDuplicateSkill`, {
        params: {
          projectName: pName,
          newSkillId: selectedSkill.value.id
        }
      })
      const raw = dupRes?.data?.result ?? dupRes?.data
      const dupData = Array.isArray(raw) ? raw[0] : raw

      if (dupData && dupData.isDuplicate) {
        errorMsg.value = `이미 사용 중인 스킬 ID입니다. 다른 ID를 입력해주세요.`
        selectedSkill.value.isIdChecked = false
      } else {
        successMsg.value = `사용 가능한 스킬 ID입니다.`
        selectedSkill.value.isIdChecked = true
      }
    } catch (e) {
      console.warn('중복 검사 중 오류 발생:', e)
      errorMsg.value = '중복 검사 중 오류가 발생했습니다.'
    } finally {
      isCheckingId.value = false
    }
  }

  // [2026-05-27 #123] frontmatter 의 `rules:` YAML 리스트 파싱 — 평가 친화 핵심 규칙.
  // SKILL.md 본문은 코드블록·상세 가이드라 `body.split('\n\n')` 로 쪼개면 150자 초과
  // 문단이 다수 → useSkillQuality 의 "긴 지시사항" 감점. frontmatter 의 짧고 명확한
  // rules 를 instructions 로 우선 사용 → 90%+ 달성하면서 본문 가이드는 코드 생성용 보존.
  function parseFrontmatterRules(fm) {
    // `rules:` 다음 줄들의 `- ...` 항목 수집 (다음 top-level 키 전까지).
    const m = fm.match(/^rules:[ \t]*\r?\n((?:[ \t]*-[ \t]*.+(?:\r?\n|$))+)/m)
    if (!m) return []
    return m[1].split(/\r?\n/)
      .map(l => l.replace(/^[ \t]*-[ \t]*/, '').trim())
      .map(l => l.replace(/^["']|["']$/g, '').trim())  // 양끝 따옴표 제거
      .filter(Boolean)
  }

  // [2026-05-27 tags] frontmatter 의 `tags:` YAML 리스트 파싱 — 코드 매칭용 키워드.
  // 백엔드 collect_rule_evidence 가 Skill.tags 토큰을 코드 본문에 substring match —
  // 자동 생성 태그 [baseName, categoryDir](예: "security-frontend") 는 코드에 안
  // 등장해 매칭 0. SKILL.md 가 실제 코드/import 에 나오는 키워드를 tags 로 명시하면
  // (예: ["dompurify", "axios", "vue"]) Rules 카테고리 매칭률 ↑.
  function parseFrontmatterTags(fm) {
    const m = fm.match(/^tags:[ \t]*\r?\n((?:[ \t]*-[ \t]*.+(?:\r?\n|$))+)/m)
    if (!m) return []
    return m[1].split(/\r?\n/)
      .map(l => l.replace(/^[ \t]*-[ \t]*/, '').trim())
      .map(l => l.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
  }

  // SKILL.md 본문 → instructions. frontmatter rules 우선, 없으면 본문 문단 split.
  function deriveInstructions(frontmatterRules, body) {
    if (frontmatterRules && frontmatterRules.length > 0) return frontmatterRules
    return body.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  }

  // frontmatter tags + 자동 태그(baseName, categoryDir) 머지. 중복은 dict-ordered.
  function mergeTags(frontmatterTags, ...autoTags) {
    return Array.from(new Set([...frontmatterTags, ...autoTags].filter(Boolean)))
  }

  // ─── AI 자동 추천 — CPS/PRD 분석해 스킬 카탈로그에서 필요 항목 선별 ──────
  // 로컬 .skills/**/SKILL.md 카탈로그 구축 (frontmatter + 본문)
  // [2026-06 다국어] 스킬 폴더별로 locale 변형(SKILL.md=ko / SKILL.en.md / SKILL.ja.md /
  // SKILL.zh.md)을 모아 현재 UI 언어 변형을 고르고, 없으면 한국어(SKILL.md)로 fallback.
  // id/baseName 은 '폴더' 기준이라 locale 과 무관하게 동일 → 추천·등록·중복제거 로직은
  // 그대로(콘텐츠 언어만 바뀜). tags 는 코드 매칭 키워드라 모든 언어에서 동일하게 둔다.
  const _SKILL_LOCALES = ['ko', 'en', 'ja', 'zh']
  // ko 는 eager(현행 — ko 사용자 번들 무변). 비-ko 는 lazy(eager:false) — 해당 언어를
  // 실제로 쓸 때만 청크를 받는다(vite manualChunks 가 skills-en/ja/zh 로 묶음). 미번역
  // 스킬은 ko 가 canonical 셋이라 한국어로 표시(누락돼도 스킬이 사라지지 않음).
  const _KO_FILES = import.meta.glob('../../.skills/**/SKILL.md', { query: '?raw', import: 'default', eager: true })
  const _LAZY_BY_LOCALE = {
    en: import.meta.glob('../../.skills/**/SKILL.en.md', { query: '?raw', import: 'default' }),
    ja: import.meta.glob('../../.skills/**/SKILL.ja.md', { query: '?raw', import: 'default' }),
    zh: import.meta.glob('../../.skills/**/SKILL.zh.md', { query: '?raw', import: 'default' }),
  }
  const _skillKeyFromPath = (path) => {
    const m = path.match(/\.skills\/([^/]+)\/([^/]+)\//)
    return m ? { categoryDir: m[1], folder: m[2], key: `${m[1]}/${m[2]}` } : null
  }
  async function buildLocalSkillCatalog(allowedCategories = []) {
    const allowedDirs = allowedCategories.map(cat => CATEGORY_MAP[cat]).filter(Boolean)

    let loc = String(i18n.global.locale?.value || 'ko').split('-')[0].split('_')[0].toLowerCase()
    if (!_SKILL_LOCALES.includes(loc)) loc = 'ko'

    // 비-ko: 해당 locale 변형 파일들을 lazy 로드해 key→content 맵 구성(없으면 빈 맵 → ko fallback).
    const localeContent = {}
    if (loc !== 'ko') {
      const loaders = _LAZY_BY_LOCALE[loc] || {}
      await Promise.all(Object.entries(loaders).map(async ([path, load]) => {
        const info = _skillKeyFromPath(path)
        if (!info) return
        try { localeContent[info.key] = await load() } catch { /* 누락 → ko fallback */ }
      }))
    }

    // ko 파일이 canonical 스킬 집합 — 순회하며 현재 locale 변형(있으면) 아니면 ko 본문 파싱.
    const catalog = []
    for (const [path, koContent] of Object.entries(_KO_FILES)) {
      const info = _skillKeyFromPath(path)
      if (!info) continue
      const { categoryDir, folder } = info
      if (allowedDirs.length > 0 && !allowedDirs.includes(categoryDir)) continue
      const content = (loc !== 'ko' && localeContent[info.key]) ? localeContent[info.key] : koContent
      if (!content) continue
      const baseName = folder.replace(/\.md$/i, '')
      const id = `SKL-${baseName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`.substring(0, 30)

      let name = baseName
      let description = ''
      let body = content
      let frontmatterRules = []
      let frontmatterTags = []

      let foundational = false

      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
      if (fmMatch) {
        const fm = fmMatch[1]
        body = fmMatch[2].trim()
        const nameMatch = fm.match(/^name:\s*(.+)$/m)
        if (nameMatch) name = nameMatch[1].trim()
        const descMatch = fm.match(/^description:\s*(.+)$/m)
        if (descMatch) description = descMatch[1].trim()
        // [2026-06-13] foundational: 모든 프로젝트 공통 기반 규칙 — 추천에 상시 포함.
        foundational = /^foundational:\s*true\s*$/m.test(fm)
        frontmatterRules = parseFrontmatterRules(fm)
        frontmatterTags = parseFrontmatterTags(fm)
      }

      catalog.push({
        id,
        name,
        description,
        categoryDir,
        baseName,
        foundational,
        body,  // LLM 호출 시엔 frontmatter만 보내고 본문은 등록 단계에서 사용
        rules: frontmatterRules,  // 평가 친화 핵심 규칙 (등록 단계 instructions 우선)
        tags: frontmatterTags     // [2026-05-27] 코드 매칭용 키워드 (등록 단계 tags 우선)
      })
    }
    return catalog
  }

  /**
   * [FE-4b 2026-05] 라이브러리 LibrarySkill → AI 추천 카탈로그 형식 변환.
   * folderIds 비면 모든 폴더, 차있으면 그 폴더들만.
   */
  function buildLibraryCatalog(folderIds = []) {
    const folderSet = new Set(folderIds)
    const useAll = folderSet.size === 0
    const catalog = []
    for (const entry of skillLibraryStore.entries) {
      if (!useAll && !folderSet.has(entry.folder.id)) continue
      for (const lib of entry.skills) {
        const body = (lib.instructions || []).join('\n\n')
        catalog.push({
          id: lib.id,
          name: lib.name,
          description: lib.trigger_condition || lib.scope || '',
          category: entry.folder.category || entry.folder.name,
          baseName: lib.name,
          categoryDir: entry.folder.category || 'library',
          body,
        })
      }
    }
    return catalog
  }

  async function requestAiRecommendation() {
    const pName = projectName.value || 'harness'
    if (!pName) return
    // [2026-06-13] 재진입 가드 — 진행 중 재호출 시 AbortController 가 교체되며
    // 이전 요청이 orphan 되는 것을 방지 (버튼 :loading 비활성화의 이중 안전장치).
    if (isAiRecommending.value) return

    isAiRecommending.value = true
    aiError.value = ''
    aiRecommendations.value = []
    aiSelectedIds.value = []
    aiExcludedCount.value = 0

    try {
      // [FE-4b] 카탈로그 소스 분기 — local markdown vs library
      let fullCatalog
      if (aiSourceMode.value === 'library') {
        if (skillLibraryStore.entries.length === 0) {
          await skillLibraryStore.load()
        }
        fullCatalog = buildLibraryCatalog(aiSelectedLibraryFolderIds.value)
        if (fullCatalog.length === 0) {
          aiError.value = aiSelectedLibraryFolderIds.value.length > 0
            ? '선택한 폴더에 스킬이 없습니다. 라이브러리에 스킬을 먼저 추가하세요.'
            : '라이브러리가 비어 있습니다. 먼저 스킬을 추가하거나 카테고리 모드를 선택하세요.'
          return
        }
      } else {
        // Merge user-selected + auto-detected stack categories (deduped).
        const effectiveCategories = [...new Set([...aiCategories.value, ...aiAutoStackCategories.value])]
        fullCatalog = await buildLocalSkillCatalog(effectiveCategories)
        if (fullCatalog.length === 0) {
          aiError.value = '추천 대상 스킬 카탈로그가 비어 있습니다. 카테고리 선택을 확인하세요.'
          return
        }
      }

      // 이미 등록된 스킬은 카탈로그에서 제외 (LLM 호출 전 필터링 — 토큰 절약 + 중복 차단)
      const registeredIds = new Set(skills.value.map(s => s.id))
      const catalog = fullCatalog.filter(c => !registeredIds.has(c.id))
      aiExcludedCount.value = fullCatalog.length - catalog.length

      if (catalog.length === 0) {
        aiError.value = `선택한 카테고리의 스킬 ${fullCatalog.length}개가 모두 이미 등록되어 있습니다. 추천할 신규 스킬이 없습니다.`
        return
      }

      // LLM에는 본문 없이 frontmatter 요약만 전송 (토큰 절약)
      const lite = catalog.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        category: c.categoryDir
      }))

      // [2026-06-13] abort 가능하도록 signal 첨부 — 사용자가 진행 중 '취소' 누르면 중단.
      aiAbortController = new AbortController()
      const res = await axios.post(`${API_BASE}/recommendSkillsByAI`, {
        projectName: pName,
        skillCatalog: lite,
        allowedCategories: aiCategories.value
      }, { signal: aiAbortController.signal })

      const raw = res?.data?.result ?? res?.data ?? {}
      const recommendations = Array.isArray(raw?.recommended)
        ? raw.recommended
        : (Array.isArray(raw) ? raw : (raw?.skills ?? []))

      // 카탈로그 항목 → 추천 객체 변환 헬퍼 (LLM 추천·기반 규칙 공용)
      const catToRec = (cat, { reason, confidence, foundational = false }) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        body: cat.body,
        rules: cat.rules || [],
        tags: cat.tags || [],
        categoryDir: cat.categoryDir,
        baseName: cat.baseName,
        foundational,
        reason,
        confidence,
      })

      // 1) LLM 추천을 카탈로그와 매칭 (이미 등록된 ID 한 번 더 거름)
      const byId = new Map(catalog.map(c => [c.id, c]))
      const llmRecs = (Array.isArray(recommendations) ? recommendations : [])
        .filter(r => !registeredIds.has(r.id))
        .map(r => {
          const cat = byId.get(r.id)
          if (!cat) return null
          return catToRec(cat, {
            reason: r.reason || '',
            confidence: typeof r.confidence === 'number' ? r.confidence : null,
          })
        })
        .filter(Boolean)

      // 2) [2026-06-13] 기반 규칙 상시 포함 — foundational 스킬은 모든 프로젝트 공통이라
      // PRD 관련성·카테고리 필터·소스 모드와 무관하게 항상 추천에 넣는다. 고정 큐레이션
      // 셋이라 환각 위험 0 → 빈 PRD(no_source_docs)에서도 안전하게 제공. 이미 등록됐거나
      // LLM 이 이미 고른 건 제외. (카테고리 필터에 안 걸리도록 전체 로컬 카탈로그에서 조회.)
      const llmIds = new Set(llmRecs.map(r => r.id))
      const foundationalRecs = (await buildLocalSkillCatalog([]))
        .filter(c => c.foundational && !registeredIds.has(c.id) && !llmIds.has(c.id))
        .map(c => catToRec(c, {
          reason: '모든 프로젝트 공통 기반 규칙 — 권장',
          confidence: null,
          foundational: true,
        }))

      // 기반 규칙을 위로, 그 아래 LLM 맞춤 추천
      const merged = [...foundationalRecs, ...llmRecs]

      if (merged.length === 0) {
        if (raw?.meta?.reason === 'no_source_docs') {
          aiError.value = '이 프로젝트에는 아직 회의록·PRD가 없어요. 먼저 회의록을 정리해 PRD를 만든 뒤 추천을 받아보세요.'
        } else {
          aiError.value = 'AI가 추천 결과를 반환하지 않았습니다. CPS/PRD 내용을 확인해 주세요.'
        }
        return
      }

      aiRecommendations.value = merged
      // 기본적으로 모두 체크
      aiSelectedIds.value = merged.map(r => r.id)
    } catch (e) {
      // [2026-06-13] 사용자가 '취소'로 중단 → 에러 표시 없이 조용히 종료 (모달도 이미 닫힘).
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || /cancel|abort/i.test(e?.message || '')) {
        return
      }
      console.error('recommendSkillsByAI 오류:', e)
      aiError.value = e?.response?.data?.message || e.message || 'AI 추천 호출 중 오류가 발생했습니다.'
    } finally {
      isAiRecommending.value = false
      aiAbortController = null
    }
  }

  // [2026-06-13] 추천 진행 중 '취소' — in-flight 요청을 중단하고 다이얼로그를 닫는다.
  // (모달은 로딩 중 X/배경/ESC 로는 안 닫히고, 오직 이 명시적 취소로만 빠져나간다.)
  function cancelAiRecommendation() {
    if (aiAbortController) aiAbortController.abort()
    aiDialog.value = false
  }

  async function registerSelectedAiSkills() {
    const pName = projectName.value || 'harness'
    if (!pName || aiSelectedIds.value.length === 0) return

    isAiRegistering.value = true
    aiError.value = ''

    try {
      // [2026-06-13] N개를 1콜로 묶어 등록 — BE postSkill 은 skills 배열을
      // create_skills 로 일괄 처리한다. 이전엔 스킬당 1콜(N회 왕복)이라 추천
      // 10개면 10번 round-trip. 이미 등록된 ID 는 호출 전에 거른다.
      const registeredIds = new Set(skills.value.map(s => s.id))
      const skipped = aiSelectedIds.value.filter(id => registeredIds.has(id)).length

      const toRegister = aiSelectedIds.value
        .filter(id => !registeredIds.has(id))
        .map(id => aiRecommendations.value.find(r => r.id === id))
        .filter(Boolean)
        .map(rec => ({
          id: rec.id,
          name: rec.name,
          scope: 'AI Recommended',
          priority: 'High',
          trigger_condition: rec.description || rec.reason || '',
          // frontmatter rules 우선 (평가 친화), 없으면 본문 split (legacy).
          instructions: deriveInstructions(rec.rules, rec.body || ''),
          // [2026-05-27] frontmatter tags 우선 + 자동 태그 merge — syncBasicSkills 와 같은 정책.
          // [동적 카테고리] cat: 마커 — export(getCategoryFromSkill)가 동적 폴더값을 폴더명으로 쓴다.
          // ⚠️ rec.tags 를 첫 인자(frontmatterTags)로 둬야 평탄화된다. autoTags 자리에 배열을 넣으면 중첩됨.
          tags: mergeTags(rec.tags || [], rec.categoryDir ? `cat:${rec.categoryDir}` : null, rec.baseName, rec.categoryDir, 'ai-recommended'),
          // [B1 — 2026-06-13] 추천 승인율 추적: 어떤 스킬이 AI 추천을 통해 수락됐는지 기록.
          source: 'ai_recommend',
          recommended_confidence: rec.confidence ?? null,
        }))

      let registered = 0
      if (toRegister.length > 0) {
        await axios.post(`${API_BASE}/postSkill`, { projectName: pName, skills: toRegister })
        registered = toRegister.length
      }

      if (registered === 0 && skipped > 0) {
        successMsg.value = `선택한 ${skipped}개 스킬이 이미 모두 등록되어 있습니다.`
      } else {
        successMsg.value = `AI 추천 스킬 ${registered}개 등록 완료${skipped > 0 ? ` (이미 등록된 ${skipped}개 건너뜀)` : ''}`
      }
      setTimeout(() => { successMsg.value = '' }, 4000)
      aiDialog.value = false
      aiRecommendations.value = []
      aiSelectedIds.value = []
      await fetchAllSkills()
    } catch (e) {
      aiError.value = '등록 중 오류가 발생했습니다.'
      console.error(e)
    } finally {
      isAiRegistering.value = false
    }
  }

  function openAiDialog(techStack = []) {
    aiDialog.value = true
    aiCategories.value = []
    aiAutoStackCategories.value = detectStackCategories(techStack)
    aiRecommendations.value = []
    aiSelectedIds.value = []
    aiError.value = ''
    aiExcludedCount.value = 0
    // [FE-4b] 라이브러리 옵션 상태 리셋. 기본은 'category'.
    aiSourceMode.value = 'category'
    aiSelectedLibraryFolderIds.value = []
  }

  function toggleAiSelection(id) {
    const idx = aiSelectedIds.value.indexOf(id)
    if (idx === -1) aiSelectedIds.value.push(id)
    else aiSelectedIds.value.splice(idx, 1)
  }

  // 선택 모드 토글
  function toggleSelectMode() {
    isSelectMode.value = !isSelectMode.value
    selectedSkillIds.value = []
    if (isSelectMode.value) selectedId.value = ''
  }

  // 전체 선택 / 해제 — child(SkillListPanel)의 filteredSkills 기반 ID 배열 사용.
  function toggleSelectAll(filteredIds) {
    const ids = Array.isArray(filteredIds) ? filteredIds : []
    const allSelected = ids.length > 0 && ids.every(id => selectedSkillIds.value.includes(id))
    selectedSkillIds.value = allSelected ? [] : ids
  }

  // 선택 항목 일괄 삭제
  async function deleteBulkSkills() {
    const pName = projectName.value || 'harness'
    if (!pName || selectedSkillIds.value.length === 0) return
    const ok = await confirm({
      title: '스킬 일괄 삭제',
      message: `선택한 ${selectedSkillIds.value.length}개의 스킬을 삭제하시겠습니까?`,
      confirmText: '삭제',
      variant: 'danger',
    })
    if (!ok) return

    isDeletingBulk.value = true
    errorMsg.value = ''
    let deletedCount = 0

    for (const id of [...selectedSkillIds.value]) {
      try {
        await axios.delete(`${API_BASE}/deleteSkill`, {
          data: { projectName: pName, id }
        })
        deletedCount++
      } catch (e) {
        console.error(`삭제 실패 [${id}]:`, e)
      }
    }

    isDeletingBulk.value = false
    isSelectMode.value = false
    selectedSkillIds.value = []
    selectedId.value = ''

    successMsg.value = `${deletedCount}개 스킬이 삭제되었습니다.`
    setTimeout(() => { successMsg.value = '' }, 3000)
    await fetchAllSkills()
  }

  // ─── 로컬 액션 ──────────────────────────────────────────────
  function selectSkill(id) {
    if (isSelectMode.value) {
      const idx = selectedSkillIds.value.indexOf(id)
      if (idx === -1) selectedSkillIds.value.push(id)
      else selectedSkillIds.value.splice(idx, 1)
      return
    }
    selectedId.value = id
    const target = skills.value.find(s => s.id === id)
    if (target && !target.isNew) {
      fetchSkillDetail(id)
    }
  }

  function addSkill() {
    const id = `SKL-RULE-${String(Date.now()).slice(-4)}`
    skills.value.unshift({
      id,
      name: '새 스킬',
      scope: '',
      priority: 'Medium',
      trigger_condition: '',
      instructions: [''],
      tags: [],
      applied_services: [],
      isNew: true,
      isIdChecked: false
    })
    selectedId.value = id
  }

  async function cancelSkill() {
    selectedId.value = ''
    await fetchAllSkills()
  }

  // projectName 바뀌면 목록 재조회 (immediate — 초기 진입 시 1회).
  watch(projectName, (val) => {
    if (val) fetchAllSkills()
  }, { immediate: true })

  return {
    // 상수
    PRIORITIES, CATEGORY_MAP, priorityColor,
    STACK_ONLY_CATEGORIES, STACK_LABELS,
    // 상태
    skills, selectedId,
    isLoading, isSaving, isDeleting, isCheckingId, successMsg, errorMsg,
    isSelectMode, selectedSkillIds, isDeletingBulk,
    aiDialog, aiCategories, aiAutoStackCategories, isAiRecommending, isAiRegistering, aiRecommendations,
    aiSelectedIds, aiError, aiExcludedCount, aiSourceMode, aiSelectedLibraryFolderIds,
    // computed
    selectedSkill, aiLibraryFolders,
    // 작업
    fetchAllSkills, fetchSkillDetail, saveSkill, deleteSkill, checkDuplicateId,
    buildLocalSkillCatalog, buildLibraryCatalog,
    requestAiRecommendation, cancelAiRecommendation, registerSelectedAiSkills, switchAiToLibrary,
    openAiDialog, toggleAiSelection,
    toggleSelectMode, toggleSelectAll, deleteBulkSkills,
    selectSkill, addSkill, cancelSkill,
    // 순수 헬퍼 (#123 — 평가 친화 frontmatter rules) — 테스트/재사용용 노출
    parseFrontmatterRules, deriveInstructions,
    // [2026-05-27 tags] frontmatter tags 파싱 + 자동 머지 — 테스트용 노출
    parseFrontmatterTags, mergeTags,
  }
}
