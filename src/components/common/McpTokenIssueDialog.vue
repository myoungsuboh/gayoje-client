<script setup>
/**
 * MCP 토큰 발급 모달.
 *
 * [흐름]
 * 1. 라벨 입력 → "발급"
 * 2. POST /api/mcp-tokens → 응답 `token` 평문 받음
 * 3. **이 모달에서만** 평문 표시 + **토큰 박힌 완성형 IDE 스니펫** 제공
 * 4. "안전하게 저장했음" 체크 후에만 닫기 허용
 * 5. 닫히면 평문은 state 에서 즉시 제거 (다시 못 봄)
 *
 * [보안 설계]
 * - 평문 토큰은 props 로 새지 않음 — 이 컴포넌트 내부 ref 만 보유.
 * - watch(modelValue) 가 닫힐 때 ref 들 reset → 다음 렌더 시 평문 흔적 0.
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Check, AlertTriangle } from 'lucide-vue-next'
import { issueMcpToken } from '@/api/mcpTokens'
import { useSnackbar } from '@/composables/useSnackbar'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'issued'])

const { showSuccess, showError } = useSnackbar()

const MCP_BASE =
  import.meta.env.VITE_API_BACKEND_URL || 'https://api.harness-system.com'
const MCP_ENDPOINT = `${MCP_BASE}/mcp/sse`

const label = ref('')
const issuing = ref(false)
const issuedToken = ref('')      // 평문 — 모달 닫힐 때 ''
const issuedJti = ref('')
const issuedExpiresAt = ref('')
const copyConfirmed = ref(false)
const copiedField = ref(null)     // 'token' | 'snippet'

const canIssue = computed(() => label.value.trim().length > 0 && !issuing.value)
const canClose = computed(() => !issuedToken.value || copyConfirmed.value)

// 토큰 박힌 완성형 스니펫 — IDE 별로 분리.
// - Cursor: 표준이 url+headers (type 없음). type 키 허용 여부가 문서상 불확실해 미포함.
// - Claude Code: 원격 서버에 type:'http'(Streamable HTTP) 필수. 누락 시 deprecated SSE 로
//   오인되어 연결 실패 가능. 서버는 streamable HTTP 라 'http' 가 정확.
const cursorSnippet = computed(() => {
  if (!issuedToken.value) return ''
  return JSON.stringify({
    mcpServers: {
      harness: {
        url: MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${issuedToken.value}` },
      },
    },
  }, null, 2)
})
const claudeSnippet = computed(() => {
  if (!issuedToken.value) return ''
  return JSON.stringify({
    mcpServers: {
      harness: {
        type: 'http',
        url: MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${issuedToken.value}` },
      },
    },
  }, null, 2)
})

const issue = async () => {
  if (!canIssue.value) return
  issuing.value = true
  try {
    const res = await issueMcpToken(label.value.trim())
    issuedToken.value = res.token
    issuedJti.value = res.jti
    issuedExpiresAt.value = res.expires_at
    emit('issued')
  } catch (e) {
    const msg = e?.response?.data?.detail || t('common.mcp.issue_failed')
    showError(msg)
  } finally {
    issuing.value = false
  }
}

const copy = async (value, field) => {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 1800)
    showSuccess(field === 'token' ? t('common.mcp.token_copied') : t('common.mcp.snippet_copied'))
  } catch {
    showError(t('common.mcp.copy_failed'))
  }
}

const close = () => {
  if (!canClose.value) return
  emit('update:modelValue', false)
}

// 모달 닫힐 때 평문 토큰 메모리에서 제거
watch(() => props.modelValue, (open) => {
  if (!open) {
    issuedToken.value = ''
    issuedJti.value = ''
    issuedExpiresAt.value = ''
    label.value = ''
    copyConfirmed.value = false
    copiedField.value = null
  }
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    :persistent="!canClose"
    @update:model-value="(v) => !v && close()"
  >
    <v-card class="pa-5">
      <h3 class="text-h6 mb-3">{{ $t('common.mcp.issue_title') }}</h3>

      <!-- Stage 1: 라벨 입력 -->
      <template v-if="!issuedToken">
        <p class="text-body-2 text-muted mb-3">
          {{ $t('common.mcp.issue_label_intro') }}
        </p>
        <v-text-field
          v-model="label"
          :placeholder="$t('common.mcp.issue_label_placeholder')"
          maxlength="80"
          counter
          autofocus
          @keydown.enter="issue"
        />
        <div class="d-flex justify-end gap-2 mt-3">
          <v-btn variant="text" @click="close">{{ $t('common.action.cancel') }}</v-btn>
          <v-btn color="primary" :loading="issuing" :disabled="!canIssue" @click="issue">
            {{ $t('common.mcp.issue_submit') }}
          </v-btn>
        </div>
      </template>

      <!-- Stage 2: 평문 토큰 + 완성형 스니펫 -->
      <template v-else>
        <div class="warning-box mb-3">
          <AlertTriangle :size="16" class="mr-2" />
          <span v-html="$t('common.mcp.issued_warning_html')" />
        </div>

        <div class="field-label">{{ $t('common.mcp.token_standalone_label') }}</div>
        <div class="token-row mb-3">
          <code class="token-value mono-text">{{ issuedToken }}</code>
          <button class="icon-btn" :title="copiedField === 'token' ? $t('common.mcp.copied') : $t('common.mcp.copy')" @click="copy(issuedToken, 'token')">
            <Check v-if="copiedField === 'token'" :size="14" class="text-success" />
            <Copy v-else :size="14" />
          </button>
        </div>

        <div class="field-label" v-html="$t('common.mcp.full_config_label_html')" />
        <!-- Cursor: type 없는 표준형 -->
        <div class="client-block mb-2">
          <span class="client-label mono-text">{{ $t('common.mcp.client_cursor') }}</span>
          <div class="snippet-wrap">
            <pre class="snippet mono-text">{{ cursorSnippet }}</pre>
            <button class="icon-btn snippet-copy" :title="copiedField === 'snippet-cursor' ? $t('common.mcp.copied') : $t('common.mcp.copy')" @click="copy(cursorSnippet, 'snippet-cursor')">
              <Check v-if="copiedField === 'snippet-cursor'" :size="14" class="text-success" />
              <Copy v-else :size="14" />
            </button>
          </div>
        </div>
        <!-- Claude Code: type:http 필수 -->
        <div class="client-block mb-3">
          <span class="client-label mono-text">{{ $t('common.mcp.client_claude') }}</span>
          <div class="snippet-wrap">
            <pre class="snippet mono-text">{{ claudeSnippet }}</pre>
            <button class="icon-btn snippet-copy" :title="copiedField === 'snippet-claude' ? $t('common.mcp.copied') : $t('common.mcp.copy')" @click="copy(claudeSnippet, 'snippet-claude')">
              <Check v-if="copiedField === 'snippet-claude'" :size="14" class="text-success" />
              <Copy v-else :size="14" />
            </button>
          </div>
        </div>

        <p class="text-caption text-muted mb-2" v-html="$t('common.mcp.expires_note_html', { date: issuedExpiresAt })" />

        <v-checkbox
          v-model="copyConfirmed"
          :label="$t('common.mcp.save_confirm')"
          density="compact"
          hide-details
        />

        <div class="d-flex justify-end mt-3">
          <v-btn color="primary" :disabled="!canClose" @click="close">
            <Check :size="14" class="mr-1" /> {{ $t('common.mcp.done') }}
          </v-btn>
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.warning-box {
  display: flex; align-items: center;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px; font-size: 13px;
}
.field-label {
  font-size: 12px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 6px;
}
.token-row {
  display: flex; align-items: center; gap: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; padding: 8px 12px;
}
.token-value {
  flex-grow: 1; font-size: 12px; word-break: break-all;
}
.icon-btn {
  flex-shrink: 0; padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; color: var(--text-muted, #999);
  cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--text-main, #fff); }
.client-label {
  display: block; font-size: 11px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 4px;
}
.snippet-wrap { position: relative; }
.snippet {
  margin: 0; padding: 12px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 12px; line-height: 1.5;
  overflow-x: auto; white-space: pre;
}
.snippet-copy { position: absolute; top: 8px; right: 8px; }
.text-success { color: #10b981; }
</style>
