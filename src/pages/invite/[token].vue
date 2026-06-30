<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Users, Check, X, Loader2, LogIn } from 'lucide-vue-next'
import { getInviteInfo, acceptInvite, declineInvite } from '@/api/teams'
import { getCurrentUser } from '@/utils/auth'
import { isPaidTier } from '@/utils/subscription'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const token = route.params.token

const invite = ref(null)
const loading = ref(true)
const error = ref(null)
const errorNeedsUpgrade = ref(false)
const processing = ref(false)
const done = ref(null) // 'accepted' | 'declined'

const me = ref(getCurrentUser())
const isLoggedIn = computed(() => Boolean(me.value?.email))
const isPaid = computed(() => isPaidTier(me.value?.subscription_type))

const roleLabel = (role) => ({ owner: 'Owner', admin: 'Admin', member: 'Member' }[role] || role)

onMounted(async () => {
  try {
    invite.value = await getInviteInfo(token)
  } catch (err) {
    error.value = err?.response?.status === 404
      ? t('team.error.notFound')
      : t('team.error.loadFail')
  } finally {
    loading.value = false
  }
})

const handleAccept = async () => {
  if (!isLoggedIn.value) {
    router.push(`/login?redirect=/invite/${token}`)
    return
  }
  processing.value = true
  try {
    await acceptInvite(token)
    done.value = 'accepted'
  } catch (err) {
    if (err?.response?.status === 402) {
      error.value = t('team.error.acceptProRequired')
      errorNeedsUpgrade.value = true
    } else {
      error.value = err?.response?.data?.detail || t('team.error.acceptFail')
    }
  } finally {
    processing.value = false
  }
}

const handleDecline = async () => {
  processing.value = true
  try {
    await declineInvite(token)
    done.value = 'declined'
  } catch {
    error.value = t('team.error.declineFail')
  } finally {
    processing.value = false
  }
}

const goHome = () => router.push('/home')
const goUpgrade = () => router.push('/plan')
</script>

<template>
  <div class="invite-page">
    <div class="invite-wrap">

      <!-- 로딩 -->
      <div v-if="loading" class="invite-loading">
        <Loader2 :size="32" class="spin" />
        <p class="invite-loading-text">{{ $t('team.accept.loading') }}</p>
      </div>

      <!-- 완료 — 수락 -->
      <div v-else-if="done === 'accepted'" class="invite-card invite-card--center">
        <div class="invite-badge invite-badge--ok">
          <Check :size="28" />
        </div>
        <div>
          <h1 class="invite-title">{{ $t('team.accept.joinedTitle') }}</h1>
          <p class="invite-lead">
            <i18n-t keypath="team.accept.joinedBody" tag="span">
              <template #team><strong>{{ invite?.team_name }}</strong></template>
            </i18n-t>
          </p>
        </div>
        <button class="invite-btn invite-btn--primary" @click="goHome">
          {{ $t('team.accept.start') }}
        </button>
      </div>

      <!-- 완료 — 거절 -->
      <div v-else-if="done === 'declined'" class="invite-card invite-card--center">
        <div class="invite-badge invite-badge--muted">
          <X :size="28" />
        </div>
        <div>
          <h1 class="invite-title">{{ $t('team.accept.declinedTitle') }}</h1>
        </div>
        <button class="invite-btn invite-btn--secondary" @click="goHome">
          {{ $t('team.accept.goHome') }}
        </button>
      </div>

      <!-- 오류 -->
      <div v-else-if="error" class="invite-card invite-card--center invite-card--error">
        <div class="invite-badge invite-badge--error">
          <X :size="28" />
        </div>
        <div>
          <h1 class="invite-title">{{ $t('team.accept.errorTitle') }}</h1>
          <p class="invite-lead">{{ error }}</p>
        </div>
        <div class="invite-actions-stack">
          <button
            v-if="errorNeedsUpgrade"
            class="invite-btn invite-btn--primary"
            @click="goUpgrade"
          >
            {{ $t('team.accept.upgrade') }}
          </button>
          <button class="invite-btn invite-btn--secondary" @click="goHome">
            {{ $t('team.accept.goHome') }}
          </button>
        </div>
      </div>

      <!-- 초대 정보 카드 -->
      <div v-else-if="invite" class="invite-card">
        <!-- 헤더 -->
        <div class="invite-header">
          <div class="invite-badge invite-badge--accent">
            <Users :size="28" />
          </div>
          <div>
            <h1 class="invite-title">{{ $t('team.accept.inviteTitle') }}</h1>
            <p class="invite-lead">
              <i18n-t keypath="team.accept.inviteBody" tag="span">
                <template #inviter><strong>{{ invite.inviter_email }}</strong></template>
                <template #team><strong>{{ invite.team_name }}</strong></template>
              </i18n-t>
            </p>
          </div>
        </div>

        <!-- 초대 정보 -->
        <div class="invite-info">
          <div class="invite-info-row">
            <span class="invite-info-key">{{ $t('team.accept.fieldTeam') }}</span>
            <span class="invite-info-val invite-info-val--strong">{{ invite.team_name }}</span>
          </div>
          <div class="invite-info-row">
            <span class="invite-info-key">{{ $t('team.accept.fieldRole') }}</span>
            <span class="invite-info-val">{{ roleLabel(invite.role) }}</span>
          </div>
          <div class="invite-info-row">
            <span class="invite-info-key">{{ $t('team.accept.fieldExpires') }}</span>
            <span class="invite-info-val invite-info-val--muted">{{ invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('ko-KR') : '-' }}</span>
          </div>
        </div>

        <!-- 로그인 안 된 경우 -->
        <div v-if="!isLoggedIn" class="invite-actions-stack">
          <div class="invite-note">
            {{ $t('team.accept.loginRequired') }}
          </div>
          <button
            class="invite-btn invite-btn--primary"
            @click="router.push(`/login?redirect=/invite/${token}`)"
          >
            <LogIn :size="16" />
            {{ $t('team.accept.loginAndAccept') }}
          </button>
        </div>

        <!-- 무료 플랜 경고 -->
        <div v-else-if="!isPaid" class="invite-actions-stack">
          <div class="invite-note">
            <i18n-t keypath="team.accept.proRequired" tag="span">
              <template #plan><strong>{{ $t('team.accept.proPlan') }}</strong></template>
            </i18n-t>
          </div>
          <button class="invite-btn invite-btn--primary" @click="goUpgrade">
            {{ $t('team.accept.upgradePlan') }}
          </button>
        </div>

        <!-- 수락/거절 버튼 -->
        <div v-else class="invite-actions-row">
          <button
            class="invite-btn invite-btn--secondary"
            :disabled="processing"
            @click="handleDecline"
          >
            {{ $t('team.accept.decline') }}
          </button>
          <button
            class="invite-btn invite-btn--primary"
            :disabled="processing"
            @click="handleAccept"
          >
            <Loader2 v-if="processing" :size="16" class="spin" />
            {{ $t('team.accept.join') }}
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  background: var(--bg-page, #FCFAEE);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-family: 'Pretendard Variable', Pretendard, sans-serif;
}
.invite-wrap { width: 100%; max-width: 28rem; }

.invite-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--text-muted);
}
.invite-loading-text { font-size: 0.85rem; margin: 0; }

.invite-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 8px 30px rgba(42, 36, 33, 0.08);
}
.invite-card--center { text-align: center; align-items: center; gap: 16px; }
.invite-card--error { border-color: rgba(220, 38, 38, 0.25); }

.invite-badge {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.invite-badge--ok { background: rgba(46, 64, 54, 0.1); color: var(--primary-moss, #2E4036); }
.invite-badge--muted { background: var(--bg-light, #F7F5EB); color: var(--text-muted); }
.invite-badge--error { background: rgba(220, 38, 38, 0.1); color: #b91c1c; }
.invite-badge--accent { background: rgba(140, 98, 57, 0.1); color: var(--accent); }

.invite-header { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }

.invite-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.invite-lead {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.55;
  margin: 6px 0 0;
}
.invite-lead strong { color: var(--text-main); font-weight: 700; }

.invite-info {
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.invite-info-row { display: flex; justify-content: space-between; font-size: 0.85rem; }
.invite-info-key { color: var(--text-muted); }
.invite-info-val { color: var(--text-main); }
.invite-info-val--strong { font-weight: 600; }
.invite-info-val--muted { color: var(--text-muted); }

.invite-actions-stack { display: flex; flex-direction: column; gap: 12px; }
.invite-actions-row { display: flex; gap: 12px; }

.invite-note {
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.2);
  border-radius: 12px;
  padding: 12px;
  font-size: 0.82rem;
  color: var(--accent);
  text-align: center;
}
.invite-note strong { font-weight: 700; }

.invite-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 11px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}
.invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.invite-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.invite-btn--primary:hover:not(:disabled) {
  background: #75502E;
  border-color: #75502E;
  transform: translateY(-1px);
}
.invite-btn--secondary {
  background: none;
  border-color: var(--border-light);
  color: var(--text-muted);
}
.invite-btn--secondary:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(140, 98, 57, 0.05);
}
.invite-actions-row .invite-btn { flex: 1; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
