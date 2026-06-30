<script setup>
/**
 * MY LIBRARY quick-load chip 그리드.
 *
 * 저장된 VibeRepo 라이브러리에서 한 번 클릭으로 repo 선택 → 부모에게 emit.
 *
 * Props:
 *   repos     — Array<{ url: string, label?: string }>
 *   disabled  — 전체 비활성 (repo loading 중)
 *
 * Emits:
 *   select (url: string) — chip 본문 클릭 (불러오기)
 *   remove (repo)        — chip 의 × 클릭 (라이브러리에서 삭제)
 */
import { BookOpen, X } from 'lucide-vue-next'

defineProps({
  repos: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'remove'])

const repoButtonLabel = (repo) =>
  repo.label || repo.url.split('/').slice(-2).join(' / ')
</script>

<template>
  <div
    v-if="repos.length > 0"
    class="library-row d-flex align-center flex-wrap mb-3"
  >
    <span class="quick-label d-flex align-center">
      <BookOpen :size="12" />MY LIBRARY
    </span>
    <span
      v-for="repo in repos"
      :key="repo.url"
      class="lib-chip"
      :class="{ 'lib-chip--disabled': disabled }"
      :title="repo.url"
    >
      <button
        type="button"
        class="lib-chip__main"
        :disabled="disabled"
        @click="emit('select', repo.url)"
      >
        {{ repoButtonLabel(repo) }}
      </button>
      <button
        type="button"
        class="lib-chip__del"
        :disabled="disabled"
        :title="$t('common.library.remove_title')"
        :aria-label="$t('common.library.remove_title')"
        @click.stop="emit('remove', repo)"
      >
        <X :size="11" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.library-row {
  min-height: 28px;
  /* [2026-06-12] URL 입력/에러 카드와 너무 붙어 있어 여백 — lint 페이지처럼 띄움. */
  margin-top: 14px;
  /* [2026-06] gap-2 util 은 이 프로젝트에 미정의(무효) — 라벨↔칩·칩↔칩 간격 명시. */
  gap: 8px;
}

.quick-label {
  font-family: 'Outfit', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  /* [2026-06] gap-1 util 미정의(무효) — 아이콘↔라벨 텍스트 간격 명시. */
  gap: 4px;
}

/* ── 라이브러리 chip — 본문(불러오기) + × (삭제) 한 알약 ───────────── */
.lib-chip {
  display: inline-flex;
  align-items: stretch;
  border-radius: 9999px;
  border: 1px solid rgba(46, 64, 54, 0.25);
  background: rgba(46, 64, 54, 0.05);
  overflow: hidden;
  transition: all 0.15s;
}
.lib-chip:hover:not(.lib-chip--disabled) {
  border-color: var(--primary-moss);
  background: rgba(46, 64, 54, 0.12);
}
.lib-chip--disabled { opacity: 0.45; }

.lib-chip__main {
  padding: 5px 10px 5px 14px;
  border: none;
  background: transparent;
  color: var(--primary-moss);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
}
.lib-chip__main:disabled { cursor: not-allowed; }

.lib-chip__del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px 0 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s;
}
.lib-chip__del:hover:not(:disabled) { color: #C62828; }
.lib-chip__del:disabled { cursor: not-allowed; }

@media (max-width: 600px) {
  /* 모바일에서 라벨 숨김 — chip 만 노출 */
  .library-row .quick-label { display: none; }
  .lib-chip__main {
    padding: 4px 6px 4px 10px; font-size: 0.62rem;
    max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
}
</style>
