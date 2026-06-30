<script setup>
/**
 * 현재 사용자의 MCP 토큰 목록.
 *
 * - 평문 토큰 표시 0 — label / 마지막 사용 / 만료 / 회수 버튼만.
 * - 회수는 useConfirm (Promise 기반) → DELETE → 목록 reload.
 *
 * 부모가 `ref.reload()` 호출해 새 발급 직후 갱신.
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, RefreshCw } from 'lucide-vue-next'
import { listMcpTokens, revokeMcpToken } from '@/api/mcpTokens'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'

const { t } = useI18n()
const { showSuccess, showError } = useSnackbar()
const confirm = useConfirm()

const tokens = ref([])
const loading = ref(false)
const revoking = ref(null)  // jti

const load = async () => {
  loading.value = true
  try {
    tokens.value = await listMcpTokens()
  } catch (e) {
    showError(e?.response?.data?.detail || t('common.mcp.list_load_failed'))
  } finally {
    loading.value = false
  }
}

const revoke = async (token) => {
  const ok = await confirm({
    title: t('common.mcp.revoke_title'),
    message: t('common.mcp.revoke_message', { label: token.label }),
    confirmText: t('common.mcp.revoke_confirm'),
    cancelText: t('common.action.cancel'),
    variant: 'danger',
  })
  if (!ok) return

  revoking.value = token.jti
  try {
    await revokeMcpToken(token.jti)
    showSuccess(t('common.mcp.revoked_toast'))
    await load()
  } catch (e) {
    showError(e?.response?.data?.detail || t('common.mcp.revoke_failed'))
  } finally {
    revoking.value = null
  }
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

const statusOf = (token) => {
  if (token.revoked) return { label: t('common.mcp.status_revoked'), cls: 'status-revoked' }
  if (new Date(token.expires_at) < new Date()) return { label: t('common.mcp.status_expired'), cls: 'status-expired' }
  return { label: t('common.mcp.status_active'), cls: 'status-active' }
}

defineExpose({ reload: load })
onMounted(load)
</script>

<template>
  <section class="mcp-token-list">
    <div class="list-header">
      <span class="list-title">{{ $t('common.mcp.list_title') }}</span>
      <v-btn icon size="x-small" variant="text" :loading="loading" @click="load">
        <RefreshCw :size="14" />
      </v-btn>
    </div>

    <div v-if="tokens.length === 0 && !loading" class="empty">
      {{ $t('common.mcp.list_empty') }}
    </div>

    <table v-else class="tokens-table">
      <thead>
        <tr>
          <th>{{ $t('common.mcp.col_label') }}</th>
          <th>{{ $t('common.mcp.col_status') }}</th>
          <th>{{ $t('common.mcp.col_last_used') }}</th>
          <th>{{ $t('common.mcp.col_expires') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="token in tokens" :key="token.jti">
          <td class="label-cell">{{ token.label }}</td>
          <td>
            <span class="status-pill" :class="statusOf(token).cls">{{ statusOf(token).label }}</span>
          </td>
          <td>{{ fmtDate(token.last_used_at) }}</td>
          <td>{{ fmtDate(token.expires_at) }}</td>
          <td>
            <v-btn
              v-if="!token.revoked"
              icon size="x-small" variant="text" color="error"
              :loading="revoking === token.jti"
              @click="revoke(token)"
            >
              <Trash2 :size="14" />
            </v-btn>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.mcp-token-list {
  margin-top: 18px;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #999);
}
.empty {
  padding: 14px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-muted, #888);
  text-align: center;
}
.tokens-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.tokens-table th {
  text-align: left;
  font-weight: 500;
  color: var(--text-muted, #999);
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.tokens-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.label-cell {
  font-weight: 500;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.status-active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.status-revoked { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.status-expired { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
</style>
