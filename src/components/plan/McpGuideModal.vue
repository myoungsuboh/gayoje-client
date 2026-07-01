<script setup>
/**
 * Plan 페이지 — MCP (AI 코딩 에이전트 연결) 가이드 모달.
 *
 * [2026-05-27 리팩토링] 골격/로직/스타일은 공통 BaseGuideModal 로 이관.
 * 이 파일은 steps 데이터 + illustration SVG (slot) + /profile 이동(finish) 만 정의.
 *
 * 5 step: MCP 소개 → Before/After → 연결 방법 → 도구 5종 → /profile 이동 CTA.
 * 자동 표시 안 함 (명시적 버튼 클릭으로만).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Sparkles, Plug, ListChecks, Wrench, ArrowUpRight } from 'lucide-vue-next'
import BaseGuideModal from '@/components/common/BaseGuideModal.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const router = useRouter()
const { t } = useI18n()

// subtitle 은 순수 기술 용어(언어 무관)라 리터럴 유지. title/desc/tip 만 locale.
const steps = computed(() => [
  {
    no: '01',
    icon: Sparkles,
    title: t('rule.mcp_guide.step1_title'),
    subtitle: 'Model Context Protocol',
    desc: t('rule.mcp_guide.step1_desc'),
    tip: t('rule.mcp_guide.step1_tip'),
    illustration: 'what-is-mcp',
  },
  {
    no: '02',
    icon: Plug,
    title: t('rule.mcp_guide.step2_title'),
    subtitle: 'Before vs After',
    desc: t('rule.mcp_guide.step2_desc'),
    tip: t('rule.mcp_guide.step2_tip'),
    illustration: 'before-after',
  },
  {
    no: '03',
    icon: Wrench,
    title: t('rule.mcp_guide.step3_title'),
    subtitle: t('rule.mcp_guide.step3_subtitle'),
    desc: t('rule.mcp_guide.step3_desc'),
    tip: t('rule.mcp_guide.step3_tip'),
    illustration: 'connect',
  },
  {
    no: '04',
    icon: ListChecks,
    title: t('rule.mcp_guide.step4_title'),
    subtitle: t('rule.mcp_guide.step4_subtitle'),
    desc: t('rule.mcp_guide.step4_desc'),
    tip: t('rule.mcp_guide.step4_tip'),
    illustration: 'tools',
  },
  {
    no: '05',
    icon: ArrowUpRight,
    title: t('rule.mcp_guide.step5_title'),
    subtitle: 'Go to /profile',
    desc: t('rule.mcp_guide.step5_desc'),
    tip: t('rule.mcp_guide.step5_tip'),
    illustration: 'start',
  },
])

// 마지막 스텝 완료 → /profile 이동 (BaseGuideModal 이 seen 저장 + 닫기 처리).
const onFinish = () => router.push('/profile')
</script>

<template>
  <BaseGuideModal
    :model-value="modelValue"
    :steps="steps"
    seen-key="gayoje_plan_mcp_guide_seen_v1"
    pill="MCP — NEW"
    :headline="$t('rule.mcp_guide.headline')"
    :sub="$t('rule.mcp_guide.sub')"
    :finish-label="$t('rule.mcp_guide.finish_label')"
    :finish-icon="ArrowUpRight"
    @update:model-value="emit('update:modelValue', $event)"
    @finish="onFinish"
  >
    <template #illustration="{ illustration }">
      <!-- ① What is MCP — Cursor ↔ Harness 연결 -->
      <svg v-if="illustration === 'what-is-mcp'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="mcp-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#mcp-bg-1)" rx="12" />
        <g transform="translate(28,38)">
          <rect width="64" height="64" fill="white" stroke="#2E4036" stroke-width="2" rx="14" />
          <text x="32" y="32" text-anchor="middle" font-family="Outfit" font-size="10" font-weight="800" fill="#2E4036">CURSOR</text>
          <text x="32" y="48" text-anchor="middle" font-family="Outfit" font-size="9" font-weight="600" fill="#8C6239">AI Agent</text>
        </g>
        <g transform="translate(92,70)">
          <line x1="0" y1="0" x2="56" y2="0" stroke="#8C6239" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3" />
          <rect x="14" y="-12" width="28" height="14" fill="#8C6239" rx="4" />
          <text x="28" y="-2" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" font-weight="800" fill="white">MCP</text>
        </g>
        <g transform="translate(148,30)">
          <rect width="64" height="80" fill="#2E4036" rx="14" />
          <text x="32" y="32" text-anchor="middle" font-family="Outfit" font-size="10" font-weight="800" fill="white">HARNESS</text>
          <g transform="translate(8,42)">
            <rect width="48" height="9" fill="white" rx="2" opacity="0.9" />
            <text x="24" y="7" text-anchor="middle" font-family="IBM Plex Mono" font-size="6" font-weight="700" fill="#2E4036">PRD</text>
          </g>
          <g transform="translate(8,54)">
            <rect width="48" height="9" fill="white" rx="2" opacity="0.7" />
            <text x="24" y="7" text-anchor="middle" font-family="IBM Plex Mono" font-size="6" font-weight="700" fill="#2E4036">DESIGN</text>
          </g>
          <g transform="translate(8,66)">
            <rect width="48" height="9" fill="white" rx="2" opacity="0.55" />
            <text x="24" y="7" text-anchor="middle" font-family="IBM Plex Mono" font-size="6" font-weight="700" fill="#2E4036">SPEC</text>
          </g>
        </g>
      </svg>

      <!-- ② Before vs After -->
      <svg v-else-if="illustration === 'before-after'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="mcp-bg-2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#mcp-bg-2)" rx="12" />
        <g transform="translate(14,22)">
          <rect width="100" height="100" fill="white" stroke="#bbb" stroke-width="1.5" rx="8" stroke-dasharray="3 3" />
          <text x="50" y="20" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="800" fill="#999" letter-spacing="0.1em">BEFORE</text>
          <text x="50" y="40" text-anchor="middle" font-family="Pretendard" font-size="9" font-weight="700" fill="#666">"이 함수 뭐예요?"</text>
          <line x1="10" y1="50" x2="90" y2="50" stroke="#ddd" stroke-width="1" />
          <text x="50" y="68" text-anchor="middle" font-family="Pretendard" font-size="8" font-weight="500" fill="#999">"음… OrderService</text>
          <text x="50" y="80" text-anchor="middle" font-family="Pretendard" font-size="8" font-weight="500" fill="#999">클래스 같은데"</text>
          <text x="50" y="94" text-anchor="middle" font-family="Pretendard" font-size="10" fill="#aaa">🤷</text>
        </g>
        <g transform="translate(118,68)">
          <line x1="0" y1="0" x2="10" y2="0" stroke="#8C6239" stroke-width="2" stroke-linecap="round" />
          <path d="M10,0 L6,-3 L6,3 Z" fill="#8C6239" />
        </g>
        <g transform="translate(130,22)">
          <rect width="100" height="100" fill="#2E4036" rx="8" />
          <text x="50" y="20" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="800" fill="white" letter-spacing="0.1em" opacity="0.7">AFTER + MCP</text>
          <text x="50" y="40" text-anchor="middle" font-family="Pretendard" font-size="9" font-weight="700" fill="white">"이 함수 뭐예요?"</text>
          <line x1="10" y1="50" x2="90" y2="50" stroke="white" stroke-width="1" opacity="0.3" />
          <text x="50" y="66" text-anchor="middle" font-family="Pretendard" font-size="8" font-weight="700" fill="white">"Story-01.1</text>
          <text x="50" y="78" text-anchor="middle" font-family="Pretendard" font-size="8" font-weight="700" fill="white">주문 처리의</text>
          <text x="50" y="90" text-anchor="middle" font-family="Pretendard" font-size="8" font-weight="700" fill="#FFB570">Aggregate Order"</text>
        </g>
      </svg>

      <!-- ③ Connect — 3단계 흐름도 -->
      <svg v-else-if="illustration === 'connect'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="mcp-bg-3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#mcp-bg-3)" rx="12" />
        <g transform="translate(16,38)">
          <circle cx="0" cy="0" r="13" fill="#8C6239" />
          <text x="0" y="4" text-anchor="middle" font-family="Outfit" font-size="11" font-weight="900" fill="white">1</text>
          <g transform="translate(-26,16)">
            <rect width="52" height="46" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
            <text x="26" y="12" text-anchor="middle" font-family="IBM Plex Mono" font-size="6" font-weight="800" fill="#2E4036">/profile</text>
            <line x1="4" y1="20" x2="48" y2="20" stroke="#2E4036" stroke-width="0.8" opacity="0.5" />
            <text x="26" y="32" text-anchor="middle" font-family="Pretendard" font-size="7" font-weight="700" fill="#8C6239">JSON 복사</text>
            <rect x="14" y="36" width="24" height="6" fill="#2E4036" rx="2" />
          </g>
        </g>
        <g transform="translate(70,60)">
          <line x1="0" y1="0" x2="14" y2="0" stroke="#2E4036" stroke-width="2" stroke-linecap="round" />
          <path d="M14,0 L9,-3 L9,3 Z" fill="#2E4036" />
        </g>
        <g transform="translate(108,38)">
          <circle cx="0" cy="0" r="13" fill="#8C6239" />
          <text x="0" y="4" text-anchor="middle" font-family="Outfit" font-size="11" font-weight="900" fill="white">2</text>
          <g transform="translate(-26,16)">
            <rect width="52" height="46" fill="white" stroke="#2E4036" stroke-width="1.5" rx="4" />
            <text x="26" y="12" text-anchor="middle" font-family="IBM Plex Mono" font-size="6" font-weight="800" fill="#2E4036">mcp.json</text>
            <line x1="4" y1="20" x2="48" y2="20" stroke="#2E4036" stroke-width="0.8" opacity="0.5" />
            <text x="26" y="28" font-family="IBM Plex Mono" font-size="5" fill="#2E4036" text-anchor="middle" opacity="0.7">{ "mcpServers":</text>
            <text x="26" y="35" font-family="IBM Plex Mono" font-size="5" fill="#2E4036" text-anchor="middle" opacity="0.7">  { "harness":</text>
            <text x="26" y="42" font-family="IBM Plex Mono" font-size="5" fill="#2E4036" text-anchor="middle" opacity="0.7">    ...} }</text>
          </g>
        </g>
        <g transform="translate(162,60)">
          <line x1="0" y1="0" x2="14" y2="0" stroke="#2E4036" stroke-width="2" stroke-linecap="round" />
          <path d="M14,0 L9,-3 L9,3 Z" fill="#2E4036" />
        </g>
        <g transform="translate(200,38)">
          <circle cx="0" cy="0" r="13" fill="#2E4036" />
          <text x="0" y="4" text-anchor="middle" font-family="Outfit" font-size="11" font-weight="900" fill="white">3</text>
          <g transform="translate(-26,16)">
            <rect width="52" height="46" fill="#2E4036" rx="4" />
            <text x="26" y="14" text-anchor="middle" font-family="Outfit" font-size="6" font-weight="800" fill="white" letter-spacing="0.1em">CURSOR</text>
            <text x="26" y="28" text-anchor="middle" font-family="Pretendard" font-size="14" fill="white">↻</text>
            <text x="26" y="40" text-anchor="middle" font-family="Pretendard" font-size="6" font-weight="700" fill="white" opacity="0.85">재시작</text>
          </g>
        </g>
      </svg>

      <!-- ④ Tools — 5개 도구 -->
      <svg v-else-if="illustration === 'tools'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="mcp-bg-4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#mcp-bg-4)" rx="12" />
        <g transform="translate(14,18)">
          <rect width="106" height="22" fill="#2E4036" rx="4" />
          <text x="8" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="#FFB570">★</text>
          <text x="20" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="white">find_spec_for_file</text>
        </g>
        <g transform="translate(124,18)">
          <rect width="106" height="22" fill="white" stroke="#2E4036" stroke-width="1.2" rx="4" />
          <text x="8" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="#2E4036">trace_upstream</text>
        </g>
        <g transform="translate(14,46)">
          <rect width="106" height="22" fill="white" stroke="#2E4036" stroke-width="1.2" rx="4" />
          <text x="8" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="#2E4036">list_design_nodes</text>
        </g>
        <g transform="translate(124,46)">
          <rect width="106" height="22" fill="white" stroke="#2E4036" stroke-width="1.2" rx="4" />
          <text x="8" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="#2E4036">get_story</text>
        </g>
        <g transform="translate(69,74)">
          <rect width="106" height="22" fill="white" stroke="#2E4036" stroke-width="1.2" rx="4" />
          <text x="8" y="14" font-family="IBM Plex Mono" font-size="7" font-weight="700" fill="#2E4036">search_spec</text>
        </g>
        <text x="120" y="116" text-anchor="middle" font-family="Pretendard" font-size="9" font-weight="600" fill="#8C6239">★ = Cursor가 가장 자주 호출</text>
        <text x="120" y="128" text-anchor="middle" font-family="Pretendard" font-size="8" fill="#666">모두 read-only</text>
      </svg>

      <!-- ⑤ Start — /profile 카드 -->
      <svg v-else-if="illustration === 'start'"
           viewBox="0 0 240 140" aria-hidden="true">
        <defs>
          <linearGradient id="mcp-bg-5" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f9f6f1" />
            <stop offset="100%" stop-color="#f1ede5" />
          </linearGradient>
        </defs>
        <rect width="240" height="140" fill="url(#mcp-bg-5)" rx="12" />
        <g transform="translate(60,28)">
          <rect width="120" height="84" fill="white" stroke="#8C6239" stroke-width="2" rx="10" />
          <g transform="translate(60,18)">
            <path d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z" fill="#8C6239" />
          </g>
          <text x="60" y="44" text-anchor="middle" font-family="Pretendard" font-size="10" font-weight="800" fill="#2E4036">AI 코딩 에이전트 연결</text>
          <rect x="34" y="56" width="52" height="18" fill="#2E4036" rx="9" />
          <text x="60" y="68" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="800" fill="white">START</text>
        </g>
        <g transform="translate(170,90)">
          <path d="M0,0 L10,4 L4,4 L4,10 Z" fill="#2E4036" />
        </g>
      </svg>
    </template>
  </BaseGuideModal>
</template>
