<script setup>
/**
 * NotionImportGuide — Notion 가져오기 다이얼로그 우측 빈 상태(페이지 미선택) 3-step 안내
 * (NotionImportDialog 에서 분리, 2026-05-27). 순수 표시용 — projectName 만 받아 경고 분기.
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  projectName: { type: String, default: '' },
})
</script>

<template>
  <div class="notion-empty notion-empty--guide">
    <div class="notion-guide">
      <h4 class="notion-guide-title">{{ $t('plan.notion.guide_title') }}</h4>
      <ol class="notion-guide-steps">
        <li class="notion-guide-step">
          <span class="notion-guide-step-num">1</span>
          <div class="notion-guide-step-body">
            <span class="notion-guide-step-label">{{ $t('plan.notion.guide_step1_label') }}</span>
            <span class="notion-guide-step-desc">{{ $t('plan.notion.guide_step1_desc') }}</span>
          </div>
        </li>
        <li class="notion-guide-step">
          <span class="notion-guide-step-num">2</span>
          <div class="notion-guide-step-body">
            <span class="notion-guide-step-label">{{ $t('plan.notion.guide_step2_label') }}</span>
            <span class="notion-guide-step-desc">{{ $t('plan.notion.guide_step2_desc') }}</span>
          </div>
        </li>
        <li class="notion-guide-step">
          <span class="notion-guide-step-num">3</span>
          <div class="notion-guide-step-body">
            <span class="notion-guide-step-label">{{ $t('plan.notion.guide_step3_label') }}</span>
            <span class="notion-guide-step-desc">{{ $t('plan.notion.guide_step3_desc') }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!projectName" class="notion-guide-warn">
        {{ $t('plan.notion.guide_warn') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 빈 상태 컨테이너 (preview pane 공유 스타일의 guide 전용 사본) */
.notion-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1;
  padding: 24px;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  font-family: 'Pretendard Variable', sans-serif;
  text-align: center;
}
.notion-empty--guide {
  padding: 30px 24px;
  background: linear-gradient(135deg, rgba(139, 111, 71, 0.04) 0%, rgba(46, 64, 54, 0.04) 100%);
}
.notion-guide {
  width: 100%; max-width: 420px;
}
.notion-guide-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-main, #1a1a1a);
  margin: 0 0 18px;
  text-align: center;
  font-family: 'Pretendard Variable', sans-serif;
}
.notion-guide-steps {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 12px;
}
.notion-guide-step {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px;
  background: white;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
}
.notion-guide-step-num {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--accent, #8B6F47);
  color: white;
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 0.95rem;
  display: inline-flex; align-items: center; justify-content: center;
}
.notion-guide-step-body {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
}
.notion-guide-step-label {
  font-size: 0.84rem; font-weight: 700;
  color: var(--text-main, #1a1a1a);
}
.notion-guide-step-desc {
  font-size: 0.74rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
}
.notion-guide-warn {
  margin: 14px 0 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  color: #c0392b;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
}
</style>
