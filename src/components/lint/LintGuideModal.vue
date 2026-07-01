<script setup>
/**
 * Lint 페이지 사용자 가이드 모달.
 *
 * [2026-05-27 리팩토링] 골격/로직/스타일은 공통 BaseGuideModal 로 이관.
 * 이 파일은 steps 데이터 + illustration SVG (slot) 만 정의.
 *
 * 4 step: Lint 개요 → GitHub URL 설정 → Run Lint 카테고리 → Constraint Fix Agent.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ShieldCheck, Github, PlayCircle, Wand2 } from 'lucide-vue-next'
import BaseGuideModal from '@/components/common/BaseGuideModal.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const steps = computed(() => [
  {
    no: '01',
    icon: ShieldCheck,
    title: t('lint.guide.step1.title'),
    subtitle: t('lint.guide.step1.subtitle'),
    desc: t('lint.guide.step1.desc'),
    tip: t('lint.guide.step1.tip'),
    illustration: 'overview',
  },
  {
    no: '02',
    icon: Github,
    title: t('lint.guide.step2.title'),
    subtitle: t('lint.guide.step2.subtitle'),
    desc: t('lint.guide.step2.desc'),
    tip: t('lint.guide.step2.tip'),
    illustration: 'github',
  },
  {
    no: '03',
    icon: PlayCircle,
    title: t('lint.guide.step3.title'),
    subtitle: t('lint.guide.step3.subtitle'),
    desc: t('lint.guide.step3.desc'),
    tip: t('lint.guide.step3.tip'),
    illustration: 'categories',
  },
  {
    no: '04',
    icon: Wand2,
    title: t('lint.guide.step4.title'),
    subtitle: t('lint.guide.step4.subtitle'),
    desc: t('lint.guide.step4.desc'),
    tip: t('lint.guide.step4.tip'),
    illustration: 'fix',
  },
])
</script>

<template>
  <BaseGuideModal
    :model-value="modelValue"
    :steps="steps"
    seen-key="gayoje_lint_guide_seen_v1"
    :pill="$t('lint.guide.pill')"
    :headline="$t('lint.guide.headline')"
    :sub="$t('lint.guide.sub')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #illustration="{ illustration }">
      <!-- ① Overview: code → shield → 결과 -->
      <svg v-if="illustration === 'overview'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="lint-illust-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#lint-illust-bg-1)" rx="12" />
        <g transform="translate(14,30)">
          <rect width="64" height="80" fill="white" stroke="#2E4036" stroke-width="1.5" rx="6" />
          <rect width="64" height="14" fill="#2E4036" rx="6 6 0 0" />
          <circle cx="8" cy="7" r="2" fill="#fb7185" />
          <circle cx="16" cy="7" r="2" fill="#fbbf24" />
          <circle cx="24" cy="7" r="2" fill="#34d399" />
          <g transform="translate(6,22)" font-family="IBM Plex Mono" font-size="6" fill="#2E4036">
            <text>const order =</text>
            <text y="10">  fetch(...)</text>
            <text y="22">function pay() {</text>
            <text y="32">  return ok</text>
            <text y="42">}</text>
          </g>
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M82,70 L98,70" />
        </g>
        <path d="M98,70 L92,66 L92,74 Z" fill="#2E4036" />
        <g transform="translate(106,40)">
          <path d="M28,0 L52,8 L52,38 Q52,52 28,60 Q4,52 4,38 L4,8 Z"
                fill="#FFFBEB" stroke="#8C6239" stroke-width="2" />
          <path d="M18,30 L26,38 L40,22" stroke="#8C6239" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <text x="28" y="56" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.08em">LINT</text>
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M168,70 L184,70" />
        </g>
        <path d="M184,70 L178,66 L178,74 Z" fill="#2E4036" />
        <g transform="translate(188,38)">
          <rect width="42" height="20" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="4" />
          <circle cx="9" cy="10" r="4" fill="#16A34A" />
          <path d="M6,10 L8,12 L12,7" stroke="white" stroke-width="1.5" fill="none" />
          <text x="28" y="13" text-anchor="middle" font-family="Pretendard Variable, Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#15803D">PASS</text>
        </g>
        <g transform="translate(188,64)">
          <rect width="42" height="20" fill="#FEF2F2" stroke="#dc2626" stroke-width="1.5" rx="4" />
          <circle cx="9" cy="10" r="4" fill="#dc2626" />
          <path d="M6,7 L12,13 M12,7 L6,13" stroke="white" stroke-width="1.5" />
          <text x="28" y="13" text-anchor="middle" font-family="Pretendard Variable, Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#b91c1c">FAIL</text>
        </g>
        <g transform="translate(188,90)">
          <rect width="42" height="20" fill="#FFFBEB" stroke="#d97706" stroke-width="1.5" rx="4" />
          <circle cx="9" cy="10" r="4" fill="#d97706" />
          <text x="9" y="13" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="white">!</text>
          <text x="28" y="13" text-anchor="middle" font-family="Pretendard Variable, Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#92400E">WARN</text>
        </g>
      </svg>

      <!-- ② GitHub URL setup -->
      <svg v-else-if="illustration === 'github'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="lint-illust-bg-2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#lint-illust-bg-2)" rx="12" />
        <g transform="translate(20,24)">
          <rect width="200" height="92" fill="white" stroke="#2E4036" stroke-width="1.5" rx="8" />
          <rect width="200" height="20" fill="#F1ECE2" rx="8 8 0 0" />
          <circle cx="10" cy="10" r="3" fill="#fb7185" />
          <circle cx="22" cy="10" r="3" fill="#fbbf24" />
          <circle cx="34" cy="10" r="3" fill="#34d399" />
          <rect x="48" y="5" width="140" height="10" fill="white" stroke="#cbd5e1" stroke-width="1" rx="3" />
          <text x="118" y="13" text-anchor="middle" font-family="Pretendard Variable, Pretendard, -apple-system, sans-serif" font-size="6" fill="#94a3b8">{{ $t('lint.guide.illust.code_screen') }}</text>
          <text x="10" y="38" font-family="Outfit" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.08em">GITHUB URL</text>
          <g transform="translate(10,44)">
            <rect width="180" height="22" fill="#FFFBEB" stroke="#8C6239" stroke-width="1.5" rx="6" />
            <g transform="translate(8,7)" fill="#2E4036">
              <circle cx="4" cy="4" r="4" />
              <path d="M4,2 Q2,2 2,4 Q2,6 4,6 L4,8" stroke="white" stroke-width="0.8" fill="none" />
            </g>
            <text x="22" y="15" font-family="IBM Plex Mono" font-size="8" font-weight="700" fill="#2E4036">github.com/your/repo</text>
          </g>
          <g transform="translate(10,72)">
            <text font-family="Pretendard" font-size="7" fill="#94a3b8">{{ $t('lint.guide.illust.public_private') }}</text>
          </g>
          <g transform="translate(126,70)">
            <rect width="58" height="14" fill="#2E4036" rx="7" />
            <text x="29" y="10" text-anchor="middle" font-family="Outfit" font-size="6" font-weight="800" fill="white" letter-spacing="0.08em">CONNECT</text>
          </g>
        </g>
      </svg>

      <!-- ③ Categories: 4개 카드 2x2 -->
      <svg v-else-if="illustration === 'categories'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="lint-illust-bg-3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#lint-illust-bg-3)" rx="12" />
        <g transform="translate(14,18)">
          <rect width="100" height="50" fill="white" stroke="#8C6239" stroke-width="1.5" rx="8" />
          <text x="10" y="16" font-family="Outfit" font-size="8" font-weight="800" fill="#2E4036">SPACK</text>
          <text x="90" y="16" text-anchor="end" font-family="IBM Plex Mono" font-size="9" font-weight="800" fill="#16A34A">92%</text>
          <rect x="10" y="28" width="80" height="6" fill="rgba(0,0,0,0.05)" rx="3" />
          <rect x="10" y="28" width="74" height="6" fill="#2E4036" rx="3" />
        </g>
        <g transform="translate(124,18)">
          <rect width="100" height="50" fill="#8C6239" stroke="#8C6239" stroke-width="1.5" rx="8" />
          <text x="10" y="16" font-family="Outfit" font-size="8" font-weight="800" fill="white">DDD</text>
          <text x="90" y="16" text-anchor="end" font-family="IBM Plex Mono" font-size="9" font-weight="800" fill="white">78%</text>
          <rect x="10" y="28" width="80" height="6" fill="rgba(255,255,255,0.2)" rx="3" />
          <rect x="10" y="28" width="62" height="6" fill="white" rx="3" />
        </g>
        <g transform="translate(14,76)">
          <rect width="100" height="50" fill="white" stroke="#8C6239" stroke-width="1.5" rx="8" />
          <text x="10" y="16" font-family="Outfit" font-size="7" font-weight="800" fill="#2E4036">ARCHITECTURE</text>
          <text x="90" y="16" text-anchor="end" font-family="IBM Plex Mono" font-size="9" font-weight="800" fill="#16A34A">88%</text>
          <rect x="10" y="28" width="80" height="6" fill="rgba(0,0,0,0.05)" rx="3" />
          <rect x="10" y="28" width="70" height="6" fill="#2E4036" rx="3" />
        </g>
        <g transform="translate(124,76)">
          <rect width="100" height="50" fill="white" stroke="#8C6239" stroke-width="1.5" rx="8" />
          <text x="10" y="16" font-family="Outfit" font-size="8" font-weight="800" fill="#2E4036">RULES</text>
          <text x="90" y="16" text-anchor="end" font-family="IBM Plex Mono" font-size="9" font-weight="800" fill="#d97706">65%</text>
          <rect x="10" y="28" width="80" height="6" fill="rgba(0,0,0,0.05)" rx="3" />
          <rect x="10" y="28" width="52" height="6" fill="#d97706" rx="3" />
        </g>
      </svg>

      <!-- ④ Fix Agent -->
      <svg v-else-if="illustration === 'fix'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="lint-illust-bg-4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#lint-illust-bg-4)" rx="12" />
        <g transform="translate(12,22)">
          <rect width="80" height="96" fill="white" stroke="#dc2626" stroke-width="1.5" rx="6" />
          <rect width="80" height="14" fill="#dc2626" rx="6 6 0 0" />
          <text x="40" y="10" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="white" letter-spacing="0.08em">VIOLATIONS</text>
          <g transform="translate(6,20)" font-family="Pretendard" font-size="6" fill="#2E4036">
            <g>
              <path d="M0,2 L4,6 M4,2 L0,6" stroke="#dc2626" stroke-width="1.2" />
              <text x="8" y="5" font-weight="700">naming</text>
            </g>
            <g transform="translate(0,12)">
              <path d="M0,2 L4,6 M4,2 L0,6" stroke="#dc2626" stroke-width="1.2" />
              <text x="8" y="5" font-weight="700">audit log</text>
            </g>
            <g transform="translate(0,24)">
              <path d="M0,2 L4,6 M4,2 L0,6" stroke="#dc2626" stroke-width="1.2" />
              <text x="8" y="5" font-weight="700">err handle</text>
            </g>
            <g transform="translate(0,36)">
              <path d="M0,2 L4,6 M4,2 L0,6" stroke="#dc2626" stroke-width="1.2" />
              <text x="8" y="5" font-weight="700">DI scope</text>
            </g>
            <g transform="translate(0,48)">
              <path d="M0,2 L4,6 M4,2 L0,6" stroke="#dc2626" stroke-width="1.2" />
              <text x="8" y="5" font-weight="700">tx bound</text>
            </g>
          </g>
        </g>
        <g transform="translate(100,52)">
          <line x1="0" y1="18" x2="24" y2="18" stroke="#2E4036" stroke-width="2.5" stroke-linecap="round" />
          <path d="M24,18 L18,14 L18,22 Z" fill="#2E4036" />
          <g transform="translate(2,0)">
            <circle cx="10" cy="8" r="3" fill="#fbbf24" />
            <line x1="8" y1="6" x2="5" y2="3" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round" />
            <line x1="13" y1="8" x2="17" y2="6" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round" />
          </g>
        </g>
        <g transform="translate(132,22)">
          <rect width="94" height="96" fill="white" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <rect width="94" height="14" fill="#16A34A" rx="6 6 0 0" />
          <text x="47" y="10" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="white" letter-spacing="0.08em">FIX SPEC</text>
          <g transform="translate(8,22)" font-family="IBM Plex Mono" font-size="6" fill="#2E4036">
            <text>+ rename to</text>
            <text y="10" font-weight="800" fill="#16A34A">  PascalCase</text>
            <text y="22">+ add audit</text>
            <text y="32" font-weight="800" fill="#16A34A">  log middleware</text>
            <text y="44">+ wrap in</text>
            <text y="54" font-weight="800" fill="#16A34A">  try/catch</text>
            <text y="66" fill="#94a3b8" font-style="italic">{{ $t('lint.guide.illust.etc_n') }}</text>
          </g>
        </g>
        <g transform="translate(218,8)">
          <text font-family="Pretendard" font-size="14">✨</text>
        </g>
      </svg>
    </template>
  </BaseGuideModal>
</template>
