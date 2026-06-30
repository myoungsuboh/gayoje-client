<script setup>
import { RotateCcw, Shield, Loader2, AlertTriangle } from 'lucide-vue-next'

defineProps({
  type: { type: String, default: 'empty' }, // 'empty' | 'error' | 'loading'
  errorInfo: { type: Object, default: null },
  isLinting: { type: Boolean, default: false },
})
defineEmits(['retry'])
</script>

<template>
  <div v-if="type === 'error' && errorInfo" class="empty-state error-state">
    <AlertTriangle :size="36" class="error-state-icon" />
    <p class="empty-title serif-text">{{ $t('lint.empty.error_title') }}</p>
    <p class="empty-desc">{{ errorInfo.message }}</p>
    <div class="error-state-hints">
      <span class="error-hint-label mono-text">{{ $t('lint.empty.checklist') }}</span>
      <ul class="error-hint-list">
        <li>
          <i18n-t keypath="lint.empty.check_url" tag="span">
            <template #url><code class="mono-text">{{ errorInfo.githubUrl }}</code></template>
          </i18n-t>
        </li>
        <li>{{ $t('lint.empty.check_public') }}</li>
        <li>{{ $t('lint.empty.check_retry') }}</li>
      </ul>
    </div>
    <button class="error-retry-btn" :disabled="isLinting" @click="$emit('retry')">
      <RotateCcw :size="14" class="mr-2" /><span>{{ $t('lint.empty.retry') }}</span>
    </button>
  </div>
  <div v-else-if="type === 'loading'" class="empty-state">
    <Loader2 :size="36" class="empty-icon rotate-anim" />
    <p class="empty-title serif-text">{{ $t('lint.empty.loading_title') }}</p>
    <p class="empty-desc">{{ $t('lint.empty.loading_desc') }}</p>
  </div>
  <div v-else class="empty-state">
    <Shield :size="36" class="empty-icon" />
    <p class="empty-title serif-text">{{ $t('lint.empty.empty_title') }}</p>
    <p class="empty-desc" v-html="$t('lint.empty.empty_desc')"></p>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; background: white; border: 1px dashed var(--border-light); border-radius: 16px; text-align: center; }
.empty-icon { color: var(--text-muted); margin-bottom: 12px; opacity: 0.5; }
.empty-title { font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px; }
.empty-desc { font-family: 'Pretendard Variable', sans-serif; font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.6; }
.error-state { border: 1px solid rgba(244, 67, 54, 0.25) !important; border-style: solid !important; background: linear-gradient(180deg, rgba(244, 67, 54, 0.03), white) !important; }
.error-state-icon { color: #F44336 !important; opacity: 1 !important; margin-bottom: 12px; }
.error-state-hints { margin-top: 20px; padding: 16px 20px; background: rgba(244, 67, 54, 0.04); border: 1px solid rgba(244, 67, 54, 0.12); border-radius: 12px; max-width: 540px; width: 100%; text-align: left; }
.error-hint-label { font-size: 0.6rem; font-weight: 800; color: #C62828; letter-spacing: 0.08em; display: block; margin-bottom: 8px; }
.error-hint-list { list-style: none; padding: 0; margin: 0; font-family: 'Pretendard Variable', sans-serif; font-size: 0.78rem; color: var(--text-main); line-height: 1.7; }
.error-hint-list li { padding-left: 18px; position: relative; }
.error-hint-list li::before { content: '·'; position: absolute; left: 6px; top: 0; color: #F44336; font-weight: 900; }
.error-hint-list code { background: white; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(140, 98, 57, 0.15); font-size: 0.74rem; }
.error-retry-btn { display: inline-flex; align-items: center; padding: 10px 20px; margin-top: 18px; border-radius: 9999px; border: 1px solid var(--border-light); background: white; color: var(--text-main); font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s; }
.error-retry-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.error-retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
