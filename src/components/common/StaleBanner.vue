<script setup>
/**
 * StaleBanner — 산출물 desync 알림 공통 배너.
 *
 * [Phase 3.6 — 2026-05]
 * CPS/PRD 의 markdown_stale banner 와 Design 의 source_stale banner 가
 * 동일한 시각 언어 (노란 경고 배경 + 강조/보조 텍스트 + 우측 액션 버튼들).
 * 기존엔 PrdTab/CpsTab 안에 각자 inline 으로 똑같은 CSS 가 들어가 있어서
 * Design 추가 시점에 세 번째 복사가 생기지 않도록 공통화.
 *
 * [사용 예]
 *   <StaleBanner
 *     v-if="designStale"
 *     title="PRD 가 갱신되었습니다."
 *     subtitle="현재 Design 은 옛 PRD 기준입니다."
 *   >
 *     <template #actions>
 *       <button class="stale-banner__btn stale-banner__btn--primary" @click="regen">
 *         최신 업데이트로 다시 생성
 *       </button>
 *       <button class="stale-banner__btn" @click="dismiss">무시</button>
 *     </template>
 *   </StaleBanner>
 *
 * [디자인 결정]
 * - props 로 title/subtitle 만 받고 actions 는 slot — 각 host 가 버튼 구성/disabled
 *   상태를 자기 reactive 로 직접 제어 (resynth/dismiss 등 로딩 상태 다름).
 * - icon 도 slot 으로 — 기본은 mdi-alert-circle-outline.
 * - 버튼 CSS class 는 외부에 노출 (.stale-banner__btn 등) → 호스트가 그대로 재사용.
 *
 * [현 상태 — 2026-06 마이그레이션 완료]
 * - design 페이지 + CpsTab + PrdTab 모두 이 공통 컴포넌트를 사용.
 * - CpsTab/PrdTab 의 inline 버전(markdown_stale 배너)은 harness#364 에서 이리로
 *   이전 완료 — 동일 CSS 가 3곳에 복사돼 있던 것을 단일 출처로 통합.
 */
import { AlertCircle } from 'lucide-vue-next'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div class="stale-banner" role="status" aria-live="polite">
    <slot name="icon">
      <AlertCircle :size="16" class="stale-banner__icon" />
    </slot>
    <div class="stale-banner__text">
      <strong>{{ title }}</strong>
      <span v-if="subtitle" class="stale-banner__sub">{{ subtitle }}</span>
      <!-- [B — 2026-06] 그래프 임팩트 상세 — 어떤 변경이 어떤 산출물에 영향 주는지.
           기본 stale 배너는 detail 슬롯을 안 쓰면 기존과 동일. -->
      <div v-if="$slots.detail" class="stale-banner__detail">
        <slot name="detail" />
      </div>
    </div>
    <div v-if="$slots.actions" class="stale-banner__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.stale-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  /* [2026-06-24] 하단 마진 0 → 아래 콘텐츠(탭 행/본문)와 붙어 답답하던 문제. 12px 확보. */
  margin: 12px 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #fff8e1;
  border: 1px solid #ffd54f;
  color: #6b4f00;
  flex-shrink: 0;
}
.stale-banner__icon { color: #b8860b; flex-shrink: 0; margin-top: 1px; }
.stale-banner__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.78rem;
  line-height: 1.4;
}
.stale-banner__sub {
  font-size: 0.7rem;
  color: #8a6d1f;
  font-weight: 500;
}
.stale-banner__detail { margin-top: 6px; }
.stale-banner__actions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }

/* 액션 버튼 — slot 내부 button 에 직접 적용되도록 :deep() 셀렉터.
   호스트가 :class="['stale-banner__btn', { 'stale-banner__btn--primary': isPrimary }]"
   같은 방식으로 작성. */
:deep(.stale-banner__btn) {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid #ffd54f;
  background: white;
  font-family: 'Outfit', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  color: #6b4f00;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
:deep(.stale-banner__btn:hover:not(:disabled)) {
  background: #fff3cd;
  border-color: #b8860b;
}
:deep(.stale-banner__btn:disabled) { opacity: 0.5; cursor: not-allowed; }
:deep(.stale-banner__btn--primary) {
  background: #b8860b;
  color: white;
  border-color: #b8860b;
}
:deep(.stale-banner__btn--primary:hover:not(:disabled)) {
  background: #8a6307;
  border-color: #8a6307;
}

@media (max-width: 600px) {
  .stale-banner {
    flex-wrap: wrap;
  }
  .stale-banner__actions {
    flex-basis: 100%;
    margin-top: 4px;
  }
}
</style>
