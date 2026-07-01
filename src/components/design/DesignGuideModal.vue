<script setup>
/**
 * Design 페이지 사용자 가이드 모달.
 *
 * [2026-05-27 리팩토링] 골격/로직/스타일은 공통 BaseGuideModal 로 이관.
 * 이 파일은 steps 데이터 + illustration SVG (slot) 만 정의.
 *
 * 4 step: Design 개요 → SPACK → DDD → Architecture.
 * 첫 방문 시 자동 표시 (호출자가 localStorage 확인), 이후 헬프 버튼으로 수동.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Layers, Boxes, Network, Server } from 'lucide-vue-next'
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
    icon: Layers,
    title: t('design.guide_modal.step1_title'),
    subtitle: 'PRD → SPACK → DDD → Architecture',
    desc: t('design.guide_modal.step1_desc'),
    tip: t('design.guide_modal.step1_tip'),
    illustration: 'overview',
  },
  {
    no: '02',
    icon: Boxes,
    title: t('design.guide_modal.step2_title'),
    subtitle: 'API · Entity · Policy',
    desc: t('design.guide_modal.step2_desc'),
    tip: t('design.guide_modal.step2_tip'),
    illustration: 'spack',
  },
  {
    no: '03',
    icon: Network,
    title: t('design.guide_modal.step3_title'),
    subtitle: 'Bounded Context · Aggregate · Domain Event',
    desc: t('design.guide_modal.step3_desc'),
    tip: t('design.guide_modal.step3_tip'),
    illustration: 'ddd',
  },
  {
    no: '04',
    icon: Server,
    title: t('design.guide_modal.step4_title'),
    subtitle: 'Service Layer · Data Layer · Connections',
    desc: t('design.guide_modal.step4_desc'),
    tip: t('design.guide_modal.step4_tip'),
    illustration: 'architecture',
  },
])
</script>

<template>
  <BaseGuideModal
    :model-value="modelValue"
    :steps="steps"
    seen-key="gayoje_design_guide_seen_v1"
    pill="DESIGN GUIDE"
    :headline="$t('design.guide_modal.headline')"
    :sub="$t('design.guide_modal.sub')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #illustration="{ illustration }">
      <!-- ① Overview: PRD → SPACK → DDD → Architecture 흐름 -->
      <svg v-if="illustration === 'overview'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="design-illust-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#design-illust-bg-1)" rx="12" />
        <g transform="translate(12,54)">
          <rect width="42" height="32" fill="white" stroke="#8C6239" stroke-width="2" rx="6" />
          <text x="21" y="20" text-anchor="middle" font-family="Outfit" font-size="10" font-weight="800" fill="#8C6239">PRD</text>
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M58,70 L72,70" />
        </g>
        <path d="M72,70 L66,66 L66,74 Z" fill="#2E4036" />
        <g transform="translate(74,40)">
          <rect width="44" height="60" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.5" rx="6" />
          <text x="22" y="20" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="#2563EB">SPACK</text>
          <circle cx="22" cy="32" r="3" fill="#2563EB" />
          <circle cx="22" cy="42" r="3" fill="#2563EB" opacity="0.6" />
          <circle cx="22" cy="52" r="3" fill="#2563EB" opacity="0.4" />
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M122,70 L136,70" />
        </g>
        <path d="M136,70 L130,66 L130,74 Z" fill="#2E4036" />
        <g transform="translate(138,40)">
          <rect width="44" height="60" fill="#FEF3C7" stroke="#D97706" stroke-width="1.5" rx="6" />
          <text x="22" y="20" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="#D97706">DDD</text>
          <rect x="12" y="28" width="20" height="6" fill="#D97706" rx="1" />
          <rect x="12" y="38" width="20" height="6" fill="#D97706" opacity="0.6" rx="1" />
          <rect x="12" y="48" width="20" height="6" fill="#D97706" opacity="0.4" rx="1" />
        </g>
        <g stroke="#2E4036" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M186,70 L200,70" />
        </g>
        <path d="M200,70 L194,66 L194,74 Z" fill="#2E4036" />
        <g transform="translate(202,40)">
          <rect width="32" height="60" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <text x="16" y="20" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#16A34A">ARCH</text>
          <g transform="translate(6,26)">
            <rect width="20" height="8" fill="#16A34A" rx="1" />
            <rect y="12" width="20" height="8" fill="#16A34A" opacity="0.6" rx="1" />
            <rect y="24" width="20" height="8" fill="#16A34A" opacity="0.4" rx="1" />
          </g>
        </g>
      </svg>

      <!-- ② SPACK: API/Entity/Policy 카드 3개 -->
      <svg v-else-if="illustration === 'spack'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="design-illust-bg-2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#design-illust-bg-2)" rx="12" />
        <g transform="translate(20,24)">
          <rect width="60" height="90" fill="white" stroke="#2563EB" stroke-width="1.5" rx="8" />
          <rect width="60" height="22" fill="#DBEAFE" rx="8" />
          <rect y="14" width="60" height="8" fill="#DBEAFE" />
          <text x="30" y="15" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="#1D4ED8">API</text>
          <g transform="translate(6,30)" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" fill="#1D4ED8">
            <rect width="14" height="8" fill="#DBEAFE" rx="2" />
            <text x="7" y="6" text-anchor="middle" font-weight="700">GET</text>
            <text x="22" y="6" fill="#2E4036">/orders</text>
          </g>
          <g transform="translate(6,44)" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" fill="#1D4ED8">
            <rect width="16" height="8" fill="#DBEAFE" rx="2" />
            <text x="8" y="6" text-anchor="middle" font-weight="700">POST</text>
            <text x="24" y="6" fill="#2E4036">/cart</text>
          </g>
          <g transform="translate(6,58)" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" fill="#1D4ED8">
            <rect width="14" height="8" fill="#DBEAFE" rx="2" />
            <text x="7" y="6" text-anchor="middle" font-weight="700">PUT</text>
            <text x="22" y="6" fill="#2E4036">/cart/:id</text>
          </g>
          <g transform="translate(6,72)" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="7" fill="#1D4ED8">
            <rect width="14" height="8" fill="#DBEAFE" rx="2" />
            <text x="7" y="6" text-anchor="middle" font-weight="700">GET</text>
            <text x="22" y="6" fill="#2E4036">/menu</text>
          </g>
        </g>
        <g transform="translate(90,24)">
          <rect width="60" height="90" fill="white" stroke="#16A34A" stroke-width="1.5" rx="8" />
          <rect width="60" height="22" fill="#DCFCE7" rx="8" />
          <rect y="14" width="60" height="8" fill="#DCFCE7" />
          <text x="30" y="15" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="#15803D">ENTITY</text>
          <g transform="translate(6,30)" font-family="Pretendard" font-size="7" font-weight="700" fill="#2E4036">
            <text>Order</text>
            <text y="14">Cart</text>
            <text y="28">MenuItem</text>
            <text y="42">Payment</text>
          </g>
        </g>
        <g transform="translate(160,24)">
          <rect width="60" height="90" fill="white" stroke="#D97706" stroke-width="1.5" rx="8" />
          <rect width="60" height="22" fill="#FEF3C7" rx="8" />
          <rect y="14" width="60" height="8" fill="#FEF3C7" />
          <text x="30" y="15" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="800" fill="#B45309">POLICY</text>
          <g transform="translate(6,30)" font-family="Pretendard" font-size="6" font-weight="700" fill="#2E4036">
            <text>{{ $t('design.guide_modal.svg_resp') }}</text>
            <text y="14">{{ $t('design.guide_modal.svg_concurrent') }}</text>
            <text y="28">OWASP</text>
            <text y="42">{{ $t('design.guide_modal.svg_privacy') }}</text>
          </g>
        </g>
      </svg>

      <!-- ③ DDD: Bounded Context 안에 Aggregate -->
      <svg v-else-if="illustration === 'ddd'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="design-illust-bg-3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#design-illust-bg-3)" rx="12" />
        <g transform="translate(14,22)">
          <rect width="100" height="96" fill="none" stroke="#D97706" stroke-width="1.5" stroke-dasharray="4 3" rx="8" />
          <text x="50" y="13" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="800" fill="#D97706" letter-spacing="0.05em">ORDER CONTEXT</text>
          <g transform="translate(10,22)">
            <rect width="80" height="30" fill="#FEF3C7" stroke="#D97706" stroke-width="1.5" rx="6" />
            <text x="40" y="13" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#92400E" letter-spacing="0.05em">AGGREGATE</text>
            <text x="40" y="24" text-anchor="middle" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">Order</text>
          </g>
          <g transform="translate(10,58)">
            <rect width="36" height="14" fill="white" stroke="#D97706" stroke-width="1" rx="3" />
            <text x="18" y="10" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="600" fill="#2E4036">OrderLine</text>
          </g>
          <g transform="translate(54,58)">
            <rect width="36" height="14" fill="white" stroke="#D97706" stroke-width="1" rx="3" />
            <text x="18" y="10" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="600" fill="#2E4036">Address</text>
          </g>
          <g transform="translate(10,78)">
            <rect width="80" height="14" fill="#fff7ed" stroke="#ea580c" stroke-width="1" stroke-dasharray="2 2" rx="3" />
            <text x="40" y="10" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="700" fill="#9a3412">⚡ OrderPlaced</text>
          </g>
        </g>
        <g stroke="#ea580c" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="3 2">
          <path d="M116,80 L130,80" />
        </g>
        <path d="M130,80 L124,76 L124,84 Z" fill="#ea580c" />
        <g transform="translate(132,22)">
          <rect width="94" height="96" fill="none" stroke="#0891b2" stroke-width="1.5" stroke-dasharray="4 3" rx="8" />
          <text x="47" y="13" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="800" fill="#0891b2" letter-spacing="0.05em">PAYMENT CONTEXT</text>
          <g transform="translate(8,22)">
            <rect width="78" height="30" fill="#cffafe" stroke="#0891b2" stroke-width="1.5" rx="6" />
            <text x="39" y="13" text-anchor="middle" font-family="Outfit" font-size="7" font-weight="800" fill="#0e7490" letter-spacing="0.05em">AGGREGATE</text>
            <text x="39" y="24" text-anchor="middle" font-family="Pretendard" font-size="9" font-weight="800" fill="#2E4036">Payment</text>
          </g>
          <g transform="translate(8,58)">
            <rect width="78" height="14" fill="white" stroke="#0891b2" stroke-width="1" rx="3" />
            <text x="39" y="10" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="600" fill="#2E4036">Receipt</text>
          </g>
          <g transform="translate(8,78)">
            <rect width="78" height="14" fill="#ecfeff" stroke="#0e7490" stroke-width="1" stroke-dasharray="2 2" rx="3" />
            <text x="39" y="10" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="700" fill="#155e75">⚡ PaymentDone</text>
          </g>
        </g>
      </svg>

      <!-- ④ Architecture: Service Layer + DB Layer -->
      <svg v-else-if="illustration === 'architecture'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="design-illust-bg-4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#design-illust-bg-4)" rx="12" />
        <text x="12" y="16" font-family="Outfit" font-size="7" font-weight="800" fill="#2563EB" letter-spacing="0.08em">SERVICE LAYER</text>
        <g transform="translate(12,22)">
          <rect width="60" height="34" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.5" rx="6" />
          <rect x="6" y="6" width="14" height="10" fill="#2563EB" rx="2" />
          <text x="34" y="14" font-family="Pretendard" font-size="7" font-weight="800" fill="#1D4ED8">Order</text>
          <text x="6" y="26" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" fill="#94A3B8">SVC-01</text>
        </g>
        <g transform="translate(80,22)">
          <rect width="60" height="34" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.5" rx="6" />
          <rect x="6" y="6" width="14" height="10" fill="#2563EB" rx="2" />
          <text x="34" y="14" font-family="Pretendard" font-size="7" font-weight="800" fill="#1D4ED8">Cart</text>
          <text x="6" y="26" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" fill="#94A3B8">SVC-02</text>
        </g>
        <g transform="translate(148,22)">
          <rect width="60" height="34" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.5" rx="6" />
          <rect x="6" y="6" width="14" height="10" fill="#2563EB" rx="2" />
          <text x="34" y="14" font-family="Pretendard" font-size="7" font-weight="800" fill="#1D4ED8">Pay</text>
          <text x="6" y="26" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-size="6" fill="#94A3B8">SVC-03</text>
        </g>
        <g stroke="#94A3B8" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="3 2">
          <path d="M42,68 L42,82" />
          <path d="M110,68 L110,82" />
          <path d="M178,68 L178,82" />
        </g>
        <text x="12" y="80" font-family="Outfit" font-size="7" font-weight="800" fill="#16A34A" letter-spacing="0.08em">DATA LAYER</text>
        <g transform="translate(12,86)">
          <rect width="60" height="32" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <ellipse cx="16" cy="14" rx="6" ry="3" fill="#16A34A" />
          <rect x="10" y="14" width="12" height="6" fill="#16A34A" />
          <ellipse cx="16" cy="20" rx="6" ry="3" fill="#16A34A" />
          <text x="34" y="18" font-family="Pretendard" font-size="7" font-weight="800" fill="#15803D">order_db</text>
        </g>
        <g transform="translate(80,86)">
          <rect width="60" height="32" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <ellipse cx="16" cy="14" rx="6" ry="3" fill="#16A34A" />
          <rect x="10" y="14" width="12" height="6" fill="#16A34A" />
          <ellipse cx="16" cy="20" rx="6" ry="3" fill="#16A34A" />
          <text x="34" y="18" font-family="Pretendard" font-size="7" font-weight="800" fill="#15803D">cart_db</text>
        </g>
        <g transform="translate(148,86)">
          <rect width="60" height="32" fill="#F0FDF4" stroke="#16A34A" stroke-width="1.5" rx="6" />
          <ellipse cx="16" cy="14" rx="6" ry="3" fill="#16A34A" />
          <rect x="10" y="14" width="12" height="6" fill="#16A34A" />
          <ellipse cx="16" cy="20" rx="6" ry="3" fill="#16A34A" />
          <text x="34" y="18" font-family="Pretendard" font-size="7" font-weight="800" fill="#15803D">pay_db</text>
        </g>
        <g transform="translate(214,8)">
          <text font-family="Pretendard" font-size="14">✨</text>
        </g>
      </svg>
    </template>
  </BaseGuideModal>
</template>
