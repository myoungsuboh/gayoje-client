<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import { saveSession, verifyToken } from '@/utils/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const phase = ref('processing') // 'processing' | 'success' | 'error'
const errorMsg = ref('')
const mode = ref('login')        // 'login' | 'link' | 'error'
const provider = ref('github')   // 'github' | 'google' — BE 가 query 로 전달 (2026-05)
const isNewUser = ref(false)

// [2026-05] provider 별 라벨 — 사용자에게 표시할 OAuth 제공자 이름.
const providerLabel = (p) => {
  if (p === 'google') return 'Google'
  if (p === 'notion') return t('auth.callback.provider_notion')
  return 'GitHub'
}

// 사용자에게 표시할 에러 메시지 (BE 가 query 로 보낸 raw 에러 코드를 한글로 변환).
// provider 인자로 GitHub/Google 메시지 분기.
const humanize = (raw, prov = 'github') => {
  if (!raw) return t('auth.callback.err_unknown')
  const label = providerLabel(prov)

  // provider-prefixed 에러 — github_already_linked_to: / google_already_linked_to:
  if (raw.startsWith('github_already_linked_to:')) {
    return t('auth.callback.err_github_already_linked', { email: raw.split(':')[1] })
  }
  if (raw.startsWith('google_already_linked_to:')) {
    return t('auth.callback.err_google_already_linked', { email: raw.split(':')[1] })
  }
  if (raw.startsWith('email_exists_use_link:')) {
    return t('auth.callback.err_email_exists_use_link', { email: raw.split(':')[1], provider: label })
  }
  if (raw.startsWith('invalid_state:')) return t('auth.callback.err_invalid_state')

  // common 에러 — provider 변수에 따라 라벨 치환
  const COMMON = {
    oauth_disabled: t('auth.callback.err_oauth_disabled', { provider: label }),
    missing_code_or_state: t('auth.callback.err_missing_code_or_state', { provider: label }),
    user_not_found: t('auth.callback.err_user_not_found'),
    link_email_missing: t('auth.callback.err_link_email_missing'),
    user_create_failed: t('auth.callback.err_user_create_failed'),
    access_denied: t('auth.callback.err_access_denied', { provider: label }),
  }
  return COMMON[raw] || raw
}

// [2026-05 보안] BE 가 토큰을 fragment (#) 로 보냄 — Referer/access log/history
// 누설 차단. 메타 (mode/error/new) 만 query.
// fragment 가 비어 있으면 옛 BE (query 만 사용) 와의 호환 — query 에서 fallback.
const _parseFragment = () => {
  if (typeof window === 'undefined') return {}
  const raw = (window.location.hash || '').replace(/^#/, '')
  if (!raw) return {}
  const out = {}
  for (const pair of raw.split('&')) {
    if (!pair) continue
    const [k, v = ''] = pair.split('=')
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v)
  }
  return out
}

onMounted(async () => {
  const frag = _parseFragment()

  // 보안: 토큰 fragment/query 가 browser history / referrer 로 leak 되지 않도록
  // mounted 시점에 즉시 URL 에서 모두 제거 (fragment 포함).
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    try { window.history.replaceState(null, '', '/auth/callback') } catch {}
  }

  const q = route.query
  mode.value = String(q.mode || 'login')
  provider.value = String(q.provider || 'github')  // BE 가 명시 — default github (legacy compat)
  isNewUser.value = q.new === '1'

  // [2026-05-18] 정지된 계정의 OAuth 시도 → 로그인 페이지로 명시 메시지 전달
  if (q.error && String(q.error).startsWith('suspended')) {
    const errorParam = String(q.error)
    const reason = errorParam.slice('suspended:'.length)
    const msg = reason
      ? t('auth.callback.err_suspended_reason', { reason: decodeURIComponent(reason) })
      : t('auth.callback.err_suspended')
    router.replace({ path: '/login', query: { error: 'suspended', msg } })
    return
  }

  if (q.error) {
    phase.value = 'error'
    errorMsg.value = humanize(String(q.error), provider.value)
    return
  }

  // [2026-05-17] mode='notion_link' — 노션은 로그인 수단 아니라 토큰 발급 안 함.
  // 이미 BE JWT 가 있는 상태라 token 확인 skip → 바로 /profile 로 success.
  if (mode.value === 'notion_link') {
    phase.value = 'success'
    setTimeout(() => router.replace('/profile'), 800)
    return
  }

  // 토큰: fragment 우선 (신규 BE) → query fallback (옛 BE 호환).
  const access = String(frag.access_token || q.access_token || '')
  const refresh = String(frag.refresh_token || q.refresh_token || '')

  if (!access) {
    phase.value = 'error'
    errorMsg.value = t('auth.callback.err_no_token')
    return
  }

  // 토큰 저장 후 /auth/me 로 user 정보 채움
  saveSession({ accessToken: access, refreshToken: refresh })
  const verified = await verifyToken()
  if (verified.valid && verified.user) {
    saveSession({ accessToken: access, refreshToken: refresh, user: verified.user })
  }

  phase.value = 'success'

  // link 모드는 /profile 로, login 모드는 /home 데시보드로.
  // [2026-05] 이전엔 /plan 으로 보냈으나 사용자가 데시보드에서 마지막 작업
  // 프로젝트 자동 선택 + 진행률 + 5단계 카드를 먼저 보는 게 더 자연스러움.
  const dest = mode.value === 'link' ? '/profile' : '/home'
  setTimeout(() => router.replace(dest), 800)
})

const goBack = () => router.replace(mode.value === 'link' ? '/profile' : '/login')
</script>

<template>
  <div class="oauth-callback-root">
    <div class="oauth-callback-card">
      <template v-if="phase === 'processing'">
        <Loader2 :size="40" class="spin text-accent mb-3" />
        <h2 class="callback-title">{{ $t('auth.callback.processing_title', { provider: providerLabel(provider) }) }}</h2>
        <p class="callback-sub">{{ $t('auth.callback.processing_sub') }}</p>
      </template>

      <template v-else-if="phase === 'success'">
        <CheckCircle2 :size="40" class="text-success mb-3" />
        <h2 class="callback-title">
          {{ mode === 'link' || mode === 'notion_link' ? $t('auth.callback.success_link_title', { provider: providerLabel(provider) }) : (isNewUser ? $t('auth.callback.success_signup_title') : $t('auth.callback.success_login_title')) }}
        </h2>
        <p class="callback-sub">
          {{ mode === 'link' || mode === 'notion_link' ? $t('auth.callback.success_link_sub') : $t('auth.callback.success_login_sub') }}
        </p>
      </template>

      <template v-else>
        <AlertCircle :size="40" class="text-error mb-3" />
        <h2 class="callback-title">{{ $t('auth.callback.error_title') }}</h2>
        <p class="callback-error">{{ errorMsg }}</p>
        <button class="back-btn" @click="goBack">{{ mode === 'link' ? $t('auth.callback.back_btn_profile') : $t('auth.callback.back_btn') }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.oauth-callback-root {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background: var(--bg-page);
  font-family: 'Pretendard Variable', sans-serif;
}
.oauth-callback-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 48px 40px;
  min-width: 360px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
}
.callback-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0 0 6px;
}
.callback-sub {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
}
.callback-error {
  font-size: 0.85rem;
  color: #c62828;
  margin: 0 0 16px;
  line-height: 1.6;
}
.text-accent { color: var(--accent); }
.text-success { color: #2e7d32; }
.text-error { color: #c62828; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.back-btn {
  margin-top: 8px;
  padding: 10px 24px;
  border-radius: 9999px;
  border: 1.5px solid var(--accent);
  background: none;
  color: var(--accent);
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}
.back-btn:hover { background: var(--accent); color: #fff; }
</style>
