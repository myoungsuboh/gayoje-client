<script setup>
/**
 * Design 페이지의 Entity / Aggregate / Service 카드 클릭 시 표시되는 lineage 패널.
 *
 * 표시 내용:
 *   - 선택된 노드 정보 (id, name)
 *   - lineage.confidence 배지 (direct/inferred/none)
 *   - lineage.related_stories 리스트 — story_id + PRD 원문 quote
 *   - "PRD 에서 보기" 버튼 → /plan?tab=prd&anchor=Story-XX.Y 로 이동
 *
 * [F3 — 2026-05] design ↔ PRD lineage MVP.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { X, ExternalLink, Link2, AlertTriangle, MinusCircle } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: () => null },
  nodeType: { type: String, default: '' },  // 'entity' | 'aggregate' | 'service'
})
const emit = defineEmits(['update:modelValue'])
const router = useRouter()
const { xs } = useDisplay()
const { t } = useI18n()

const close = () => emit('update:modelValue', false)

const lineage = computed(() => {
  return props.item?.lineage || { confidence: 'none', related_stories: [] }
})

const nodeLabel = computed(() => {
  return ({
    entity: 'Entity',
    aggregate: 'Aggregate',
    service: 'Service',
    domain_entity: 'Domain Entity',
    database: 'Database',
  }[props.nodeType]) || t('design.lpanel.node_fallback')
})

// confidence 표현 — direct/inferred/none 별 색/라벨/아이콘 (로케일 반응형)
const CONFIDENCE_STYLE = computed(() => ({
  direct: {
    label: t('enums.confidence.direct'),
    color: '#2E7D32',
    bg: '#E8F5E9',
    border: '#4CAF50',
    icon: Link2,
    description: t('enums.confidence.description.direct'),
  },
  inferred: {
    label: t('enums.confidence.inferred'),
    color: '#E08A3C',
    bg: '#FFF7E6',
    border: '#FFB570',
    icon: AlertTriangle,
    description: t('enums.confidence.description.inferred'),
  },
  none: {
    label: t('enums.confidence.none'),
    color: '#8A817C',
    bg: '#F5F5F5',
    border: '#D0D0D0',
    icon: MinusCircle,
    description: t('enums.confidence.description.none'),
  },
}))

const confidenceStyle = computed(() => {
  return CONFIDENCE_STYLE.value[lineage.value.confidence] || CONFIDENCE_STYLE.value.none
})

// BE 가 Neo4j 에 flat 으로 저장하면서 related_stories detail (story_id/quote) 가
// 누락됨 — composable normalizer 가 length 맞춤용 빈 객체로 채움. panel 에선
// 빈 객체뿐인 경우 "상세 미제공" 안내로 분기.
const hasStoryDetail = computed(() => {
  const stories = lineage.value.related_stories || []
  return stories.length > 0 && stories.some((s) => s && s.story_id)
})
const lineageCount = computed(() => (lineage.value.related_stories || []).length)

// BE 가 주는 story_id 는 Neo4j 노드 id 형식(`story_02_1`)인데, PRD 탭의 anchor 는
// `Story-02.1` 형식(annotatePrdAnchors 가 zero-pad 로 생성)이다. 그대로 넘기면 anchor
// 매칭이 실패해 PRD 로만 이동하고 스토리로 스크롤되지 않는다 → 형식 변환 필수.
// `story_02_1` / `story_2_1` / `Story-2.1` 등 모두 → `Story-02.1`.
const _STORY_ID_RE = /story[-\s_]?(\d+)[._-](\d+)/i
const toPrdAnchor = (storyId) => {
  const m = String(storyId || '').match(_STORY_ID_RE)
  if (!m) return storyId
  return `Story-${String(m[1]).padStart(2, '0')}.${m[2]}`
}

const jumpToPrd = (storyId) => {
  close()
  router.push({
    path: '/plan',
    query: { tab: 'prd', anchor: toPrdAnchor(storyId), section: 'epic' },
  })
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :max-width="xs ? undefined : 560"
    :fullscreen="xs"
  >
    <VCard class="design-lineage-panel" :class="{ 'design-lineage-panel--fullscreen': xs }">
      <div class="lineage-header">
        <div class="lineage-header-main">
          <span class="lineage-node-type">{{ nodeLabel }}</span>
          <span class="lineage-node-id">{{ item?.id }}</span>
        </div>
        <button class="lineage-close" @click="close" aria-label="close">
          <X :size="18" />
        </button>
      </div>

      <div class="lineage-name">{{ item?.name || '—' }}</div>
      <div v-if="item?.description" class="lineage-desc">{{ item.description }}</div>

      <!-- confidence 배지 -->
      <div
        class="lineage-confidence-badge"
        :style="{
          color: confidenceStyle.color,
          background: confidenceStyle.bg,
          borderColor: confidenceStyle.border,
        }"
      >
        <component :is="confidenceStyle.icon" :size="14" />
        <span>{{ confidenceStyle.label }}</span>
        <span class="lineage-confidence-sub">{{ confidenceStyle.description }}</span>
      </div>

      <!-- PRD Story 매핑 -->
      <div class="lineage-stories">
        <div class="lineage-section-title">{{ $t('design.lpanel.prd_basis') }}</div>
        <div v-if="!lineageCount" class="lineage-empty">
          {{ $t('design.lpanel.no_story') }}
        </div>
        <div v-else-if="!hasStoryDetail" class="lineage-empty">
          {{ $t('design.lpanel.detail_pending', { n: lineageCount }) }}
        </div>
        <template v-else>
          <div
            v-for="(s, idx) in lineage.related_stories"
            :key="`${s.story_id || 'placeholder'}-${idx}`"
            class="lineage-story-item"
          >
            <div class="lineage-story-head">
              <span class="lineage-story-id">{{ s.story_id }}</span>
              <button class="lineage-story-jump" @click="jumpToPrd(s.story_id)">
                <ExternalLink :size="12" />
                <span>{{ $t('design.lpanel.view_in_prd') }}</span>
              </button>
            </div>
            <div v-if="(s.quote || '').trim()" class="lineage-story-quote">
              <span class="quote-mark">“</span>{{ s.quote }}<span class="quote-mark">”</span>
            </div>
            <div v-else class="lineage-story-quote lineage-story-quote--empty">
              {{ $t('design.lpanel.quote_empty') }}
            </div>
          </div>
        </template>
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.design-lineage-panel {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-height: 90vh;
  overflow-y: auto;
}
/* fullscreen 모드 (mobile xs) — 화면 전체 사용 */
.design-lineage-panel--fullscreen {
  max-height: 100vh;
  height: 100%;
  border-radius: 0;
}

.lineage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.lineage-header-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lineage-node-type {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8A817C;
}

.lineage-node-id {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 12px;
  background: #F5F5F5;
  padding: 2px 8px;
  border-radius: 4px;
  color: #333;
}

.lineage-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #8A817C;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.lineage-close:hover { background: #F5F5F5; color: #333; }

.lineage-name {
  font-size: 18px;
  font-weight: 600;
  color: #1A1A1A;
  margin-bottom: 4px;
}

.lineage-desc {
  font-size: 13px;
  color: #666;
  margin-bottom: 16px;
}

.lineage-confidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
}

.lineage-confidence-sub {
  font-weight: 400;
  font-size: 11px;
  opacity: 0.8;
  margin-left: 4px;
}

.lineage-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8A817C;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ECECEC;
}

.lineage-empty {
  font-size: 13px;
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 16px 0;
}

.lineage-story-item {
  padding: 10px 12px;
  background: #FAFAFA;
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid #2563EB;
}

.lineage-story-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.lineage-story-id {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: #2563EB;
}

.lineage-story-jump {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #2563EB;
  background: transparent;
  border: 1px solid #BFDBFE;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.lineage-story-jump:hover { background: #EFF6FF; }

.lineage-story-quote {
  font-size: 13px;
  color: #444;
  line-height: 1.5;
}
.lineage-story-quote--empty {
  color: #999;
  font-style: italic;
  font-size: 12px;
}
.quote-mark {
  color: #2563EB;
  font-weight: 700;
  margin: 0 2px;
}
</style>
