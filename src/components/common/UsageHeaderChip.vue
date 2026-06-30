<script setup>
/**
 * UsageHeaderChip — 헤더에 표시하는 작은 사용량 칩 (모든 페이지 노출).
 *
 * 표시: [Free|Pro] [미팅 N/M] [토큰 NN%]
 *  - 미팅: 잔여 표시 (남은 건수가 더 직관적)
 *  - 토큰: 퍼센트 표시 (절대값은 헤더에 부담)
 *  - 80% 이상: 주황, 100%: 빨강 (pulse 애니메이션)
 *
 * 클릭 = 항상 /profile. 한도 도달 모달은 axios 402 interceptor 가 자동 트리거 →
 * 칩은 사용자 정보/사용량 진입점 단일 역할.
 *
 * 반응형:
 *  - 1200px+: 전체 (tier + metrics)
 *  - 900~1200px: ProjectLookup 좁아짐, 칩 padding 축소
 *  - 600~900px: tier-pill 숨김 (공간 절약)
 *  - 600px↓ (모바일): metrics 숨김 + tier-pill 만 표시 → 프로필 진입점 유지.
 *    (이전엔 칩 자체를 숨겼으나 프로필 버튼도 제거되면서 모바일 사용자가 프로필
 *    진입 불가 → 칩이라도 남겨야 함.)
 */
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Crown } from 'lucide-vue-next'
import { useUsageStore } from '@/store/usage'

const { t } = useI18n()
const router = useRouter()
const usage = useUsageStore()

onMounted(() => {
  // 첫 mount 시 1회 로드 (캐시 30초 — 추가 mount 시 재요청 없음)
  usage.refresh({ silent: true })
})

const meetingChipColor = computed(() => {
  if (usage.meetingPct >= 100) return 'danger'
  if (usage.meetingPct >= 80) return 'warning'
  return 'default'
})

// [2026-06] Lite 오버플로우 — 메인 소진 유료 등급은 차단이 아니라 Lite 모드로 작업 중.
//   토큰 메트릭: overflow 중이면 'Lite' 표시(teal), 진짜 차단(주간캡 소진)일 때만 danger.
const tokensChipColor = computed(() => {
  if (usage.liteOverflowActive) {
    return usage.liteDailyPct >= 100 ? 'danger' : 'lite'  // 주간캡 소진=danger, 아니면 lite
  }
  if (usage.tokensPct >= 100) return 'danger'
  if (usage.tokensPct >= 80) return 'warning'
  return 'default'
})

// 칩의 토큰 텍스트 — overflow 중이면 'Lite', 아니면 사용률 %.
const tokensDisplay = computed(() =>
  usage.liteOverflowActive ? 'Lite' : `${usage.tokensPct}%`,
)

// 진짜 차단 상태(빨강 pulse) — 메인 소진이어도 Lite 로 넘어가면 차단 아님.
// store.isTokenBlocked 단일 출처 (MeetingLogEditor 진입 가드와 동일 판정).
const chipExhausted = computed(() => usage.meetingPct >= 100 || usage.isTokenBlocked)

// 클릭 = 항상 프로필 페이지로. 한도 도달은 칩의 시각적 표시(빨강 + pulse)로 충분히 인지 가능.
// 프로필 페이지의 UsageCard 에서 Pro 안내 / 상세 사용량 확인 → 일관된 UX.
const onClick = () => {
  router.push('/profile')
}

// [2026-05 월간 reset] 칩 hover title 에 "N일 후 reset" 안내.
// 헤더에서 "내 cycle 언제 끝나지?" 즉답 가능 — 프로필 진입 안 해도 됨.
const titleText = computed(() => {
  const base = chipExhausted.value
    ? t('common.usage.title_exhausted')
    : t('common.usage.title_default')
  const days = usage.daysUntilReset
  if (days == null) return base
  if (days <= 0) return t('common.usage.title_reset_soon', { base })
  return t('common.usage.title_reset_days', { base, days })
})
</script>

<template>
  <button
    v-if="usage.data"
    type="button"
    class="usage-chip"
    :class="{ 'usage-chip--exhausted': chipExhausted }"
    @click="onClick"
    :title="titleText"
    :aria-label="$t('common.usage.aria_label')"
  >
    <!-- 등급 — Free / Pro / Pro+ / Pro Max 분기 색상 -->
    <span
      class="tier-pill"
      :class="{ 'tier-pill--paid': usage.isPaid }"
      :style="usage.isPaid ? { background: usage.tierMeta.gradient } : null"
    >
      <Crown v-if="usage.isPaid" :size="10" class="mr-1" />
      {{ usage.tierLabel }}
    </span>

    <!-- 미팅 잔여 -->
    <span class="metric" :class="`metric--${meetingChipColor}`">
      <span class="metric-icon" aria-hidden="true">📋</span>
      <span class="metric-text">{{ usage.meetingUsed }}/{{ usage.meetingLimit }}</span>
    </span>

    <!-- 토큰 % (또는 오버플로우 중 'Lite') -->
    <span class="metric" :class="`metric--${tokensChipColor}`">
      <span class="metric-icon" aria-hidden="true">🪙</span>
      <span class="metric-text">{{ tokensDisplay }}</span>
    </span>
  </button>
</template>

<style scoped>
.usage-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 9999px;
  border: 1px solid var(--border-light, rgba(140, 98, 57, 0.1));
  background: var(--bg-light, #F7F5EB);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-main, #2A2421);
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: 'Pretendard', sans-serif;
}
.usage-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(140, 98, 57, 0.12);
}
.usage-chip--exhausted {
  border-color: #fca5a5;
  background: #fef2f2;
  /* 만료/한도 도달 상태 — 사용자 인지 우선. 1.4s cycle 로 잔잔하지 않게,
     box-shadow 0→10px 까지 퍼지면서 border 도 함께 깊은 빨강으로 깜빡. */
  animation: pulse-strong 1.4s ease-in-out infinite;
}
.usage-chip--exhausted .metric--danger {
  /* 빨간 "50/50" 텍스트도 같이 살짝 깜빡 — 칩 외곽 pulse 와 sync. */
  animation: text-pulse 1.4s ease-in-out infinite;
}
@keyframes pulse-strong {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55);
    border-color: #fca5a5;
  }
  50% {
    box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
    border-color: #dc2626;
  }
}
@keyframes text-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
/* prefers-reduced-motion 사용자 (모션 민감) 는 애니메이션 끄고 정적인 빨강만. */
@media (prefers-reduced-motion: reduce) {
  .usage-chip--exhausted,
  .usage-chip--exhausted .metric--danger {
    animation: none;
  }
}

.tier-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted, #6F665F);
  letter-spacing: 0.02em;
}
/* 유료 등급 — gradient 는 inline style 로 등급별 (Pro 호박 / Pro+ 보라 / Pro Max 골드). */
.tier-pill--paid {
  color: #ffffff;
}

.metric {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}
.metric-icon { font-size: 0.85rem; line-height: 1; }
.metric-text { font-size: 0.72rem; }
.metric--warning { color: #d97706; }
.metric--danger { color: #dc2626; font-weight: 700; }
/* [2026-06] Lite 오버플로우 — 차단 아님(정상 작업 중)이라 teal 로 구분. */
.metric--lite { color: #0d9488; font-weight: 700; }

/* 600~900px — 공간 좁음. tier-pill 숨겨서 metrics (📋, 🪙) 만 표시. */
@media (max-width: 900px) {
  .usage-chip {
    padding: 3px 6px;
    gap: 4px;
  }
  .tier-pill { display: none; }
}
/* 모바일 (600px↓) — metrics 숨기고 tier-pill 만 표시.
   프로필 버튼 제거된 상태라 이 칩이 프로필 페이지 진입점.
   tier-pill 만 보여도 클릭 영역 충분하고 사용자에게 "내 등급/계정" hint. */
@media (max-width: 600px) {
  .usage-chip {
    padding: 4px 8px;
    gap: 4px;
  }
  .tier-pill { display: inline-flex; }  /* 900px↓ 규칙 override */
  .metric { display: none; }
}
</style>
