<script setup>
/**
 * Design 페이지 (SPACK · DDD · Architecture) 의 공통 빈 상태.
 *
 * 이전엔 탭마다 icon size · 메시지 톤 · spacing 이 미세하게 달라
 * 사용자가 탭 전환 시 다른 페이지 같은 인상을 받음. 한 컴포넌트로 모아
 * 시각 일관성 확보 + 액션 가이드 한 줄로 다음 단계 안내.
 *
 * Props:
 *   icon       — lucide icon 컴포넌트 (Network / GitBranch / Layers ...)
 *   title      — 큰 제목 (탭 별로 다름. 예: "기능 명세가 아직 없습니다")
 *   subtitle   — 다음 액션 안내 한 줄. 기본: "'최신 업데이트' 버튼을 눌러 시작하세요"
 *   loading    — true 이면 spinner 표시. icon 자리 대체.
 */
import { Loader2 } from 'lucide-vue-next'

defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  // prop default 는 컴포넌트 컨텍스트 밖이라 t() 불가 → 빈 문자열 + 템플릿 $t() 폴백.
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="design-empty-state" role="status" aria-live="polite">
    <div class="design-empty-icon">
      <Loader2 v-if="loading" :size="40" class="design-empty-spin" />
      <component v-else-if="icon" :is="icon" :size="48" />
    </div>
    <h4 v-if="title" class="design-empty-title">{{ title }}</h4>
    <p v-if="!loading" class="design-empty-subtitle">{{ subtitle || $t('design.empty_state.default_subtitle') }}</p>
  </div>
</template>

<style scoped>
.design-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 48px 24px;
  min-height: 240px;
  animation: designEmptyFade 0.3s ease-out;
}
@keyframes designEmptyFade {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.design-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
  border-radius: 20px;
  background: var(--bg-light, #F7F5EB);
  color: var(--text-muted);
  opacity: 0.55;
}
.design-empty-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}
.design-empty-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
  max-width: 380px;
  word-break: keep-all;
}
.design-empty-spin { animation: designEmptyRotate 0.9s linear infinite; }
@keyframes designEmptyRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .design-empty-state { animation: none; }
  .design-empty-spin { animation: none; }
}
</style>
