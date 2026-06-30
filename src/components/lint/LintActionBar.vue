<script setup>
import { Loader2, FileDown, AlertTriangle } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

defineProps({
  fixSpecLoading: { type: Boolean, default: false },
  fixSpecMessage: { type: String, default: '' },
  fixSpecError: { type: String, default: '' },
  failCount: { type: Number, default: 0 },
})
defineEmits(['execute'])
</script>

<template>
  <div class="action-row">
    <span class="d-inline-flex align-center">
      <button :disabled="fixSpecLoading || failCount === 0" class="fix-btn" @click="$emit('execute')">
        <Loader2 v-if="fixSpecLoading" class="rotate-anim mr-2" :size="16" />
        <FileDown v-else class="mr-2" :size="16" />
        <span>{{ fixSpecLoading ? 'Generating Spec...' : 'Execute Constraint Fix Agent' }}</span>
      </button>
      <GuideTooltip target="fix-agent" placement="bottom" />
    </span>
    <p v-if="fixSpecMessage" class="fix-result">{{ fixSpecMessage }}</p>
    <p v-if="fixSpecError" class="fix-error"><AlertTriangle :size="14" class="mr-1" />{{ fixSpecError }}</p>
  </div>
</template>

<style scoped>
.action-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.fix-btn { display: inline-flex; align-items: center; padding: 14px 32px; border-radius: 9999px; border: none; background: var(--text-main); color: white; font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: all 0.15s; }
.fix-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
.fix-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fix-result { font-family: 'Pretendard Variable', sans-serif; font-size: 0.82rem; color: var(--primary-moss); font-weight: 600; }
.fix-error { display: inline-flex; align-items: center; font-family: 'Pretendard Variable', sans-serif; font-size: 0.82rem; color: #F44336; font-weight: 600; }
.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) { .fix-btn { width: 100%; justify-content: center; } }
</style>
