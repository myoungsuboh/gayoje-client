<script setup>
/**
 * 활성 세션 가시화 카드 — Phase 3.
 *
 * [기능]
 * - GET /auth/me/sessions → 활성 세션 목록 (PC + 모바일 등)
 * - 각 세션: device_label, IP, 로그인 시각, "이 디바이스" 표시
 * - "이 디바이스 외 모두 로그아웃" 버튼 → 일괄 강제 로그아웃
 * - 개별 세션 옆 X 버튼 → 단일 강제 로그아웃
 *
 * [UX]
 * 사용자가 "내가 폰에 로그인 중이었구나" 인지 → 의식적으로 끄거나, 유지하거나.
 * 분실한 디바이스 / 카페 공용 PC 등은 즉시 끊을 수 있어야 함 (보안).
 *
 * [의존성]
 * - axios 는 utils/auth.js 안에 캡슐화됨
 * - useConfirm: 강제 로그아웃 전 confirm dialog
 * - useSnackbar: 결과 토스트
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor, Smartphone, Loader2, RefreshCw, X, LogOut } from 'lucide-vue-next'
import { fetchActiveSessionsApi, revokeSessionApi } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import CardCollapseToggle from '@/components/common/CardCollapseToggle.vue'

const { t, locale } = useI18n()
const { showSuccess, showError } = useSnackbar() ?? {}
const confirm = useConfirm()

const sessions = ref([])
const currentJti = ref(null)
const isLoading = ref(false)
const isRevoking = ref(null)   // jti currently being revoked
const isRevokingOthers = ref(false)
const collapsed = ref(false)

const notify = (msg, type = 'success') => {
  if (type === 'success' && showSuccess) showSuccess(msg)
  else if (type === 'error' && showError) showError(msg)
}

const refresh = async () => {
  isLoading.value = true
  const result = await fetchActiveSessionsApi()
  isLoading.value = false
  if (result.success) {
    sessions.value = result.sessions || []
    currentJti.value = result.currentJti
  } else {
    notify(result.error || t('profile.sessions.list_failed'), 'error')
  }
}

onMounted(refresh)

// 다른 디바이스 (현재 제외) — 일괄 로그아웃 대상
const otherSessions = computed(() =>
  sessions.value.filter(s => !s.is_current),
)

const hasOtherSessions = computed(() => otherSessions.value.length > 0)

const formatTime = (ms) => {
  if (!ms) return '-'
  const date = new Date(ms)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return t('profile.sessions.just_now')
  if (diffMin < 60) return t('profile.sessions.minutes_ago', { count: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('profile.sessions.hours_ago', { count: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return t('profile.sessions.days_ago', { count: diffDay })
  const localeCode = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale.value] || 'en-US'
  return date.toLocaleDateString(localeCode)
}

const deviceIcon = (label) => {
  const l = (label || '').toLowerCase()
  if (l.includes('iphone') || l.includes('android') || l.includes('mobile')) {
    return Smartphone
  }
  return Monitor
}

const handleRevokeOne = async (session) => {
  const ok = await confirm({
    title: t('profile.sessions.revoke_title'),
    message: t('profile.sessions.revoke_message', { device: session.device_label }),
    variant: 'danger',
    confirmText: t('profile.sessions.revoke_confirm'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return
  isRevoking.value = session.jti
  const result = await revokeSessionApi(session.jti)
  isRevoking.value = null
  if (result.success) {
    notify(result.message || t('profile.sessions.revoked_toast'))
    await refresh()
  } else {
    notify(result.error || t('profile.sessions.revoke_failed'), 'error')
  }
}

const handleRevokeAllOthers = async () => {
  if (!hasOtherSessions.value) return
  const count = otherSessions.value.length
  const ok = await confirm({
    title: t('profile.sessions.revoke_all_title'),
    message: t('profile.sessions.revoke_all_message', { count }),
    variant: 'danger',
    confirmText: t('profile.sessions.revoke_all_confirm'),
    cancelText: t('common.action.cancel'),
  })
  if (!ok) return

  isRevokingOthers.value = true
  // 순차 처리 — 동시 호출은 BE 부담 (전부 같은 사용자라 rate-limit 위험)
  let failures = 0
  for (const s of otherSessions.value) {
    const r = await revokeSessionApi(s.jti)
    if (!r.success) failures++
  }
  isRevokingOthers.value = false
  if (failures === 0) {
    notify(t('profile.sessions.revoke_all_done', { count }))
  } else {
    notify(t('profile.sessions.revoke_all_partial', { done: count - failures, failed: failures }), failures > 0 ? 'error' : 'success')
  }
  await refresh()
}
</script>

<template>
  <section class="profile-card" :aria-label="$t('profile.sessions.aria')">
    <div class="profile-card-header" :class="{ 'is-collapsed': collapsed }" @click="collapsed = !collapsed">
      <Monitor :size="18" class="mr-2" />
      <span class="profile-card-title">{{ $t('profile.sessions.title') }}</span>
      <button class="refresh-btn" :disabled="isLoading" :title="$t('profile.sessions.refresh')" @click.stop="refresh">
        <RefreshCw :size="13" :class="{ spin: isLoading }" />
      </button>
      <CardCollapseToggle v-model:collapsed="collapsed" class="ml-1" />
    </div>

    <div v-show="!collapsed">
    <p class="sessions-intro text-muted">
      {{ $t('profile.sessions.intro') }}
    </p>

    <!-- Loading -->
    <div v-if="isLoading && sessions.length === 0" class="sessions-loading">
      <Loader2 :size="16" class="spin mr-2" />
      {{ $t('profile.sessions.loading') }}
    </div>

    <!-- Empty (보통 안 보임 — 최소 현재 세션은 항상 있어야 함) -->
    <div v-else-if="!isLoading && sessions.length === 0" class="sessions-empty">
      {{ $t('profile.sessions.empty') }}
    </div>

    <!-- Sessions list -->
    <ul v-else class="sessions-list">
      <li
        v-for="s in sessions"
        :key="s.jti"
        class="session-item"
        :class="{ 'session-item--current': s.is_current }"
      >
        <component :is="deviceIcon(s.device_label)" :size="20" class="session-icon" />
        <div class="session-meta">
          <div class="session-device">
            {{ s.device_label || $t('profile.sessions.unknown_device') }}
            <span v-if="s.is_current" class="current-pill">{{ $t('profile.sessions.this_device') }}</span>
          </div>
          <div class="session-info">
            <span class="session-time">{{ formatTime(s.created_at) }}</span>
            <span v-if="s.ip" class="session-ip mono-text">· {{ s.ip }}</span>
          </div>
        </div>
        <!-- 현재 세션은 X 안 보임 — 로그아웃은 헤더의 logout 으로 -->
        <button
          v-if="!s.is_current"
          class="session-revoke-btn"
          :disabled="isRevoking === s.jti"
          :title="$t('profile.sessions.revoke_one_title')"
          @click="handleRevokeOne(s)"
        >
          <Loader2 v-if="isRevoking === s.jti" :size="14" class="spin" />
          <X v-else :size="14" />
        </button>
      </li>
    </ul>

    <!-- Bulk action -->
    <div v-if="hasOtherSessions" class="sessions-actions">
      <button
        class="revoke-all-btn"
        :disabled="isRevokingOthers"
        @click="handleRevokeAllOthers"
      >
        <Loader2 v-if="isRevokingOthers" :size="13" class="spin mr-1" />
        <LogOut v-else :size="13" class="mr-1" />
        {{ isRevokingOthers ? $t('profile.sessions.revoking') : $t('profile.sessions.revoke_all_btn', { count: otherSessions.length }) }}
      </button>
    </div>
    </div>
  </section>
</template>

<style scoped>
.profile-card {
  background: #fff;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 12px;
  padding: 22px 24px;
}
.profile-card-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.06));
}
.profile-card-header.is-collapsed { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.profile-card-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #2A2421;
  flex: 1;
}
.refresh-btn {
  padding: 4px;
  background: transparent;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  border-radius: 6px;
  color: #6F665F;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}
.refresh-btn:hover:not(:disabled) { color: #2A2421; border-color: rgba(0,0,0,0.25); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sessions-intro {
  font-size: 0.78rem;
  margin: 0 0 14px;
  line-height: 1.5;
}

.sessions-loading, .sessions-empty {
  display: flex;
  align-items: center;
  padding: 14px 0;
  font-size: 0.82rem;
  color: #6F665F;
}

.sessions-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
}
.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.08));
  border-radius: 10px;
  margin-bottom: 8px;
  transition: border-color 0.15s;
}
.session-item:hover { border-color: rgba(0,0,0,0.2); }
.session-item--current {
  background: rgba(46, 64, 54, 0.04);
  border-color: rgba(46, 64, 54, 0.25);
}
.session-icon { color: #6F665F; flex-shrink: 0; }
.session-meta { flex: 1; min-width: 0; }
.session-device {
  font-size: 0.86rem;
  font-weight: 700;
  color: #2A2421;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.current-pill {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 9999px;
  background: var(--primary-moss, #2E4036);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.session-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 0.72rem;
  color: #6F665F;
  flex-wrap: wrap;
}
.session-ip { opacity: 0.7; }
.mono-text { font-family: 'IBM Plex Mono', monospace; }

.session-revoke-btn {
  padding: 6px;
  border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  border-radius: 8px;
  background: transparent;
  color: #b91c1c;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.session-revoke-btn:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.1);
  border-color: #b91c1c;
}
.session-revoke-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sessions-actions {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light, rgba(0,0,0,0.06));
  display: flex;
  justify-content: flex-end;
}
.revoke-all-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  background: #fff;
  color: #b91c1c;
  border: 1.5px solid #b91c1c;
  border-radius: 9px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.revoke-all-btn:hover:not(:disabled) {
  background: #b91c1c;
  color: #fff;
}
.revoke-all-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin { animation: spin 0.9s linear infinite; }

@media (max-width: 600px) {
  .profile-card { padding: 18px 18px; }
  .session-item { padding: 10px 12px; }
}
</style>
