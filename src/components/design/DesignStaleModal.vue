<script setup>
/**
 * DesignStaleModal — PRD 변경 시 '설계도 재생성 유도' 모달 (2026-06 리팩토링).
 * design.vue 에서 **UI 만** 분리. 열기 조건/seen 기억/재생성 트리거 같은 로직은
 * design.vue(designSourceStale·designStaleAt·handleLatestUpdate 와 얽힘)에 그대로 두고,
 * 여기선 표시 + 두 버튼 이벤트만 담당.
 *
 * props: modelValue(표시 여부), projectName(재생성 버튼 가드)
 * emit:
 *   - update:modelValue : 외부 닫기(ESC/배경) — 부모 v-model 동기화
 *   - later             : '나중에' — 부모가 seen 기록 후 닫기(closeDesignStaleModal)
 *   - regenerate        : '지금 다시 만들기' — 부모가 seen 기록 + 재생성(regenerateFromStaleModal)
 */
import { RefreshCw } from 'lucide-vue-next'

defineProps({
  modelValue: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'later', 'regenerate'])
</script>

<template>
  <VDialog :model-value="modelValue" max-width="500" @update:model-value="v => emit('update:modelValue', v)">
    <div class="design-stale-modal">
      <div class="design-stale-modal__icon"><RefreshCw :size="24" /></div>
      <h3 class="design-stale-modal__title">{{ $t('design.stale.modal_title') }}</h3>
      <p class="design-stale-modal__body" v-html="$t('design.stale.modal_body')"></p>
      <p class="design-stale-modal__note">{{ $t('design.stale.modal_note') }}</p>
      <div class="design-stale-modal__actions">
        <button type="button" class="design-stale-modal__later" @click="emit('later')">
          {{ $t('design.stale.modal_later') }}
        </button>
        <button
          type="button"
          class="design-stale-modal__go"
          :disabled="!projectName"
          @click="emit('regenerate')"
        >
          <RefreshCw :size="14" class="mr-1" />
          {{ $t('design.stale.modal_regen') }}
        </button>
      </div>
    </div>
  </VDialog>
</template>

<style scoped>
/* ── design.vue 원본(L996-1046)을 1:1 이동. 한 줄도 변경하지 않음. ── */
/* ═══════ PRD 변경 → 설계도 재생성 안내 모달 ═══════ */
.design-stale-modal {
  background: #fff;
  border-radius: 18px;
  /* 표준 모달 elevation (cf. BaseGuideModal) — 없으면 카드가 배경 위에 안착하지 못해
     가장자리가 '따로 노는' 것처럼 보인다. overflow:hidden 으로 둥근 모서리도 확실히 클립. */
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  padding: 28px 26px 22px;
  text-align: center;
}
.design-stale-modal__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 15px;
  background: #fff8e1; color: #b8860b;
  margin-bottom: 14px;
}
.design-stale-modal__title {
  font-size: 1.18rem; font-weight: 800; letter-spacing: -0.02em;
  color: var(--text-main, #2A2421); margin: 0 0 12px; line-height: 1.4;
  word-break: keep-all;
}
.design-stale-modal__body {
  font-size: 0.9rem; line-height: 1.7; color: var(--text-muted, #6F665F);
  margin: 0 0 10px; word-break: keep-all;
}
.design-stale-modal__body strong { color: var(--accent, #8C6239); font-weight: 700; }
.design-stale-modal__note {
  font-size: 0.78rem; line-height: 1.6; color: var(--text-dim, #A89B91);
  margin: 0 0 22px; word-break: keep-all;
}
.design-stale-modal__actions {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.design-stale-modal__later,
.design-stale-modal__go {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 11px 22px; border-radius: 9999px;
  font-family: inherit; font-size: 0.86rem; font-weight: 800;
  cursor: pointer; transition: all .18s cubic-bezier(.16,1,.3,1);
}
.design-stale-modal__later {
  background: #fff; color: var(--text-muted, #6F665F);
  border: 1.5px solid rgba(0, 0, 0, 0.12);
}
.design-stale-modal__later:hover { background: rgba(0, 0, 0, 0.04); }
.design-stale-modal__go {
  background: var(--accent, #8C6239); color: #fff; border: none;
  box-shadow: 0 8px 20px -8px rgba(140, 98, 57, 0.45);
}
.design-stale-modal__go:hover:not(:disabled) { background: #6E4E2E; transform: translateY(-1px); }
.design-stale-modal__go:disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 480px) {
  .design-stale-modal__later, .design-stale-modal__go { width: 100%; }
}
</style>
