<script setup>
/**
 * AiDraftNotice — "이건 AI가 만든 초안이에요" 신뢰 안내 배너.
 *
 * [왜 필요한가 — B2C 신뢰]
 * 비전문 사용자는 AI 산출물을 "확정된 정답"으로 오해하기 쉽다. 결과물이 초안이며
 * 사람의 검토가 필요하다는 점을 일관되게 알려, 과신/실망을 모두 줄인다.
 * 모든 생성 산출물(CPS·PRD·설계 등) 상단에 동일한 톤으로 노출한다.
 *
 * dismissible=true 면 사용자가 닫을 수 있고, storageKey 가 있으면 그 선택을
 * localStorage 에 기억한다(매번 거슬리지 않게).
 *
 * [version — 문서 업데이트마다 1회]
 * version(예: master 의 last_updated)을 주면 "이 버전을 닫았는지"를 기억한다.
 * 문서가 업데이트되면 version 이 바뀌어 다시 1회 노출되고, 같은 버전에서는
 * 새로고침해도 닫힘이 유지된다. version 을 안 주면 기존처럼 단순 1회 닫기('1').
 */
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Sparkles, X } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps({
  // 무엇에 대한 초안인지 — 예: "기획 문서(PRD)". 비우면 일반 문구.
  label: { type: String, default: '' },
  dismissible: { type: Boolean, default: false },
  storageKey: { type: String, default: '' },
  // 문서 버전/갱신 식별자(예: master.last_updated). 주면 버전 단위로 닫힘을 기억.
  version: { type: [String, Number], default: '' },
})

// localStorage 에 저장할 "닫음" 표식 — version 이 있으면 그 값, 없으면 '1'(레거시 호환).
const _token = () => (props.version === '' || props.version == null ? '1' : String(props.version))

const _isDismissed = () => {
  if (!props.storageKey) return false
  try { return localStorage.getItem(props.storageKey) === _token() } catch { return false }
}
const dismissed = ref(_isDismissed())

// 문서가 업데이트되면 token 이 바뀌어 더 이상 일치하지 않으므로 자동 재노출.
watch(() => props.version, () => { dismissed.value = _isDismissed() })

const close = () => {
  dismissed.value = true
  if (props.storageKey) {
    try { localStorage.setItem(props.storageKey, _token()) } catch { /* ignore */ }
  }
}

// label 유무에 따라 다른 본문 — label 이 있으면 "{label}의 ..." 형태.
const bodyText = computed(() =>
  props.label
    ? t('common.ai_draft.body_with_label', { label: props.label })
    : t('common.ai_draft.body'),
)
</script>

<template>
  <div v-if="!dismissed" class="ai-draft-notice" role="note">
    <Sparkles :size="16" class="ai-draft-icon" aria-hidden="true" />
    <p class="ai-draft-text">
      <strong>{{ $t('common.ai_draft.title') }}</strong>
      {{ bodyText }}
    </p>
    <button
      v-if="dismissible"
      type="button"
      class="ai-draft-close"
      :aria-label="$t('common.ai_draft.close_aria')"
      @click="close"
    >
      <X :size="14" />
    </button>
  </div>
</template>

<style scoped>
.ai-draft-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  margin: 0 0 14px;
  background: rgba(140, 98, 57, 0.06);
  border: 1px solid rgba(140, 98, 57, 0.16);
  border-radius: 10px;
}
.ai-draft-icon {
  color: var(--accent, #8C6239);
  flex-shrink: 0;
  margin-top: 1px;
}
.ai-draft-text {
  flex: 1;
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--text-muted, #6F665F);
}
.ai-draft-text strong {
  color: var(--text-main, #2A2421);
  font-weight: 800;
}
.ai-draft-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-dim, #A89B91);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.ai-draft-close:hover {
  background: rgba(140, 98, 57, 0.12);
  color: var(--text-main, #2A2421);
}
@media (max-width: 600px) {
  .ai-draft-text { font-size: 0.74rem; }
}
</style>
