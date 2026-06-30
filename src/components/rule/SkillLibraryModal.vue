<script setup>
/**
 * SkillLibraryModal — 유저 단위 스킬 보관함 (모달).
 *
 * [레이아웃]
 *   ┌── Header: 제목 + Free/Pro 한도 칩 + ✕ ──────────────────────────────┐
 *   ├── 좌(폴더 트리) / 중(스킬 그리드 + 검색) / 우(스킬 상세) ──────────┤
 *   └── Footer: 일괄 액션 (선택 가져오기 / 프로젝트 가져오기) ───────────┘
 *
 * [상태 흐름]
 *   1. open=true 시 useSkillLibraryStore.load() (캐시 30s)
 *   2. 폴더 클릭 → selectedFolderId 변경 → 우측 스킬 리스트 갱신
 *   3. 스킬 카드 클릭 → selectedSkillId → 우측 상세
 *   4. 다중선택 모드 → 체크박스 토글 → bulk import 가능
 *
 * [FE-3 의존]
 * 폴더 생성/편집/삭제/스킬 편집/import-conflict 다이얼로그는 emit 으로 위임 —
 * 부모(RuleGeneratorTab) 가 FE-3 다이얼로그 컴포넌트 mount 후 응답.
 *
 * [FE-4 의존]
 * 드래그앤드롭 (스킬 → 폴더 이동) 은 FE-4 에서 데코레이션 추가. 지금은 클릭만.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { formatInt } from '@/utils/format'
import { useDisplay } from 'vuetify'
import {
  X, Folder, FolderPlus, FolderOpen, Plus, Search, Crown, Sparkles,
  Pencil, Trash2, AlertCircle, Loader2, ArrowDown,
  ArrowUp, CheckSquare, Square, FileCheck2, ChevronDown, ChevronUp,
} from 'lucide-vue-next'
import { useSkillLibraryStore } from '@/store/skillLibrary'
import { getTierLabel, isPaidTier } from '@/utils/subscription'

// 반응형 break point — Vuetify 의 useDisplay 활용.
//   xs: <600px (모바일)        — 폴더 chips 가로 스크롤 + 카드 인라인 expand
//   sm/md (600~1280px)        — 폴더 pane 좌측 + 카드 인라인 expand (detail pane 숨김)
//   lg+ (1280px+)             — 3분할 (폴더 + 카드 그리드 + 우측 detail pane)
const { xs, mdAndDown } = useDisplay()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 현재 활성 프로젝트 이름 — Import/Export 시 사용. */
  projectName: { type: String, default: '' },
  /** 현재 프로젝트의 스킬 ID 목록 — "이미 가져옴" 표시용. */
  currentProjectSkillIds: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:modelValue',
  'request-folder-create',          // FE-3 의 FolderEditDialog 열기
  'request-folder-edit',             // payload: folder 객체
  'request-folder-delete',           // payload: folder
  'request-skill-create',            // payload: { folderId }
  'request-skill-edit',              // payload: skill
  'request-skill-delete',            // payload: skill
  'request-import-from-project',     // payload: { folderId } — 프로젝트 → 라이브러리
  'request-export-to-project',       // payload: { skillIds } — 라이브러리 → 프로젝트
])

const store = useSkillLibraryStore()

// ─── 상태 ────────────────────────────────────────────
const selectedFolderId = ref(null)
const selectedSkillId = ref(null)
const searchQuery = ref('')
const isSelectMode = ref(false)
const selectedSkillIds = ref([])      // 다중선택 시 체크된 스킬 ID

// [FE-4c] 드래그앤드롭 — 스킬 카드 → 폴더 이동.
const draggingSkillId = ref(null)
const dragOverFolderId = ref(null)

// [Mobile fix 2026-05] 데스크탑(lg+) 외에는 우측 detail pane 숨김 — 카드 인라인 expand 로 대체.
// 모바일/태블릿에서 카드 클릭 = expand 토글, 데스크탑에서는 카드 클릭 = detail pane 갱신.
const useInlineExpand = computed(() => mdAndDown.value)  // <1280px
const expandedSkillId = ref(null)  // 인라인 모드에서 expand 된 카드 id

// 카드 클릭 핸들러 — 모드별 동작
const onClickSkillCard = (skill) => {
  if (isSelectMode.value) {
    toggleSkillCheck(skill.id)
    return
  }
  if (useInlineExpand.value) {
    // 모바일/태블릿: 같은 카드 토글, 다른 카드면 그 카드로
    expandedSkillId.value = expandedSkillId.value === skill.id ? null : skill.id
    selectedSkillId.value = skill.id
  } else {
    // 데스크탑: 우측 detail pane 갱신
    selectedSkillId.value = skill.id
  }
}

// ─── 모달 열림 시 자동 로드 ──────────────────────────
watch(() => props.modelValue, async (isOpen) => {
  if (!isOpen) return
  await store.load()
  // 첫 폴더 자동 선택
  if (!selectedFolderId.value && store.folders.length > 0) {
    selectedFolderId.value = store.folders[0].id
  }
})

onMounted(async () => {
  if (props.modelValue) {
    await store.load()
    if (!selectedFolderId.value && store.folders.length > 0) {
      selectedFolderId.value = store.folders[0].id
    }
  }
})

// store 갱신 시 선택된 폴더가 없어졌으면 첫 번째로 재설정
watch(() => store.folders, (folders) => {
  if (folders.length === 0) {
    selectedFolderId.value = null
    selectedSkillId.value = null
    return
  }
  if (!selectedFolderId.value || !folders.find(f => f.id === selectedFolderId.value)) {
    selectedFolderId.value = folders[0].id
    selectedSkillId.value = null
  }
})

// ─── derived ─────────────────────────────────────────
const currentFolder = computed(() => store.folderById(selectedFolderId.value))
const currentSkills = computed(() => store.skillsInFolder(selectedFolderId.value))
const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return currentSkills.value
  return currentSkills.value.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q)),
  )
})
const selectedSkill = computed(() =>
  store.skillsById.get(selectedSkillId.value) || null,
)
const projectSkillIdSet = computed(() => new Set(props.currentProjectSkillIds || []))

const close = () => emit('update:modelValue', false)

// ─── 다중선택 ─────────────────────────────────────────
const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) selectedSkillIds.value = []
}
const isSkillChecked = (id) => selectedSkillIds.value.includes(id)
const toggleSkillCheck = (id) => {
  if (selectedSkillIds.value.includes(id)) {
    selectedSkillIds.value = selectedSkillIds.value.filter(x => x !== id)
  } else {
    selectedSkillIds.value = [...selectedSkillIds.value, id]
  }
}
const isAllChecked = computed(() =>
  filteredSkills.value.length > 0 &&
  filteredSkills.value.every(s => selectedSkillIds.value.includes(s.id)),
)
const toggleAllChecked = () => {
  if (isAllChecked.value) {
    const ids = new Set(filteredSkills.value.map(s => s.id))
    selectedSkillIds.value = selectedSkillIds.value.filter(id => !ids.has(id))
  } else {
    const ids = filteredSkills.value.map(s => s.id)
    selectedSkillIds.value = [...new Set([...selectedSkillIds.value, ...ids])]
  }
}

// ─── 액션 (대부분 emit 으로 부모에게 다이얼로그 요청) ─────
const onClickFolder = (folder) => {
  selectedFolderId.value = folder.id
  selectedSkillId.value = null
}
const onCreateFolder = () => emit('request-folder-create')
const onEditFolder = (folder) => emit('request-folder-edit', folder)
const onDeleteFolder = (folder) => emit('request-folder-delete', folder)
const onCreateSkill = () => {
  if (!selectedFolderId.value) return
  emit('request-skill-create', { folderId: selectedFolderId.value })
}
const onEditSkill = (skill) => emit('request-skill-edit', skill)
const onDeleteSkill = (skill) => emit('request-skill-delete', skill)
const onImportFromProject = () => {
  if (!selectedFolderId.value) return
  emit('request-import-from-project', { folderId: selectedFolderId.value })
}
const onExportSelected = () => {
  if (selectedSkillIds.value.length === 0) return
  emit('request-export-to-project', { skillIds: [...selectedSkillIds.value] })
}
const onExportSingle = (skill) => emit('request-export-to-project', { skillIds: [skill.id] })

// ─── [FE-4c] 드래그앤드롭 — 스킬 카드 → 폴더 이동 ──────
const onSkillDragStart = (skill, event) => {
  draggingSkillId.value = skill.id
  // 드래그 이미지 + payload (HTML5 drag API)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', skill.id)
}
const onSkillDragEnd = () => {
  draggingSkillId.value = null
  dragOverFolderId.value = null
}
const onFolderDragOver = (folder, event) => {
  // 드롭 허용 (preventDefault 안 하면 drop 안 됨)
  if (!draggingSkillId.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverFolderId.value = folder.id
}
const onFolderDragLeave = (folder) => {
  if (dragOverFolderId.value === folder.id) {
    dragOverFolderId.value = null
  }
}
const onFolderDrop = async (folder, event) => {
  event.preventDefault()
  const skillId = draggingSkillId.value || event.dataTransfer.getData('text/plain')
  draggingSkillId.value = null
  dragOverFolderId.value = null
  if (!skillId) return
  const skill = store.skillsById.get(skillId)
  if (!skill) return
  // 같은 폴더로 드롭은 no-op
  if (skill.folder_id === folder.id) return
  // 폴더 이동 — store.updateSkill 이 folder_id 변경하면 자동 처리
  await store.updateSkill(skillId, { folder_id: folder.id })
}

// ─── 카드 메타 표시 헬퍼 ──────────────────────────────
const priorityClass = (p) => {
  if (p === 'High') return 'priority-high'
  if (p === 'Low') return 'priority-low'
  return 'priority-medium'
}
const fmt = formatInt
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1180"
    persistent
    scrollable
    @update:model-value="(v) => !v && close()"
  >
    <div class="sl-modal">
      <!-- ── Header ────────────────────────────────────────── -->
      <header class="sl-header">
        <div class="sl-header-left">
          <FolderOpen :size="22" class="sl-header-icon" />
          <h2 class="sl-title">{{ $t('rule.library.title') }}</h2>
          <div class="sl-desc">{{ $t('rule.library.desc') }}</div>
        </div>
        <div class="sl-header-right">
          <div
            class="sl-quota-pill"
            :class="{
              'sl-quota-pill--warning': store.atRiskOfLimit,
              'sl-quota-pill--danger': store.isAtLimit,
            }"
            :title="$t('rule.library.tier_quota_title', { tier: getTierLabel(store.subscriptionType) })"
          >
            <Crown v-if="isPaidTier(store.subscriptionType)" :size="11" class="mr-1" />
            <span class="sl-quota-label">
              {{ getTierLabel(store.subscriptionType) }}
            </span>
            <span class="sl-quota-numbers">
              {{ fmt(store.totalSkillCount) }} / {{ fmt(store.skillLimit) }}
            </span>
          </div>
          <button class="sl-close-btn" @click="close" :aria-label="$t('common.action.close')">
            <X :size="20" />
          </button>
        </div>
      </header>

      <!-- ── Loading / Error overlay ───────────────────────── -->
      <div v-if="store.isLoading && store.entries.length === 0" class="sl-state-overlay">
        <Loader2 :size="32" class="sl-spin" />
        <p>{{ $t('rule.library.loading') }}</p>
      </div>
      <div v-else-if="store.errorMsg" class="sl-state-overlay sl-state-overlay--error">
        <AlertCircle :size="32" />
        <p>{{ store.errorMsg }}</p>
        <button class="sl-btn-secondary" @click="store.load({ force: true })">{{ $t('common.action.retry') }}</button>
      </div>

      <!-- ── 빈 상태 (backend 자동 init 이 있어서 사실상 안 보임. 안전망) ── -->
      <div v-else-if="store.isEmpty" class="sl-empty">
        <FolderOpen :size="48" class="sl-empty-icon" />
        <h3>{{ $t('rule.library.empty_title') }}</h3>
        <p>{{ $t('rule.library.empty_desc') }}</p>
        <div class="sl-empty-actions">
          <button class="sl-btn-primary" @click="onCreateFolder">
            <FolderPlus :size="14" class="mr-2" /> {{ $t('rule.library.create_folder') }}
          </button>
          <button class="sl-btn-secondary" @click="onImportFromProject" :disabled="!projectName">
            <ArrowDown :size="14" class="mr-2" /> {{ $t('rule.library.import_from_project') }}
          </button>
        </div>
      </div>

      <!-- ── 메인 3분할 ───────────────────────────────────── -->
      <div v-else class="sl-body">
        <!-- 좌: 폴더 트리 -->
        <aside class="sl-folder-pane" :aria-label="$t('rule.library.folder_list_aria')">
          <div class="sl-section-header">
            <Folder :size="14" class="mr-1" /><span>{{ $t('rule.library.folders') }}</span>
            <button class="sl-icon-btn ml-auto" @click="onCreateFolder" :title="$t('rule.library.create_folder')">
              <FolderPlus :size="14" />
            </button>
          </div>
          <ul class="sl-folder-list" role="listbox">
            <li
              v-for="folder in store.folders"
              :key="folder.id"
              class="sl-folder-item"
              :class="{
                'sl-folder-item--active': folder.id === selectedFolderId,
                'sl-folder-item--drop-target': dragOverFolderId === folder.id,
              }"
              @click="onClickFolder(folder)"
              @dragover="onFolderDragOver(folder, $event)"
              @dragleave="onFolderDragLeave(folder)"
              @drop="onFolderDrop(folder, $event)"
              role="option"
              :aria-selected="folder.id === selectedFolderId"
            >
              <span
                class="sl-folder-dot"
                :style="{ background: folder.color || '#6b7280' }"
                aria-hidden="true"
              />
              <span class="sl-folder-name" :title="folder.name">{{ folder.name }}</span>
              <span class="sl-folder-count">
                {{ store.entriesByFolderId.get(folder.id)?.skills.length ?? 0 }}
              </span>
              <span class="sl-folder-actions">
                <button class="sl-icon-btn" @click.stop="onEditFolder(folder)" :title="$t('rule.library.edit_folder')">
                  <Pencil :size="12" />
                </button>
                <button class="sl-icon-btn sl-icon-btn--danger" @click.stop="onDeleteFolder(folder)" :title="$t('rule.library.delete_folder')">
                  <Trash2 :size="12" />
                </button>
              </span>
            </li>
          </ul>
        </aside>

        <!-- 중: 스킬 그리드 -->
        <section class="sl-grid-pane" :aria-label="$t('rule.library.skill_list_aria')">
          <!-- [Mobile fix] xs(<600px) 에서만 폴더 chips 가로 스크롤 — 폴더 pane 이 숨겨지므로 -->
          <div v-if="xs" class="sl-mobile-folder-chips" role="tablist" :aria-label="$t('rule.library.folder_select_aria')">
            <button
              v-for="folder in store.folders"
              :key="folder.id"
              type="button"
              class="sl-folder-chip"
              :class="{ 'sl-folder-chip--active': folder.id === selectedFolderId }"
              role="tab"
              :aria-selected="folder.id === selectedFolderId"
              @click="onClickFolder(folder)"
            >
              <span class="sl-folder-dot" :style="{ background: folder.color || '#6b7280' }" />
              <span>{{ folder.name }}</span>
              <span class="sl-folder-chip-count">
                {{ store.entriesByFolderId.get(folder.id)?.skills.length ?? 0 }}
              </span>
            </button>
            <button
              type="button"
              class="sl-folder-chip sl-folder-chip--add"
              @click="onCreateFolder"
              :title="$t('rule.library.create_folder')"
            >
              <FolderPlus :size="11" class="mr-1" />{{ $t('rule.library.folder_chip_add') }}
            </button>
          </div>

          <!-- 검색 + 액션 -->
          <div class="sl-grid-toolbar">
            <div class="sl-search">
              <Search :size="14" class="sl-search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="$t('rule.library.search_placeholder')"
                class="sl-search-input"
              />
            </div>
            <button
              class="sl-btn-secondary sl-btn-sm"
              :class="{ 'sl-btn-active': isSelectMode }"
              @click="toggleSelectMode"
              :title="$t('rule.library.select_mode_title')"
            >
              <CheckSquare v-if="isSelectMode" :size="12" class="mr-1" />
              <Square v-else :size="12" class="mr-1" />
              <span>{{ $t('rule.library.select_mode') }}</span>
            </button>
            <button class="sl-btn-secondary sl-btn-sm" @click="onImportFromProject" :disabled="!projectName">
              <ArrowDown :size="12" class="mr-1" /> {{ $t('rule.library.from_project') }}
            </button>
            <button class="sl-btn-primary sl-btn-sm" @click="onCreateSkill">
              <Plus :size="12" class="mr-1" /> {{ $t('rule.library.add_skill') }}
            </button>
          </div>

          <!-- 폴더 헤더 (현재 폴더 정보) -->
          <div v-if="currentFolder" class="sl-folder-banner">
            <span class="sl-folder-dot" :style="{ background: currentFolder.color || '#6b7280' }" />
            <div class="sl-folder-meta">
              <strong>{{ currentFolder.name }}</strong>
              <span v-if="currentFolder.description" class="sl-folder-desc">
                — {{ currentFolder.description }}
              </span>
              <span v-if="currentFolder.category" class="sl-folder-category">
                #{{ currentFolder.category }}
              </span>
            </div>
            <span class="sl-folder-counter">{{ $t('rule.library.count_unit', { count: currentSkills.length }) }}</span>
          </div>

          <!-- 선택 모드 — 전체 선택 -->
          <div v-if="isSelectMode && filteredSkills.length > 0" class="sl-bulk-row">
            <button class="sl-check-all-btn" @click="toggleAllChecked">
              <component :is="isAllChecked ? CheckSquare : Square" :size="14" class="mr-2" />
              {{ $t('rule.library.select_all', { selected: selectedSkillIds.length, total: filteredSkills.length }) }}
            </button>
          </div>

          <!-- 스킬 카드 그리드 -->
          <div v-if="filteredSkills.length > 0" class="sl-skill-grid">
            <article
              v-for="skill in filteredSkills"
              :key="skill.id"
              class="sl-skill-card"
              :class="{
                'sl-skill-card--active': skill.id === selectedSkillId && !useInlineExpand,
                'sl-skill-card--checked': isSelectMode && isSkillChecked(skill.id),
                'sl-skill-card--dragging': draggingSkillId === skill.id,
                'sl-skill-card--expanded': useInlineExpand && expandedSkillId === skill.id,
              }"
              tabindex="0"
              :draggable="!isSelectMode"
              @click="onClickSkillCard(skill)"
              @keydown.enter="onClickSkillCard(skill)"
              @dragstart="onSkillDragStart(skill, $event)"
              @dragend="onSkillDragEnd"
            >
              <header class="sl-skill-card-header">
                <CheckSquare v-if="isSelectMode && isSkillChecked(skill.id)" :size="14" class="sl-card-check sl-card-check--on" />
                <Square v-else-if="isSelectMode" :size="14" class="sl-card-check" />
                <span class="sl-skill-name" :title="skill.name">{{ skill.name }}</span>
                <span class="sl-priority-pill" :class="priorityClass(skill.priority)">
                  {{ skill.priority }}
                </span>
                <!-- 모바일/태블릿: expand 토글 hint chevron -->
                <component
                  v-if="useInlineExpand && !isSelectMode"
                  :is="expandedSkillId === skill.id ? ChevronUp : ChevronDown"
                  :size="14"
                  class="sl-expand-chevron"
                />
              </header>
              <div v-if="skill.tags && skill.tags.length > 0" class="sl-skill-tags">
                <span v-for="t in skill.tags.slice(0, 3)" :key="t" class="sl-tag">#{{ t }}</span>
                <span v-if="skill.tags.length > 3" class="sl-tag-more">+{{ skill.tags.length - 3 }}</span>
              </div>
              <footer class="sl-skill-card-footer">
                <span class="sl-rule-count">
                  <FileCheck2 :size="11" class="mr-1" />
                  {{ $t('rule.library.rule_count', { count: skill.instructions?.length ?? 0 }) }}
                </span>
                <span v-if="projectSkillIdSet.has(skill.id)" class="sl-already-in-project" :title="$t('rule.library.already_in_project_title')">
                  {{ $t('rule.library.already_in_project') }}
                </span>
              </footer>

              <!-- [Mobile fix 2026-05] 모바일/태블릿에서 카드 클릭 시 인라인 expand 상세 -->
              <section
                v-if="useInlineExpand && expandedSkillId === skill.id"
                class="sl-card-inline-detail"
                @click.stop
              >
                <dl class="sl-inline-fields">
                  <div v-if="skill.scope" class="sl-inline-field">
                    <dt>{{ $t('rule.library.field_scope') }}</dt><dd>{{ skill.scope }}</dd>
                  </div>
                  <div v-if="skill.trigger_condition" class="sl-inline-field">
                    <dt>{{ $t('rule.library.field_trigger') }}</dt><dd>{{ skill.trigger_condition }}</dd>
                  </div>
                  <div v-if="skill.instructions && skill.instructions.length > 0" class="sl-inline-field">
                    <dt>{{ $t('rule.library.field_instructions', { count: skill.instructions.length }) }}</dt>
                    <dd>
                      <ul class="sl-instruction-list">
                        <li v-for="(line, idx) in skill.instructions" :key="idx">
                          <FileCheck2 :size="11" class="mr-1" /><span>{{ line }}</span>
                        </li>
                      </ul>
                    </dd>
                  </div>
                </dl>
                <div class="sl-inline-actions">
                  <button class="sl-btn-secondary sl-btn-sm" @click.stop="onEditSkill(skill)">
                    <Pencil :size="12" class="mr-1" />{{ $t('common.action.edit') }}
                  </button>
                  <button class="sl-btn-secondary sl-btn-sm sl-btn-danger" @click.stop="onDeleteSkill(skill)">
                    <Trash2 :size="12" class="mr-1" />{{ $t('common.action.delete') }}
                  </button>
                  <button
                    class="sl-btn-primary sl-btn-sm"
                    @click.stop="onExportSingle(skill)"
                    :disabled="!projectName"
                  >
                    <ArrowUp :size="12" class="mr-1" />{{ $t('rule.library.import_single') }}
                  </button>
                </div>
              </section>
            </article>
          </div>

          <!-- 빈 폴더 / 검색 결과 없음 -->
          <div v-else class="sl-grid-empty">
            <template v-if="searchQuery">
              <Search :size="32" class="sl-empty-icon-sm" />
              <p>{{ $t('rule.library.search_no_match', { query: searchQuery }) }}</p>
            </template>
            <template v-else>
              <Folder :size="32" class="sl-empty-icon-sm" />
              <p>{{ $t('rule.library.empty_folder') }}</p>
              <button class="sl-btn-primary sl-btn-sm" @click="onCreateSkill">
                <Plus :size="12" class="mr-1" /> {{ $t('rule.library.add_skill') }}
              </button>
            </template>
          </div>
        </section>

        <!-- 우: 스킬 상세 -->
        <aside class="sl-detail-pane" :aria-label="$t('rule.library.detail_aria')">
          <div v-if="selectedSkill" class="sl-detail-content">
            <header class="sl-detail-header">
              <h3 class="sl-detail-title">{{ selectedSkill.name }}</h3>
              <span class="sl-priority-pill" :class="priorityClass(selectedSkill.priority)">
                {{ selectedSkill.priority }}
              </span>
            </header>

            <dl class="sl-detail-fields">
              <div v-if="selectedSkill.scope" class="sl-detail-field">
                <dt>{{ $t('rule.library.field_scope') }}</dt>
                <dd>{{ selectedSkill.scope }}</dd>
              </div>
              <div v-if="selectedSkill.trigger_condition" class="sl-detail-field">
                <dt>{{ $t('rule.library.field_trigger') }}</dt>
                <dd>{{ selectedSkill.trigger_condition }}</dd>
              </div>
              <div class="sl-detail-field">
                <dt>{{ $t('rule.library.field_instructions', { count: selectedSkill.instructions?.length ?? 0 }) }}</dt>
                <dd>
                  <ul v-if="selectedSkill.instructions && selectedSkill.instructions.length > 0" class="sl-instruction-list">
                    <li v-for="(line, idx) in selectedSkill.instructions" :key="idx">
                      <FileCheck2 :size="11" class="mr-1" />
                      <span>{{ line }}</span>
                    </li>
                  </ul>
                  <span v-else class="sl-empty-text">{{ $t('rule.library.detail_instructions_none') }}</span>
                </dd>
              </div>
              <div v-if="selectedSkill.tags && selectedSkill.tags.length > 0" class="sl-detail-field">
                <dt>{{ $t('rule.library.field_tags') }}</dt>
                <dd class="sl-detail-tags">
                  <span v-for="t in selectedSkill.tags" :key="t" class="sl-tag">#{{ t }}</span>
                </dd>
              </div>
            </dl>

            <div class="sl-detail-actions">
              <button class="sl-btn-secondary sl-btn-sm" @click="onEditSkill(selectedSkill)">
                <Pencil :size="12" class="mr-1" /> {{ $t('common.action.edit') }}
              </button>
              <button class="sl-btn-secondary sl-btn-sm sl-btn-danger" @click="onDeleteSkill(selectedSkill)">
                <Trash2 :size="12" class="mr-1" /> {{ $t('common.action.delete') }}
              </button>
              <button
                class="sl-btn-primary sl-btn-sm"
                @click="onExportSingle(selectedSkill)"
                :disabled="!projectName"
                :title="projectName ? $t('rule.library.import_single_title') : $t('rule.library.import_single_title_no_project')"
              >
                <ArrowUp :size="12" class="mr-1" /> {{ $t('rule.library.import_single') }}
              </button>
            </div>
          </div>
          <div v-else class="sl-detail-empty">
            <Sparkles :size="32" class="sl-empty-icon-sm" />
            <p v-html="$t('rule.library.detail_empty_html')"></p>
          </div>
        </aside>
      </div>

      <!-- ── Footer: 일괄 액션 ───────────────────────────── -->
      <footer v-if="!store.isEmpty" class="sl-footer">
        <div class="sl-footer-left">
          <span v-if="isSelectMode && selectedSkillIds.length > 0" class="sl-selected-count">
            {{ $t('rule.library.selected_count', { count: selectedSkillIds.length }) }}
          </span>
        </div>
        <div class="sl-footer-right">
          <button
            v-if="isSelectMode"
            class="sl-btn-primary sl-btn-md"
            :disabled="selectedSkillIds.length === 0 || !projectName"
            @click="onExportSelected"
          >
            <ArrowUp :size="14" class="mr-2" /> {{ $t('rule.library.export_selected', { count: selectedSkillIds.length }) }}
          </button>
          <button class="sl-btn-secondary sl-btn-md" @click="close">{{ $t('common.action.close') }}</button>
        </div>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
/* ===== 기본 ===== */
.sl-modal {
  background: #ffffff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  height: 82vh;
  max-height: 820px;
  overflow: hidden;
  font-family: 'Pretendard', sans-serif;
}
/* [Mobile fix 2026-05] 모바일에서 모달 거의 풀스크린 — 작은 화면에서 라이브러리 잘 보이게 */
@media (max-width: 600px) {
  .sl-modal {
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
}

/* ===== Header ===== */
.sl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
  gap: 12px;
}
.sl-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
/* [Mobile fix] 모바일에서 헤더 padding 축소 + 설명 텍스트 숨김 (이미 < 900 에서 숨김) */
@media (max-width: 600px) {
  .sl-header { padding: 14px 16px; gap: 8px; }
  .sl-title { font-size: 0.95rem; }
  .sl-quota-pill { padding: 4px 8px; font-size: 0.68rem; }
  .sl-quota-label { display: none; }  /* "Free/Pro" 텍스트는 숨기고 숫자만 */
}
.sl-header-icon { color: var(--accent, #8C6239); flex-shrink: 0; }
.sl-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main, #2A2421);
  margin: 0;
}
.sl-desc {
  font-size: 0.78rem;
  color: var(--text-muted, #6F665F);
  margin-left: 10px;
  display: none;
}
@media (min-width: 900px) { .sl-desc { display: inline; } }

.sl-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sl-quota-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-main, #2A2421);
  font-variant-numeric: tabular-nums;
}
.sl-quota-pill--warning { background: #fef3c7; border-color: #fbbf24; color: #92400e; }
.sl-quota-pill--danger { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
.sl-quota-label { font-weight: 800; }
.sl-quota-numbers { opacity: 0.8; }

.sl-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #6F665F);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
}
.sl-close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-main, #2A2421); }

/* ===== State overlays ===== */
.sl-state-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
  color: var(--text-muted, #6F665F);
}
.sl-state-overlay--error { color: #dc2626; }
.sl-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== Empty ===== */
.sl-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  gap: 12px;
}
.sl-empty-icon { color: var(--accent, #8C6239); opacity: 0.6; }
.sl-empty h3 { margin: 0; font-size: 1.1rem; color: var(--text-main, #2A2421); }
.sl-empty p { margin: 0; color: var(--text-muted, #6F665F); font-size: 0.9rem; line-height: 1.6; }
.sl-empty-actions { display: flex; gap: 10px; margin-top: 12px; }

/* ===== Body 3 분할 (반응형) =====
 * 1280px+ (lg+):  3분할 (폴더 + 카드 + 우측 detail pane)
 * 600-1280:       폴더 + 카드 (detail pane 숨김, 카드 인라인 expand 로 대체)
 * <600px (xs):    카드만 (폴더 pane 숨김, 상단 폴더 chips 가로 스크롤)
 */
.sl-body {
  display: grid;
  grid-template-columns: 220px 1fr 320px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
@media (max-width: 1280px) {
  .sl-body { grid-template-columns: 200px 1fr; }
  .sl-detail-pane { display: none; }
}
@media (max-width: 600px) {
  .sl-body { grid-template-columns: 1fr; }
  .sl-folder-pane { display: none; }
}

/* ===== [Mobile fix 2026-05] 폴더 chips 가로 스크롤 (xs 전용) ===== */
.sl-mobile-folder-chips {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
  scrollbar-width: thin;
}
.sl-mobile-folder-chips::-webkit-scrollbar { height: 4px; }
.sl-folder-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 5px 10px;
  background: white;
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 9999px;
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-main, #2A2421);
  white-space: nowrap;
  transition: border-color 0.12s, background 0.12s;
}
.sl-folder-chip:hover { border-color: var(--accent, #8C6239); }
.sl-folder-chip--active {
  background: var(--accent, #8C6239);
  color: white;
  border-color: var(--accent, #8C6239);
}
.sl-folder-chip--active .sl-folder-dot { box-shadow: 0 0 0 2px white inset; }
.sl-folder-chip-count {
  background: rgba(0, 0, 0, 0.08);
  font-size: 0.65rem;
  padding: 0 5px;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
}
.sl-folder-chip--active .sl-folder-chip-count {
  background: rgba(255, 255, 255, 0.25);
  color: white;
}
.sl-folder-chip--add {
  background: transparent;
  color: var(--accent, #8C6239);
  border-style: dashed;
}

/* ===== [Mobile fix 2026-05] 카드 인라인 expand (모바일/태블릿) ===== */
.sl-skill-card--expanded {
  grid-column: 1 / -1;  /* expand 시 한 행 통째로 차지해서 깔끔히 */
  border-color: var(--accent, #8C6239);
  background: white;
}
.sl-expand-chevron {
  color: var(--text-muted, #6F665F);
  flex-shrink: 0;
}
.sl-card-inline-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-light, rgba(0, 0, 0, 0.12));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sl-inline-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}
.sl-inline-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sl-inline-field dt {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6F665F);
}
.sl-inline-field dd {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-main, #2A2421);
  line-height: 1.5;
}
.sl-inline-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sl-inline-actions .sl-btn-primary,
.sl-inline-actions .sl-btn-secondary {
  flex: 1 1 auto;
  min-width: 80px;
  justify-content: center;
}

/* ===== Folder pane ===== */
.sl-folder-pane {
  border-right: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
  overflow-y: auto;
  padding: 12px 6px;
}
.sl-section-header {
  display: flex;
  align-items: center;
  padding: 6px 10px 10px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6F665F);
}
.sl-folder-list { list-style: none; padding: 0; margin: 0; }
.sl-folder-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.84rem;
  color: var(--text-main, #2A2421);
  transition: background 0.12s;
  gap: 8px;
}
.sl-folder-item:hover { background: rgba(140, 98, 57, 0.06); }
.sl-folder-item:hover .sl-folder-actions { opacity: 1; }
.sl-folder-item--active {
  background: rgba(140, 98, 57, 0.12);
  font-weight: 700;
  color: var(--accent, #8C6239);
}
/* [FE-4c] 드래그 호버 시 폴더 — 명확한 시각 신호 */
.sl-folder-item--drop-target {
  background: rgba(16, 185, 129, 0.15);
  outline: 2px dashed #10b981;
  outline-offset: -2px;
}
.sl-folder-dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0;
}
.sl-folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-folder-count {
  font-size: 0.7rem;
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 6px;
  border-radius: 9999px;
  color: var(--text-muted, #6F665F);
  font-variant-numeric: tabular-nums;
}
.sl-folder-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}

/* ===== Grid pane ===== */
.sl-grid-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sl-grid-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: white;
  flex-wrap: wrap;  /* [Mobile fix] 좁은 화면에서 줄바꿈 */
}
.sl-search {
  flex: 1 1 200px;  /* 최소 200px, 그 이하면 줄바꿈 */
  display: flex;
  align-items: center;
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  padding: 4px 10px;
}
/* [Mobile fix] xs 에서 toolbar 의 텍스트 숨기고 아이콘 위주 — 검색은 한 줄 위로 */
@media (max-width: 600px) {
  .sl-grid-toolbar {
    gap: 6px;
    padding: 8px 12px;
  }
  .sl-search { flex: 1 1 100%; }  /* 검색은 한 줄 차지 */
  .sl-grid-toolbar .sl-btn-sm { padding: 5px 8px; font-size: 0.7rem; }
}
.sl-search-icon { color: var(--text-muted, #6F665F); margin-right: 6px; }
.sl-search-input {
  border: none;
  background: transparent;
  outline: none;
  flex: 1;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--text-main, #2A2421);
}

.sl-folder-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  font-size: 0.82rem;
  color: var(--text-main, #2A2421);
}
.sl-folder-meta { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-folder-desc { color: var(--text-muted, #6F665F); font-weight: 400; margin-left: 4px; }
.sl-folder-category {
  font-size: 0.7rem;
  color: var(--accent, #8C6239);
  margin-left: 8px;
}
.sl-folder-counter {
  font-size: 0.75rem;
  color: var(--text-muted, #6F665F);
  font-variant-numeric: tabular-nums;
}

.sl-bulk-row {
  padding: 8px 16px;
  background: rgba(140, 98, 57, 0.04);
  border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.sl-check-all-btn {
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--text-main, #2A2421);
  font-weight: 600;
}

.sl-skill-grid {
  overflow-y: auto;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  align-content: start;
}
.sl-skill-card {
  background: white;
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.sl-skill-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(140, 98, 57, 0.08);
  border-color: var(--accent, #8C6239);
}
.sl-skill-card--active {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.04);
}
.sl-skill-card--checked {
  border-color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.08);
}
.sl-skill-card--dragging { opacity: 0.4; }
.sl-skill-card[draggable="true"] { cursor: grab; }
.sl-skill-card[draggable="true"]:active { cursor: grabbing; }

.sl-skill-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.sl-card-check { color: var(--text-muted, #6F665F); flex-shrink: 0; }
.sl-card-check--on { color: var(--accent, #8C6239); }
.sl-skill-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main, #2A2421);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-priority-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
}
.priority-high { background: #fef2f2; color: #b91c1c; }
.priority-medium { background: #fef3c7; color: #b45309; }
.priority-low { background: #eef2ff; color: #4338ca; }

.sl-skill-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.sl-tag {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent, #8C6239);
}
.sl-tag-more {
  font-size: 0.68rem;
  color: var(--text-muted, #6F665F);
  font-weight: 600;
}

.sl-skill-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.sl-rule-count {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  color: var(--text-muted, #6F665F);
}
.sl-already-in-project {
  font-size: 0.68rem;
  font-weight: 700;
  background: #ecfdf5;
  color: #047857;
  padding: 1px 6px;
  border-radius: 9999px;
}

.sl-grid-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted, #6F665F);
  padding: 32px;
}
.sl-empty-icon-sm { opacity: 0.4; }
.sl-empty-text { color: var(--text-muted, #6F665F); font-style: italic; font-size: 0.85rem; }

/* ===== Detail pane ===== */
.sl-detail-pane {
  border-left: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: var(--bg-light, #F7F5EB);
  overflow-y: auto;
}
.sl-detail-content { padding: 16px 18px; }
.sl-detail-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.sl-detail-title {
  flex: 1;
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main, #2A2421);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sl-detail-fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sl-detail-field dt {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6F665F);
  margin-bottom: 4px;
}
.sl-detail-field dd {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-main, #2A2421);
  line-height: 1.5;
}
.sl-instruction-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sl-instruction-list li {
  display: flex;
  align-items: flex-start;
  font-size: 0.78rem;
  color: var(--text-main, #2A2421);
}
.sl-instruction-list li svg { color: #10b981; margin-top: 3px; flex-shrink: 0; }
.sl-detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sl-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
}
.sl-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  color: var(--text-muted, #6F665F);
  padding: 40px 20px;
  font-size: 0.85rem;
  line-height: 1.5;
}

/* ===== Footer ===== */
.sl-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  background: white;
  flex-shrink: 0;
  gap: 8px;
  flex-wrap: wrap;
}
.sl-footer-left { display: flex; align-items: center; }
.sl-footer-right { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 600px) {
  .sl-footer { padding: 10px 14px; }
  .sl-footer-right { flex: 1 1 100%; justify-content: stretch; }
  .sl-footer-right .sl-btn-md { flex: 1; min-width: 0; padding: 8px 10px; font-size: 0.75rem; }
}
.sl-selected-count {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent, #8C6239);
}

/* ===== Buttons (공통) ===== */
.sl-btn-primary, .sl-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  font-family: inherit;
  transition: all 0.12s;
  white-space: nowrap;
}
.sl-btn-primary {
  background: var(--accent, #8C6239);
  color: white;
}
.sl-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(140, 98, 57, 0.25); }
.sl-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.sl-btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-main, #2A2421);
}
.sl-btn-secondary:hover:not(:disabled) { background: rgba(0, 0, 0, 0.08); }
.sl-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.sl-btn-sm { padding: 6px 10px; font-size: 0.75rem; }
.sl-btn-md { padding: 8px 14px; font-size: 0.82rem; }
.sl-btn-active { background: var(--accent, #8C6239) !important; color: white !important; }
.sl-btn-danger { color: #dc2626; }
.sl-btn-danger:hover:not(:disabled) { background: #fef2f2; color: #b91c1c; }

.sl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted, #6F665F);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
}
.sl-icon-btn:hover { background: rgba(0, 0, 0, 0.06); color: var(--text-main, #2A2421); }
.sl-icon-btn--danger:hover { background: #fef2f2; color: #dc2626; }

.mr-1 { margin-right: 4px; }
.mr-2 { margin-right: 6px; }
.ml-auto { margin-left: auto; }
</style>
