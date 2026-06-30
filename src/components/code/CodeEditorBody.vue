<script setup>
/**
 * 에디터 본문 — loading overlay / empty state / line gutter + code.
 *
 * Props:
 *   isLoading   — content fetch 중 (overlay)
 *   activePath  — 활성 파일 경로 (없으면 empty state)
 *   content     — 현재 파일 내용 (line gutter 표시용 + pre 표시)
 *
 * [디자인 결정 — lineCount 는 내부 computed]
 * 부모로부터 prop 받아도 되지만, content 가 props 로 들어오니 자체 계산이 더 단순.
 * content 변경 → lineCount 자동 갱신 (Vue reactivity).
 */
import { computed } from 'vue'

const props = defineProps({
  isLoading: { type: Boolean, default: false },
  activePath: { type: String, default: '' },
  content: { type: String, default: '' },
})

// 줄 수 계산 — 빈 content 도 1줄로 (gutter 가 '1' 한 줄 보임).
const lineCount = computed(() => {
  if (!props.content) return 1
  return props.content.split('\n').length
})
</script>

<template>
  <div class="editor-body custom-scroll editor-body--relative">
    <!-- Content Loading Overlay -->
    <div
      v-if="isLoading"
      class="content-loading-overlay d-flex align-center justify-center"
    >
      <VProgressCircular indeterminate color="accent" size="24" width="2" />
    </div>

    <!-- Empty State — no file selected -->
    <div
      v-else-if="!activePath"
      class="d-flex flex-column align-center justify-center pa-8 opacity-25 editor-empty-state"
    >
      <VIcon icon="mdi-file-code-outline" size="40" color="muted" class="mb-4" />
      <span class="text-caption text-muted">{{ $t('code.body.empty') }}</span>
    </div>

    <!-- Code Content -->
    <template v-else-if="!isLoading">
      <div class="line-gutter">
        <div v-for="n in lineCount" :key="n" class="line-num">{{ n }}</div>
      </div>
      <pre class="code-text mono-text">{{ content }}</pre>
    </template>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }

.editor-body {
  flex: 1;
  overflow: auto;
  display: flex;
  background: white;
}
.editor-body--relative { position: relative; }

.content-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.85);
  z-index: 10;
}

/* [2026-05-30] editor-body 가 flex-row(코드 표시 시 gutter+pre 가로 배치)라
   빈 상태 div 가 콘텐츠 폭만큼만 차지해 좌측으로 쏠렸음. flex:1 + width:100% 로
   가로 전체를 채워 align-center 가 실제로 중앙정렬되게 한다. (웹/모바일 공통) */
.editor-empty-state { flex: 1; width: 100%; padding-top: 80px; }

/* [2026-05-21] 모바일에서 파일 미리보기 영역이 전체 viewport 의 ~70% 를 차지
   하던 문제. 빈 상태 padding 축소 + editor-body min-height 제한. */
@media (max-width: 768px) {
  .editor-body { min-height: 220px; }
  .editor-empty-state { padding: 24px 16px !important; padding-top: 32px !important; }
}

.line-gutter {
  width: 48px;
  flex-shrink: 0;
  padding: 20px 8px 20px 0;
  text-align: right;
  background: #fafbfc;
  border-right: 1px solid var(--border-light);
  user-select: none;
}
.line-num {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  color: #bbb;
  line-height: 1.8;
  height: 1.8em;
}
.code-text {
  margin: 0;
  padding: 20px 24px;
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--text-main);
  white-space: pre;
  tab-size: 2;
  overflow: visible;
}

/* scrollbar (editor-body 자체 스크롤) */
.custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }

.opacity-25 { opacity: 0.25; }
</style>
