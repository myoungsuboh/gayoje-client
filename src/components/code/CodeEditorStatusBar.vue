<script setup>
/**
 * 에디터 하단 상태 바 — 인코딩 / 줄 끝 / branch / 활성 경로 / 언어.
 *
 * Props:
 *   repoInfo        — { owner, repo, branch } 또는 null (repo 미로드)
 *   activeFilePath  — 현재 활성 파일 경로 (null 이면 표시 안 함)
 *   currentLanguage — 'Python' / 'Vue' / ... 또는 빈 문자열
 *   currentIcon     — getIconType 결과 (색 점에 사용)
 */
import { useI18n } from 'vue-i18n'
import { Terminal } from 'lucide-vue-next'
import { getIconDot } from '@/utils/githubCode'

const { t } = useI18n()

defineProps({
  repoInfo: { type: Object, default: null },     // { owner, repo, branch }
  activeFilePath: { type: String, default: '' },
  currentLanguage: { type: String, default: '' },
  currentIcon: { type: String, default: 'file' },
})
</script>

<template>
  <div class="status-bar">
    <div class="d-flex align-center gap-3">
      <span class="status-item">
        <Terminal :size="12" class="mr-1" />UTF-8
      </span>
      <span class="status-item">LF</span>
      <span v-if="repoInfo" class="status-item">
        <VIcon icon="mdi-source-branch" size="11" class="mr-1" />{{ repoInfo.branch }}
      </span>
    </div>
    <div class="d-flex align-center gap-3">
      <span
        v-if="activeFilePath"
        class="status-item mono-text status-item--path"
      >
        {{ activeFilePath }}
      </span>
      <span class="status-lang">
        <span
          v-if="currentLanguage"
          class="status-dot mr-1"
          :style="{ background: getIconDot(currentIcon) }"
        />
        {{ currentLanguage || t('code.status.lang_none') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* code.vue 의 기존 status-bar CSS 그대로 — 동작 보존. */
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 16px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 8px;
}
.status-item {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.62rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.status-lang {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.62rem;
  color: var(--text-main);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

/* 색 점 — code.vue 의 .tab-dot 와 같은 형태 (편의상 별도 클래스) */
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 활성 파일 경로 — 길어지면 ... 처리 */
.status-item--path {
  font-size: 0.58rem;
  opacity: 0.55;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .status-item--path { max-width: 140px; font-size: 0.55rem; }
}
@media (max-width: 600px) {
  .status-item--path { max-width: 100px; }
}
</style>
