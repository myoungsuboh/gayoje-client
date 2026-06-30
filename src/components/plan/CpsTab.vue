<script setup>
/**
 * CpsTab — CPS 명세서 뷰어 + 편집기.
 *
 * [구조 — 2026-05 PRD-style 재작성]
 * 좌(nav-panel) 280px + 우(viewer-panel) flex:1.
 * 상단 tab 바로 4섹션(Context/Problem/Solution/Pending) 전환,
 * 좌측 nav-items 가 활성 섹션의 sub-item (PRB/RES/Pending group) 목록을 표시.
 * sub-item 클릭 시 우측 본문 내 해당 텍스트로 scroll + 강조.
 *
 * [편집]
 * 편집 버튼은 editable=true 일 때만 노출 (검수 모드).
 * 편집 textarea 는 활성 섹션만 보여주고, 저장 시 replaceCpsSection 으로 다른
 * 섹션 + Journey Record 보존하며 합쳐 PATCH /api/v2/cps.
 *
 * [반응형]
 * - Desktop (≥1025px): 좌 280px + 우.
 * - Tablet (768–1024px): 좌 220px.
 * - Mobile (≤768px): column. 상단에 mobile-nav-toggle 드로어 + 탭 가로 스크롤.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { md } from '@/utils/markdown'
import {
  ChevronDown,
  Edit3,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  Save,
  ShieldCheck,
  Wand2,
  X as IconX,
  Zap,
  Eye,
  FileDown,
  Copy,
  Check,
} from 'lucide-vue-next'
import axios from '@/utils/axios'
import { useSnackbar } from '@/composables/useSnackbar'
import { useDocMdExport } from '@/composables/useDocMdExport'
import { useGraphNodeEdit } from '@/composables/useGraphNodeEdit'
import { useDocStaleDismiss } from '@/composables/useDocStaleDismiss'
import {
  parseCpsSections,
  replaceCpsSection,
  parseProblemItems,
  parseResolutionItems,
  parsePendingGroups,
  JOURNEY_MARK_RE,
} from '@/utils/cpsSections'
import ResynthDiffModal from './ResynthDiffModal.vue'
// markdown_stale 배너 — design·CpsTab·PrdTab 공유 공통 컴포넌트 (harness#364 통합).
// title/subtitle prop + #actions slot 으로 재합성·편집·해제 버튼을 host 가 직접 제어.
import StaleBanner from '@/components/common/StaleBanner.vue'

const props = defineProps({
  cps: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  // [2026-06-11 멀티디바이스] 다른 기기/탭에서 이 프로젝트의 master 쓰기 작업 진행 중
  // (plan.vue 의 getProjectBusy 폴링). 편집/재합성을 사전 차단 — merge 가 master CPS 를
  // 다시 쓰는 중이라 곧 충돌(409)할 작업으로 시간·토큰을 낭비하지 않게.
  // 데이터 자체는 아래 client_updated_at 낙관적 잠금이 지킨다(이건 안내용 1차 가드).
  remoteBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['navigate', 'saved', 'update:editing'])

const { t } = useI18n()
const { showSuccess, showError, showWarning } = useSnackbar() ?? {}

// ─── Navigation state ────────────────────────────────────────
const activeSection = ref('problem')   // context | problem | solution | pending
const selectedItem = ref(null)         // PRB-01 / RES-01 / "미결정 사항" 등
const mobileNavOpen = ref(false)

const sectionTabs = [
  { key: 'context',  label: 'Context',  num: '1', icon: FileText },
  { key: 'problem',  label: 'Problem',  num: '2', icon: Layers },
  { key: 'solution', label: 'Solution', num: '3', icon: Wand2 },
  { key: 'pending',  label: 'Pending',  num: '4', icon: ListChecks },
]

// ─── Parsed sections ─────────────────────────────────────────
const rawContent = computed(() => props.cps?.output || props.cps?.content || '')

const sections = computed(() => {
  const raw = rawContent.value.replace(/\\n/g, '\n')
  return parseCpsSections(raw)
})

const hasSections = computed(() => sections.value.length > 0)

// [2026-05 B2B 내보내기] CPS 전체 markdown 다운로드 + 복사. 전체 문서(모든 섹션) 기준.
const fullMarkdown = computed(() => rawContent.value.replace(/\\n/g, '\n'))
// [2026-06 공통화] 복사·MD 다운로드는 useDocMdExport 로 추출 (CpsTab/PrdTab 공통 로직).
const { mdCopied, downloadMd, copyMd } = useDocMdExport(
  () => fullMarkdown.value,
  {
    filenameLabel: 'CPS',
    getProjectName: () => props.projectName,
    onDownloadOk: () => showSuccess?.(t('cps.toast.download_ok')),
    onCopyFail: () => showError?.(t('cps.toast.copy_fail')),
  },
)

const sectionByKey = (key) => sections.value.find(s => s.id === key)

const problemItems = computed(() => parseProblemItems(sectionByKey('problem')?.content || ''))
const resolutionItems = computed(() => parseResolutionItems(sectionByKey('solution')?.content || ''))
const pendingGroups = computed(() => parsePendingGroups(sectionByKey('pending')?.content || ''))

// 활성 섹션 markdown — 단일 섹션만 렌더.
const activeSectionData = computed(() => sectionByKey(activeSection.value) || sections.value[0])

const activeContentHtml = computed(() => {
  if (!activeSectionData.value) return ''
  return md.render(activeSectionData.value.content)
})

// [2026-05-19] 좌측 메뉴 항목 클릭 시 우측에 그 항목만 표시 (PRD 패턴 이식).
// problem: `- **[PRB-XX] ...` 블록 단위 / solution: `- **[RES-XX] ...` 단위 /
// pending: `- **TITLE**:` 단위 (TITLE 안에 별표 없는 한 글자 헤더 추출).
// context 는 단일 블록이라 필터링 안 함. 매칭 실패 시 graceful 전체 렌더.
const filteredContentHtml = computed(() => {
  const section = activeSectionData.value
  if (!section) return ''
  if (!selectedItem.value || activeSection.value === 'context') {
    return md.render(section.content)
  }

  const text = section.content
  // 각 섹션 sub-item 헤더 패턴 (line 시작).
  let itemRegex = null
  if (activeSection.value === 'problem') {
    itemRegex = /^[-*]\s+\*\*\[PRB-\d+\][^\n]*$/gm
  } else if (activeSection.value === 'solution') {
    itemRegex = /^[-*]\s+`?\[?RES-\d+\]?[^\n]*$/gm
  } else if (activeSection.value === 'pending') {
    // pending: 최상위 bullet 의 `- **TITLE**:` (TITLE 안 별표 없음).
    // [i18n] 콜론은 ASCII ':' + 전각 '：'(일·중) 모두 허용 (cpsSections.parsePendingGroups 와 동일).
    itemRegex = /^[-*]\s+\*\*[^*\n]+\*\*\s*[:：]?\s*$/gm
  }
  if (!itemRegex) return md.render(text)

  const positions = []
  let m
  while ((m = itemRegex.exec(text)) !== null) {
    positions.push({ start: m.index, header: m[0] })
  }
  if (positions.length === 0) return md.render(text)

  const sectionHeader = text.substring(0, positions[0].start)
  let matchedBlock = null

  positions.forEach((p, i) => {
    const end = i < positions.length - 1 ? positions[i + 1].start : text.length
    const block = text.substring(p.start, end)
    if (activeSection.value === 'pending') {
      // anchorId = `pending-{idx}` — positions 순서가 pendingGroups 순서와 일치.
      if (`pending-${i}` === selectedItem.value) matchedBlock = block
    } else {
      // problem / solution: ID (PRB-01 / RES-01) 가 헤더에 포함되면 매치.
      if (p.header.includes(selectedItem.value)) matchedBlock = block
    }
  })

  if (!matchedBlock) return md.render(text)  // graceful fallback
  return md.render(sectionHeader + matchedBlock)
})

// 필터 배너에 표시할 사용자 친화 라벨.
const selectedItemLabel = computed(() => {
  if (!selectedItem.value) return ''
  if (activeSection.value === 'pending') {
    const g = pendingGroups.value.find(g => g.anchorId === selectedItem.value)
    return g?.title || selectedItem.value
  }
  return selectedItem.value
})

const clearSelection = () => {
  selectedItem.value = null
}

// 렌더된 DOM 에 data-cps-anchor 속성을 부여 — 텍스트 매칭이 아닌 *구조 기반* 키 사용.
//
// [Pending — 핵심 수정]
// 이전엔 모든 <strong> 의 텍스트를 anchor 로 썼지만, 같은 글자가 여러 곳에 나오면
// (예: 'Next Steps' 가 standalone parent + nested sub-bullet 양쪽) 잘못된 위치
// 첫 매치로 잡혔음. 해결: top-level <li> (다른 <li> 안에 nested 되지 않은) 의
// 첫 <strong> 만 'pending-{idx}' 인덱스 키로 anchor 부여 → pendingGroups 순서와
// 1:1 매칭. 텍스트 무관.
//
// [Problem / Solution]
// PRB-XX / RES-XX 는 BE 가 발행하는 고유 ID 라 텍스트 매칭이 안전. 단 top-level
// 제한은 그대로 적용해서 cross-reference 텍스트로 잘못 잡히는 케이스도 차단.
const annotateAnchors = () => {
  const container = document.querySelector('.cps-viewer-body')
  if (!container) return

  // top-level <li> 만 추리기 — <li> 의 조상 중에 또 다른 <li> 가 없을 때 top-level.
  const topLevelLis = []
  container.querySelectorAll('li').forEach(li => {
    const parentLi = li.parentElement?.closest('li')
    if (!parentLi) topLevelLis.push(li)
  })

  if (activeSection.value === 'pending') {
    topLevelLis.forEach((li, idx) => {
      const strong = li.querySelector('strong')
      if (strong) strong.setAttribute('data-cps-anchor', `pending-${idx}`)
      // [2026-05] LLM 이 그룹을 빈 채로 emit 한 케이스 (sub-bullet 없음) 안내 표시.
      // 사용자 입장에서 "내용이 비어있다" 로 보이는데, 실제 markdown 에 sub-bullet 이
      // 없는 거라 시각적 안내 추가. li 의 직속 <ul> 이 없거나 비었으면 placeholder.
      const directUl = Array.from(li.children).find(c => c.tagName === 'UL')
      const hasItems = directUl && directUl.children.length > 0
      if (!hasItems && !li.querySelector('.cps-empty-group-hint')) {
        const hint = document.createElement('div')
        hint.className = 'cps-empty-group-hint'
        hint.textContent = t('cps.nav.pending_group_empty')
        li.appendChild(hint)
      }
    })
  } else if (activeSection.value === 'problem') {
    // Solution 과 동일 — Problem 의 PRB 항목이 nested 인 케이스 흡수. PRB-XX 가 BE
    // 발행 고유 ID 라 모든 <strong> 검사해도 중복 매치 위험 없음.
    container.querySelectorAll('strong').forEach(strong => {
      const m = (strong.textContent || '').trim().match(/^\[(PRB-\d+)\]/)
      if (m) strong.setAttribute('data-cps-anchor', m[1])
    })
  } else if (activeSection.value === 'solution') {
    // Solution 섹션의 RES 항목들은 보통 nested 구조 ("핵심 기능 명세" 같은 top-level
    // bullet 아래에 RES-01, RES-02 가 sub-bullet 으로 들어감). top-level <li> 제한
    // 두면 첫 번째 RES 만 anchor 받게 됨. 모든 <code> 를 순회해 [RES-XX] 로 시작
    // 하는 항목 모두 anchor 부여. RES-XX 가 BE 발행 고유 ID 라 중복 매치 위험 없음.
    container.querySelectorAll('code').forEach(code => {
      const m = (code.textContent || '').trim().match(/^\[(RES-\d+)\]/)
      if (m) code.setAttribute('data-cps-anchor', m[1])
    })
  }
}

// activeSection 또는 내용이 바뀔 때마다 (v-html 재렌더 후) anchor 재주입.
watch([activeSection, activeContentHtml], async () => {
  await nextTick()
  annotateAnchors()
}, { immediate: true, flush: 'post' })

// Fallback: sections 파싱 실패 시 전체 markdown.
const fullMarkdownFallback = computed(() => {
  const raw = rawContent.value
  if (!raw) return ''
  // [i18n] Journey 마커는 다국어로 번역되므로 ⚙️ 이모지 앵커(언어 무관)로 컷.
  const jm = raw.match(JOURNEY_MARK_RE)
  const clean = (jm ? raw.slice(0, jm.index) : raw).replace(/\\n/g, '\n')
  return md.render(clean)
})

// CPS 가 바뀌어 activeSection 이 무효해지면 첫 섹션으로 fallback.
watch(sections, (now) => {
  if (now.length === 0) return
  if (!now.find(s => s.id === activeSection.value)) {
    activeSection.value = now[0].id
  }
}, { immediate: true })

// ─── Section switch + scroll ────────────────────────────────
const switchSection = (key) => {
  // [2026-06] 편집 중에는 탭 이동 차단 — 활성 섹션만 편집 중이라 다른 섹션으로 옮기면
  // 편집 내용이 유실되거나 엉뚱한 섹션에 저장된다. 저장/취소 후 이동 가능.
  if (isEditing.value) return
  activeSection.value = key
  selectedItem.value = null
  mobileNavOpen.value = false
}

const scrollAndHighlight = (anchorValue, sectionKey) => {
  // [2026-06] 편집 중 좌측 항목 클릭으로 섹션이 바뀌면 편집 내용이 유실 — 차단.
  if (isEditing.value) return
  if (sectionKey) activeSection.value = sectionKey
  selectedItem.value = anchorValue
  mobileNavOpen.value = false
  nextTick(() => {
    const container = document.querySelector('.cps-viewer-body')
    if (!container) return
    container.querySelectorAll('.cps-hl').forEach(el => el.classList.remove('cps-hl'))

    // DOM iteration 으로 정확 매칭. CSS.escape 가 quoted attribute selector 안에서
    // 공백을 'Next\ Steps' 로 over-escape 해서 querySelector 가 매치 실패하던 문제 회피.
    // getAttribute 는 정확한 raw 값으로 비교 가능.
    const candidates = container.querySelectorAll('[data-cps-anchor]')
    let target = null
    for (const el of candidates) {
      if (el.getAttribute('data-cps-anchor') === anchorValue) {
        target = el
        break
      }
    }

    if (!target) {
      // anchor 가 정말 없는 케이스만 (이론상 발생 안 함). substring fallback 은 의도적으로
      // 제거 — 이전엔 nested 텍스트 포함된 outer <li> 가 먼저 매치되어 오작동했음.
      return
    }
    const block = target.closest('li, p, h1, h2, h3, h4') || target
    block.scrollIntoView({ behavior: 'smooth', block: 'center' })
    block.classList.add('cps-hl')
  })
}

// ─── Edit mode (섹션 단위) ────────────────────────────────────
const isEditing = ref(false)
const editContent = ref('')
const editScope = ref('section')   // section | full
const isSaving = ref(false)
// [2026-06-11 lost-update 가드] 편집 시작 시점 CPS last_updated — 저장 PATCH 의
// client_updated_at 용. 저장 시점 prop 참조가 아닌 시작 시점 캡처인 이유: 편집 중
// 부모가 refetch 하면 prop 이 최신화돼, 낡은 화면 기준 편집이 충돌 검사를 통과해
// 버리는 구멍(PR #290 방식의 결함)이 생긴다. PrdTab 과 동일 패턴.
const editBaseUpdatedAt = ref(null)

const startEdit = () => {
  if (hasSections.value && activeSectionData.value) {
    editScope.value = 'section'
    editContent.value = activeSectionData.value.content
  } else {
    editScope.value = 'full'
    editContent.value = rawContent.value
  }
  editBaseUpdatedAt.value = props.cps?.last_updated ?? null
  isEditing.value = true
}
const cancelEdit = () => {
  isEditing.value = false
  editContent.value = ''
  editScope.value = 'section'
}
const saveEdit = async () => {
  if (!props.projectName) {
    showError?.(t('cps.err.no_project'))
    return
  }
  if (!editContent.value.trim()) {
    showError?.(t('cps.err.content_empty'))
    return
  }
  if (editContent.value.length > 500_000) {
    showError?.(t('cps.err.content_too_large'))
    return
  }
  // [2026-05-26] 큰 삭제 confirm — 'full' scope(문서 전체 편집) 시 원본 대비 50% 이상
  // 줄어들면 명시 확인. section scope 는 일부 교체라 confirm 불필요(전체 길이 비교 무의미).
  // [2026-06 버그수정] 조건이 'all'(어디서도 설정되지 않는 값 — startEdit 는 section|full 만
  // 설정)이라 우발적 대량삭제 가드가 죽어 있던 것을 'full' 로 정정.
  if (editScope.value === 'full') {
    const oldLen = (rawContent.value || '').length
    const newLen = editContent.value.length
    if (oldLen > 1000 && newLen < oldLen * 0.5) {
      const lostPct = Math.round((1 - newLen / oldLen) * 100)
      const ok = window.confirm(t('cps.confirm.large_delete', { pct: lostPct, deleted: oldLen - newLen }))
      if (!ok) return
    }
  }
  isSaving.value = true
  try {
    let finalContent
    if (editScope.value === 'section' && hasSections.value && activeSectionData.value) {
      finalContent = replaceCpsSection(rawContent.value, activeSectionData.value.id, editContent.value)
    } else {
      finalContent = editContent.value
    }
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    await axios.patch(`${base}/api/v2/cps`, {
      project_name: props.projectName,
      content: finalContent,
      // [2026-06-11] 편집 시작 시점 스냅샷 — 그 사이 다른 기기/배치 merge 로 master 가
      // 바뀌었으면 BE 낙관적 잠금이 409 (덮어쓰기 유실 차단). null 이면 기존 동작.
      ...(editBaseUpdatedAt.value != null
        ? { client_updated_at: editBaseUpdatedAt.value }
        : {}),
    })
    showSuccess?.(t('cps.toast.save_ok'))
    isEditing.value = false
    editScope.value = 'section'
    emit('saved')
  } catch (err) {
    console.error('CPS 저장 실패:', err)
    if (err?.response?.status === 409) {
      // 편집 내용은 보존(isEditing 유지) — 사용자가 최신본과 비교해 복사/병합 판단.
      showError?.(t('cps.toast.save_conflict'), { timeout: 9000 })
    } else {
      showError?.(t('cps.toast.save_fail'))
    }
  } finally {
    isSaving.value = false
  }
}

// ─── Graph nodes (검수 모드) ──────────────────────────────────
// [2026-06 공통화] 노드 조회/인라인 summary 수정 CRUD 는 useGraphNodeEdit 로 추출
// (PrdNodeEditor 와 공통). 외형(template/CSS)은 CpsTab 이 그대로 보유 — UI 불변.
const {
  graphNodes,
  isLoadingNodes,
  editingNodeId,
  editingNodeSummary,
  isSavingNode,
  startEditNode,
  cancelEditNode,
  saveEditNode,
} = useGraphNodeEdit({
  getProjectName: () => props.projectName,
  getEditable: () => props.editable,
  nodesPath: '/api/v2/cps/nodes',
  onSummaryEmpty: () => showError?.(t('cps.err.summary_empty')),
  onSummaryTooLarge: () => showError?.(t('cps.err.summary_too_large')),
  onSaveOk: (node) => showSuccess?.(t('cps.toast.node_save_ok', { label: node.label })),
  onSaveFail: () => showError?.(t('cps.toast.node_save_fail')),
  onSaved: () => emit('saved'),
  logLabel: 'CPS nodes',
})

// [편집 가드 — 2026-06] 편집 중(섹션/전체 마크다운 또는 노드 인라인) 상태를 부모로 올린다.
// 부모(plan.vue)가 탭/스텝 이동 시 '저장 안 된 변경' confirm 을 띄우는 데 사용.
const isAnyEditing = computed(() => isEditing.value || editingNodeId.value != null)
watch(isAnyEditing, (v) => emit('update:editing', v), { immediate: true })
// 편집 중 컴포넌트가 unmount(탭 전환 등)되면 watch 가 false 를 못 쏘므로 명시 해제.
onBeforeUnmount(() => emit('update:editing', false))

// ─── Stale dismiss / Resynth ─────────────────────────────────
// [2026-06 공통화] stale 배너 dismiss(POST → 성공토스트 → saved) 는 useDocStaleDismiss 로 추출.
const { isDismissingStale, dismissStale } = useDocStaleDismiss({
  endpoint: '/api/v2/cps/markdown-stale/dismiss',
  getProjectName: () => props.projectName,
  onOk: () => showSuccess?.(t('cps.toast.dismiss_ok')),
  onFail: () => showError?.(t('cps.toast.dismiss_fail')),
  onSaved: () => emit('saved'),
})

const isResynthesizing = ref(false)
const isApplyingResynth = ref(false)
const showDiffModal = ref(false)
const resyncOldMd = ref('')
const resyncNewMd = ref('')

// [2026-06-11 lost-update 가드] 재합성 기준 master 버전 — 적용 PATCH 의 client_updated_at.
const resyncBaseUpdatedAt = ref(null)

const resynthesizeMarkdown = async () => {
  if (!props.projectName) return
  // [멀티디바이스] 다른 기기 작업 중 — 곧 바뀔 CPS 기준 재합성은 적용 시점에 409 라
  // LLM 시간·토큰만 낭비. 시작 전에 안내하고 차단.
  if (props.remoteBusy) {
    showWarning?.(t('cps.toast.remote_busy'))
    return
  }
  isResynthesizing.value = true
  // 요청 직전 캡처 — 응답에 서버가 읽은 정확한 버전이 오면 그걸로 교체.
  resyncBaseUpdatedAt.value = props.cps?.last_updated ?? null
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.post(
      `${base}/api/v2/cps/resynthesize`,
      { project_name: props.projectName },
      { timeout: 60_000 },
    )
    resyncOldMd.value = data?.current_markdown || rawContent.value
    resyncNewMd.value = data?.markdown || ''
    // 재합성은 서버본 기준 diff — 응답의 last_updated(서버가 읽은 버전)가 정확한 짝.
    resyncBaseUpdatedAt.value = data?.last_updated ?? resyncBaseUpdatedAt.value
    showDiffModal.value = true
  } catch (err) {
    console.error('CPS 재합성 실패:', err)
    const detail = err?.response?.data?.detail
    if (err?.response?.status === 404) {
      showError?.(t('cps.toast.resynth_not_found'))
    } else if (err?.response?.status === 429) {
      showError?.(t('cps.toast.resynth_rate_limit', { detail: detail || '' }))
    } else {
      showError?.(t('cps.toast.resynth_fail'))
    }
  } finally {
    isResynthesizing.value = false
  }
}

const applyResynth = async (newMd) => {
  if (!newMd || !props.projectName) return
  // [멀티디바이스] 적용 직전 1차 가드 — 어차피 409 날 PATCH 를 사전에 안내.
  if (props.remoteBusy) {
    showWarning?.(t('cps.toast.remote_busy'))
    return
  }
  isApplyingResynth.value = true
  try {
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    await axios.patch(`${base}/api/v2/cps`, {
      project_name: props.projectName,
      content: newMd,
      ...(resyncBaseUpdatedAt.value != null
        ? { client_updated_at: resyncBaseUpdatedAt.value }
        : {}),
    })
    showSuccess?.(t('cps.toast.resynth_apply_ok'))
    showDiffModal.value = false
    emit('saved')
  } catch (err) {
    console.error('CPS 재합성 적용 실패:', err)
    if (err?.response?.status === 409) {
      // 재합성 기준이 낡음 — 같은 diff 재적용은 또 409 (무한 루프). 닫고 최신본
      // refetch 후 재합성을 유도.
      showError?.(t('cps.toast.save_conflict'), { timeout: 9000 })
      showDiffModal.value = false
      emit('saved')
    } else {
      showError?.(t('cps.toast.resynth_apply_fail'))
    }
  } finally {
    isApplyingResynth.value = false
  }
}

const cancelResynth = () => {
  showDiffModal.value = false
  resyncOldMd.value = ''
  resyncNewMd.value = ''
}
</script>

<template>
  <div class="cps-root">
    <!-- Mobile nav toggle -->
    <button class="mobile-nav-toggle" @click="mobileNavOpen = !mobileNavOpen" type="button">
      <FileText :size="14" class="mr-2" />
      {{ sectionTabs.find(t => t.key === activeSection)?.label || 'CPS' }}
      <ChevronDown :size="16" class="ml-1" :style="mobileNavOpen ? 'transform: rotate(180deg);' : ''" />
    </button>

    <!-- Left Nav Panel -->
    <aside class="nav-panel" :class="{ 'nav-panel--open': mobileNavOpen }">
      <div class="nav-header">
        <FileText :size="14" class="text-accent mr-2" />
        <span class="nav-doc-id">{{ cps?.document_id || 'DOC-CPS-01' }}</span>
      </div>

      <div class="nav-items custom-scroll">
        <!-- Context tab — 보통 짧은 본문이라 sub-item 없음 -->
        <div v-if="activeSection === 'context'" class="nav-hint">
          {{ $t('cps.nav.context_hint') }}
        </div>

        <!-- Problem tab — PRB 카드 -->
        <template v-else-if="activeSection === 'problem'">
          <div v-if="problemItems.length === 0" class="nav-hint">
            {{ $t('cps.nav.problem_empty') }}
          </div>
          <div
            v-for="item in problemItems" :key="item.id"
            class="nav-item"
            :class="{ 'nav-item--active': selectedItem === item.id }"
            @click="scrollAndHighlight(item.id, 'problem')"
          >
            <span class="nav-item-id">{{ item.id }}</span>
            <span class="nav-item-text">{{ item.summary }}</span>
          </div>
        </template>

        <!-- Solution tab — RES 카드 -->
        <template v-else-if="activeSection === 'solution'">
          <div v-if="resolutionItems.length === 0" class="nav-hint">
            {{ $t('cps.nav.solution_empty') }}
          </div>
          <div
            v-for="item in resolutionItems" :key="item.id"
            class="nav-item"
            :class="{ 'nav-item--active': selectedItem === item.id }"
            @click="scrollAndHighlight(item.id, 'solution')"
          >
            <span class="nav-item-id">{{ item.id }}</span>
            <span class="nav-item-text">{{ item.summary }}</span>
          </div>
        </template>

        <!-- Pending tab — top-level 그룹 (anchorId 인덱스 기반 매칭) -->
        <template v-else-if="activeSection === 'pending'">
          <div v-if="pendingGroups.length === 0" class="nav-hint">
            {{ $t('cps.nav.pending_empty') }}
          </div>
          <div
            v-for="g in pendingGroups" :key="g.anchorId"
            class="nav-item"
            :class="{ 'nav-item--active': selectedItem === g.anchorId }"
            @click="scrollAndHighlight(g.anchorId, 'pending')"
          >
            <ListChecks :size="13" class="nav-item-icon" />
            <span class="nav-item-text">{{ g.title }}</span>
          </div>
        </template>
      </div>

      <!-- [검수 모드] 그래프 노드 인라인 수정 -->
      <div v-if="editable" class="graph-edit-panel">
        <div class="d-flex align-center mb-2">
          <VIcon icon="mdi-graph-outline" size="small" color="accent" class="mr-1" />
          <span class="graph-edit-title">Graph ({{ graphNodes.length }})</span>
          <VSpacer />
          <span class="graph-edit-mode">{{ $t('cps.graph.edit_mode') }}</span>
        </div>
        <p v-if="!isLoadingNodes && graphNodes.length === 0" class="graph-empty">
          {{ $t('cps.graph.no_nodes') }}
        </p>
        <Loader2 v-if="isLoadingNodes" :size="14" class="spin text-muted" />
        <div v-for="node in graphNodes" :key="node.id" class="graph-node-row">
          <div class="d-flex align-center mb-1">
            <span class="graph-node-pill" :class="{ 'graph-node-pill--solution': node.label === 'Solution' }">
              {{ node.label }}
            </span>
            <span class="graph-node-id mono-text">{{ node.id }}</span>
            <VSpacer />
            <button
              v-if="editingNodeId !== node.id"
              class="graph-edit-btn"
              type="button"
              @click="startEditNode(node)"
            >
              <Edit3 :size="11" />
            </button>
          </div>
          <textarea
            v-if="editingNodeId === node.id"
            v-model="editingNodeSummary"
            class="graph-node-textarea"
            rows="3"
            :disabled="isSavingNode"
            spellcheck="false"
          />
          <div v-else class="graph-node-summary">{{ node.summary }}</div>
          <div v-if="editingNodeId === node.id" class="d-flex gap-2 mt-1">
            <button
              class="graph-save-btn"
              type="button"
              :disabled="isSavingNode"
              @click="saveEditNode(node)"
            >
              <Loader2 v-if="isSavingNode" :size="11" class="spin mr-1" />
              <Save v-else :size="11" class="mr-1" />
              {{ $t('common.action.save') }}
            </button>
            <button
              class="graph-cancel-btn"
              type="button"
              :disabled="isSavingNode"
              @click="cancelEditNode"
            >
              <IconX :size="11" class="mr-1" />{{ $t('common.action.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Viewer -->
    <main class="viewer-panel">
      <div class="viewer-topbar">
        <div class="viewer-topbar-tabs">
          <button
            v-for="tab in sectionTabs" :key="'vt'+tab.key"
            class="vtab"
            :class="{ 'vtab--active': activeSection === tab.key }"
            :disabled="isEditing"
            :title="isEditing ? $t('cps.tab_locked') : ''"
            @click="switchSection(tab.key)"
            type="button"
          >
            {{ tab.num }}. {{ tab.label }}
          </button>
        </div>
        <div class="viewer-badge-area">
          <button
            v-if="!isEditing && fullMarkdown"
            class="cps-edit-btn"
            @click="copyMd"
            :title="$t('cps.copy_title')"
            type="button"
          >
            <component :is="mdCopied ? Check : Copy" :size="13" class="mr-1" />{{ mdCopied ? $t('common.action.copied') : $t('common.action.copy') }}
          </button>
          <button
            v-if="!isEditing && fullMarkdown"
            class="cps-edit-btn"
            @click="downloadMd"
            :title="$t('cps.download_title')"
            type="button"
          >
            <FileDown :size="13" class="mr-1" />MD
          </button>
          <button
            v-if="editable && !isEditing"
            class="cps-edit-btn"
            :disabled="remoteBusy"
            @click="startEdit"
            :title="remoteBusy ? $t('cps.toast.remote_busy') : $t('cps.edit_title')"
            type="button"
          >
            <Edit3 :size="13" class="mr-1" />{{ $t('common.action.edit') }}
          </button>
          <template v-else-if="isEditing">
            <button
              class="cps-edit-btn cps-edit-btn--save"
              :disabled="isSaving"
              @click="saveEdit"
              type="button"
            >
              <Loader2 v-if="isSaving" :size="13" class="mr-1 spin" />
              <Save v-else :size="13" class="mr-1" />
              {{ isSaving ? $t('cps.saving') : $t('common.action.save') }}
            </button>
            <button
              class="cps-edit-btn cps-edit-btn--cancel"
              :disabled="isSaving"
              @click="cancelEdit"
              type="button"
            >
              <IconX :size="13" class="mr-1" />{{ $t('common.action.cancel') }}
            </button>
          </template>
          <template v-else>
            <ShieldCheck :size="14" color="#2E7D32" class="mr-1" />
            <span class="viewer-badge">VERIFIED</span>
          </template>
        </div>
      </div>

      <!-- markdown_stale banner (공통 StaleBanner — 2026-06 인라인 마이그레이션) -->
      <StaleBanner
        v-if="cps?.markdown_stale && !isEditing"
        :title="$t('cps.stale.title')"
        :subtitle="$t('cps.stale.sub')"
      >
        <template #actions>
          <button
            class="stale-banner__btn stale-banner__btn--primary"
            type="button"
            :disabled="isResynthesizing"
            @click="resynthesizeMarkdown"
          >
            <Loader2 v-if="isResynthesizing" :size="11" class="spin mr-1" />
            <Zap v-else :size="11" class="mr-1" />
            {{ isResynthesizing ? $t('cps.resynth_running') : $t('cps.resynth_btn') }}
          </button>
          <button
            v-if="editable"
            class="stale-banner__btn"
            type="button"
            :disabled="isResynthesizing"
            @click="startEdit"
          >
            <Edit3 :size="11" class="mr-1" />{{ $t('cps.manual_edit_btn') }}
          </button>
          <button
            class="stale-banner__btn"
            type="button"
            :disabled="isDismissingStale || isResynthesizing"
            @click="dismissStale"
          >
            <Loader2 v-if="isDismissingStale" :size="11" class="spin mr-1" />
            {{ $t('cps.dismiss_btn') }}
          </button>
        </template>
      </StaleBanner>

      <!-- Body -->
      <div class="cps-viewer-body custom-scroll">
        <!-- [2026-05-19] 좌측에서 항목 선택 시 sticky 필터 배너 + 전체 보기 토글.
             PRD 패턴 동일. context 섹션은 단일 블록이라 필터링 안 함. -->
        <div
          v-if="!isEditing && selectedItem && activeSection !== 'context'"
          class="cps-filter-bar"
        >
          <span class="cps-filter-bar__label">
            <Eye :size="12" class="mr-1" />
            {{ $t('cps.filter.view_only', { label: selectedItemLabel }) }}
          </span>
          <button type="button" class="cps-filter-bar__clear" @click="clearSelection">
            {{ $t('cps.filter.view_all') }}
          </button>
        </div>
        <!-- 편집 모드: 활성 섹션만 textarea -->
        <template v-if="isEditing">
          <div class="edit-scope-banner" :class="{ 'edit-scope-banner--full': editScope === 'full' }">
            <Edit3 :size="12" class="mr-2" />
            <template v-if="editScope === 'section' && activeSectionData">
              <span>{{ $t('cps.edit_scope.editing') }} <strong>{{ $t('cps.edit_scope.section_label', { num: activeSectionData.num, title: activeSectionData.title }) }}</strong></span>
              <span class="edit-scope-banner__hint">{{ $t('cps.edit_scope.section_hint') }}</span>
            </template>
            <template v-else>
              <span>{{ $t('cps.edit_scope.editing') }} <strong>{{ $t('cps.edit_scope.full_label') }}</strong></span>
              <span class="edit-scope-banner__hint">{{ $t('cps.edit_scope.full_hint') }}</span>
            </template>
          </div>
          <textarea
            v-model="editContent"
            class="cps-edit-textarea"
            :placeholder="editScope === 'section' ? $t('cps.placeholder.section') : $t('cps.placeholder.full')"
            spellcheck="false"
          />
        </template>

        <!-- 보기 모드: 활성 섹션 markdown (selectedItem 있으면 sub-item 만) -->
        <template v-else-if="hasSections">
          <div
            class="markdown-content"
            v-html="filteredContentHtml"
          ></div>

          <!-- Compliance CTA — 본문 끝에 노출 -->
          <div class="compliance-card">
            <div class="compliance-card__title">
              <VIcon icon="mdi-star-four-points" color="warning" class="mr-2" />
              <span>Compliance Status</span>
            </div>
            <p class="compliance-card__desc">
              {{ $t('cps.compliance.desc') }}
            </p>
            <VBtn
              color="white"
              variant="elevated"
              class="compliance-card__btn"
              size="large"
              @click="emit('navigate', 'eslint')"
            >
              Generate Engineering Rules →
            </VBtn>
          </div>
        </template>

        <!-- Fallback: sections 파싱 실패 -->
        <div v-else class="markdown-content" v-html="fullMarkdownFallback"></div>
      </div>
    </main>

    <!-- Resynth diff preview -->
    <ResynthDiffModal
      :open="showDiffModal"
      kind="cps"
      :old-markdown="resyncOldMd"
      :new-markdown="resyncNewMd"
      :applying="isApplyingResynth"
      @apply="applyResynth"
      @cancel="cancelResynth"
    />
  </div>
</template>

<style scoped>
/* ==============================
   Root Layout
   ============================== */
.cps-root {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 16px;
  padding: 12px 0;
  animation: cpsFadeIn 0.4s ease-out;
}
@keyframes cpsFadeIn { from { opacity: 0; } to { opacity: 1; } }

.mobile-nav-toggle { display: none; }

/* ==============================
   Nav Panel
   ============================== */
.nav-panel {
  width: 280px;
  flex-shrink: 0;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.nav-header {
  display: flex; align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08));
  flex-shrink: 0;
}
.nav-doc-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.65rem; font-weight: 600;
  color: var(--accent, #8C6239);
  background: rgba(140,98,57,0.08);
  padding: 2px 8px; border-radius: 4px;
}

.nav-items {
  flex: 1; overflow-y: auto;
  padding: 8px; min-height: 0;
}
.nav-item {
  display: flex; align-items: flex-start;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  gap: 8px;
  margin-bottom: 2px;
}
.nav-item:hover { background: var(--bg-light, #fafaf7); }
.nav-item--active { background: var(--accent, #8C6239) !important; }
.nav-item--active .nav-item-id,
.nav-item--active .nav-item-text,
.nav-item--active .nav-item-icon { color: white !important; }
.nav-item-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.58rem; font-weight: 700;
  color: var(--accent, #8C6239);
  background: rgba(140,98,57,0.08);
  padding: 2px 6px; border-radius: 4px;
  white-space: nowrap; flex-shrink: 0; line-height: 1.5;
}
.nav-item--active .nav-item-id { background: rgba(255,255,255,0.2); }
.nav-item-icon { color: var(--accent, #8C6239); flex-shrink: 0; margin-top: 2px; }
.nav-item-text {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.75rem; font-weight: 600;
  color: var(--text-main, #111);
  line-height: 1.4;
}
.nav-hint {
  text-align: center;
  padding: 20px 8px;
  font-size: 0.72rem;
  color: var(--text-muted, #888);
  line-height: 1.6;
}

/* ==============================
   Viewer Panel
   ============================== */
.viewer-panel {
  flex: 1; min-width: 0;
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 14px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.viewer-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08));
  flex-shrink: 0;
  gap: 8px;
}
.viewer-topbar-tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.viewer-topbar-tabs::-webkit-scrollbar { display: none; }
.vtab {
  padding: 12px 16px;
  border: none; background: transparent; cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 0.72rem; font-weight: 600;
  color: var(--text-muted, #888);
  border-bottom: 2px solid transparent;
  white-space: nowrap; transition: all 0.15s;
}
.vtab:hover:not(:disabled) { color: var(--text-main, #111); }
.vtab--active {
  color: var(--accent, #8C6239);
  border-bottom-color: var(--accent, #8C6239);
  font-weight: 800;
}
/* [2026-06] 편집 중 탭 잠금 — 비활성 탭은 흐리게, 활성 탭(편집 대상)은 그대로 강조 유지. */
.vtab:disabled { cursor: not-allowed; opacity: 0.4; }
.vtab--active:disabled { opacity: 1; }
.viewer-badge-area {
  display: flex; align-items: center; flex-shrink: 0; gap: 8px;
}
.viewer-badge {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.58rem; font-weight: 700; color: #2E7D32;
}

.cps-viewer-body {
  flex: 1; overflow-y: auto;
  padding: 32px 36px;
  text-align: left;
}

/* [2026-05-19] 좌측 메뉴 항목 선택 시 sticky 필터 배너 — PRD 패턴 동일. */
.cps-filter-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 0 16px;
  padding: 8px 14px;
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.22);
  border-radius: 10px;
  font-size: 0.78rem;
}
.cps-filter-bar__label {
  display: inline-flex; align-items: center;
  color: var(--accent, #8C6239);
  font-weight: 700;
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cps-filter-bar__clear {
  background: white;
  border: 1px solid rgba(140, 98, 57, 0.3);
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent, #8C6239);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 10px;
  transition: all 0.15s;
}
.cps-filter-bar__clear:hover {
  background: var(--accent, #8C6239);
  color: white;
  border-color: var(--accent, #8C6239);
}

/* ==============================
   Edit Mode
   ============================== */
.cps-edit-btn {
  display: inline-flex; align-items: center;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: var(--bg-light, #fafafa);
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem; font-weight: 700;
  color: var(--text-main, #111);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.cps-edit-btn:hover:not(:disabled) {
  border-color: var(--accent, #8C6239);
  color: var(--accent, #8C6239);
}
.cps-edit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cps-edit-btn--save {
  background: var(--accent, #8C6239);
  color: #fff;
  border-color: var(--accent, #8C6239);
}
.cps-edit-btn--save:hover:not(:disabled) {
  background: #6f4d2d; border-color: #6f4d2d;
}
.cps-edit-btn--cancel {
  color: #c0362c; border-color: #f5c8c4; background: #fff5f4;
}
.cps-edit-btn--cancel:hover:not(:disabled) {
  border-color: #c0362c; color: #c0362c; background: #ffe6e3;
}
.cps-edit-btn .spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.edit-scope-banner {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 6px 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.06);
  border: 1px solid rgba(140, 98, 57, 0.2);
  color: var(--text-main, #111);
  font-size: 0.78rem; font-weight: 600;
}
.edit-scope-banner strong { font-weight: 800; color: var(--accent, #8C6239); }
.edit-scope-banner__hint {
  font-size: 0.68rem;
  color: var(--text-muted, #888);
  font-weight: 500;
}
.edit-scope-banner--full {
  background: #fff3cd;
  border-color: #ffd54f;
  color: #6b4f00;
}
.edit-scope-banner--full strong { color: #6b4f00; }

.cps-edit-textarea {
  width: 100%;
  min-height: 60vh;
  padding: 16px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  background: #fcfbf8;
  font-family: 'Fira Code', 'Menlo', 'Consolas', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-main, #111);
  resize: vertical;
  outline: none;
}
.cps-edit-textarea:focus {
  border-color: var(--accent, #8C6239);
  box-shadow: 0 0 0 3px rgba(140, 98, 57, 0.1);
}

/* Stale Banner 스타일은 공통 컴포넌트 StaleBanner.vue 로 이전 (버튼 클래스는
   StaleBanner 가 :deep 로 제공 — slot 버튼에 .stale-banner__btn 그대로 사용). */

/* ==============================
   Graph Edit Panel
   ============================== */
.graph-edit-panel {
  padding: 12px 14px;
  border-top: 1px dashed var(--border-light, rgba(0,0,0,0.12));
  background: #fffaf3;
  max-height: 320px;
  overflow-y: auto;
}
.graph-edit-title {
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-main, #111);
}
.graph-edit-mode {
  font-size: 0.6rem;
  color: var(--text-muted, #888);
  font-weight: 700;
}
.graph-empty {
  font-size: 0.7rem;
  color: var(--text-muted, #888);
  margin: 0;
}
.graph-node-row { padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05); }
.graph-node-row:last-child { border-bottom: none; }
.graph-node-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #fff3e0;
  color: #8C6239;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  margin-right: 8px;
}
.graph-node-pill--solution { background: #e8f5e9; color: #2e7d32; }
.graph-node-id {
  font-size: 0.68rem;
  color: var(--text-muted, #888);
  font-family: 'IBM Plex Mono', monospace;
}
.graph-node-summary {
  font-size: 0.78rem;
  color: var(--text-main, #111);
  line-height: 1.5;
  padding-left: 4px;
}
.graph-node-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--accent, #8C6239);
  border-radius: 6px;
  background: #fff;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-main, #111);
  outline: none;
  resize: vertical;
}
.graph-edit-btn,
.graph-save-btn,
.graph-cancel-btn {
  display: inline-flex; align-items: center;
  padding: 3px 9px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  background: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-main, #111);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.graph-edit-btn:hover:not(:disabled) {
  border-color: var(--accent, #8C6239); color: var(--accent, #8C6239);
}
.graph-save-btn {
  background: var(--accent, #8C6239); color: #fff; border-color: var(--accent, #8C6239);
}
.graph-save-btn:hover:not(:disabled) { background: #6f4d2d; }
.graph-cancel-btn {
  color: #c0362c; border-color: #f5c8c4; background: #fff5f4;
}
.graph-cancel-btn:hover:not(:disabled) {
  border-color: #c0362c; background: #ffe6e3;
}
.graph-edit-btn:disabled,
.graph-save-btn:disabled,
.graph-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.spin { animation: spin 0.9s linear infinite; }

/* ==============================
   Compliance CTA
   ============================== */
.compliance-card {
  margin-top: 32px;
  padding: 24px;
  border-radius: 16px;
  background: linear-gradient(135deg, #111 0%, #333 100%);
  color: white;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}
.compliance-card__title {
  display: flex; align-items: center;
  font-size: 1rem; font-weight: 700;
  margin-bottom: 8px;
}
.compliance-card__desc {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.7);
  line-height: 1.6;
  margin-bottom: 16px;
}
.compliance-card__btn {
  border-radius: 9999px !important;
  font-family: 'Outfit', sans-serif !important;
  font-weight: 800 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  font-size: 0.7rem !important;
  color: var(--text-main, #111) !important;
}

/* [2026-05] 빈 Pending 그룹 안내 */
:deep(.cps-empty-group-hint) {
  display: inline-block;
  margin: 6px 0 8px 0;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--text-muted, #888);
  background: var(--bg-page, #fafaf7);
  border-radius: 6px;
  border: 1px dashed var(--border-light, rgba(0,0,0,0.1));
}

/* ==============================
   Markdown styles
   ============================== */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin-top: 28px; margin-bottom: 16px;
  font-family: 'Outfit', sans-serif !important;
  font-weight: 800;
  color: var(--text-main, #111);
  letter-spacing: -0.02em;
}
.markdown-content :deep(h2) {
  font-size: 1.4rem;
  border-bottom: 2px solid var(--border-light, rgba(0,0,0,0.08));
  padding-bottom: 8px;
}
.markdown-content :deep(h3) { font-size: 1.15rem; color: var(--accent, #8C6239); }
.markdown-content :deep(h4) { font-size: 1rem; }
.markdown-content :deep(p) {
  margin-bottom: 18px; line-height: 2;
  color: #444;
  text-align: left !important;
  word-break: keep-all;
}
.markdown-content :deep(ul), .markdown-content :deep(ol) {
  padding-left: 24px; margin-bottom: 24px; color: #444;
}
.markdown-content :deep(li) { margin-bottom: 10px; line-height: 1.7; }
.markdown-content :deep(strong) { color: var(--text-main, #111); font-weight: 800; }
.markdown-content :deep(code) {
  font-family: 'IBM Plex Mono', monospace;
  background-color: #fcf8f2;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  color: var(--accent, #8C6239);
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
}
.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-light, rgba(0,0,0,0.08));
  margin: 28px 0;
}

.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

/* Highlight (scroll target) */
:global(.cps-hl) {
  background-color: rgba(255, 235, 59, 0.25) !important;
  border-radius: 8px;
  box-shadow: 0 0 0 8px rgba(255, 235, 59, 0.25);
  transition: all 0.3s ease;
}

/* ==============================
   Responsive: Tablet (≤1024px)
   ============================== */
@media (max-width: 1024px) {
  .nav-panel { width: 220px; }
  .cps-viewer-body { padding: 24px 20px; }
  .vtab { padding: 10px 12px; font-size: 0.68rem; }
}

/* ==============================
   Responsive: Mobile (≤768px)
   ============================== */
@media (max-width: 768px) {
  .cps-root {
    flex-direction: column;
    gap: 8px;
    padding: 8px 0;
  }

  .mobile-nav-toggle {
    display: flex; align-items: center; justify-content: center;
    width: 100%;
    padding: 10px 16px;
    border: 1px solid var(--border-light, rgba(0,0,0,0.08));
    border-radius: 10px;
    background: var(--bg-card, #fff);
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 0.78rem; font-weight: 700;
    color: var(--text-main, #111);
  }
  .mobile-nav-toggle :deep(svg) { transition: transform 0.2s; }

  .nav-panel {
    width: 100%;
    display: none;
    border-radius: 10px;
    max-height: 50vh;
  }
  .nav-panel--open { display: flex; }

  .viewer-panel {
    border-radius: 10px;
    flex: 1;
    min-height: 60vh;
  }
  /* [2026-06] 모바일: 액션(복사/MD/VERIFIED)을 아랫줄로 내려 CPS 섹션 탭을 한 줄에
     온전히 보이게 — PRD 탭과 동일한 2줄 레이아웃. */
  .viewer-topbar {
    padding: 0 8px;
    flex-wrap: wrap;
  }
  .viewer-topbar-tabs {
    flex: 1 1 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  /* [2026-06] PRD 탭과 동일한 밑줄 간격 — vtab 세로 패딩 8px (이전 10px 라 메뉴↔밑줄이 넓었음). */
  .vtab { padding: 8px 10px; font-size: 0.67rem; white-space: nowrap; }
  .viewer-badge-area {
    width: 100%;
    padding: 4px 0 7px;
    border-top: 1px solid var(--border-light, rgba(0,0,0,0.08));
    justify-content: flex-end;
  }
  .cps-viewer-body { padding: 16px; }

  .graph-edit-panel { max-height: 250px; }

  .compliance-card { padding: 18px; }
}
</style>
