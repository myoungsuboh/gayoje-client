<script setup>
/**
 * Design / Lint / Deliverables 페이지 진입 가드 카드.
 *
 * 미팅 로그가 없거나 CPS/PRD 가 아직 안 만들어졌으면 페이지 본문 대신 이 카드를
 * 노출 — 빈 화면 / raw 403 에러 / 의미 없는 빈 그리드를 차단.
 *
 * Props:
 *   hasMeetingLogs  미팅 로그 1+ 존재 여부
 *   hasCps          마스터 CPS 존재 여부
 *   hasPrd          마스터 PRD 존재 여부
 *   feature         현재 페이지 이름 ('Design' / 'Lint' / 'Deliverables') — 카드 제목용
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FileText, ArrowRight, Loader2 } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps({
  hasMeetingLogs: { type: Boolean, default: false },
  hasCps: { type: Boolean, default: false },
  hasPrd: { type: Boolean, default: false },
  // 미지정 시 공통 기본 문구(common.project_not_ready.default_feature).
  feature: { type: String, default: '' },
})

// feature 미지정 시 기본 명칭으로 대체.
const featureLabel = computed(() => props.feature || t('common.project_not_ready.default_feature'))
defineEmits(['refresh'])

const router = useRouter()
const goToPlan = () => router.push('/plan')

// 어떤 단계가 비어 있는지에 따라 다른 메시지/CTA 노출.
//   - 미팅 로그 없음: "Plan 에서 회의록 작성" 안내 + 이동 버튼.
//   - 미팅 로그 있지만 CPS/PRD 없음: 처리 진행 중일 가능성 — "잠시 후 새로고침" 안내.
const phase = computed(() => {
  if (!props.hasMeetingLogs) return 'no_meeting'
  if (!props.hasCps || !props.hasPrd) return 'processing'
  return 'ready'
})
</script>

<template>
  <div class="not-ready-card">
    <div class="not-ready-icon-wrap">
      <Loader2 v-if="phase === 'processing'" :size="44" class="rotate-anim" />
      <FileText v-else :size="44" />
    </div>
    <h3 class="not-ready-title serif-text">
      <template v-if="phase === 'no_meeting'">
        {{ $t('common.project_not_ready.title_no_meeting') }}
      </template>
      <template v-else-if="phase === 'processing'">
        {{ $t('common.project_not_ready.title_processing') }}
      </template>
    </h3>
    <p class="not-ready-desc">
      <template v-if="phase === 'no_meeting'">
        <span v-html="$t('common.project_not_ready.desc_no_meeting_html', { feature: featureLabel })" />
      </template>
      <template v-else-if="phase === 'processing'">
        <span v-html="$t('common.project_not_ready.desc_processing_html', { feature: featureLabel })" />
      </template>
    </p>

    <!-- 진행 상태 체크리스트 — 현재 어디까지 됐는지 한눈에. -->
    <div class="not-ready-checklist">
      <div class="checklist-item" :class="{ 'checklist-item--done': hasMeetingLogs }">
        <span class="checklist-marker">{{ hasMeetingLogs ? '✓' : '1' }}</span>
        <span>{{ $t('common.project_not_ready.checklist_meeting') }}</span>
      </div>
      <div class="checklist-item" :class="{ 'checklist-item--done': hasCps }">
        <span class="checklist-marker">{{ hasCps ? '✓' : '2' }}</span>
        <span>{{ $t('common.project_not_ready.checklist_cps') }}</span>
      </div>
      <div class="checklist-item" :class="{ 'checklist-item--done': hasPrd }">
        <span class="checklist-marker">{{ hasPrd ? '✓' : '3' }}</span>
        <span>{{ $t('common.project_not_ready.checklist_prd') }}</span>
      </div>
    </div>

    <div class="not-ready-actions">
      <button class="not-ready-cta" @click="goToPlan">
        <span>{{ $t('common.project_not_ready.cta_go_plan') }}</span>
        <ArrowRight :size="14" />
      </button>
      <button v-if="phase === 'processing'" class="not-ready-refresh" @click="$emit('refresh')">
        {{ $t('common.project_not_ready.refresh') }}
      </button>
    </div>
  </div>
</template>

<script>
export default { emits: ['refresh'] }
</script>

<style scoped>
.not-ready-card {
  max-width: 560px;
  margin: 64px auto;
  padding: 40px 32px 36px;
  background: white;
  border: 1px solid var(--border-light);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.not-ready-icon-wrap {
  width: 76px; height: 76px;
  border-radius: 50%;
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.not-ready-title {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0 0 10px;
  line-height: 1.3;
}

.not-ready-desc {
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.86rem;
  color: var(--text-muted);
  line-height: 1.65;
  margin: 0 0 24px;
}

.not-ready-checklist {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  background: var(--bg-light, #fafbfc);
  border-radius: 12px;
  margin-bottom: 24px;
}
.checklist-item {
  display: flex; align-items: center; gap: 12px;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.checklist-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: white;
  border: 1.5px solid var(--border-light);
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--text-muted);
  flex-shrink: 0;
}
.checklist-item--done {
  color: var(--primary-moss, #2E4036);
  font-weight: 700;
}
.checklist-item--done .checklist-marker {
  background: var(--primary-moss, #2E4036);
  border-color: var(--primary-moss, #2E4036);
  color: white;
}

.not-ready-actions {
  display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
}
.not-ready-cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px;
  border-radius: 9999px;
  border: none;
  background: var(--accent);
  color: white;
  font-family: 'Outfit', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.15s;
}
.not-ready-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(140, 98, 57, 0.25);
}
.not-ready-refresh {
  padding: 12px 18px;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
  background: white;
  color: var(--text-main);
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
}
.not-ready-refresh:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.rotate-anim {
  animation: spin 1.4s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
