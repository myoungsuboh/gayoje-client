<script setup>
/**
 * NotionPageList — Notion 가져오기 다이얼로그 좌측 검색 + 페이지 리스트
 * (NotionImportDialog 에서 분리, 2026-05-27).
 *
 * notion store 에 직접 연결해 검색/무한스크롤을 자체 처리하고, 페이지 클릭 시
 * select(page) 만 부모로 emit — 부모가 selectAndPreview / 에러 처리 담당.
 */
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatRelativeTime } from '@/utils/format'
import { Search, Loader2, X, FileText, ChevronRight } from 'lucide-vue-next'
import { useNotionStore } from '@/store/notion'
import { notionErrorMessage } from '@/utils/notion'

const { t, locale } = useI18n()

const props = defineProps({
  // 다이얼로그 열림 상태 — 열릴 때마다 검색어 초기화.
  active: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const notion = useNotionStore()

const searchInput = ref('')
let debounceTimer = null

const onSearchInput = (e) => {
  searchInput.value = e.target.value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    notion.search(searchInput.value.trim())
  }, 300)
}

const clearSearch = () => {
  searchInput.value = ''
  notion.search('')
}

// 다이얼로그가 열릴 때 검색어 초기화 (부모가 notion.search('') 로 목록은 갱신).
watch(() => props.active, (open) => {
  if (open) searchInput.value = ''
})

// 스크롤 끝 80px 전에서 다음 페이지 자동 로드.
const listRef = ref(null)
const onListScroll = () => {
  const el = listRef.value
  if (!el) return
  if (!notion.hasMore || notion.isLoadingMore) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
    notion.loadMore()
  }
}

// [2026-06 공통화] 상대시간 표시는 utils/format.formatRelativeTime 로 통합(BatchPanel 과 공통).
// Notion 은 ISO 입력·'방금'(just_now) 미표시(최소 '1분 전') — isIso/showJustNow 로 흡수.
const formatLastEdited = (iso) =>
  formatRelativeTime(iso, { t, locale: locale.value, isIso: true, keyPrefix: 'plan.notion', showJustNow: false })

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="notion-list-pane">
    <div class="notion-search-box">
      <Search :size="14" class="notion-search-icon" />
      <input
        type="text"
        class="notion-search-input"
        :placeholder="$t('plan.notion.search_placeholder')"
        :value="searchInput"
        @input="onSearchInput"
      />
      <button
        v-if="searchInput"
        class="notion-search-clear"
        :aria-label="$t('plan.notion.search_clear_aria')"
        @click="clearSearch"
      ><X :size="12" /></button>
    </div>

    <!-- 결과 리스트 -->
    <div
      v-if="!notion.isSearching && notion.results.length > 0"
      ref="listRef"
      class="notion-page-list custom-scroll"
      @scroll="onListScroll"
    >
      <button
        v-for="page in notion.results"
        :key="page.id"
        class="notion-page-item"
        :class="{ 'notion-page-item--active': notion.selectedPageId === page.id }"
        @click="emit('select', page)"
      >
        <span class="notion-page-icon">
          <template v-if="page.icon && !page.icon.startsWith('http')">{{ page.icon }}</template>
          <FileText v-else :size="14" />
        </span>
        <span class="notion-page-info">
          <span class="notion-page-title">{{ page.title }}</span>
          <span class="notion-page-meta">
            <span v-if="page.last_edited_time">{{ formatLastEdited(page.last_edited_time) }}</span>
          </span>
        </span>
        <ChevronRight :size="13" class="notion-page-chevron" />
      </button>
      <div
        v-if="notion.isLoadingMore"
        class="notion-list-loading"
      >
        <Loader2 :size="14" class="rotate-anim mr-1" />
        {{ $t('plan.notion.list_loading') }}
      </div>
      <div
        v-else-if="!notion.hasMore"
        class="notion-list-end"
      >{{ $t('plan.notion.list_end') }}</div>
    </div>

    <!-- 빈 / 로딩 -->
    <div v-if="notion.isSearching" class="notion-empty">
      <Loader2 :size="16" class="rotate-anim mr-1" />
      {{ $t('plan.notion.searching') }}
    </div>
    <div v-else-if="notion.isEmpty && !notion.searchError" class="notion-empty">
      {{ $t('plan.notion.no_results') }}
      <div class="notion-empty-hint">
        {{ $t('plan.notion.no_results_hint') }}
      </div>
    </div>
    <div v-else-if="notion.searchError" class="notion-empty notion-empty--error">
      {{ notionErrorMessage(notion.searchError.code) || notion.searchError.message }}
    </div>
  </div>
</template>

<style scoped>
.notion-list-pane {
  border-right: 1px solid var(--border-light, #e5e2dd);
  display: flex; flex-direction: column;
  min-width: 0;
  /* grid item 안 inner scroll 정상 작동 위해 min-height: 0 명시. */
  min-height: 0;
  overflow: hidden;
}
.notion-search-box {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid var(--border-light, #e5e2dd);
  display: flex; align-items: center;
}
.notion-search-icon {
  position: absolute;
  left: 22px;
  color: var(--text-muted, #6b7280);
  pointer-events: none;
}
.notion-search-input {
  width: 100%;
  padding: 8px 30px 8px 30px;
  font-size: 0.8rem;
  border: 1px solid var(--border-light, #e5e2dd);
  border-radius: 8px;
  outline: none;
  background: var(--bg-input, #fafaf8);
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-search-input:focus {
  border-color: var(--accent, #8B6F47);
}
.notion-search-clear {
  position: absolute;
  right: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted, #6b7280);
}
.notion-page-list {
  flex: 1; overflow-y: auto;
  padding: 4px 0;
  /* inner scroll 이 끝까지 닿아도 부모로 scroll 전파 안 되게. */
  overscroll-behavior: contain;
}
.notion-page-item {
  width: 100%;
  display: flex; align-items: center;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  gap: 10px;
  font-family: 'Pretendard Variable', sans-serif;
  transition: background 0.1s;
}
.notion-page-item:hover { background: rgba(0,0,0,0.03); }
.notion-page-item--active {
  background: rgba(139, 111, 71, 0.08);
  border-left-color: var(--accent, #8B6F47);
}
.notion-page-icon {
  width: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}
.notion-page-info {
  display: flex; flex-direction: column;
  min-width: 0; flex: 1;
}
.notion-page-title {
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--text-main, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notion-page-meta {
  font-size: 0.68rem;
  color: var(--text-muted, #6b7280);
  margin-top: 2px;
}
.notion-page-chevron { color: var(--text-muted, #6b7280); opacity: 0.4; }
.notion-page-item--active .notion-page-chevron { opacity: 1; }

.notion-list-loading, .notion-list-end {
  text-align: center;
  padding: 12px;
  font-size: 0.72rem;
  color: var(--text-muted, #6b7280);
}

/* empty / error — preview pane 과 공유하던 스타일의 list-pane 전용 사본 */
.notion-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1;
  padding: 24px;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  font-family: 'Pretendard Variable', sans-serif;
  text-align: center;
}
.notion-empty--error { color: #b91c1c; }
.notion-empty-hint {
  font-size: 0.7rem;
  color: var(--text-muted, #6b7280);
  margin-top: 6px;
  opacity: 0.8;
}

/* 모바일 — .notion-body 가 세로 grid 로 바뀌면서 리스트가 상단 row 가 됨 */
@media (max-width: 760px) {
  .notion-list-pane {
    border-right: none;
    border-bottom: 1px solid var(--border-light, #e5e2dd);
  }
}
</style>
