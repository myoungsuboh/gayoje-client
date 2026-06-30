<script setup>
/**
 * 노션 워크스페이스 연결 다이얼로그.
 *
 * [2026-05-19 OAuth 복원]
 * - 기본 흐름: 원클릭 OAuth (BE /auth/notion/link → authorize URL → 노션 동의 → 자동 복귀)
 * - 폴백: 운영에 OAuth env 가 안 설정돼 503 받으면 Internal Integration Token 입력 표시
 * - 사용자가 명시적으로 "Token 직접 입력" 펼쳐서 폴백 사용도 가능
 *
 * BE 라우트:
 *   POST /auth/notion/link    → authorize URL
 *   POST /auth/notion/token   → Internal Token 검증 + 저장
 *   GET  /auth/notion/callback (BE 내부 — 노션 → BE redirect)
 *   FE callback (/auth/callback?mode=notion_link) 에서 토스트.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Loader2, Link as LinkIcon, ExternalLink, AlertTriangle } from 'lucide-vue-next'
import {
  submitNotionTokenApi,
  startNotionOAuthLinkApi,
  fetchNotionStatusApi,
} from '@/utils/auth'

const { t } = useI18n()
const emit = defineEmits(['close', 'connected'])

const oauthAvailable = ref(null)     // null = 조회 전, true/false = 조회 완료
const isStartingOAuth = ref(false)
const oauthError = ref('')

const showManualToken = ref(false)   // "Token 직접 입력" 토글
const tokenInput = ref('')
const tokenError = ref('')
const isConnecting = ref(false)

onMounted(async () => {
  // 다이얼로그 열릴 때 OAuth 사용 가능 여부 확인.
  const r = await fetchNotionStatusApi()
  if (r.success) {
    oauthAvailable.value = !!r.status?.oauth_available
  } else {
    oauthAvailable.value = false  // 모를 땐 안전하게 manual 만 노출.
  }
})

const handleClose = () => {
  tokenInput.value = ''
  tokenError.value = ''
  oauthError.value = ''
  emit('close')
}

const startOAuth = async () => {
  oauthError.value = ''
  isStartingOAuth.value = true
  const r = await startNotionOAuthLinkApi()
  isStartingOAuth.value = false
  if (r.success && r.url) {
    // 노션 authorize 페이지로 이동. 사용자가 승인 후 BE callback → FE /auth/callback?mode=notion_link 로 자동 복귀.
    window.location.assign(r.url)
    return
  }
  if (r.status === 503) {
    // 운영 OAuth 미설정 — manual token 자동 노출 + 친절 안내.
    oauthError.value = t('profile.notion_dialog.oauth_503_error')
    oauthAvailable.value = false
    showManualToken.value = true
  } else {
    oauthError.value = r.error || t('profile.notion_dialog.oauth_start_failed')
  }
}

const submitToken = async () => {
  tokenError.value = ''
  const token = (tokenInput.value || '').trim()
  if (!token || token.length < 10) {
    tokenError.value = t('profile.notion_dialog.invalid_token')
    return
  }
  isConnecting.value = true
  const result = await submitNotionTokenApi(token)
  isConnecting.value = false
  if (result.success) {
    emit('connected', result.status?.notion_workspace_name)
  } else {
    tokenError.value = result.error || t('profile.notion_dialog.connect_failed')
  }
}

const showOAuthPrimary = computed(() => oauthAvailable.value === true)
</script>

<template>
  <div class="notion-dialog-overlay" @click.self="handleClose">
    <div class="notion-dialog">
      <div class="notion-dialog-header">
        <h3>{{ $t('profile.notion_dialog.title') }}</h3>
        <button class="notion-dialog-close" @click="handleClose" :aria-label="$t('common.action.close')">
          <X :size="16" />
        </button>
      </div>

      <div class="notion-dialog-body">

        <!-- OAuth 사용 가능 여부 조회 중 -->
        <div v-if="oauthAvailable === null" class="notion-loading">
          <Loader2 :size="14" class="spin mr-2" />
          {{ $t('profile.notion_dialog.checking') }}
        </div>

        <!-- ─── OAuth 원클릭 (기본 흐름) ─── -->
        <template v-else-if="showOAuthPrimary">
          <p class="notion-intro">
            {{ $t('profile.notion_dialog.oauth_intro') }}
          </p>

          <button
            type="button"
            class="notion-oauth-btn"
            :disabled="isStartingOAuth"
            @click="startOAuth"
          >
            <Loader2 v-if="isStartingOAuth" :size="16" class="spin mr-2" />
            <ExternalLink v-else :size="16" class="mr-2" />
            {{ isStartingOAuth ? $t('profile.notion_dialog.oauth_btn_loading') : $t('profile.notion_dialog.oauth_btn') }}
          </button>

          <p v-if="oauthError" class="notion-error">{{ oauthError }}</p>

          <p class="notion-hint">
            {{ $t('profile.notion_dialog.oauth_hint') }}
          </p>

          <!-- 폴백 토글 — OAuth 가 안 되는 사용자용 -->
          <details class="notion-fallback">
            <summary>{{ $t('profile.notion_dialog.fallback_summary') }}</summary>
            <div class="notion-fallback-body">
              <p class="notion-step-title">{{ $t('profile.notion_dialog.token_guide_title') }}</p>
              <ol class="notion-steps">
                <li>
                  <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer noopener" class="notion-link">
                    {{ $t('profile.notion_dialog.step1_link') }}
                  </a>{{ $t('profile.notion_dialog.step1_suffix') }}
                </li>
                <li v-html="$t('profile.notion_dialog.step2_html')"></li>
                <li v-html="$t('profile.notion_dialog.step3_html')"></li>
                <li v-html="$t('profile.notion_dialog.step4_html')"></li>
                <li>{{ $t('profile.notion_dialog.step5') }}</li>
              </ol>

              <label class="notion-token-label">
                <span>{{ $t('profile.notion_dialog.token_label') }}</span>
                <input
                  v-model="tokenInput"
                  type="password"
                  class="notion-token-input"
                  placeholder="ntn_..."
                  autocomplete="off"
                  spellcheck="false"
                  @keyup.enter="submitToken"
                />
              </label>
              <p v-if="tokenError" class="notion-error">{{ tokenError }}</p>
              <button
                type="button"
                class="notion-btn-primary notion-btn-fullwidth"
                :disabled="!tokenInput || isConnecting"
                @click="submitToken"
              >
                <Loader2 v-if="isConnecting" :size="13" class="mr-1 spin" />
                <LinkIcon v-else :size="13" class="mr-1" />
                {{ $t('profile.notion_dialog.token_connect') }}
              </button>
            </div>
          </details>
        </template>

        <!-- ─── OAuth 미설정 — Internal Token 직접 노출 ─── -->
        <template v-else>
          <div class="notion-warn-banner">
            <AlertTriangle :size="14" class="mr-2" />
            <span>{{ $t('profile.notion_dialog.oauth_missing_banner') }}</span>
          </div>

          <p class="notion-step-title">{{ $t('profile.notion_dialog.token_guide_title') }}</p>
          <ol class="notion-steps">
            <li>
              <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer noopener" class="notion-link">
                {{ $t('profile.notion_dialog.step1_link') }}
              </a>{{ $t('profile.notion_dialog.step1_suffix') }}
            </li>
            <li v-html="$t('profile.notion_dialog.step2_html')"></li>
            <li v-html="$t('profile.notion_dialog.step3_html')"></li>
            <li v-html="$t('profile.notion_dialog.step4_html')"></li>
            <li>{{ $t('profile.notion_dialog.step5') }}</li>
          </ol>

          <label class="notion-token-label">
            <span>{{ $t('profile.notion_dialog.token_label') }}</span>
            <input
              v-model="tokenInput"
              type="password"
              class="notion-token-input"
              placeholder="ntn_..."
              autocomplete="off"
              spellcheck="false"
              @keyup.enter="submitToken"
            />
          </label>
          <p v-if="tokenError" class="notion-error">{{ tokenError }}</p>
          <p class="notion-hint">
            {{ $t('profile.notion_dialog.token_hint') }}
          </p>
        </template>
      </div>

      <div class="notion-dialog-actions">
        <button class="notion-btn-secondary" @click="handleClose">{{ $t('common.action.cancel') }}</button>
        <button
          v-if="!showOAuthPrimary"
          class="notion-btn-primary"
          :disabled="!tokenInput || isConnecting"
          @click="submitToken"
        >
          <Loader2 v-if="isConnecting" :size="13" class="mr-1 spin" />
          <LinkIcon v-else :size="13" class="mr-1" />
          {{ $t('profile.notion_dialog.connect') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notion-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}
.notion-dialog {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0,0,0,0.15);
}
.notion-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08));
}
.notion-dialog-header h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.notion-dialog-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted);
}
.notion-dialog-close:hover { background: rgba(0,0,0,0.05); border-radius: 4px; }

.notion-dialog-body { padding: 20px; }

.notion-loading {
  display: flex; align-items: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 20px 0;
}

.notion-intro {
  font-size: 0.85rem;
  color: var(--text-main);
  line-height: 1.6;
  margin: 0 0 16px;
}

/* OAuth 원클릭 메인 버튼 — primary 액션 강조. */
.notion-oauth-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%;
  padding: 12px 16px;
  background: var(--accent, #8C6239);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}
.notion-oauth-btn:hover:not(:disabled) {
  background: #6E4E2E;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(140, 98, 57, 0.3);
}
.notion-oauth-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.notion-warn-banner {
  display: flex; align-items: center;
  padding: 10px 12px;
  background: rgba(180, 103, 35, 0.08);
  color: #B46723;
  border: 1px solid rgba(180, 103, 35, 0.25);
  border-radius: 8px;
  font-size: 0.8rem;
  margin-bottom: 14px;
}

/* 폴백 details 토글 */
.notion-fallback {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-light, rgba(0,0,0,0.12));
}
.notion-fallback summary {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  cursor: pointer;
  list-style: none;
  padding: 4px 0;
}
.notion-fallback summary::-webkit-details-marker { display: none; }
.notion-fallback summary::before {
  content: '▸ ';
  margin-right: 4px;
  transition: transform 0.15s;
  display: inline-block;
}
.notion-fallback[open] summary::before { transform: rotate(90deg); }
.notion-fallback-body { padding-top: 10px; }

.notion-step-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  margin: 0 0 8px;
}
.notion-steps {
  padding-left: 20px;
  margin: 0 0 16px;
  font-size: 0.85rem;
  line-height: 1.7;
}
.notion-steps li { margin-bottom: 4px; }
.notion-steps code {
  background: #F3F4F6;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
}
.notion-link { color: var(--accent, #8C6239); text-decoration: underline; font-weight: 700; }

.notion-token-label { display: block; margin-top: 12px; }
.notion-token-label span {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
}
.notion-token-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.88rem;
  font-family: ui-monospace, 'SF Mono', monospace;
}
.notion-token-input:focus { border-color: var(--accent, #8C6239); outline: none; }
.notion-error { color: #DC2626; font-size: 0.8rem; margin: 8px 0 0; }
.notion-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 14px 0 0;
  line-height: 1.6;
  padding-top: 10px;
  border-top: 1px dashed var(--border-light, rgba(0,0,0,0.08));
}

.notion-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 20px;
}
.notion-btn-secondary {
  background: transparent;
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-main);
}
.notion-btn-secondary:hover { background: rgba(0,0,0,0.04); }
.notion-btn-primary {
  display: inline-flex;
  align-items: center;
  background: var(--accent, #8C6239);
  border: none;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  color: white;
}
.notion-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.notion-btn-fullwidth {
  width: 100%;
  justify-content: center;
  margin-top: 10px;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
