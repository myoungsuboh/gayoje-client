<script setup>
/**
 * SkillImproveDialog — 'AI 로 다듬기' before/after 미리보기 모달.
 *
 * 사용자가 적은 초안(original)과 AI 개선안(result)을 나란히 보여주고,
 * '적용'하면 부모가 폼에 반영한다. 표시만 담당 — 호출/반영 로직은 부모.
 *
 * props:
 *   modelValue : 표시 여부
 *   original   : 다듬기 직전 초안 스냅샷 { name, trigger_condition, instructions[] }
 *   result     : AI 개선안 { improved, name, scope, trigger_condition, instructions[], explanation } | null
 *   loading    : 호출 중
 *   error      : 에러 메시지(있으면 표시)
 * emit:
 *   update:modelValue, apply
 */
import { Sparkles, ArrowRight, Check, X, Loader } from 'lucide-vue-next'

defineProps({
  modelValue: { type: Boolean, default: false },
  original: { type: Object, default: () => ({}) },
  result: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'apply'])

const close = () => emit('update:modelValue', false)
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="760"
    scrollable
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <div class="si-modal">
      <!-- 헤더 -->
      <div class="si-head">
        <span class="si-head-title">
          <Sparkles :size="16" class="mr-2" />{{ $t('rule.improve.dialog_title') }}
        </span>
        <button type="button" class="si-close" @click="close" :aria-label="$t('rule.improve.close')">
          <X :size="18" />
        </button>
      </div>

      <!-- 로딩 -->
      <div v-if="loading" class="si-state">
        <Loader :size="28" class="spinning mb-3" style="color: var(--accent);" />
        <p class="si-state-msg">{{ $t('rule.improve.loading') }}</p>
      </div>

      <!-- 에러 -->
      <div v-else-if="error || !result" class="si-state">
        <p class="si-state-msg si-state-msg--error">{{ error || $t('rule.improve.error_generic') }}</p>
        <VBtn variant="tonal" color="secondary" @click="close" class="rounded-pill font-bold mt-3">
          {{ $t('rule.improve.close') }}
        </VBtn>
      </div>

      <!-- AI 가 개선할 게 없다고 판단 (improved=false) -->
      <div v-else-if="!result.improved" class="si-state">
        <p class="si-state-msg">{{ $t('rule.improve.no_change') }}</p>
        <VBtn variant="tonal" color="secondary" @click="close" class="rounded-pill font-bold mt-3">
          {{ $t('rule.improve.close') }}
        </VBtn>
      </div>

      <!-- before/after -->
      <template v-else>
        <div class="si-body custom-scroll">
          <div class="si-compare">
            <!-- before -->
            <div class="si-col si-col--before">
              <div class="si-col-label">{{ $t('rule.improve.before') }}</div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_name') }}</span>
                <span class="si-field-val">{{ original.name || '—' }}</span>
              </div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_trigger') }}</span>
                <span class="si-field-val">{{ original.trigger_condition || '—' }}</span>
              </div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_instructions') }}</span>
                <ul class="si-inst-list">
                  <li v-for="(i, idx) in (original.instructions || []).filter(x => (x||'').trim())" :key="idx">{{ i }}</li>
                  <li v-if="!(original.instructions || []).filter(x => (x||'').trim()).length" class="si-empty">—</li>
                </ul>
              </div>
            </div>

            <ArrowRight :size="20" class="si-arrow" />

            <!-- after -->
            <div class="si-col si-col--after">
              <div class="si-col-label si-col-label--after">{{ $t('rule.improve.after') }}</div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_name') }}</span>
                <span class="si-field-val si-field-val--strong">{{ result.name || '—' }}</span>
              </div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_trigger') }}</span>
                <span class="si-field-val si-field-val--strong">{{ result.trigger_condition || '—' }}</span>
              </div>
              <div class="si-field">
                <span class="si-field-label">{{ $t('rule.improve.field_instructions') }}</span>
                <ul class="si-inst-list">
                  <li v-for="(i, idx) in result.instructions" :key="idx" class="si-inst--new">{{ i }}</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- 설명 -->
          <div v-if="result.explanation" class="si-explain">
            <span class="si-explain-label">{{ $t('rule.improve.explanation_label') }}</span>
            <p class="si-explain-text">{{ result.explanation }}</p>
          </div>
        </div>

        <!-- 액션 -->
        <div class="si-actions">
          <VBtn variant="tonal" color="secondary" height="40" @click="close" class="rounded-pill font-bold px-4">
            {{ $t('rule.improve.close') }}
          </VBtn>
          <VBtn variant="flat" color="accent" height="40" @click="emit('apply')" class="rounded-pill font-bold px-5">
            <Check :size="15" class="mr-2" />{{ $t('rule.improve.apply') }}
          </VBtn>
        </div>
      </template>
    </div>
  </VDialog>
</template>

<style scoped>
.si-modal {
  background: var(--bg-card, #fff);
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
}
.si-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(140,98,57,0.08), rgba(184,134,11,0.08));
  border-bottom: 1px solid var(--border-light);
}
.si-head-title { display: inline-flex; align-items: center; font-size: 0.95rem; font-weight: 800; color: var(--accent); }
.si-close {
  display: inline-flex; background: none; border: none; cursor: pointer;
  color: var(--text-muted); border-radius: 8px; padding: 4px;
}
.si-close:hover { background: rgba(0,0,0,0.05); color: var(--text-main); }

.si-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; }
.si-state-msg { font-size: 0.86rem; color: var(--text-muted); line-height: 1.6; word-break: keep-all; }
.si-state-msg--error { color: #dc2626; }

.si-body { padding: 20px; overflow-y: auto; }
.si-compare { display: flex; align-items: stretch; gap: 12px; }
.si-col { flex: 1; min-width: 0; border-radius: 12px; padding: 14px; border: 1px solid var(--border-light); }
.si-col--before { background: rgba(0,0,0,0.02); }
.si-col--after { background: #fffdf6; border-color: rgba(184,134,11,0.35); }
.si-col-label { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 10px; }
.si-col-label--after { color: var(--accent); }
.si-arrow { color: var(--accent); align-self: center; flex-shrink: 0; }

.si-field { margin-bottom: 12px; }
.si-field-label { display: block; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim, #a89b91); margin-bottom: 3px; }
.si-field-val { font-size: 0.8rem; color: var(--text-main); line-height: 1.45; word-break: break-word; }
.si-field-val--strong { font-weight: 700; }
.si-inst-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.si-inst-list li { font-size: 0.78rem; line-height: 1.45; color: var(--text-main); padding-left: 12px; position: relative; word-break: break-word; }
.si-inst-list li::before { content: '·'; position: absolute; left: 2px; color: var(--text-dim, #a89b91); }
.si-inst--new::before { color: var(--accent); }
.si-empty { color: var(--text-dim, #a89b91); }

.si-explain { margin-top: 16px; padding: 12px 14px; background: rgba(140,98,57,0.06); border-radius: 10px; }
.si-explain-label { display: block; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); margin-bottom: 5px; }
.si-explain-text { font-size: 0.8rem; color: var(--text-main); line-height: 1.6; margin: 0; word-break: keep-all; }

.si-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-light); }

.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(140,98,57,0.2); border-radius: 10px; }

@media (max-width: 600px) {
  .si-compare { flex-direction: column; }
  .si-arrow { transform: rotate(90deg); }
  .si-actions { flex-direction: column-reverse; }
  .si-actions :deep(.v-btn) { width: 100%; }
}
</style>
