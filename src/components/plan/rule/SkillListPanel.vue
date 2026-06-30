<script setup>
/**
 * SkillListPanel
 *
 * RuleGeneratorTab 좌측 패널 — 스킬 검색 / 목록 / 다중선택 모드 / 일괄 삭제 액션바.
 *
 * 검색 state (searchQuery + filteredSkills computed) 는 컴포넌트 내부에 격리.
 * 그 외 모든 상태/액션은 parent (RuleGeneratorTab) 에서 props/emits 로 통신.
 */
import { ref, computed } from 'vue'
import { Search, CheckSquare, Square, PlusCircle, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  skills: { type: Array, required: true },
  selectedId: { type: String, default: '' },
  isSelectMode: { type: Boolean, default: false },
  selectedSkillIds: { type: Array, default: () => [] },
  priorityColor: { type: Object, required: true },
  isDeletingBulk: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select',
  'toggle-select-mode',
  'toggle-select-all',
  'delete-bulk',
  'add-skill',
])

// 검색 state — 이 컴포넌트 단독 관심사이므로 내부에 보관.
const searchQuery = ref('')

const filteredSkills = computed(() => {
  if (!searchQuery.value.trim()) return props.skills
  const q = searchQuery.value.toLowerCase()
  return props.skills.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.id || '').toLowerCase().includes(q) ||
    (s.scope || '').toLowerCase().includes(q) ||
    (s.tags || []).some(t => typeof t === 'string' && !t.startsWith('cat:') && t.toLowerCase().includes(q)),
  )
})

const isAllSelected = computed(() =>
  filteredSkills.value.length > 0 && filteredSkills.value.every(s => props.selectedSkillIds.includes(s.id))
)
const isIndeterminate = computed(() =>
  props.selectedSkillIds.length > 0 && !isAllSelected.value
)
</script>

<template>
  <div class="skill-list d-flex flex-column">
    <div class="skill-list-search">
      <VTextField v-model="searchQuery" :placeholder="$t('rule.skill_list.search_placeholder')" variant="outlined" density="compact" hide-details class="search-field">
        <template #prepend-inner><Search :size="15" class="text-muted" /></template>
      </VTextField>
      <div class="d-flex align-center justify-space-between mt-2 px-1">
        <span class="text-xs text-muted font-bold" style="font-size:0.68rem;">{{ $t('rule.skill_list.count_unit', { count: filteredSkills.length }) }}</span>
        <VBtn
          variant="text" density="compact" size="small"
          :color="isSelectMode ? 'error' : 'default'"
          class="select-mode-btn"
          @click="emit('toggle-select-mode')"
        >
          <CheckSquare v-if="isSelectMode" :size="13" class="mr-1" />
          <Square v-else :size="13" class="mr-1" />
          {{ isSelectMode ? $t('rule.skill_list.select_cancel') : $t('rule.skill_list.select_delete') }}
        </VBtn>
      </div>
    </div>

    <div class="skill-list-body custom-scroll flex-grow-1 overflow-y-auto">
      <div
        v-for="skill in filteredSkills" :key="skill.id"
        class="skill-item"
        :class="{
          active: !isSelectMode && selectedId === skill.id,
          'select-checked': isSelectMode && selectedSkillIds.includes(skill.id)
        }"
        @click="emit('select', skill.id)"
      >
        <div class="d-flex align-center gap-2 mb-1">
          <!-- 선택 모드 체크박스 -->
          <div v-if="isSelectMode" class="skill-checkbox" @click.stop="emit('select', skill.id)">
            <CheckSquare v-if="selectedSkillIds.includes(skill.id)" :size="16" style="color: var(--accent);" />
            <Square v-else :size="16" style="color: var(--text-muted); opacity: 0.5;" />
          </div>
          <span class="skill-item-name flex-grow-1">{{ skill.name }}</span>
        </div>
        <p class="skill-item-desc" :class="{ 'ml-6': isSelectMode }">{{ skill.scope || $t('rule.skill_list.scope_none') }}</p>
        <div class="d-flex align-center gap-2 mt-2" :class="{ 'ml-6': isSelectMode }">
          <span class="priority-badge" :style="{ color: priorityColor[skill.priority] || '#6b7280', background: (priorityColor[skill.priority] || '#6b7280') + '18' }">
            {{ skill.priority || $t('rule.skill_list.priority_none') }}
          </span>
          <span class="id-badge">{{ skill.id }}</span>
        </div>
      </div>

      <div v-if="filteredSkills.length === 0" class="empty-list">
        <Search :size="22" class="mb-2 opacity-30" />
        <p>{{ searchQuery ? $t('rule.skill_list.search_no_match') : $t('rule.skill_list.empty') }}</p>
        <VBtn v-if="!searchQuery" variant="tonal" color="accent" size="small" class="mt-3" @click="emit('add-skill')">
          <PlusCircle :size="12" class="mr-1" />{{ $t('rule.skill_list.add_first') }}
        </VBtn>
      </div>
    </div>

    <!-- 선택 모드 액션바 -->
    <div v-if="isSelectMode" class="bulk-action-bar">
      <div class="d-flex align-center gap-2">
        <div class="bulk-checkbox" @click="emit('toggle-select-all', filteredSkills.map(s => s.id))">
          <CheckSquare v-if="isAllSelected" :size="16" style="color: var(--accent);" />
          <div v-else-if="isIndeterminate" class="indeterminate-icon" />
          <Square v-else :size="16" style="color: var(--text-muted); opacity: 0.6;" />
        </div>
        <span class="bulk-count">
          {{ selectedSkillIds.length > 0 ? $t('rule.skill_list.select_count', { count: selectedSkillIds.length }) : $t('rule.skill_list.select_all') }}
        </span>
      </div>
      <VBtn
        variant="flat" color="error" size="small" height="32"
        class="bulk-delete-btn"
        :disabled="selectedSkillIds.length === 0"
        :loading="isDeletingBulk"
        @click="emit('delete-bulk')"
      >
        <Trash2 :size="12" class="mr-1" />{{ $t('rule.skill_list.delete') }} {{ selectedSkillIds.length > 0 ? `(${selectedSkillIds.length})` : '' }}
      </VBtn>
    </div>

    <!-- 일반 푸터 -->
    <div v-else class="skill-list-footer">
      {{ $t('rule.skill_list.total', { count: skills.length }) }}
    </div>
  </div>
</template>

<style scoped>
/* 좌측 목록 */
/* [2026-06-13] overflow:hidden + min-height:0 — max-height/flex 가 줄 때 내용이
   페이지로 새지 않고 .skill-list-body 내부에서만 스크롤되게 하는 핵심(flex 오버플로우 버그). */
.skill-list { width: 280px; flex-shrink: 0; border-right: 1px solid var(--border-light); background: var(--bg-card); overflow: hidden; min-height: 0; }
.skill-list-search { padding: 12px; border-bottom: 1px solid var(--border-light); }
.skill-list-body { padding: 8px; min-height: 0; }
.skill-list-footer {
  padding: 10px 16px; border-top: 1px solid var(--border-light);
  font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
}

.skill-item {
  padding: 12px 14px; border-radius: 10px; cursor: pointer;
  transition: all 0.2s; border: 1px solid transparent; margin-bottom: 4px;
}
.skill-item:hover { background: var(--bg-light); }
.skill-item.active { background: var(--bg-light); border-color: var(--accent); box-shadow: 0 2px 12px rgba(140,98,57,0.08); }
.skill-item-name { font-size: 0.84rem; font-weight: 800; color: var(--text-main); }
.skill-item-desc {
  font-size: 0.71rem; color: var(--text-muted);
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
}

.priority-badge { font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.id-badge {
  font-size: 0.6rem; font-weight: 700; color: var(--text-muted);
  background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;
  font-family: 'IBM Plex Mono', monospace;
}
.empty-list { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.8rem; }

/* 검색 */
.search-field :deep(.v-field) { border-radius: 8px !important; border: 1px solid var(--border-light) !important; background: var(--bg-page) !important; }

/* 스크롤 */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(140,98,57,0.2); border-radius: 10px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(140,98,57,0.4); }

/* 선택 모드 */
.select-mode-btn { font-size: 0.68rem !important; font-weight: 700 !important; letter-spacing: 0.02em; opacity: 0.75; }
.select-mode-btn:hover { opacity: 1; }

.skill-item.select-checked {
  background: rgba(140,98,57,0.07);
  border-color: rgba(140,98,57,0.3);
}
.skill-checkbox { flex-shrink: 0; cursor: pointer; display: flex; align-items: center; }

.bulk-action-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-top: 1px solid var(--border-light);
  background: rgba(239,68,68,0.04);
  flex-shrink: 0;
}
.bulk-checkbox { cursor: pointer; display: flex; align-items: center; flex-shrink: 0; }
.bulk-count { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
.bulk-delete-btn { border-radius: 8px !important; font-size: 0.72rem !important; font-weight: 700 !important; }

.indeterminate-icon {
  width: 16px; height: 16px; border-radius: 3px; border: 2px solid var(--accent);
  background: rgba(140,98,57,0.2);
  position: relative;
}
.indeterminate-icon::after {
  content: ''; position: absolute; left: 2px; top: 50%; transform: translateY(-50%);
  width: 8px; height: 2px; background: var(--accent); border-radius: 1px;
}

/* [Mobile fix 2026-05] — 좁은 화면에서 좌측 목록 전체 폭 */
@media (max-width: 600px) {
  .skill-list {
    width: 100% !important;
    flex-shrink: 1 !important;
    border-right: none !important;
    border-bottom: 1px solid var(--border-light);
    max-height: 50vh;
  }
  /* [2026-06] 좌우 패딩 축소 — 모바일 가로폭 최대 활용 (헤더와 통일). */
  .skill-list-search { padding-left: 8px; padding-right: 8px; }
  .skill-list-body { padding-left: 4px; padding-right: 4px; }
}
</style>
