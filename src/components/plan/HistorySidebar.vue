<script setup>
/**
 * HistorySidebar.vue — 미팅 로그 버전 History 사이드바 (MeetingLogTab 에서 분리, 2026-05-27).
 *
 * 좌측 패널: 헤더(History 라벨 + 새 회의록 버튼 + 더보기 메뉴) + 버전 리스트.
 * 상태는 보유하지 않음 — 부모(MeetingLogTab)가 selectedLog/showBatchPanel 등을
 * 내려주고, 버튼 클릭은 select/new-log/open-notion/toggle-batch 로 위임.
 *
 * [2026-06-10 UX 개편] 아이콘 전용 버튼 3개 + ⓘ 툴팁 3개(작은 타겟 6개)가 처음
 * 사용자에게 발견·이해 모두 어렵다는 피드백 →
 *  - 주 액션 "새 회의록"은 텍스트 라벨이 있는 풀폭 버튼으로 승격. v-if 로 사라지던
 *    것을 disabled + 이유(title/aria-label) 안내로 변경해 항상 보이게 함.
 *  - 보조 액션(Notion 가져오기 / 일괄 처리)은 ⋯ 더보기 메뉴로 이동, 각 항목에
 *    제목 + 설명(기존 guides.json ⓘ 문구 재사용)을 함께 노출 — 별도 ⓘ 아이콘 제거.
 *  - 터치 타겟: ≤600px 에서 헤더 버튼 44px, ≤900px 칩 행의 미리보기 버튼 40px.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, Plus, Layers, BookOpen, Eye, MoreHorizontal } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps({
  meetingLogs: {
    type: Array,
    default: () => [],
  },
  selectedLog: {
    type: String,
    default: '',
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  nextVersion: {
    type: String,
    default: 'v1.1',
  },
  isNewLogMode: {
    type: Boolean,
    default: false,
  },
  // batch/single job 진행 중 — 헤더 버튼 일괄 비활성화
  isAnyProcessing: {
    type: Boolean,
    default: false,
  },
  // 배치 패널 열림 — 메뉴의 배치 항목 active 표시
  showBatchPanel: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'new-log', 'open-notion', 'toggle-batch', 'preview'])

const menuOpen = ref(false)

// 새 회의록 버튼 — 숨기지 않고 비활성화 + 이유 안내 (처음 사용자가 주 액션의
// 존재 자체를 인지할 수 있도록 항상 렌더).
const newLogDisabled = computed(
  () => props.isAnyProcessing || props.isNewLogMode || props.showBatchPanel,
)
const newLogTitle = computed(() => {
  if (props.isAnyProcessing) return t('plan.history.processing_disabled')
  if (props.isNewLogMode) return t('plan.history.new_log_drafting')
  if (props.showBatchPanel) return t('plan.history.new_log_in_batch')
  return t('plan.history.new_log')
})

const onMenuAction = (event) => {
  menuOpen.value = false
  emit(event)
}
</script>

<template>
  <div class="history-sidebar d-flex flex-column flex-shrink-0">
    <!-- Header: 라벨 + ⋯ 메뉴 (1행) / 새 회의록 주 버튼 (2행). ≤900px 은 한 줄 배치. -->
    <div class="sidebar-header">
      <div class="sidebar-label-group">
        <Clock :size="13" class="text-accent mr-2" />
        <span class="sidebar-label">History</span>
      </div>

      <button
        class="history-primary-btn"
        :title="newLogTitle"
        :aria-label="newLogTitle"
        :disabled="newLogDisabled"
        @click="emit('new-log')"
      >
        <Plus :size="14" />
        <span>{{ t('plan.history.new_log_short') }}</span>
      </button>

      <!-- 보조 액션(가져오기/일괄 처리) — 항목마다 제목+설명을 함께 보여주는 메뉴.
           트리거 자체는 처리 중에도 활성: 메뉴를 열면 항목이 비활성 이유를 안내한다. -->
      <VMenu v-model="menuOpen" location="bottom end" content-class="history-actions-menu">
        <template #activator="{ props: menuProps }">
          <button
            v-bind="menuProps"
            class="history-more-btn"
            :class="{ 'history-more-btn--active': menuOpen || showBatchPanel }"
            :title="t('plan.history.more_actions')"
            :aria-label="t('plan.history.more_actions')"
          >
            <MoreHorizontal :size="15" />
          </button>
        </template>

        <div class="history-menu" role="menu">
          <button
            class="history-menu-item history-menu-item--notion"
            role="menuitem"
            :disabled="isAnyProcessing"
            @click="onMenuAction('open-notion')"
          >
            <BookOpen :size="15" class="history-menu-icon" />
            <span class="history-menu-texts">
              <span class="history-menu-title">{{ t('plan.history.open_notion') }}</span>
              <span class="history-menu-desc">{{ isAnyProcessing ? t('plan.history.processing_disabled') : t('guides.meeting-log-notion.desc') }}</span>
            </span>
          </button>
          <button
            class="history-menu-item history-menu-item--batch"
            :class="{ 'history-menu-item--active': showBatchPanel }"
            role="menuitem"
            :aria-pressed="showBatchPanel"
            :disabled="isAnyProcessing"
            @click="onMenuAction('toggle-batch')"
          >
            <Layers :size="15" class="history-menu-icon" />
            <span class="history-menu-texts">
              <span class="history-menu-title">{{ t('plan.history.batch') }}</span>
              <span class="history-menu-desc">{{ isAnyProcessing ? t('plan.history.processing_disabled') : t('guides.meeting-log-batch.desc') }}</span>
            </span>
          </button>
        </div>
      </VMenu>
    </div>

    <div v-if="isLoading" class="d-flex justify-center pa-8">
      <VProgressCircular indeterminate color="accent" size="24" width="2" />
    </div>

    <!-- Version List (max 10 visible, scroll for rest) -->
    <div v-else-if="meetingLogs.length > 0 || isNewLogMode" class="version-list-wrapper">
      <!-- New Entry Placeholder -->
      <div v-if="isNewLogMode" class="version-item version-item--draft">
        <div class="version-dot version-dot--draft"></div>
        <div class="version-info">
          <span class="version-tag version-tag--draft">{{ nextVersion }}</span>
          <span class="version-status">{{ t('plan.history.drafting') }}</span>
        </div>
      </div>

      <div
        v-for="log in meetingLogs"
        :key="log.version"
        class="version-item"
        :class="{ 'version-item--active': selectedLog === log.version && !isNewLogMode }"
        role="button"
        tabindex="0"
        :aria-pressed="selectedLog === log.version && !isNewLogMode"
        :aria-label="log.date ? $t('plan.history.log_aria_date', { version: log.version, date: log.date }) : $t('plan.history.log_aria', { version: log.version })"
        @click="emit('select', log.version)"
        @keydown.enter.prevent="emit('select', log.version)"
        @keydown.space.prevent="emit('select', log.version)"
      >
        <div class="version-dot" :class="{ 'version-dot--active': selectedLog === log.version && !isNewLogMode }"></div>
        <div class="version-info">
          <span class="version-tag">{{ log.version }}</span>
          <span v-if="log.date" class="version-date">{{ log.date }}</span>
        </div>
        <button
          class="preview-btn"
          :title="$t('plan.history.preview_title', { version: log.version })"
          :aria-label="$t('plan.history.preview_title', { version: log.version })"
          @click.stop="emit('preview', log.version)"
        >
          <Eye :size="11" />
        </button>
      </div>
    </div>

    <div v-else class="text-center pa-6 text-caption text-muted" style="font-family: 'Pretendard Variable', sans-serif">No logs found</div>
  </div>
</template>

<style scoped>
.history-sidebar {
  width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  height: 100%;
  overflow: hidden;
}

/* [2026-06-10 UX 개편] 헤더 grid 배치 — 데스크탑: 1행(라벨·⋯) + 2행(주 버튼 풀폭).
   라벨/⋯/주 버튼이 모두 헤더의 직접 자식이라 breakpoint 별로 영역만 바꾸면 됨. */
.sidebar-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'label more'
    'primary primary';
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.sidebar-label-group {
  grid-area: label;
  display: flex;
  align-items: center;
  min-width: 0;
}

.sidebar-label {
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

/* 주 액션 — 텍스트 라벨이 있는 풀폭 버튼. 사라지지 않고 disabled 로 상태 안내. */
.history-primary-btn {
  grid-area: primary;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.history-primary-btn:hover:not(:disabled) {
  background: #7a5430;
  border-color: #7a5430;
}

.history-primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 보조 액션 메뉴 트리거 (⋯) */
.history-more-btn {
  grid-area: more;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: white;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.history-more-btn:hover,
.history-more-btn--active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

/* Version list: fill remaining sidebar height, scroll when overflow */
.version-list-wrapper {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}

.version-list-wrapper::-webkit-scrollbar {
  width: 3px;
}
.version-list-wrapper::-webkit-scrollbar-thumb {
  background: #e8e8e8;
  border-radius: 10px;
}
.version-list-wrapper::-webkit-scrollbar-thumb:hover {
  background: #d0d0d0;
}

.version-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 2px;
}

.version-item:hover {
  background: var(--bg-light);
}

.version-item--active {
  background: var(--accent) !important;
}

.version-item--active .version-tag {
  color: white !important;
}

.version-item--active .version-date {
  color: rgba(255, 255, 255, 0.6) !important;
}

.version-item--draft {
  border: 1px dashed var(--accent);
  background: rgba(140, 98, 57, 0.04);
  cursor: default;
}

.version-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-light);
  margin-right: 12px;
  flex-shrink: 0;
}

.version-dot--active {
  background: white;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.version-dot--draft {
  background: var(--accent);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.version-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.version-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
}

.version-tag--draft {
  color: var(--accent);
  font-style: italic;
}

.preview-btn {
  margin-left: auto;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  background: white;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.85;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
}

.version-item:hover .preview-btn {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
}

.version-item--active .preview-btn {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.35);
  color: white;
  opacity: 1;
}

.preview-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.version-item--active .preview-btn:hover {
  background: white;
  color: var(--accent);
  border-color: white;
}

.version-date {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 2px;
}

.version-status {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--accent);
  opacity: 0.7;
  margin-top: 1px;
}

/* ─── 반응형 ──────────────────────────────────────────────────────
   [2026-06-10 버그픽스] 미디어쿼리는 반드시 기본 규칙 '뒤'에 — 동일 특이도라
   파일 상단에 두면 아래 기본 규칙(flex/min-height/padding 등)이 도로 덮어써
   칩 행 스타일이 죽어 있었다(세로 풀폭 리스트로 렌더되던 원인). */

/* 태블릿(가로 박스): 헤더 한 줄(라벨 ─ 주 버튼 ─ ⋯) + 가로 스와이프 칩 행. */
@media (max-width: 900px) {
  .history-sidebar {
    width: 100%;
    /* [2026-06-08 v2 → 2026-06-10] 과거 박스 collapse(min-height:150px 로 방어)는
       칩 행 미디어쿼리가 기본 규칙에 덮여(wrapper 가 flex:1 1 0/min-height:0 으로
       남음) 생긴 증상이었다. 캐스케이드를 고쳐 wrapper 가 flex:0 0 auto 로 콘텐츠
       높이를 갖게 됐으므로 height:auto 로 정확히 헤더+칩 한 줄 높이가 된다. */
    height: auto;
    max-height: none;
    flex: 0 0 auto;
  }
  .sidebar-header {
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'label primary more';
    gap: 10px;
    padding: 10px 14px;
  }
  .history-primary-btn {
    width: auto;
    height: 40px;
    padding: 0 16px;
  }
  .history-more-btn {
    width: 40px;
    height: 40px;
  }
  .version-list-wrapper {
    /* [2026-06-10 버그픽스] display:flex 누락 — flex-direction:row 만으론 블록
       컨테이너라 칩이 세로로 쌓여 풀폭 리스트로 늘어졌음(주석의 '가로 스와이프
       칩 행' 의도와 다르게 렌더). flex 명시로 의도대로 한 줄 가로 스크롤. */
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
    overflow-y: hidden;
    min-height: 52px;          /* 가로 칩 한 줄이 항상 보이도록 하한 */
    gap: 8px;
    padding: 10px 12px 12px;
    -webkit-overflow-scrolling: touch;
  }
  .version-list-wrapper::-webkit-scrollbar {
    height: 3px;
    width: auto;
  }
  .version-item {
    flex: 0 0 auto;            /* 내용 폭만큼, 줄어들지 않음 */
    margin-bottom: 0;
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 8px 12px;
  }
  .version-item--active {
    border-color: var(--accent);
  }
  .version-dot {
    margin-right: 8px;
  }
  .version-info {
    flex-direction: row;       /* 버전·날짜 한 줄로 */
    align-items: center;
    gap: 8px;
  }
  .version-date {
    margin-top: 0;
  }
  .preview-btn {
    margin-left: 8px;
    width: 40px;               /* 터치 타겟 — 칩 행에서 손가락으로 누를 수 있게 */
    height: 40px;
  }
}

/* 모바일: 헤더 다시 2행(주 버튼 풀폭) + 모든 헤더 타겟 44px 이상. */
@media (max-width: 600px) {
  .history-sidebar {
    border-radius: 12px;
  }
  .sidebar-header {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'label more'
      'primary primary';
    gap: 8px;
  }
  .history-primary-btn {
    width: 100%;
    height: 44px;
    font-size: 0.82rem;
  }
  .history-more-btn {
    width: 44px;
    height: 44px;
  }
}
</style>

<!-- [2026-06-10] 보조 액션 메뉴는 VMenu 가 body 레벨 overlay 로 teleport —
     scoped 스타일이 닿지 않아 전역 블록으로 선언 (GuideTooltip popover 와 동일 기법). -->
<style>
.history-actions-menu {
  border-radius: 12px;
}

.history-menu {
  min-width: 260px;
  max-width: min(320px, calc(100vw - 24px));
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, rgba(140, 98, 57, 0.1));
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: 'Pretendard Variable', sans-serif;
}

.history-menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 48px;          /* 터치 타겟 하한 */
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.history-menu-item:hover:not(:disabled) {
  background: var(--bg-light, #f7f5eb);
}

.history-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-menu-item--active {
  background: rgba(140, 98, 57, 0.08);
}

.history-menu-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent, #8c6239);
}

.history-menu-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.history-menu-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main, #2a2421);
}

.history-menu-item--active .history-menu-title {
  color: var(--accent, #8c6239);
}

.history-menu-desc {
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--text-muted, #6f665f);
  word-break: keep-all;
  overflow-wrap: break-word;
}
</style>
