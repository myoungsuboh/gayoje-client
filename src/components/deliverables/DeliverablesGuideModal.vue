<script setup>
/**
 * Deliverables 페이지 사용자 가이드 모달.
 *
 * [2026-05-27 리팩토링] 골격/로직/스타일은 공통 BaseGuideModal 로 이관.
 * 이 파일은 steps 데이터 + illustration SVG (slot) 만 정의.
 *
 * 4 step: Deliverables 개요 → Repository 등록 → Lineage & Quality → Handoff ZIP.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Package, Github, Link2, Download } from 'lucide-vue-next'
import BaseGuideModal from '@/components/common/BaseGuideModal.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

// locale 의존 — 모듈 상수 대신 computed (언어 전환 시 갱신).
const steps = computed(() => [
  {
    no: '01',
    icon: Package,
    title: t('deliverables.guide.step1.title'),
    subtitle: t('deliverables.guide.step1.subtitle'),
    desc: t('deliverables.guide.step1.desc'),
    tip: t('deliverables.guide.step1.tip'),
    illustration: 'overview',
  },
  {
    no: '02',
    icon: Github,
    title: t('deliverables.guide.step2.title'),
    subtitle: t('deliverables.guide.step2.subtitle'),
    desc: t('deliverables.guide.step2.desc'),
    tip: t('deliverables.guide.step2.tip'),
    illustration: 'repos',
  },
  {
    no: '03',
    icon: Link2,
    title: t('deliverables.guide.step3.title'),
    subtitle: t('deliverables.guide.step3.subtitle'),
    desc: t('deliverables.guide.step3.desc'),
    tip: t('deliverables.guide.step3.tip'),
    illustration: 'lineage',
  },
  {
    no: '04',
    icon: Download,
    title: t('deliverables.guide.step4.title'),
    subtitle: t('deliverables.guide.step4.subtitle'),
    desc: t('deliverables.guide.step4.desc'),
    tip: t('deliverables.guide.step4.tip'),
    illustration: 'handoff',
  },
])
</script>

<template>
  <BaseGuideModal
    :model-value="modelValue"
    :steps="steps"
    seen-key="harness_deliverables_guide_seen_v1"
    :pill="$t('deliverables.guide.pill')"
    :headline="$t('deliverables.guide.headline')"
    :sub="$t('deliverables.guide.sub')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #illustration="{ illustration }">
      <!-- ① Overview: dashboard KPI 카드 + ZIP -->
      <svg v-if="illustration === 'overview'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="del-illust-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#del-illust-bg-1)" rx="12" />
        <g transform="translate(14,18)">
          <rect width="212" height="32" fill="white" stroke="#8C6239" stroke-width="1.5" rx="8" />
          <text x="12" y="13" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.02em">PROJECT SUMMARY</text>
          <text x="12" y="26" font-family="Outfit" font-size="11" font-weight="900" fill="#2E4036">myproject</text>
        </g>
        <g transform="translate(14,58)">
          <rect width="48" height="36" fill="#8C6239" rx="6" />
          <text x="24" y="14" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="white" opacity="0.85" letter-spacing="0.04em">REPOS</text>
          <text x="24" y="28" text-anchor="middle" font-family="Outfit" font-size="14" font-weight="900" fill="white">5</text>
        </g>
        <g transform="translate(66,58)">
          <rect width="48" height="36" fill="white" stroke="#cbd5e1" stroke-width="1" rx="6" />
          <text x="24" y="14" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#94a3b8" letter-spacing="0.04em">FILES</text>
          <text x="24" y="28" text-anchor="middle" font-family="Outfit" font-size="12" font-weight="900" fill="#2E4036">820</text>
        </g>
        <g transform="translate(118,58)">
          <rect width="48" height="36" fill="white" stroke="#cbd5e1" stroke-width="1" rx="6" />
          <text x="24" y="14" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#94a3b8" letter-spacing="0.04em">LOC</text>
          <text x="24" y="28" text-anchor="middle" font-family="Outfit" font-size="11" font-weight="900" fill="#2E4036">18.4K</text>
        </g>
        <g transform="translate(170,58)">
          <rect width="56" height="36" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <text x="28" y="14" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#15803D" letter-spacing="0.04em">AVG LINT</text>
          <text x="28" y="28" text-anchor="middle" font-family="Outfit" font-size="12" font-weight="900" fill="#15803D">86%</text>
        </g>
        <g transform="translate(14,102)">
          <rect width="212" height="24" fill="#2E4036" rx="12" />
          <g transform="translate(14,5)" fill="white">
            <path d="M0,0 L8,0 L8,14 L0,14 Z" />
            <rect x="2" y="3" width="4" height="2" fill="#2E4036" />
            <rect x="2" y="7" width="4" height="2" fill="#2E4036" />
          </g>
          <text x="106" y="16" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="white" letter-spacing="0.08em">{{ $t('deliverables.guide.illustration_zip_label') }}</text>
        </g>
      </svg>

      <!-- ② Repo 등록 -->
      <svg v-else-if="illustration === 'repos'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="del-illust-bg-2" x1="0" y1="0" x2="1" y2="2">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#del-illust-bg-2)" rx="12" />
        <g transform="translate(12,16)">
          <rect width="108" height="52" fill="white" stroke="#2563EB" stroke-width="1.5" rx="6" />
          <g transform="translate(8,7)" fill="#2563EB">
            <path d="M7,0 a7,7 0 1,0 0.001,0 z M7,2 a5,5 0 1,1 0,10 a5,5 0 1,1 0,-10" />
          </g>
          <text x="22" y="14" font-family="Outfit" font-size="7" font-weight="800" fill="#2563EB" letter-spacing="0.08em">FRONTEND</text>
          <text x="8" y="30" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#2E4036">myproject-web</text>
          <text x="8" y="42" font-family="Pretendard" font-size="6" fill="#94a3b8">★ 12 · 8.2K LOC · 92%</text>
        </g>
        <g transform="translate(124,16)">
          <rect width="104" height="52" fill="white" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <g transform="translate(8,7)" fill="#16A34A">
            <path d="M7,0 a7,7 0 1,0 0.001,0 z M7,2 a5,5 0 1,1 0,10 a5,5 0 1,1 0,-10" />
          </g>
          <text x="22" y="14" font-family="Outfit" font-size="7" font-weight="800" fill="#16A34A" letter-spacing="0.08em">BACKEND</text>
          <text x="8" y="30" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#2E4036">myproject-api</text>
          <text x="8" y="42" font-family="Pretendard" font-size="6" fill="#94a3b8">★ 7 · 6.1K LOC · 84%</text>
        </g>
        <g transform="translate(12,76)">
          <rect width="68" height="44" fill="white" stroke="#0891b2" stroke-width="1.5" rx="6" />
          <g transform="translate(8,9)" fill="#0891b2">
            <ellipse cx="6" cy="3" rx="6" ry="2" />
            <rect x="0" y="3" width="12" height="6" />
            <ellipse cx="6" cy="9" rx="6" ry="2" />
          </g>
          <text x="26" y="12" font-family="Outfit" font-size="7" font-weight="800" fill="#0891b2">DB</text>
          <text x="8" y="28" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#2E4036">schema</text>
          <text x="8" y="38" font-family="Pretendard" font-size="6" fill="#94a3b8">120 files · 1.2K</text>
        </g>
        <g transform="translate(84,76)">
          <rect width="68" height="44" fill="white" stroke="#9333ea" stroke-width="1.5" rx="6" />
          <g transform="translate(8,7)" fill="#9333ea">
            <rect width="10" height="14" rx="2" />
            <rect x="3" y="3" width="4" height="8" fill="white" />
          </g>
          <text x="26" y="12" font-family="Outfit" font-size="7" font-weight="800" fill="#9333ea">MOBILE</text>
          <text x="8" y="28" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#2E4036">myproject-app</text>
          <text x="8" y="38" font-family="Pretendard" font-size="6" fill="#94a3b8">220 files · 4.8K</text>
        </g>
        <g transform="translate(156,76)">
          <rect width="72" height="44" fill="rgba(140,98,57,0.06)" stroke="#8C6239" stroke-width="1.5" stroke-dasharray="3 3" rx="6" />
          <text x="36" y="20" text-anchor="middle" font-family="Outfit" font-size="14" font-weight="900" fill="#8C6239">+</text>
          <text x="36" y="34" text-anchor="middle" font-family="Outfit" font-size="6" font-weight="800" fill="#8C6239" letter-spacing="0.08em">ADD REPO</text>
        </g>
      </svg>

      <!-- ③ Lineage: PRD → Design → Code -->
      <svg v-else-if="illustration === 'lineage'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="del-illust-bg-3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#del-illust-bg-3)" rx="12" />
        <text x="40" y="20" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.08em">PRD</text>
        <text x="120" y="20" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.08em">DESIGN</text>
        <text x="200" y="20" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#8C6239" letter-spacing="0.08em">CODE</text>
        <g transform="translate(12,28)">
          <rect width="56" height="16" fill="white" stroke="#8C6239" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#2E4036">Story 1</text>
        </g>
        <g transform="translate(12,52)">
          <rect width="56" height="16" fill="white" stroke="#8C6239" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#2E4036">Story 2</text>
        </g>
        <g transform="translate(12,76)">
          <rect width="56" height="16" fill="white" stroke="#8C6239" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#2E4036">Story 3</text>
        </g>
        <g transform="translate(92,28)">
          <rect width="56" height="16" fill="#EFF6FF" stroke="#2563EB" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#1D4ED8">API-01</text>
        </g>
        <g transform="translate(92,52)">
          <rect width="56" height="16" fill="#FEF3C7" stroke="#D97706" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#B45309">AGG-02</text>
        </g>
        <g transform="translate(92,76)">
          <rect width="56" height="16" fill="#F0FDF4" stroke="#16A34A" stroke-width="1" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="700" fill="#15803D">SVC-03</text>
        </g>
        <g transform="translate(172,28)">
          <rect width="56" height="16" fill="white" stroke="#16A34A" stroke-width="1.5" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#15803D">order.ts</text>
        </g>
        <g transform="translate(172,52)">
          <rect width="56" height="16" fill="white" stroke="#16A34A" stroke-width="1.5" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#15803D">cart.ts</text>
        </g>
        <g transform="translate(172,76)">
          <rect width="56" height="16" fill="white" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="2 2" rx="3" />
          <text x="28" y="11" text-anchor="middle" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" font-weight="700" fill="#dc2626">missing?</text>
        </g>
        <g stroke="#2E4036" stroke-width="1" fill="none" opacity="0.5">
          <path d="M68,36 L92,36" /><path d="M68,60 L92,60" /><path d="M68,84 L92,84" />
          <path d="M148,36 L172,36" /><path d="M148,60 L172,60" />
          <path d="M148,84 L172,84" stroke="#dc2626" stroke-dasharray="2 2" opacity="1" />
        </g>
        <g transform="translate(14,108)">
          <text x="0" y="0" font-family="Outfit" font-size="7" font-weight="800" fill="#2E4036" letter-spacing="0.08em">COVERAGE</text>
          <rect x="60" y="-6" width="150" height="8" fill="rgba(0,0,0,0.05)" rx="4" />
          <rect x="60" y="-6" width="125" height="8" fill="#16A34A" rx="4" />
          <text x="218" y="0" text-anchor="end" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" font-weight="800" fill="#16A34A">83%</text>
        </g>
      </svg>

      <!-- ④ Handoff ZIP -->
      <svg v-else-if="illustration === 'handoff'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="del-illust-bg-4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#del-illust-bg-4)" rx="12" />
        <g transform="translate(14,22)">
          <rect x="12" y="0" width="40" height="48" fill="white" stroke="#cbd5e1" stroke-width="1" rx="3" />
          <rect x="8" y="4" width="40" height="48" fill="white" stroke="#cbd5e1" stroke-width="1" rx="3" />
          <rect x="4" y="8" width="40" height="48" fill="white" stroke="#cbd5e1" stroke-width="1" rx="3" />
          <rect x="0" y="12" width="40" height="48" fill="white" stroke="#8C6239" stroke-width="1.5" rx="3" />
          <g transform="translate(4,18)" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" fill="#2E4036">
            <text>SPACK.md</text>
            <text y="9">DDD.md</text>
            <text y="18">ARCH.md</text>
            <text y="27">SKILLS</text>
            <text y="36" fill="#94a3b8">+ N</text>
          </g>
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M76,58 L100,58" />
        </g>
        <path d="M100,58 L94,54 L94,62 Z" fill="#2E4036" />
        <g transform="translate(106,30)">
          <rect width="58" height="60" fill="#2E4036" rx="6" />
          <rect x="6" y="4" width="46" height="8" fill="#8C6239" rx="2" />
          <text x="29" y="11" text-anchor="middle" font-family="Outfit" font-size="6" font-weight="800" fill="white" letter-spacing="0.08em">ZIP</text>
          <g transform="translate(12,20)" fill="white">
            <rect width="34" height="3" rx="1" opacity="0.8" />
            <rect y="7" width="30" height="3" rx="1" opacity="0.6" />
            <rect y="14" width="34" height="3" rx="1" opacity="0.8" />
            <rect y="21" width="28" height="3" rx="1" opacity="0.6" />
            <rect y="28" width="32" height="3" rx="1" opacity="0.8" />
            <rect y="35" width="26" height="3" rx="1" opacity="0.6" />
          </g>
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M168,58 L190,58" />
        </g>
        <path d="M190,58 L184,54 L184,62 Z" fill="#2E4036" />
        <g transform="translate(196,32)">
          <circle cx="16" cy="12" r="8" fill="#8C6239" />
          <path d="M2,40 Q2,28 16,28 Q30,28 30,40 L30,52 L2,52 Z" fill="#8C6239" />
          <text x="16" y="64" text-anchor="middle" font-family="Outfit" font-size="6" font-weight="800" fill="#2E4036" letter-spacing="0.08em">TEAM</text>
        </g>
        <g transform="translate(218,8)">
          <text font-family="Pretendard" font-size="14">✨</text>
        </g>
      </svg>
    </template>
  </BaseGuideModal>
</template>
