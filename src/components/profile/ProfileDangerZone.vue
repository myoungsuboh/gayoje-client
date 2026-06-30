<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-vue-next'
import { deleteMyAccountApi, clearSession } from '@/utils/auth'
import { useLibraryStore } from '@/store/library'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}
const confirm = useConfirm()
const libraryStore = useLibraryStore()

const isDeletingAccount = ref(false)

const notify = (msg, type = 'success') => {
  if (type === 'success' && showSuccess) showSuccess(msg)
  else if (type === 'error' && showError) showError(msg)
}

const handleDeleteAccount = async () => {
  const ok = await confirm({
    title: t('profile.danger.confirm1_title'),
    message: t('profile.danger.confirm1_message'),
    variant: 'danger',
    confirmText: t('profile.danger.confirm1_confirm'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return
  const reallyOk = await confirm({
    title: t('profile.danger.confirm2_title'),
    message: t('profile.danger.confirm2_message'),
    variant: 'danger',
    confirmText: t('profile.danger.confirm2_confirm'),
    cancelText: t('common.action.cancel'),
  })
  if (!reallyOk) return

  isDeletingAccount.value = true
  const result = await deleteMyAccountApi()
  isDeletingAccount.value = false
  if (!result.success) {
    notify(result.error || t('profile.danger.delete_failed'), 'error')
    return
  }
  notify(t('profile.danger.deleted_toast'))
  clearSession()
  setTimeout(() => { router.push('/login') }, 1200)
}
</script>

<template>
  <section class="profile-card profile-card--danger" :aria-label="$t('profile.danger.aria')">
    <div class="profile-card-header profile-card-header--danger">
      <AlertTriangle :size="18" class="mr-2" style="color: #b91c1c;" />
      <span class="profile-card-title" style="color: #b91c1c;">{{ $t('profile.danger.title') }}</span>
    </div>
    <div class="danger-zone-body">
      <div class="danger-zone-head">
        <p class="danger-zone-title">{{ $t('profile.danger.deactivate') }}</p>
        <p class="danger-zone-lead">
          {{ $t('profile.danger.lead') }}
        </p>
      </div>

      <ul class="danger-list" :aria-label="$t('profile.danger.deleted_items_aria')">
        <li>
          <span class="danger-list-icon" aria-hidden="true">×</span>
          <span>{{ $t('profile.danger.item_account') }}</span>
        </li>
        <li>
          <span class="danger-list-icon" aria-hidden="true">×</span>
          <span>{{ $t('profile.danger.item_library_prefix') }}<em>{{ $t('profile.danger.item_library_repos', { count: libraryStore.repos.length }) }}</em></span>
        </li>
        <li>
          <span class="danger-list-icon" aria-hidden="true">×</span>
          <span>{{ $t('profile.danger.item_mcp') }}</span>
        </li>
        <li>
          <span class="danger-list-icon" aria-hidden="true">×</span>
          <span>{{ $t('profile.danger.item_billing') }}</span>
        </li>
        <li>
          <span class="danger-list-icon" aria-hidden="true">×</span>
          <span>{{ $t('profile.danger.item_projects') }}</span>
        </li>
      </ul>

      <div class="danger-callout" role="note">
        <AlertTriangle :size="14" class="mr-2 flex-shrink-0" />
        <span v-html="$t('profile.danger.callout_html')"></span>
      </div>

      <div class="danger-action">
        <button
          class="danger-btn"
          :disabled="isDeletingAccount"
          @click="handleDeleteAccount"
        >
          <Loader2 v-if="isDeletingAccount" :size="14" class="spin mr-2" />
          <Trash2 v-else :size="14" class="mr-2" />
          {{ isDeletingAccount ? $t('profile.danger.deactivating') : $t('profile.danger.deactivate') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-card {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}
.profile-card-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-light);
}
.profile-card-title { font-size: 0.9rem; font-weight: 700; color: var(--text-main); }

.profile-card--danger {
  border: 1.5px solid rgba(220, 38, 38, 0.25);
  background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
}
.profile-card-header--danger {
  background: linear-gradient(135deg, rgba(220, 38, 38, 0.06) 0%, rgba(220, 38, 38, 0.02) 100%);
  border-bottom-color: rgba(220, 38, 38, 0.15);
}

.danger-zone-body { padding: 20px; }
.danger-zone-head { margin-bottom: 14px; }
.danger-zone-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2A2421;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}
.danger-zone-lead { font-size: 0.8rem; color: #6F665F; line-height: 1.55; margin: 0; }

.danger-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(220, 38, 38, 0.15);
  border-radius: 10px;
  font-size: 0.78rem;
  line-height: 1.55;
  color: #4E4540;
}
.danger-list li { display: flex; align-items: flex-start; gap: 9px; padding: 5px 0; }
.danger-list li + li { border-top: 1px dashed rgba(220, 38, 38, 0.1); }
.danger-list em {
  font-style: normal;
  color: #b91c1c;
  font-weight: 700;
  font-size: 0.74rem;
  margin-left: 4px;
}
.danger-list-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
  font-size: 0.85rem;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 1px;
  line-height: 1;
}

.danger-callout {
  display: flex;
  align-items: flex-start;
  padding: 11px 13px;
  background: rgba(220, 38, 38, 0.07);
  border: 1px solid rgba(220, 38, 38, 0.22);
  border-radius: 10px;
  font-size: 0.78rem;
  color: #6F4040;
  line-height: 1.55;
  margin-bottom: 16px;
}
.danger-callout > svg { color: #b91c1c; margin-top: 1px; }
.danger-callout strong { color: #b91c1c; font-weight: 700; }

.danger-action { display: flex; justify-content: flex-end; }
.danger-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 18px;
  background: #fff;
  color: #b91c1c;
  border: 1.5px solid #b91c1c;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.danger-btn:hover:not(:disabled) {
  background: #b91c1c;
  color: #fff;
  box-shadow: 0 2px 10px rgba(185, 28, 28, 0.25);
  transform: translateY(-1px);
}
.danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
