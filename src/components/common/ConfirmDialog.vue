<script setup>
import { useConfirmState } from '@/composables/useConfirm'
import { AlertTriangle, HelpCircle } from 'lucide-vue-next'

const { state, accept, reject } = useConfirmState()
</script>

<template>
  <v-dialog
    :model-value="state.show"
    max-width="440"
    persistent
    role="alertdialog"
    :aria-label="state.title"
    @update:model-value="(v) => !v && reject()"
    @keydown.esc="reject"
    @keydown.enter="accept"
  >
    <v-card class="confirm-card">
      <div class="confirm-head" :class="{ 'confirm-head--danger': state.variant === 'danger' }">
        <AlertTriangle v-if="state.variant === 'danger'" :size="20" class="mr-2" aria-hidden="true" />
        <HelpCircle v-else :size="20" class="mr-2" aria-hidden="true" />
        <span class="confirm-title">{{ state.title }}</span>
      </div>
      <div class="confirm-body">
        <p class="confirm-message">{{ state.message }}</p>
      </div>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn confirm-btn--cancel" @click="reject">{{ state.cancelText }}</button>
        <button
          type="button"
          class="confirm-btn"
          :class="state.variant === 'danger' ? 'confirm-btn--danger' : 'confirm-btn--primary'"
          @click="accept"
        >{{ state.confirmText }}</button>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirm-card {
  border-radius: 14px;
  overflow: hidden;
}
.confirm-head {
  display: flex; align-items: center;
  padding: 14px 20px;
  background: linear-gradient(135deg, var(--accent) 0%, #6B4A2A 100%);
  color: white;
}
.confirm-head--danger {
  background: linear-gradient(135deg, #E74C3C 0%, #C0392B 100%);
}
.confirm-title {
  font-family: 'Outfit', sans-serif;
  font-weight: 800; font-size: 0.95rem;
}
.confirm-body { padding: 20px; }
.confirm-message {
  font-size: 0.85rem; line-height: 1.6; color: var(--text-main);
  white-space: pre-line;
}
.confirm-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 18px;
}
.confirm-btn {
  font-family: 'Outfit', sans-serif; font-weight: 700;
  font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 9px 18px; border-radius: 9999px; cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.confirm-btn--cancel {
  background: white; color: var(--text-main); border-color: var(--border-light);
}
.confirm-btn--cancel:hover { background: var(--bg-light); }
.confirm-btn--primary {
  background: var(--accent); color: white;
}
.confirm-btn--primary:hover { opacity: 0.88; transform: translateY(-1px); }
.confirm-btn--danger {
  background: #E74C3C; color: white;
}
.confirm-btn--danger:hover { background: #C0392B; transform: translateY(-1px); }
</style>
