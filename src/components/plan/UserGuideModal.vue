<script setup>
/**
 * Plan 페이지 사용자 가이드 모달.
 *
 * [2026-05-27 리팩토링] 골격/로직/스타일은 공통 BaseGuideModal 로 이관.
 * 이 파일은 steps 데이터 + illustration SVG (slot) 만 정의.
 *
 * 4 step: 미팅 로그 → CPS → PRD → Rule Generator.
 * 첫 방문 시 자동 표시 (호출자가 localStorage 확인), 이후 헬프 버튼으로 수동.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload, Sparkles, ListChecks, ShieldCheck } from 'lucide-vue-next'
import BaseGuideModal from '@/components/common/BaseGuideModal.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

// subtitle 은 순수 기술 용어(언어 무관)라 리터럴 유지. title/desc/tip 만 locale.
const steps = computed(() => [
  {
    no: '01',
    icon: Upload,
    title: t('plan.user_guide.step1_title'),
    subtitle: 'Meeting Log',
    desc: t('plan.user_guide.step1_desc'),
    tip: t('plan.user_guide.step1_tip'),
    illustration: 'meeting-log',
  },
  {
    no: '02',
    icon: Sparkles,
    title: t('plan.user_guide.step2_title'),
    subtitle: 'Context · Problem · Solution',
    desc: t('plan.user_guide.step2_desc'),
    tip: t('plan.user_guide.step2_tip'),
    illustration: 'cps',
  },
  {
    no: '03',
    icon: ListChecks,
    title: t('plan.user_guide.step3_title'),
    subtitle: 'Product Requirements Document',
    desc: t('plan.user_guide.step3_desc'),
    tip: t('plan.user_guide.step3_tip'),
    illustration: 'prd',
  },
  {
    no: '04',
    icon: ShieldCheck,
    title: t('plan.user_guide.step4_title'),
    subtitle: t('plan.user_guide.step4_subtitle'),
    desc: t('plan.user_guide.step4_desc'),
    tip: t('plan.user_guide.step4_tip'),
    illustration: 'rule',
  },
])
</script>

<template>
  <BaseGuideModal
    :model-value="modelValue"
    :steps="steps"
    seen-key="harness_plan_guide_seen_v1"
    pill="PLAN GUIDE"
    :headline="$t('plan.user_guide.headline')"
    :sub="$t('plan.user_guide.sub')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #illustration="{ illustration }">
      <!-- ① Meeting Log: 파일 업로드 + 버전 누적 -->
      <svg v-if="illustration === 'meeting-log'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="illust-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#illust-bg-1)" rx="12" />
        <g transform="translate(38,32)">
          <rect width="56" height="72" fill="white" stroke="#8C6239" stroke-width="2" rx="6" />
          <path d="M40,0 L56,16 L40,16 Z" fill="#8C6239" opacity="0.18" />
          <line x1="10" y1="28" x2="46" y2="28" stroke="#8C6239" stroke-width="2" stroke-linecap="round" opacity="0.5" />
          <line x1="10" y1="38" x2="40" y2="38" stroke="#8C6239" stroke-width="2" stroke-linecap="round" opacity="0.5" />
          <line x1="10" y1="48" x2="46" y2="48" stroke="#8C6239" stroke-width="2" stroke-linecap="round" opacity="0.5" />
          <text x="28" y="68" text-anchor="middle" font-family="IBM Plex Mono" font-size="9" fill="#8C6239" font-weight="700">v1.2</text>
        </g>
        <g transform="translate(110,66)">
          <line x1="0" y1="0" x2="30" y2="0" stroke="#2E4036" stroke-width="2.5" stroke-linecap="round" />
          <path d="M30,0 L24,-5 L24,5 Z" fill="#2E4036" />
        </g>
        <g transform="translate(150,30)">
          <rect width="56" height="14" fill="#fff" stroke="#2E4036" stroke-width="1.5" rx="4" opacity="0.4" />
          <text x="28" y="10" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" fill="#2E4036" font-weight="700">v1.0</text>
        </g>
        <g transform="translate(150,50)">
          <rect width="56" height="14" fill="#fff" stroke="#2E4036" stroke-width="1.5" rx="4" opacity="0.7" />
          <text x="28" y="10" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" fill="#2E4036" font-weight="700">v1.1</text>
        </g>
        <g transform="translate(150,70)">
          <rect width="56" height="14" fill="#2E4036" rx="4" />
          <text x="28" y="10" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" fill="white" font-weight="700">v1.2 NEW</text>
        </g>
      </svg>

      <!-- ② CPS: 문서 → AI → 구조화 카드 -->
      <svg v-else-if="illustration === 'cps'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="illust-bg-2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#illust-bg-2)" rx="12" />
        <g transform="translate(20,40)">
          <rect width="40" height="56" fill="white" stroke="#8C6239" stroke-width="2" rx="5" />
          <line x1="6" y1="14" x2="34" y2="14" stroke="#8C6239" stroke-width="1.5" opacity="0.5" />
          <line x1="6" y1="22" x2="28" y2="22" stroke="#8C6239" stroke-width="1.5" opacity="0.5" />
          <line x1="6" y1="30" x2="34" y2="30" stroke="#8C6239" stroke-width="1.5" opacity="0.5" />
          <line x1="6" y1="38" x2="22" y2="38" stroke="#8C6239" stroke-width="1.5" opacity="0.5" />
        </g>
        <g transform="translate(80,52)">
          <circle cx="20" cy="20" r="20" fill="#2E4036" opacity="0.12" />
          <circle cx="20" cy="20" r="14" fill="#2E4036" />
          <path d="M14,18 L18,22 L26,14" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M62,68 L78,68" />
          <path d="M122,68 L138,68" />
        </g>
        <path d="M78,68 L72,64 L72,72 Z" fill="#2E4036" />
        <path d="M138,68 L132,64 L132,72 Z" fill="#2E4036" />
        <g transform="translate(146,32)">
          <rect width="74" height="22" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <circle cx="10" cy="11" r="4" fill="#8C6239" />
          <text x="20" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">Context</text>
        </g>
        <g transform="translate(146,60)">
          <rect width="74" height="22" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <circle cx="10" cy="11" r="4" fill="#F44336" />
          <text x="20" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">Problem</text>
        </g>
        <g transform="translate(146,88)">
          <rect width="74" height="22" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <circle cx="10" cy="11" r="4" fill="#2E4036" />
          <text x="20" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">Solution</text>
        </g>
      </svg>

      <!-- ③ PRD: Epic → Story → AC -->
      <svg v-else-if="illustration === 'prd'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="illust-bg-3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#illust-bg-3)" rx="12" />
        <g transform="translate(20,30)">
          <rect width="64" height="80" fill="#8C6239" rx="6" />
          <text x="32" y="20" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="white" letter-spacing="0.08em">EPIC</text>
          <text x="32" y="48" text-anchor="middle" font-family="Pretendard" font-size="12" font-weight="800" fill="white">📦</text>
          <text x="32" y="66" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="700" fill="white" opacity="0.85">{{ $t('plan.user_guide.svg_epic_refund') }}</text>
        </g>
        <g stroke="#2E4036" stroke-width="1.5" stroke-linecap="round" opacity="0.5">
          <path d="M84,46 L116,32" fill="none" />
          <path d="M84,70 L116,70" fill="none" />
          <path d="M84,94 L116,108" fill="none" />
        </g>
        <g transform="translate(116,22)">
          <rect width="50" height="20" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <text x="25" y="13" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" font-weight="700" fill="#2E4036">Story 1</text>
        </g>
        <g transform="translate(116,60)">
          <rect width="50" height="20" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <text x="25" y="13" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" font-weight="700" fill="#2E4036">Story 2</text>
        </g>
        <g transform="translate(116,98)">
          <rect width="50" height="20" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <text x="25" y="13" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" font-weight="700" fill="#2E4036">Story 3</text>
        </g>
        <g transform="translate(176,30)">
          <rect width="50" height="80" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
          <text x="25" y="14" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#2E4036" letter-spacing="0.08em">A C</text>
          <g transform="translate(6,22)">
            <rect width="8" height="8" fill="#2E4036" rx="1" />
            <path d="M2,4 L4,6 L6,2" stroke="white" stroke-width="1" fill="none" />
            <line x1="12" y1="6" x2="42" y2="6" stroke="#2E4036" stroke-width="1" opacity="0.5" />
          </g>
          <g transform="translate(6,36)">
            <rect width="8" height="8" fill="#2E4036" rx="1" />
            <path d="M2,4 L4,6 L6,2" stroke="white" stroke-width="1" fill="none" />
            <line x1="12" y1="6" x2="38" y2="6" stroke="#2E4036" stroke-width="1" opacity="0.5" />
          </g>
          <g transform="translate(6,50)">
            <rect width="8" height="8" fill="white" stroke="#2E4036" stroke-width="1" rx="1" />
            <line x1="12" y1="6" x2="40" y2="6" stroke="#2E4036" stroke-width="1" opacity="0.5" />
          </g>
          <g transform="translate(6,64)">
            <rect width="8" height="8" fill="white" stroke="#2E4036" stroke-width="1" rx="1" />
            <line x1="12" y1="6" x2="36" y2="6" stroke="#2E4036" stroke-width="1" opacity="0.5" />
          </g>
        </g>
      </svg>

      <!-- ④ Rule: 톱니바퀴 + Skill 칩 -->
      <svg v-else-if="illustration === 'rule'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="illust-bg-4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#illust-bg-4)" rx="12" />
        <g transform="translate(38,52)">
          <circle cx="18" cy="18" r="18" fill="#2E4036" opacity="0.1" />
          <circle cx="18" cy="18" r="10" fill="#2E4036" />
          <circle cx="18" cy="18" r="4" fill="#f9f6f1" />
          <g fill="#2E4036">
            <rect x="16" y="0" width="4" height="6" />
            <rect x="16" y="30" width="4" height="6" />
            <rect x="0" y="16" width="6" height="4" />
            <rect x="30" y="16" width="6" height="4" />
          </g>
        </g>
        <g transform="translate(82,68)">
          <line x1="0" y1="0" x2="22" y2="0" stroke="#2E4036" stroke-width="2.5" stroke-linecap="round" />
          <path d="M22,0 L16,-5 L16,5 Z" fill="#2E4036" />
        </g>
        <g transform="translate(116,28)">
          <rect width="98" height="20" fill="white" stroke="#2E4036" stroke-width="1.5" rx="10" />
          <circle cx="12" cy="10" r="4" fill="#2E4036" />
          <path d="M9,10 L11,12 L15,8" stroke="white" stroke-width="1.2" fill="none" />
          <text x="22" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">{{ $t('plan.user_guide.svg_rule_naming') }}</text>
        </g>
        <g transform="translate(116,56)">
          <rect width="98" height="20" fill="white" stroke="#8C6239" stroke-width="1.5" rx="10" />
          <circle cx="12" cy="10" r="4" fill="#8C6239" />
          <path d="M9,10 L11,12 L15,8" stroke="white" stroke-width="1.2" fill="none" />
          <text x="22" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">{{ $t('plan.user_guide.svg_rule_audit') }}</text>
        </g>
        <g transform="translate(116,84)">
          <rect width="98" height="20" fill="white" stroke="#2E4036" stroke-width="1.5" rx="10" opacity="0.7" />
          <circle cx="12" cy="10" r="4" fill="#2E4036" opacity="0.6" />
          <text x="22" y="14" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036" opacity="0.7">{{ $t('plan.user_guide.svg_rule_more') }}</text>
        </g>
      </svg>
    </template>
  </BaseGuideModal>
</template>
