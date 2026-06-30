<script setup>
/**
 * MyProjectsModal — 내가 OWNS 한 프로젝트 빠른 관리.
 *
 * [용도]
 * 헤더의 "내 프로젝트 (N)" 버튼 클릭 시 표시. 사용자가 프로필 페이지까지
 * 들어가지 않고 바로 프로젝트 리스트를 볼 수 있게.
 *
 * [기능]
 * - 프로젝트 카드 리스트 (이름 + 등록일)
 * - 카드 클릭 → store.setProjectName 으로 선택 + 모달 닫기
 * - "+ 새 프로젝트" 인라인 폼 → 이름 입력 → 선택 (다음 mutation 시 OWNS 등록)
 * - 각 카드 우측 휴지통 → confirm → BE delete
 * - 빈 상태 — 안내 메시지
 *
 * [데이터]
 * onMounted + props.modelValue=true 변경 시 reload (최신 상태 보장).
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import {
  X, Plus, FolderOpen, Check, Trash2, Loader2,
  AlertCircle, RefreshCw, Search, Github,
} from 'lucide-vue-next'
import { fetchMyProjects } from '@/utils/auth'
import { useHarnessStore, API_BASE } from '@/store/harness'
import axios from '@/utils/axios'
import { extractError } from '@/utils/apiErrors'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import GithubImportPanel from '@/components/common/GithubImportPanel.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { xs } = useDisplay()
const store = useHarnessStore()
const { showSuccess, showInfo, showError } = useSnackbar() ?? {}
const confirmDialog = useConfirm()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// ─── 상태 ─────────────────────────────────────────
const projects = ref([])         // [{ id, name, owned_at }]
const isLoading = ref(false)
const errorMsg = ref('')
const deletingName = ref('')     // 삭제 중인 project name (로딩 표시용)

const searchInput = ref('')

const filteredProjects = computed(() => {
  const q = searchInput.value.trim().toLowerCase()
  if (!q) return projects.value
  return projects.value.filter(p => p.name.toLowerCase().includes(q))
})

// ─── 신규 프로젝트 폼 ─────────────────────────────
const showAddForm = ref(false)
const newName = ref('')
const addError = ref('')
const isCreating = ref(false)

// [2026-05-26] GitHub 으로 시작 — Vibe Coding entry Phase 1.
const showGithubForm = ref(false)

const startAdd = () => {
  showAddForm.value = true
  showGithubForm.value = false
  newName.value = ''
  addError.value = ''
}
const cancelAdd = () => {
  showAddForm.value = false
  newName.value = ''
  addError.value = ''
}
const startGithubAdd = () => {
  showGithubForm.value = true
  showAddForm.value = false
  newName.value = ''
  addError.value = ''
}
const cancelGithubAdd = () => {
  showGithubForm.value = false
}
const onGithubStarted = () => {
  // submit 성공 → 패널 닫고 모달도 닫음 (백그라운드 폴링이 완료 시 plan 으로 이동).
  showGithubForm.value = false
  emit('update:modelValue', false)
}

const submitAdd = async () => {
  const v = newName.value.trim()
  if (!v) {
    addError.value = t('common.my_projects.name_required')
    return
  }
  // [멀티테넌시 위조 차단] 예약 sentinel('::') 포함 이름은 BE claim 이 400 으로 막지만
  // 입력 단에서 즉시 안내해 왕복 절약.
  if (v.includes('::')) {
    addError.value = t('common.my_projects.name_invalid_char')
    return
  }
  // 이미 같은 이름이 있으면 그냥 선택만 (claim 멱등이지만 네트워크 절약).
  const existing = projects.value.find(p => p.name === v)
  if (existing) {
    selectProject(existing.name)
    return
  }
  // [2026-06] 즉시 등록(claim) — 미팅 로그 없이도 BE 에 OWNS 생성. 신규 프로젝트의
  // pre-claim 403 노이즈를 근본 제거(생성 직후부터 모든 read 통과). dispatcher 의
  // _OWNERSHIP_CREATE 가 quota(402)·동명 타 유저(409) 가드 수행.
  isCreating.value = true
  addError.value = ''
  try {
    // team_id:'' — '내 프로젝트' 모달은 개인 프로젝트 전용. 빈 문자열이면 axios 인터셉터가
    // 활성 팀 컨텍스트를 주입하지 않고('' 는 != null), BE 도 개인 claim 으로 처리한다.
    // (생략하면 stale 팀컨텍스트가 새서 개인 생성이 팀 스코프로 가거나 무료 팀원 402 무음.)
    await axios.post(`${API_BASE}/createProject`, { projectName: v, team_id: '' })
    await load()                  // owned 목록 갱신 → 새 카드 즉시 표시
    store.setProjectName(v)       // 선택 (persist → /home 자동선택에 반영)
    showSuccess?.(t('common.my_projects.created_toast', { name: v }))
    emit('update:modelValue', false)
    // [2026-06] 생성 후 메인(/home)으로 이동. 이미 /home 이면 대시보드가 새 프로젝트를
    // 반영하도록 새로고침(home 의 autoSelectLastProject/loadMyProjects 재실행).
    if (route.path === '/home') {
      window.location.reload()
    } else {
      router.push('/home')
    }
  } catch (e) {
    // 쿼터 402(code=QUOTA_EXCEEDED) → axios 인터셉터가 UpgradePromptDialog 를 띄움(중복 방지).
    // 그 외 모든 에러(비쿼터 402·409·404·5xx)는 폼에 노출 — 무음 실패 방지.
    const detail = e?.response?.data?.detail
    if (e?.response?.status === 402 && detail && typeof detail === 'object' && detail.code === 'QUOTA_EXCEEDED') return
    addError.value = extractError(e, t('common.my_projects.create_failed'))
  } finally {
    isCreating.value = false
  }
}

// ─── 액션 ─────────────────────────────────────────
const close = () => emit('update:modelValue', false)

const load = async () => {
  isLoading.value = true
  errorMsg.value = ''
  const r = await fetchMyProjects()
  isLoading.value = false
  if (r.success) {
    projects.value = r.projects || []
  } else {
    errorMsg.value = r.error || t('common.my_projects.load_failed')
  }
}

const selectProject = (name) => {
  store.setProjectName(name)
  showInfo?.(t('common.my_projects.selected_toast', { name }))
  emit('update:modelValue', false)
}

const deleteProject = async (project) => {
  const ok = await confirmDialog({
    title: t('common.my_projects.delete_confirm_title'),
    message: t('common.my_projects.delete_confirm_message', { name: project.name }),
    variant: 'danger',
    confirmText: t('common.action.delete'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return

  deletingName.value = project.name
  const r = await store.deleteProject(project.name)
  deletingName.value = ''
  if (!r.success) {
    showError?.(r.error || t('common.my_projects.delete_failed'))
    return
  }
  showSuccess?.(t('common.my_projects.deleted_toast', { name: project.name }))
  // 선택된 프로젝트가 삭제됐다면 store 도 정리
  if (store.projectName === project.name) {
    store.setProjectName('')
  }
  emit('update:modelValue', false)
  // [2026-06] 생성과 동일 — 삭제 후 메인(/home)으로 이동. 이미 /home 이면 새로고침해
  // 대시보드(autoSelectLastProject/loadMyProjects)가 삭제 결과를 반영하게 한다.
  if (route.path === '/home') {
    window.location.reload()
  } else {
    router.push('/home')
  }
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return iso.slice(0, 10)
  }
}

// ─── 모달 open 시 리로드 ───────────────────────────
watch(() => props.modelValue, (open) => {
  if (open) {
    searchInput.value = ''
    showAddForm.value = false
    showGithubForm.value = false
    newName.value = ''
    addError.value = ''
    load()
  }
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="xs ? undefined : 580"
    :fullscreen="xs"
    @update:model-value="(v) => !v && close()"
  >
    <div class="mp-modal">
      <header class="mp-header">
        <FolderOpen :size="20" class="mp-header-icon" />
        <h3 class="mp-title">
          {{ $t('common.my_projects.title') }}
          <span v-if="!isLoading" class="mp-count">{{ projects.length }}</span>
        </h3>
        <button class="mp-icon-btn" @click="load" :title="$t('common.my_projects.refresh')" :disabled="isLoading">
          <RefreshCw :size="15" :class="{ spin: isLoading }" />
        </button>
        <button class="mp-icon-btn" @click="close" :aria-label="$t('common.action.close')">
          <X :size="18" />
        </button>
      </header>

      <div class="mp-body">
        <!-- 검색 + 신규 -->
        <div class="mp-toolbar">
          <div class="mp-search">
            <Search :size="14" class="mp-search-icon" />
            <input
              v-model="searchInput"
              type="text"
              class="mp-search-input"
              :placeholder="$t('common.my_projects.search_placeholder')"
            />
          </div>
          <div v-if="!showAddForm && !showGithubForm" class="mp-add-btn-group">
            <button class="mp-add-btn" @click="startAdd" type="button">
              <Plus :size="13" class="mr-1" />{{ $t('common.my_projects.new_project') }}
            </button>
            <button class="mp-add-btn mp-add-btn--github" @click="startGithubAdd" type="button" :title="$t('common.my_projects.github_start_title')">
              <Github :size="13" class="mr-1" />{{ $t('common.my_projects.github_start') }}
            </button>
          </div>
        </div>

        <!-- [2026-05-26] GitHub 으로 시작 — Vibe Coding entry Phase 1 -->
        <GithubImportPanel
          v-if="showGithubForm"
          @cancel="cancelGithubAdd"
          @started="onGithubStarted"
        />

        <!-- 신규 폼 -->
        <div v-if="showAddForm" class="mp-add-form">
          <input
            v-model="newName"
            type="text"
            class="mp-add-input"
            :placeholder="$t('common.my_projects.name_placeholder')"
            autofocus
            :disabled="isCreating"
            @keydown.enter="submitAdd"
            @keydown.esc="cancelAdd"
            maxlength="50"
          />
          <button class="mp-add-confirm" @click="submitAdd" :disabled="isCreating">
            <Loader2 v-if="isCreating" :size="13" class="spin mr-1" />
            <Check v-else :size="13" class="mr-1" />{{ $t('common.my_projects.create_btn') }}
          </button>
          <button class="mp-add-cancel" @click="cancelAdd" :disabled="isCreating">
            <X :size="13" />
          </button>
        </div>
        <p v-if="addError" class="mp-add-error">
          <AlertCircle :size="12" class="mr-1" />{{ addError }}
        </p>

        <!-- 로딩 / 에러 -->
        <div v-if="isLoading && projects.length === 0" class="mp-loading">
          <Loader2 :size="20" class="spin mr-2" />
          <span>{{ $t('common.my_projects.loading') }}</span>
        </div>
        <div v-else-if="errorMsg" class="mp-error">
          <AlertCircle :size="14" class="mr-1" />{{ errorMsg }}
        </div>

        <!-- 빈 상태 -->
        <div v-else-if="projects.length === 0" class="mp-empty">
          <FolderOpen :size="32" class="mp-empty-icon" />
          <p class="mp-empty-title">{{ $t('common.my_projects.empty_title') }}</p>
          <p class="mp-empty-desc">{{ $t('common.my_projects.empty_desc') }}</p>
        </div>

        <!-- 카드 리스트 -->
        <ul v-else class="mp-list">
          <li
            v-for="p in filteredProjects"
            :key="p.name"
            class="mp-card"
            :class="{ 'mp-card--active': p.name === store.projectName }"
          >
            <button
              class="mp-card-body"
              @click="selectProject(p.name)"
              :disabled="deletingName === p.name"
            >
              <span class="mp-card-name">{{ p.name }}</span>
              <span class="mp-card-meta">
                <span v-if="p.name === store.projectName" class="mp-card-badge">{{ $t('common.my_projects.selected_badge') }}</span>
                <span class="mp-card-date">{{ fmtDate(p.owned_at) }}</span>
              </span>
            </button>
            <button
              class="mp-card-delete"
              @click="deleteProject(p)"
              :disabled="deletingName === p.name"
              :title="$t('common.my_projects.delete_title_attr')"
              :aria-label="$t('common.action.delete')"
            >
              <Loader2 v-if="deletingName === p.name" :size="14" class="spin" />
              <Trash2 v-else :size="14" />
            </button>
          </li>
          <li v-if="filteredProjects.length === 0" class="mp-empty-search">
            {{ $t('common.my_projects.no_search_match', { query: searchInput }) }}
          </li>
        </ul>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.mp-modal {
  background: #fff;
  border-radius: 14px;
  font-family: 'Pretendard', sans-serif;
  overflow: hidden;
}
@media (max-width: 600px) {
  .mp-modal { border-radius: 0; min-height: 100dvh; display: flex; flex-direction: column; }
  .mp-body { flex: 1; overflow-y: auto; }
}

.mp-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.mp-header-icon { color: var(--accent, #8C6239); }
.mp-title { flex: 1; margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-main); }
.mp-count {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  background: var(--accent, #8C6239);
  color: white;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  vertical-align: middle;
}
.mp-icon-btn {
  background: transparent; border: none;
  color: var(--text-muted, #6F665F);
  padding: 4px; border-radius: 6px;
  cursor: pointer;
}
.mp-icon-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.05); }
.mp-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mp-body {
  padding: 14px 18px 18px;
}

.mp-toolbar {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.mp-search {
  flex: 1;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  border-radius: 8px;
  padding: 6px 10px;
  background: white;
}
.mp-search-icon { color: var(--text-muted); flex-shrink: 0; }
.mp-search-input {
  flex: 1;
  border: none; outline: none; background: transparent;
  font-size: 0.85rem; font-family: inherit;
  min-width: 0;
}
.mp-add-btn-group {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}
.mp-add-btn {
  display: inline-flex; align-items: center;
  background: var(--accent, #8C6239);
  color: white;
  border: none; border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.mp-add-btn:hover { transform: translateY(-1px); }
.mp-add-btn--github {
  background: #1f2328;
}
.mp-add-btn--github:hover {
  background: #0a0c0e;
}
@media (max-width: 600px) {
  /* [2026-06] 모바일 반응형 수정 — 기존엔 검색창(flex:1)과 버튼 그룹을 한 줄에 욱여넣어
     'New project'·'Start with GitHub' 버튼이 화면 밖으로 잘려 나갔다(toolbar 가 flex-row
     인데 wrap 도 없고 세로 전환도 안 됨). 툴바를 세로로 쌓아 검색은 풀폭, 버튼 그룹은
     그 아래 풀폭 2등분으로 배치 → 어떤 폭에서도 잘림 없이 탭 가능. */
  .mp-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .mp-add-btn-group {
    width: 100%;
  }
  .mp-add-btn-group .mp-add-btn {
    flex: 1;
    justify-content: center;
    padding: 10px 12px;   /* 터치 타깃 확대(권장 최소 44px 높이에 근접) */
    font-size: 0.82rem;
  }
}

.mp-add-form {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 8px;
}
.mp-add-input {
  flex: 1;
  border: 1.5px solid var(--accent, #8C6239);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.85rem; font-family: inherit;
  outline: none; background: white;
}
.mp-add-confirm, .mp-add-cancel {
  display: inline-flex; align-items: center;
  border: none; border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.mp-add-confirm { background: #10b981; color: white; }
.mp-add-confirm:hover { background: #059669; }
.mp-add-cancel { background: rgba(0,0,0,0.05); color: var(--text-muted); }
.mp-add-cancel:hover { background: rgba(0,0,0,0.08); }

.mp-add-error {
  display: inline-flex; align-items: center;
  font-size: 0.72rem; color: #b91c1c;
  margin: 0 0 10px;
}

.mp-loading, .mp-error {
  display: flex; align-items: center;
  padding: 24px;
  font-size: 0.85rem; color: var(--text-muted);
}
.mp-error { background: #fef2f2; color: #b91c1c; border-radius: 8px; }

.mp-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 36px 18px 24px;
  text-align: center;
}
.mp-empty-icon { color: var(--text-muted); opacity: 0.4; margin-bottom: 10px; }
.mp-empty-title { font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin: 0 0 4px; }
.mp-empty-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; line-height: 1.5; }

.mp-list {
  list-style: none;
  padding: 4px 4px 4px 0;
  margin: 0;
  /* [2026-05-21] 프로젝트 카드 수에 무관하게 모달 높이 고정 — 5장 ≈ 380px.
     이상은 내부 스크롤. 뷰포트 작을 때도 50vh 로 자동 축소. */
  max-height: min(380px, 50vh);
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 6px;
  /* 스크롤바를 살짝 보이게 — 사용자가 스크롤 가능함을 인지 */
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 98, 57, 0.35) transparent;
}
.mp-list::-webkit-scrollbar { width: 8px; }
.mp-list::-webkit-scrollbar-track { background: transparent; }
.mp-list::-webkit-scrollbar-thumb {
  background: rgba(140, 98, 57, 0.3);
  border-radius: 4px;
}
.mp-list::-webkit-scrollbar-thumb:hover { background: rgba(140, 98, 57, 0.5); }

.mp-card {
  display: flex; align-items: stretch;
  border: 1.5px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.mp-card:hover { border-color: var(--accent, #8C6239); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.mp-card--active {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.04);
}

.mp-card-body {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: flex-start; gap: 3px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.mp-card-body:disabled { opacity: 0.5; cursor: not-allowed; }
.mp-card-name {
  font-size: 0.88rem; font-weight: 700; color: var(--text-main);
}
.mp-card-meta {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.7rem; color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.mp-card-badge {
  background: var(--accent, #8C6239);
  color: white;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 0.62rem; font-weight: 700;
}
.mp-card-date {}

.mp-card-delete {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px;
  background: transparent;
  border: none; border-left: 1px solid var(--border-light, rgba(0,0,0,0.06));
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.mp-card-delete:hover:not(:disabled) {
  background: #fef2f2;
  color: #b91c1c;
}
.mp-card-delete:disabled { opacity: 0.5; cursor: not-allowed; }

.mp-empty-search {
  padding: 18px;
  font-size: 0.78rem; color: var(--text-muted);
  text-align: center;
  font-style: italic;
}

.mr-1 { margin-right: 4px; }
.mr-2 { margin-right: 6px; }
</style>
