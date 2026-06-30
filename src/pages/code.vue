<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useHarnessStore, API_BASE } from '@/store/harness'
import { useLibraryStore } from '@/store/library'
import axios from '@/utils/axios'
// [Phase 1] pure helpers — selectFile / switchTab 안에서만 사용.
// getIconType/Dot 등 UI helper 는 각 컴포넌트가 자체 import.
import {
  mapGithubProxyError,
  getLanguage,
  isBinaryExtension,
} from '@/utils/githubCode'
// [Phase 2] UI 단순 분리
import GithubUrlInput from '@/components/code/GithubUrlInput.vue'
import LibraryQuickLoad from '@/components/code/LibraryQuickLoad.vue'
import MobileExplorerToggle from '@/components/code/MobileExplorerToggle.vue'
import CodeEditorStatusBar from '@/components/code/CodeEditorStatusBar.vue'
// [Phase 3] state 공유 분리 — composable + 3개 컴포넌트
import { useGithubRepo } from '@/composables/useGithubRepo'
import FileExplorer from '@/components/code/FileExplorer.vue'
import CodeEditorTabs from '@/components/code/CodeEditorTabs.vue'
import CodeEditorBody from '@/components/code/CodeEditorBody.vue'
import NextStepRouter from '@/components/code/NextStepRouter.vue'
import { extractRaw, isArchitectureEmpty } from '@/utils/designFetch'
import { useConfirm } from '@/composables/useConfirm'
import { useSnackbar } from '@/composables/useSnackbar'
import { useI18n } from 'vue-i18n'

const store = useHarnessStore()
const libraryStore = useLibraryStore()
const confirm = useConfirm()
const { showSuccess, showError } = useSnackbar()
const { t } = useI18n()

// [2026-06] NextStepRouter("설계까지 끝났어요 → 코드로 가는 3가지 길") 게이트.
// 이 배너는 SPACK·DDD·Architecture 명세가 있다고 전제하므로(있어야 AgentExportPanel
// export 도 동작), design 이 실제로 생성된 프로젝트에서만 노출한다. design 은 prd·cps
// 없이는 존재할 수 없으므로 'architecture 비어있지 않음' 하나로 cps+prd+design 완료를 보장.
// 미충족 시 배너만 숨기고, 아래 GitHub repo 브라우저(독립 기능)는 그대로 노출.
const hasDesign = ref(false)
const checkDesign = async () => {
  const projectName = store.projectName
  if (!projectName) { hasDesign.value = false; return }
  try {
    const res = await axios.get(`${API_BASE}/getArchitecture`, { params: { projectName } })
    hasDesign.value = !isArchitectureEmpty(extractRaw(res))
  } catch {
    hasDesign.value = false  // 403/빈 응답 등 → 미완료로 간주(배너 숨김)
  }
}

// ─── Page-level State — 탭 / 활성 파일 / 콘텐츠 캐시 ─────────────
// 이 state 는 모두 selectFile / switchTab / closeTab 의 컨텍스트.
// composable 로 옮기면 fetch 로직 (race guard / 캐시) 도 끌고 가야 해서 결합도 ↑.
// page 에 남기는 게 자연스러움.
const openTabs = ref([])
const activeFilePath = ref(null)
const fileContentCache = ref({})
const currentContent = ref('')
const currentLanguage = ref('')
const currentIcon = ref('file')
const isContentLoading = ref(false)
const mobileExplorerOpen = ref(false)

// ─── Repo State — composable 위임 ───────────────────────────────
// composable 이 githubUrl / isRepoLoading / repoError / repoInfo / fileExplorer
// + loadRepo 액션 제공.
// loadRepo 시작 시 page state 도 reset 해야 해서 onLoadStart 콜백 주입.
const _resetPageState = () => {
  openTabs.value = []
  activeFilePath.value = null
  currentContent.value = ''
  currentLanguage.value = ''
  currentIcon.value = 'file'
  fileContentCache.value = {}
}
const {
  githubUrl,
  isRepoLoading,
  repoError,
  repoInfo,
  fileExplorer,
  loadRepo: _loadRepoRaw,
} = useGithubRepo({
  store,
  onLoadStart: _resetPageState,
})

// loadRepo wrapper — composable 결과의 readme 자동 오픈을 page 가 처리.
// (selectFile 이 page 에 있어 composable 안에서 호출하면 결합도 ↑ → 명시 분리)
const loadRepo = async (urlOverride) => {
  const { readme } = await _loadRepoRaw(urlOverride)
  if (readme) selectFile(readme)
}

// [2026-06-12] MY LIBRARY 에서 저장된 깃 주소 삭제 — 확인 후 store.removeRepo.
// 저장소/분석 결과가 아니라 '내 라이브러리 등록'만 지운다(메시지로 안내).
const removeLibraryRepo = async (repo) => {
  const label = repo.label || repo.url.split('/').slice(-2).join(' / ')
  const ok = await confirm({
    title: t('common.library.remove_confirm_title'),
    message: t('common.library.remove_confirm_message', { label }),
    confirmText: t('common.action.delete'),
    variant: 'danger',
  })
  if (!ok) return
  const res = await libraryStore.removeRepo(repo.url)
  if (res?.success) showSuccess(t('common.library.removed'))
  else showError(res?.error || t('common.library.remove_failed'))
}

// ─── Visible Tree (open/closed 반영) ─────────────────────────
const visibleFileExplorer = computed(() => {
  return fileExplorer.value.filter(item => {
    if (item.parentId === null) return true
    let cur = item.parentId
    while (cur !== null) {
      const p = fileExplorer.value.find(f => f.id === cur)
      if (!p || !p.open) return false
      cur = p.parentId
    }
    return true
  })
})

// 트리에서 현재 파일 하이라이트용 ID
const activeFileId = computed(() => {
  if (!activeFilePath.value) return null
  return fileExplorer.value.find(f => f.path === activeFilePath.value)?.id ?? null
})

onMounted(() => { libraryStore.fetchLibrary(); checkDesign() })
watch(() => store.projectName, () => checkDesign())

// FileExplorer emit 핸들러 — selectFile + 모바일 자동 닫기.
// 기존 inline 핸들러 (`selectFile(item); mobileExplorerOpen = false`) 와 동일 효과.
const onTreeSelect = (file) => {
  selectFile(file)
  mobileExplorerOpen.value = false
}

// ─── Select / Open File ───────────────────────────────────────
// FileExplorer 의 select emit 으로 호출. folder 면 토글, file 이면 fetch.
// race guard (activeFilePath === file.path) 와 fileContentCache 가 핵심.
const selectFile = async (file) => {
  if (file.type === 'folder') {
    file.open = !file.open
    return
  }

  activeFilePath.value = file.path
  currentLanguage.value = getLanguage(file.name)
  currentIcon.value = file.icon || 'file'

  if (!openTabs.value.find(t => t.path === file.path)) {
    openTabs.value.push({ id: file.id, name: file.name, icon: file.icon, path: file.path })
  }

  // 캐시 히트 — 즉시 표시 가능, 이전 파일의 로딩 오버레이 끔
  if (fileContentCache.value[file.path] !== undefined) {
    currentContent.value = fileContentCache.value[file.path]
    isContentLoading.value = false
    return
  }

  // 바이너리 파일 — 즉시 표시
  if (isBinaryExtension(file.name)) {
    const msg = `// Binary file: ${file.name}\n// This file type cannot be displayed as text.`
    fileContentCache.value[file.path] = msg
    currentContent.value = msg
    isContentLoading.value = false
    return
  }

  // 대용량 파일 (500KB 초과) — 즉시 표시
  if (file.size > 500_000) {
    const msg = `// File too large to display (${(file.size / 1024).toFixed(0)} KB)\n// Path: ${file.path}`
    fileContentCache.value[file.path] = msg
    currentContent.value = msg
    isContentLoading.value = false
    return
  }

  // 파일 컨텐츠 fetch (BE 프록시 경유 — 사용자 OAuth 토큰으로 private repo 도 접근 가능)
  isContentLoading.value = true
  try {
    const repoUrl = `https://github.com/${repoInfo.value.owner}/${repoInfo.value.repo}`
    const res = await axios.get('/api/github/file', {
      params: {
        url: repoUrl,
        ref: repoInfo.value.branch,
        path: file.path,
      },
    })
    const text = res.data?.content ?? ''
    fileContentCache.value[file.path] = text
    // race condition 방어: 응답 도착 시점에 이 파일이 여전히 활성 상태일 때만 반영
    if (activeFilePath.value === file.path) {
      currentContent.value = text
    }
  } catch (err) {
    const msg = `// Failed to load: ${mapGithubProxyError(err)}\n// Path: ${file.path}`
    fileContentCache.value[file.path] = msg
    if (activeFilePath.value === file.path) {
      currentContent.value = msg
    }
  } finally {
    // 다른 파일이 활성 상태이면 그 파일의 로딩 상태를 따라야 하므로
    // 현재 파일이 여전히 활성일 때만 false로
    if (activeFilePath.value === file.path) {
      isContentLoading.value = false
    }
  }
}

// ─── Tab Operations ───────────────────────────────────────────
const switchTab = async (tab) => {
  activeFilePath.value = tab.path
  currentLanguage.value = getLanguage(tab.name)
  currentIcon.value = tab.icon || 'file'

  if (fileContentCache.value[tab.path] !== undefined) {
    currentContent.value = fileContentCache.value[tab.path]
    // 이전 파일이 fetch 중이었다면 로딩 오버레이가 떠 있을 수 있음 → 끔
    isContentLoading.value = false
  } else {
    const file = fileExplorer.value.find(f => f.path === tab.path)
    if (file) await selectFile(file)
  }
}

const closeTab = (tabPath, event) => {
  event.stopPropagation()
  openTabs.value = openTabs.value.filter(t => t.path !== tabPath)
  if (activeFilePath.value === tabPath) {
    if (openTabs.value.length > 0) {
      switchTab(openTabs.value[0])
    } else {
      activeFilePath.value = null
      currentContent.value = ''
      currentLanguage.value = ''
      currentIcon.value = 'file'
    }
  }
}
</script>

<template>
  <div class="d-flex flex-column fill-height w-100 pt-0 page-root code-root">

    <!-- ── Header ─────────────────────────────────────────── -->
    <div class="flex-shrink-0 px-0 mt-6 w-100">
      <div class="mb-4">
        <h2 class="text-h4 font-weight-black text-main tracking-tight serif-text">{{ $t('code.title') }}</h2>
        <p class="text-caption text-muted mt-2 font-weight-medium">
          {{ $t('code.subtitle') }}
        </p>
      </div>

      <!-- [분기점] 설계 → 실제 코드로 넘어가는 다리. 사용자 유형별 다음 행동 안내.
           design(SPACK·DDD·Architecture)이 실제로 생성된 프로젝트에서만 노출 —
           명세 없이 뜨면 "설계까지 끝났어요"가 거짓이고 export 도 빈손/오류라서. -->
      <NextStepRouter v-if="hasDesign" />

      <!-- [Phase 2] GitHub URL 입력 + Load + 에러 메시지 → 컴포넌트 -->
      <GithubUrlInput
        v-model="githubUrl"
        :is-loading="isRepoLoading"
        :error-message="repoError"
        @load="loadRepo()"
      />

      <!-- [Phase 2] MY LIBRARY quick-load chips → 컴포넌트 -->
      <LibraryQuickLoad
        :repos="libraryStore.repos"
        :disabled="isRepoLoading"
        @select="loadRepo($event)"
        @remove="removeLibraryRepo"
      />

      <div class="premium-tab-row" />
    </div>

    <!-- [Phase 2] 모바일 file explorer 토글 → 컴포넌트 -->
    <MobileExplorerToggle v-model:open="mobileExplorerOpen" />

    <!-- ── Dashboard ──────────────────────────────────────── -->
    <div class="flex-grow-1 overflow-hidden w-100 pb-8 mt-4">
      <div class="code-dashboard d-flex h-100 overflow-hidden">

        <!-- [Phase 3] File Explorer 컴포넌트
             모바일에서 file click 시 자동 닫기는 page 가 처리 (onTreeSelect). -->
        <FileExplorer
          :files="visibleFileExplorer"
          :active-file-id="activeFileId"
          :repo-info="repoInfo"
          :is-loading="isRepoLoading"
          :is-open="mobileExplorerOpen"
          @select="onTreeSelect"
        />

        <!-- ── Editor ─────────────────────────────────── -->
        <main class="editor-main">

          <!-- [Phase 3] Tabs 컴포넌트 -->
          <CodeEditorTabs
            :tabs="openTabs"
            :active-path="activeFilePath || ''"
            @switch="switchTab"
            @close="closeTab"
          />

          <!-- [Phase 3] Body 컴포넌트 (loading / empty / line gutter + code) -->
          <CodeEditorBody
            :is-loading="isContentLoading"
            :active-path="activeFilePath || ''"
            :content="currentContent"
          />

          <!-- [Phase 2] Status Bar 컴포넌트 -->
          <CodeEditorStatusBar
            :repo-info="repoInfo"
            :active-file-path="activeFilePath"
            :current-language="currentLanguage"
            :current-icon="currentIcon"
          />
        </main>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* 레이아웃 CSS 는 모두 자식 컴포넌트로 분리 완료 (header / mobile toggle /
   status bar / file explorer / editor tabs / editor body). 이 파일엔 dashboard
   컨테이너와 editor-main 레이아웃 + 반응형만 남긴다. */

.code-root { background: var(--bg-page); }
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.premium-tab-row { border-bottom: 1px solid var(--border-light); padding-bottom: 8px; }
.editor-body--relative { position: relative; }
.editor-empty-state { padding-top: 80px; }

/* ── Dashboard ──────────────────────────────────── */
.code-dashboard {
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: white;
  overflow: hidden;
}

/* File Explorer / Editor Tabs / Editor Body / Status Bar 의 CSS 는 각 자식
   컴포넌트로 분리 완료. 여기엔 dashboard layout + editor-main 컨테이너만 남김. */

/* ── Editor 컨테이너 (column flex) ──────────────── */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 768px) {
  .code-dashboard { flex-direction: column; }
  /* [2026-05-21] 빈 파일 미리보기가 화면 50% 차지하던 문제. 컴팩트 min-height. */
  .editor-main { min-height: 280px; }
  /* file-explorer / mobile-toggle / status-bar 모바일 CSS 는 각 컴포넌트에 위치 */
}

/* [2026-06-05] 모바일 페이지 스크롤 셸과 정합. 셸이 height:auto 로 풀리면서
   IDE 영역이 무너지지 않도록 에디터에 뷰포트 기준 높이를 명시(코드 본문은 내부
   스크롤). 탐색기·상태바 등 나머지는 페이지 스크롤로 도달. */
@media (max-width: 600px) {
  .flex-grow-1.overflow-hidden { overflow: visible !important; }
  .code-dashboard { height: auto !important; overflow: visible !important; }
  .editor-main { height: 70dvh; min-height: 360px; }
}
</style>
