<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  User, Github, Pencil, Check, X,
  ExternalLink, Loader2, Link as LinkIcon, Unlink,
  Settings, Crown, Languages,
} from 'lucide-vue-next'
import {
  getCurrentUser, updateMeApi,
  fetchGithubStatusApi, startGithubOAuthLink, disconnectGithubApi,
  fetchGoogleStatusApi, startGoogleOAuthLink, disconnectGoogleApi,
  fetchNotionStatusApi, disconnectNotionApi,
} from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { getTierLabel, getTierMeta, isPaidTier } from '@/utils/subscription'
import { useLocale } from '@/composables/useLocale'
import NotionTokenDialog from './NotionTokenDialog.vue'

const { t } = useI18n()
const router = useRouter()
const { showSuccess, showError } = useSnackbar() ?? {}
const confirm = useConfirm()

const notify = (msg, type = 'success') => {
  if (type === 'success' && showSuccess) showSuccess(msg)
  else if (type === 'error' && showError) showError(msg)
}

// ─── User ─────────────────────────────────────────────────────
const user = ref(getCurrentUser() || {})
const editingName = ref(false)
const nameInput = ref(user.value.name || '')
const isSaving = ref(false)

const displayName = computed(() => user.value.name || user.value.email || '-')
const displayEmail = computed(() => user.value.email || '-')
const isAdmin = computed(() => Boolean(user.value?.is_admin))
const subscriptionType = computed(() => user.value?.subscription_type || 'free')
const subscriptionLabel = computed(() => getTierLabel(subscriptionType.value))
const isPaidSubscription = computed(() => isPaidTier(subscriptionType.value))
const subscriptionGradient = computed(() => getTierMeta(subscriptionType.value).gradient)

const goToAdmin = () => router.push('/admin')

const startEditName = () => {
  nameInput.value = user.value.name || ''
  editingName.value = true
}
const cancelEditName = () => { editingName.value = false }

const saveName = async () => {
  const name = nameInput.value.trim()
  if (!name) return
  isSaving.value = true
  const result = await updateMeApi({ name })
  isSaving.value = false
  if (result.success) {
    user.value = { ...user.value, name: result.user?.name || name }
    editingName.value = false
    notify(t('profile.account.name_saved'))
  } else {
    notify(result.error || t('profile.account.name_save_failed'), 'error')
  }
}

// ─── Auto Progress ────────────────────────────────────────────
// true (default) — postMeeting 이 CPS+PRD 자동 체이닝
// false          — CPS 만 자동, 사용자가 PRD/Design 단계별 명시 트리거 (검수 모드)
const autoProgress = computed({
  get: () => user.value?.auto_progress !== false,
  set: () => {},
})
const isTogglingAutoProgress = ref(false)
const toggleAutoProgress = async () => {
  if (isTogglingAutoProgress.value) return
  const newValue = !autoProgress.value
  isTogglingAutoProgress.value = true
  const result = await updateMeApi({ auto_progress: newValue })
  isTogglingAutoProgress.value = false
  if (result.success) {
    user.value = { ...user.value, auto_progress: newValue }
    notify(newValue
      ? t('profile.account.auto_on_toast')
      : t('profile.account.auto_off_toast'),
    )
  } else {
    notify(result.error || t('profile.account.auto_change_failed'), 'error')
  }
}

// ─── Locale ───────────────────────────────────────────────────
const { currentLocale, localeOptions, setLocale } = useLocale()
const isChangingLocale = ref(false)

const changeLocale = async (code) => {
  if (code === currentLocale.value || isChangingLocale.value) return
  isChangingLocale.value = true
  await setLocale(code)
  isChangingLocale.value = false
}

// ─── GitHub OAuth ─────────────────────────────────────────────
const githubStatus = ref({ linked: false, github_username: null, oauth_available: false })
const isGithubLoading = ref(false)
const isDisconnecting = ref(false)
const isConnecting = ref(false)

const refreshGithubStatus = async () => {
  isGithubLoading.value = true
  const result = await fetchGithubStatusApi()
  isGithubLoading.value = false
  if (result.success) {
    githubStatus.value = result.status
    if (result.status.github_username !== undefined) {
      user.value = { ...user.value, github_username: result.status.github_username || null }
    }
  }
}

const connectGithub = async () => {
  if (!githubStatus.value.oauth_available) {
    notify(t('profile.account.github_oauth_admin'), 'error')
    return
  }
  isConnecting.value = true
  const result = await startGithubOAuthLink()
  if (!result.success) {
    isConnecting.value = false
    notify(result.error || t('profile.account.github_connect_start_failed'), 'error')
  }
  // 성공 시 window.location 이동 — 이 코드는 실행되지 않음
}

const disconnectGithub = async () => {
  const ok = await confirm({
    title: t('profile.account.github_disconnect_title'),
    message: t('profile.account.github_disconnect_msg'),
    variant: 'danger',
    confirmText: t('profile.account.disconnect'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return
  isDisconnecting.value = true
  const result = await disconnectGithubApi()
  isDisconnecting.value = false
  if (result.success) {
    notify(t('profile.account.github_disconnected'))
    await refreshGithubStatus()
  } else {
    notify(result.error || t('profile.account.disconnect_failed'), 'error')
  }
}

// ─── Google OAuth ─────────────────────────────────────────────
const googleStatus = ref({ linked: false, google_email: null, oauth_available: false })
const isGoogleLoading = ref(false)
const isGoogleDisconnecting = ref(false)
const isGoogleConnecting = ref(false)

const refreshGoogleStatus = async () => {
  isGoogleLoading.value = true
  const result = await fetchGoogleStatusApi()
  isGoogleLoading.value = false
  if (result.success) googleStatus.value = result.status
}

const connectGoogle = async () => {
  if (!googleStatus.value.oauth_available) {
    notify(t('profile.account.google_oauth_admin'), 'error')
    return
  }
  isGoogleConnecting.value = true
  const result = await startGoogleOAuthLink()
  if (!result.success) {
    isGoogleConnecting.value = false
    notify(result.error || t('profile.account.google_connect_start_failed'), 'error')
  }
  // 성공 시 window.location 이동
}

const disconnectGoogle = async () => {
  const ok = await confirm({
    title: t('profile.account.google_disconnect_title'),
    message: t('profile.account.google_disconnect_msg'),
    variant: 'danger',
    confirmText: t('profile.account.disconnect'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return
  isGoogleDisconnecting.value = true
  const result = await disconnectGoogleApi()
  isGoogleDisconnecting.value = false
  if (result.success) {
    notify(t('profile.account.google_disconnected'))
    await refreshGoogleStatus()
  } else {
    notify(result.error || t('profile.account.disconnect_failed'), 'error')
  }
}

// ─── Notion ───────────────────────────────────────────────────
const notionStatus = ref({ linked: false, notion_workspace_name: null, oauth_available: false })
const isNotionLoading = ref(false)
const isNotionDisconnecting = ref(false)
const showNotionTokenDialog = ref(false)

const refreshNotionStatus = async () => {
  isNotionLoading.value = true
  const result = await fetchNotionStatusApi()
  isNotionLoading.value = false
  if (result.success) notionStatus.value = result.status
}

const disconnectNotion = async () => {
  const ok = await confirm({
    title: t('profile.account.notion_disconnect_title'),
    message: t('profile.account.notion_disconnect_msg'),
    variant: 'danger',
    confirmText: t('profile.account.disconnect'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return
  isNotionDisconnecting.value = true
  const result = await disconnectNotionApi()
  isNotionDisconnecting.value = false
  if (result.success) {
    notify(t('profile.account.notion_disconnected'))
    await refreshNotionStatus()
  } else {
    notify(result.error || t('profile.account.disconnect_failed'), 'error')
  }
}

const handleNotionConnected = async (workspaceName) => {
  notify(t('profile.account.notion_connected_toast', { name: workspaceName || '' }))
  showNotionTokenDialog.value = false
  await refreshNotionStatus()
}

onMounted(async () => {
  const stored = getCurrentUser()
  if (stored) user.value = stored
  await Promise.all([
    refreshGithubStatus(),
    refreshGoogleStatus(),
    refreshNotionStatus(),
  ])
})
</script>

<template>
  <section class="profile-card" :aria-label="$t('profile.account.aria')">

    <!-- ── 프로필 요약 헤더 ─────────────────────────────── -->
    <div class="profile-hero">
      <div class="profile-avatar">
        {{ (displayName || displayEmail || '?')[0].toUpperCase() }}
      </div>
      <div class="profile-hero-info">
        <div class="profile-hero-name">{{ displayName }}</div>
        <div class="profile-hero-email">{{ displayEmail }}</div>
        <div class="profile-hero-meta">
          <span
            class="sub-badge"
            :class="{ 'sub-badge--paid': isPaidSubscription }"
            :style="isPaidSubscription ? { background: subscriptionGradient } : null"
          >{{ subscriptionLabel }}</span>
          <span v-if="isAdmin" class="role-badge">
            <Crown :size="11" class="mr-1" />{{ $t('profile.account.admin_badge') }}
          </span>
          <button v-if="isAdmin" class="admin-link-btn" @click="goToAdmin">
            <Settings :size="12" class="mr-1" />{{ $t('profile.account.admin_page') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── 섹션: 계정 설정 ─────────────────────────────── -->
    <div class="section-group">
      <p class="section-label">{{ $t('profile.account.section_account') }}</p>

      <!-- 이름 -->
      <div class="profile-field">
        <span class="field-label">{{ $t('profile.account.name') }}</span>
        <div v-if="!editingName" class="field-value-row">
          <span class="field-value">{{ displayName }}</span>
          <button class="edit-btn" @click="startEditName" :aria-label="$t('profile.account.name_edit_aria')">
            <Pencil :size="13" />
          </button>
        </div>
        <div v-else class="field-edit-row">
          <input
            v-model="nameInput"
            class="field-input"
            :placeholder="$t('profile.account.name_placeholder')"
            @keydown.enter="saveName"
            @keydown.esc="cancelEditName"
            autofocus
          />
          <button class="icon-btn icon-btn--confirm" :disabled="isSaving" @click="saveName">
            <Loader2 v-if="isSaving" :size="14" class="spin" />
            <Check v-else :size="14" />
          </button>
          <button class="icon-btn icon-btn--cancel" @click="cancelEditName">
            <X :size="14" />
          </button>
        </div>
      </div>

      <!-- 자동 분석 -->
      <div class="profile-field profile-field--block">
        <span class="field-label">{{ $t('profile.account.auto_analysis') }}</span>
        <div class="auto-toggle-wrap">
          <button
            type="button"
            class="auto-toggle"
            :class="{ 'auto-toggle--on': autoProgress }"
            :disabled="isTogglingAutoProgress"
            role="switch"
            :aria-checked="autoProgress"
            @click="toggleAutoProgress"
            :title="autoProgress
              ? $t('profile.account.auto_on_title')
              : $t('profile.account.auto_off_title')"
          >
            <span class="auto-toggle-track">
              <span class="auto-toggle-thumb" />
            </span>
            <span class="auto-toggle-label">{{ autoProgress ? $t('profile.account.auto_on') : $t('profile.account.auto_off') }}</span>
          </button>
          <p class="auto-toggle-hint">
            <template v-if="autoProgress">{{ $t('profile.account.auto_on_hint') }}</template>
            <template v-else>{{ $t('profile.account.auto_off_hint') }}</template>
          </p>
        </div>
      </div>
      <!-- 언어 -->
      <div class="profile-field profile-field--block">
        <span class="field-label">
          <Languages :size="13" class="mr-1" style="vertical-align:middle" />{{ $t('profile.account.language') }}
        </span>
        <div class="locale-selector" role="group" :aria-label="$t('profile.account.language_select_aria')">
          <button
            v-for="opt in localeOptions"
            :key="opt.code"
            type="button"
            class="locale-btn"
            :class="{ 'locale-btn--active': currentLocale === opt.code }"
            :disabled="isChangingLocale"
            @click="changeLocale(opt.code)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </div>

    <!-- ── 섹션: 소셜 연결 ─────────────────────────────── -->
    <div class="section-group section-group--last">
      <p class="section-label">{{ $t('profile.account.section_social') }}</p>

      <!-- GitHub -->
      <div class="profile-field">
        <span class="field-label">
          <Github :size="13" class="mr-1" style="vertical-align:middle" />GitHub
        </span>
        <div v-if="isGithubLoading" class="field-value-row">
          <Loader2 :size="14" class="spin text-muted" />
        </div>
        <div v-else-if="githubStatus.linked" class="field-value-row github-linked-row">
          <a
            :href="`https://github.com/${githubStatus.github_username}`"
            target="_blank"
            rel="noopener noreferrer"
            class="github-linked-link"
          >
            <Github :size="13" />
            <span>@{{ githubStatus.github_username }}</span>
            <ExternalLink :size="11" class="github-linked-ext" />
          </a>
          <span class="github-badge github-badge--linked">{{ $t('profile.account.connected') }}</span>
          <button
            class="icon-btn icon-btn--cancel"
            :disabled="isDisconnecting"
            @click="disconnectGithub"
            :aria-label="$t('profile.account.github_disconnect_aria')"
            :title="$t('profile.account.github_disconnect_aria')"
          >
            <Loader2 v-if="isDisconnecting" :size="13" class="spin" />
            <Unlink v-else :size="13" />
          </button>
        </div>
        <div v-else class="field-value-row">
          <button
            class="connect-btn"
            :disabled="!githubStatus.oauth_available || isConnecting"
            :title="githubStatus.oauth_available ? $t('profile.account.github_connect_title') : $t('profile.account.github_oauth_missing_title')"
            @click="connectGithub"
          >
            <Loader2 v-if="isConnecting" :size="13" class="mr-1 spin" />
            <LinkIcon v-else :size="13" class="mr-1" />
            {{ $t('profile.account.github_connect') }}
          </button>
          <span v-if="!githubStatus.oauth_available" class="oauth-disabled-note">{{ $t('profile.account.oauth_not_configured') }}</span>
        </div>
      </div>

      <!-- Google -->
      <div class="profile-field">
        <span class="field-label">
          <svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:middle" class="mr-1" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google
        </span>
        <div v-if="isGoogleLoading" class="field-value-row">
          <Loader2 :size="14" class="spin text-muted" />
        </div>
        <div v-else-if="googleStatus.linked" class="field-value-row github-linked-row">
          <span class="github-linked-link">{{ googleStatus.google_email }}</span>
          <span class="github-badge github-badge--linked">{{ $t('profile.account.connected') }}</span>
          <button
            class="icon-btn icon-btn--cancel"
            :disabled="isGoogleDisconnecting"
            @click="disconnectGoogle"
            :aria-label="$t('profile.account.google_disconnect_aria')"
            :title="$t('profile.account.google_disconnect_aria')"
          >
            <Loader2 v-if="isGoogleDisconnecting" :size="13" class="spin" />
            <Unlink v-else :size="13" />
          </button>
        </div>
        <div v-else class="field-value-row">
          <button
            class="connect-btn"
            :disabled="!googleStatus.oauth_available || isGoogleConnecting"
            :title="googleStatus.oauth_available ? $t('profile.account.google_connect_title') : $t('profile.account.github_oauth_missing_title')"
            @click="connectGoogle"
          >
            <Loader2 v-if="isGoogleConnecting" :size="13" class="mr-1 spin" />
            <LinkIcon v-else :size="13" class="mr-1" />
            {{ $t('profile.account.google_connect') }}
          </button>
          <span v-if="!googleStatus.oauth_available" class="oauth-disabled-note">{{ $t('profile.account.oauth_not_configured') }}</span>
        </div>
      </div>

      <!-- Notion -->
      <div class="profile-field">
        <span class="field-label">
          <svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:middle" class="mr-1" aria-hidden="true">
            <path fill="#000" d="M4.46 2.16c.39.32.54.3 2.27.18l16.31-.98c.35 0 .06-.34-.05-.36L20.27.21C19.75-.1 19.06.04 18.16.07L2.4 1.16C1.61 1.21 1.46 1.48 1.78 1.81l2.68.35zm.95 3.7v17.18c0 .92.46 1.27 1.51 1.21l17.94-1.04c1.04-.07 1.16-.71 1.16-1.45V5.05c0-.74-.28-1.13-.91-1.07l-18.78 1.1c-.69.07-.92.42-.92 1.18zm17.7.91c.12.55 0 1.1-.55 1.16l-.87.18v12.78c-.75.4-1.45.63-2.03.63-.92 0-1.16-.29-1.85-1.16l-5.66-8.9v8.61l1.79.41s0 1.04-1.45 1.04l-3.99.23c-.12-.24 0-.81.41-.93l1.04-.29V8.46l-1.45-.12c-.12-.6.21-1.45 1.16-1.51l4.28-.29 5.89 9.02V8.07l-1.5-.18c-.12-.74.41-1.27 1.1-1.33l3.69-.21z"/>
          </svg>
          Notion
        </span>
        <div v-if="isNotionLoading" class="field-value-row">
          <Loader2 :size="14" class="spin text-muted" />
        </div>
        <div v-else-if="notionStatus.linked" class="field-value-row github-linked-row">
          <span class="github-linked-link">{{ notionStatus.notion_workspace_name || $t('profile.account.notion_workspace_fallback') }}</span>
          <span class="github-badge github-badge--linked">{{ $t('profile.account.connected') }}</span>
          <button
            class="icon-btn icon-btn--cancel"
            :disabled="isNotionDisconnecting"
            @click="disconnectNotion"
            :aria-label="$t('profile.account.notion_disconnect_aria')"
            :title="$t('profile.account.notion_disconnect_aria')"
          >
            <Loader2 v-if="isNotionDisconnecting" :size="13" class="spin" />
            <Unlink v-else :size="13" />
          </button>
        </div>
        <div v-else class="field-value-row">
          <button
            class="connect-btn"
            :title="$t('profile.account.notion_connect_title')"
            @click="showNotionTokenDialog = true"
          >
            <LinkIcon :size="13" class="mr-1" />
            {{ $t('profile.account.notion_connect') }}
          </button>
        </div>
      </div>
    </div>

    <NotionTokenDialog
      v-if="showNotionTokenDialog"
      @close="showNotionTokenDialog = false"
      @connected="handleNotionConnected"
    />
  </section>
</template>

<style scoped>
/* ── 카드 껍질 ─────────────────────────────────────────── */
.profile-card {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}

/* ── 프로필 요약 헤더 ───────────────────────────────────── */
.profile-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-light, #fafaf9);
}
.profile-avatar {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C77F4A 0%, #8C6239 100%);
  color: #fff;
  font-size: 1.3rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(140, 98, 57, 0.25);
}
.profile-hero-info {
  flex: 1;
  min-width: 0;
}
.profile-hero-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}
.profile-hero-email {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile-hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── 섹션 그룹 ─────────────────────────────────────────── */
.section-group {
  padding: 0 0 4px;
  border-bottom: 1px solid var(--border-light);
}
.section-group--last { border-bottom: none; }
.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
  padding: 14px 24px 6px;
  opacity: 0.7;
}

/* ── 개별 필드 행 ──────────────────────────────────────── */
.profile-field {
  display: flex;
  align-items: center;
  padding: 13px 24px;
  gap: 16px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}
.profile-field:last-child { border-bottom: none; }

.profile-field--block {
  align-items: flex-start;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  min-width: 110px;
  flex-shrink: 0;
  padding-top: 1px;
}
.field-value { font-size: 0.875rem; color: var(--text-main); }
.field-value-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.field-edit-row { display: flex; align-items: center; gap: 6px; flex: 1; }

/* ── 입력 / 버튼 공통 ──────────────────────────────────── */
.field-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--text-main);
  background: var(--bg-page);
  outline: none;
  transition: border-color 0.2s;
}
.field-input:focus { border-color: var(--accent); }

.edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.edit-btn:hover { background: var(--bg-light); color: var(--accent); }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  gap: 3px;
}
.icon-btn--confirm {
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent);
  border-color: rgba(140, 98, 57, 0.2);
}
.icon-btn--confirm:hover { background: rgba(140, 98, 57, 0.15); }
.icon-btn--confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.icon-btn--cancel {
  background: none;
  color: var(--text-muted);
  border-color: var(--border-light);
}
.icon-btn--cancel:hover { background: var(--bg-light); color: var(--text-main); }
.icon-btn--cancel:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 소셜 연결 상태 ─────────────────────────────────────── */
.github-linked-row { flex-wrap: wrap; gap: 8px; }
.github-linked-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text-main);
  font-weight: 600;
  font-size: 0.85rem;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-light);
  transition: all 0.15s;
}
.github-linked-link:hover { border-color: var(--accent); color: var(--accent); }
.github-linked-ext { opacity: 0.4; }
.github-badge {
  font-family: 'Outfit', sans-serif;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 9999px;
  text-transform: uppercase;
}
.github-badge--linked {
  background: rgba(46, 64, 54, 0.1);
  color: var(--primary-moss);
}
.connect-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1.5px solid #2A2421;
  background: #2A2421;
  color: white;
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.15s;
}
.connect-btn:hover:not(:disabled) {
  background: #1A1208;
  border-color: #1A1208;
  transform: translateY(-1px);
}
.connect-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.oauth-disabled-note {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
}

/* ── 배지/뱃지 ──────────────────────────────────────────── */
.sub-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 9999px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent);
  border: 1px solid rgba(140, 98, 57, 0.2);
}
.sub-badge--paid { color: #FFFFFF; border-color: transparent; }
.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  background: rgba(46, 64, 54, 0.08);
  color: var(--primary-moss);
  border: 1px solid rgba(46, 64, 54, 0.2);
}
.admin-link-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
  background: none;
  color: var(--text-muted);
  font-family: 'Outfit', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.admin-link-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── 자동 분석 토글 ─────────────────────────────────────── */
.auto-toggle-wrap { display: flex; flex-direction: column; gap: 8px; }
.auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 5px 14px 5px 5px;
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.auto-toggle:hover:not(:disabled) { border-color: var(--accent); background: rgba(140,98,57,0.04); }
.auto-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.auto-toggle-track {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  background: rgba(0,0,0,0.12);
  border-radius: 9999px;
  transition: background 0.15s;
}
.auto-toggle--on .auto-toggle-track { background: var(--primary-moss, #2E4036); }
.auto-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.auto-toggle--on .auto-toggle-thumb { transform: translateX(14px); }
.auto-toggle-label {
  font-family: 'Outfit', sans-serif;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-main);
}
.auto-toggle-hint {
  font-size: 0.77rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

/* ── 언어 선택기 ─────────────────────────────────────────── */
.locale-selector {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.locale-btn {
  padding: 5px 14px;
  border-radius: 9999px;
  border: 1.5px solid var(--border-light);
  background: none;
  color: var(--text-muted);
  font-family: 'Outfit', sans-serif;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.locale-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(140, 98, 57, 0.05);
}
.locale-btn--active {
  border-color: var(--accent) !important;
  background: rgba(140, 98, 57, 0.1) !important;
  color: var(--accent) !important;
}
.locale-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 600px) {
  .profile-hero { padding: 18px 16px 16px; gap: 14px; }
  .profile-avatar { width: 44px; height: 44px; font-size: 1.1rem; }
  .section-label { padding: 12px 16px 6px; }
  .profile-field { padding: 12px 16px; }
  .field-label { min-width: 90px; font-size: 0.75rem; }
  .locale-selector { gap: 5px; }
}
</style>
