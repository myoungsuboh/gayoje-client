<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Users, Plus, UserPlus, Trash2, LogOut,
  Crown, ShieldCheck, User, Loader2, Copy, Check, Mail,
  ChevronDown, ChevronUp, X
} from 'lucide-vue-next'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirm } from '@/composables/useConfirm'
import { getCurrentUser } from '@/utils/auth'
import { isPaidTier } from '@/utils/subscription'
import {
  listMyTeams, createTeam, deleteTeam, updateTeam,
  getTeam, createInvite, listPendingInvites, cancelInvite,
  changeMemberRole, removeMember,
} from '@/api/teams'

const { t } = useI18n()
const { showSuccess, showError } = useSnackbar() ?? {}
const confirm = useConfirm()
const notify = (msg, type = 'success') => {
  if (type === 'success' && showSuccess) showSuccess(msg)
  else if (showError) showError(msg)
}

const me = ref(getCurrentUser() || {})
const isPaid = ref(isPaidTier(me.value?.subscription_type))

// ─── 팀 목록 ──────────────────────────────────────────────────
const teams = ref([])
const loadingTeams = ref(false)
const expandedTeamId = ref(null)
const teamDetails = ref({}) // teamId → { members, invites }

const loadTeams = async () => {
  loadingTeams.value = true
  try {
    teams.value = await listMyTeams()
  } catch {
    notify(t('team.toast.loadTeamsFail'), 'error')
  } finally {
    loadingTeams.value = false
  }
}

const toggleTeam = async (teamId) => {
  if (expandedTeamId.value === teamId) {
    expandedTeamId.value = null
    return
  }
  expandedTeamId.value = teamId
  if (!teamDetails.value[teamId]) {
    await loadTeamDetail(teamId)
  }
}

const loadTeamDetail = async (teamId) => {
  try {
    const [detail, invites] = await Promise.all([
      getTeam(teamId),
      listPendingInvites(teamId).catch(() => []),
    ])
    teamDetails.value[teamId] = {
      members: detail.members || [],
      invites,
    }
  } catch {
    notify(t('team.toast.loadTeamFail'), 'error')
  }
}

// ─── 팀 생성 ──────────────────────────────────────────────────
const showCreateModal = ref(false)
const newTeamName = ref('')
const creating = ref(false)

const openCreateModal = () => {
  newTeamName.value = ''
  showCreateModal.value = true
}

const submitCreateTeam = async () => {
  const name = newTeamName.value.trim()
  if (!name) return
  creating.value = true
  try {
    const team = await createTeam(name)
    teams.value.unshift(team)
    showCreateModal.value = false
    notify(t('team.toast.created', { name }))
  } catch (err) {
    const detail = err?.response?.data?.detail
    if (err?.response?.status === 402) {
      notify(t('team.toast.createProRequired'), 'error')
    } else {
      notify(detail || t('team.toast.createFail'), 'error')
    }
  } finally {
    creating.value = false
  }
}

// ─── 팀 삭제 ──────────────────────────────────────────────────
const handleDeleteTeam = async (team) => {
  const ok = await confirm?.(t('team.toast.deleteConfirm', { name: team.name }))
  if (!ok) return
  try {
    await deleteTeam(team.id)
    teams.value = teams.value.filter(t => t.id !== team.id)
    if (expandedTeamId.value === team.id) expandedTeamId.value = null
    notify(t('team.toast.deleted', { name: team.name }))
  } catch {
    notify(t('team.toast.deleteFail'), 'error')
  }
}

// ─── 멤버 탈퇴/제거 ───────────────────────────────────────────
const handleRemoveMember = async (teamId, member) => {
  const isSelf = member.email === me.value?.email
  const msg = isSelf
    ? t('team.toast.leaveConfirm')
    : t('team.toast.removeConfirm', { email: member.email })
  const ok = await confirm?.(msg)
  if (!ok) return
  try {
    await removeMember(teamId, member.email)
    if (isSelf) {
      teams.value = teams.value.filter(t => t.id !== teamId)
      if (expandedTeamId.value === teamId) expandedTeamId.value = null
    } else {
      const detail = teamDetails.value[teamId]
      if (detail) detail.members = detail.members.filter(m => m.email !== member.email)
    }
    notify(isSelf ? t('team.toast.left') : t('team.toast.removed'))
  } catch {
    notify(t('team.toast.removeFail'), 'error')
  }
}

// ─── 역할 변경 ────────────────────────────────────────────────
const handleChangeRole = async (teamId, member, newRole) => {
  try {
    await changeMemberRole(teamId, member.email, newRole)
    const detail = teamDetails.value[teamId]
    if (detail) {
      const m = detail.members.find(m => m.email === member.email)
      if (m) m.role = newRole
    }
    notify(t('team.toast.roleChanged'))
  } catch {
    notify(t('team.toast.roleChangeFail'), 'error')
  }
}

// ─── 초대 ─────────────────────────────────────────────────────
const showInviteModal = ref(false)
const inviteTeamId = ref(null)
const inviteEmail = ref('')
const inviteRole = ref('member')
const inviting = ref(false)
const inviteResult = ref(null) // { invite_url }

const openInviteModal = (teamId) => {
  inviteTeamId.value = teamId
  inviteEmail.value = ''
  inviteRole.value = 'member'
  inviteResult.value = null
  showInviteModal.value = true
}

const submitInvite = async () => {
  const email = inviteEmail.value.trim()
  if (!email) return
  inviting.value = true
  try {
    const result = await createInvite(inviteTeamId.value, email, inviteRole.value)
    inviteResult.value = result
    notify(t('team.toast.inviteSent', { email }))
    await loadTeamDetail(inviteTeamId.value)
  } catch (err) {
    const detail = err?.response?.data?.detail
    notify(detail || t('team.toast.inviteFail'), 'error')
  } finally {
    inviting.value = false
  }
}

const handleCancelInvite = async (teamId, token) => {
  try {
    await cancelInvite(teamId, token)
    const detail = teamDetails.value[teamId]
    if (detail) detail.invites = detail.invites.filter(i => i.token !== token)
    notify(t('team.toast.inviteCancelled'))
  } catch {
    notify(t('team.toast.inviteCancelFail'), 'error')
  }
}

// ─── 초대 URL 복사 ────────────────────────────────────────────
const copiedToken = ref(null)
const copyInviteUrl = async (url) => {
  try {
    await navigator.clipboard.writeText(url)
    copiedToken.value = url
    setTimeout(() => { copiedToken.value = null }, 2000)
  } catch {
    notify(t('team.toast.copyFail'), 'error')
  }
}

// ─── 역할 아이콘/라벨 ─────────────────────────────────────────
const roleIcon = (role) => ({ owner: Crown, admin: ShieldCheck, member: User }[role] || User)
const roleLabel = (role) => ({ owner: 'Owner', admin: 'Admin', member: 'Member' }[role] || role)

onMounted(loadTeams)
</script>

<template>
  <section class="team-card" :aria-label="$t('team.title')">
    <!-- 헤더 -->
    <div class="team-card-header">
      <div class="team-card-title-wrap">
        <Users :size="18" class="team-card-icon" />
        <h2 class="team-card-title">{{ $t('team.title') }}</h2>
      </div>
      <button class="btn-primary" @click="openCreateModal">
        <Plus :size="16" />
        {{ $t('team.create') }}
      </button>
    </div>

    <!-- 로딩 -->
    <div v-if="loadingTeams" class="team-loading">
      <Loader2 :size="20" class="spin" />
    </div>

    <!-- 팀 없음 — 빈 상태 가이드 -->
    <div v-else-if="teams.length === 0" class="team-empty-state">
      <div class="team-empty-icon">
        <Users :size="32" />
      </div>
      <p class="team-empty-title">{{ $t('team.emptyState.title') }}</p>
      <p class="team-empty-body">{{ $t('team.emptyState.body') }}</p>
      <button class="btn-primary team-empty-cta" @click="openCreateModal">
        <Plus :size="16" />
        {{ $t('team.emptyState.cta') }}
      </button>
      <p class="team-empty-or">{{ $t('team.emptyState.orWait') }}</p>
    </div>

    <!-- 팀 목록 -->
    <div v-else class="team-list">
      <div
        v-for="team in teams"
        :key="team.id"
        class="team-item"
      >
        <!-- 팀 헤더 행 -->
        <div
          class="team-item-head"
          @click="toggleTeam(team.id)"
        >
          <div class="team-item-name-wrap">
            <component :is="roleIcon(team.role)" :size="16" class="team-item-role-icon" />
            <span class="team-item-name">{{ team.name }}</span>
            <span class="team-item-role">({{ roleLabel(team.role) }})</span>
          </div>
          <div class="team-item-actions">
            <!-- owner: 삭제 -->
            <button
              v-if="team.role === 'owner'"
              class="icon-action icon-action--danger"
              :title="$t('team.deleteTeam')"
              @click.stop="handleDeleteTeam(team)"
            >
              <Trash2 :size="14" />
            </button>
            <!-- 본인 탈퇴 -->
            <button
              v-else
              class="icon-action"
              :title="$t('team.leaveTeam')"
              @click.stop="handleRemoveMember(team.id, { email: me.email })"
            >
              <LogOut :size="14" />
            </button>
            <!-- 펼치기/접기 -->
            <component :is="expandedTeamId === team.id ? ChevronUp : ChevronDown" :size="16" class="team-item-chevron" />
          </div>
        </div>

        <!-- 펼쳐진 팀 상세 -->
        <div v-if="expandedTeamId === team.id" class="team-detail">
          <div v-if="!teamDetails[team.id]" class="team-loading team-loading--sm">
            <Loader2 :size="16" class="spin" />
          </div>
          <template v-else>
            <!-- 멤버 목록 -->
            <div class="team-section">
              <div class="team-section-head">
                <span class="team-section-label">{{ $t('team.members', { count: teamDetails[team.id].members.length }) }}</span>
                <button
                  v-if="['owner', 'admin'].includes(team.role)"
                  class="team-invite-link"
                  @click="openInviteModal(team.id)"
                >
                  <UserPlus :size="14" />
                  {{ $t('team.invite') }}
                </button>
              </div>
              <div class="team-rows">
                <div
                  v-for="member in teamDetails[team.id].members"
                  :key="member.email"
                  class="team-row"
                >
                  <div class="team-row-info">
                    <component :is="roleIcon(member.role)" :size="14" class="team-row-icon" />
                    <span class="team-row-email">{{ member.email }}</span>
                    <span class="team-row-role">{{ roleLabel(member.role) }}</span>
                  </div>
                  <div
                    v-if="member.email !== me.email && team.role === 'owner' && member.role !== 'owner'"
                    class="team-row-controls"
                  >
                    <select
                      :value="member.role"
                      class="team-role-select"
                      @change="handleChangeRole(team.id, member, $event.target.value)"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <button
                      class="icon-action icon-action--danger"
                      @click="handleRemoveMember(team.id, member)"
                    >
                      <X :size="13" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 대기 중 초대 -->
            <div v-if="teamDetails[team.id].invites.length > 0" class="team-section">
              <span class="team-section-label team-section-label--block">{{ $t('team.pendingInvites', { count: teamDetails[team.id].invites.length }) }}</span>
              <div class="team-rows">
                <div
                  v-for="invite in teamDetails[team.id].invites"
                  :key="invite.token"
                  class="team-row team-row--invite"
                >
                  <div class="team-row-info">
                    <Mail :size="14" class="team-row-icon team-row-icon--invite" />
                    <span class="team-row-email">{{ invite.invitee_email }}</span>
                    <span class="team-row-role">{{ roleLabel(invite.role) }}</span>
                  </div>
                  <button
                    class="icon-action icon-action--danger"
                    :title="$t('team.cancelInvite')"
                    @click="handleCancelInvite(team.id, invite.token)"
                  >
                    <X :size="13" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ─── 팀 생성 모달 ──────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-card">
          <div class="modal-head">
            <h3 class="modal-title">{{ $t('team.createModal.title') }}</h3>
            <button class="modal-close" @click="showCreateModal = false"><X :size="16" /></button>
          </div>
          <div v-if="!isPaid" class="modal-warning">
            <i18n-t keypath="team.createModal.proRequired" tag="span">
              <template #plan><strong>{{ $t('team.createModal.proPlan') }}</strong></template>
            </i18n-t>
          </div>
          <div v-else class="modal-body">
            <input
              v-model="newTeamName"
              type="text"
              :placeholder="$t('team.createModal.namePlaceholder')"
              class="modal-input"
              maxlength="64"
              @keydown.enter="submitCreateTeam"
            />
            <button
              class="btn-primary btn-primary--block"
              :disabled="creating || !newTeamName.trim()"
              @click="submitCreateTeam"
            >
              <Loader2 v-if="creating" :size="16" class="spin" />
              {{ $t('team.create') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ─── 초대 모달 ──────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showInviteModal" class="modal-overlay" @click.self="showInviteModal = false">
        <div class="modal-card">
          <div class="modal-head">
            <h3 class="modal-title">{{ $t('team.inviteModal.title') }}</h3>
            <button class="modal-close" @click="showInviteModal = false"><X :size="16" /></button>
          </div>

          <!-- 초대 완료 결과 -->
          <div v-if="inviteResult" class="modal-body">
            <div class="modal-success">
              {{ $t('team.inviteModal.sentBanner') }}
            </div>
            <div class="invite-link-block">
              <p class="invite-link-label">{{ $t('team.inviteModal.linkLabel') }}</p>
              <div class="invite-link-row">
                <input
                  :value="inviteResult.invite_url"
                  readonly
                  class="modal-input modal-input--readonly"
                />
                <button
                  class="icon-action icon-action--bordered"
                  :title="$t('common.action.copy')"
                  @click="copyInviteUrl(inviteResult.invite_url)"
                >
                  <Check v-if="copiedToken === inviteResult.invite_url" :size="14" class="copy-ok" />
                  <Copy v-else :size="14" />
                </button>
              </div>
            </div>
            <button
              class="btn-secondary btn-secondary--block"
              @click="inviteResult = null; inviteEmail = ''"
            >
              {{ $t('team.inviteModal.inviteAnother') }}
            </button>
          </div>

          <!-- 초대 입력 -->
          <div v-else class="modal-body">
            <input
              v-model="inviteEmail"
              type="email"
              :placeholder="$t('team.inviteModal.emailPlaceholder')"
              class="modal-input"
              @keydown.enter="submitInvite"
            />
            <div class="invite-input-row">
              <select
                v-model="inviteRole"
                class="team-role-select team-role-select--lg"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                class="btn-primary invite-send-btn"
                :disabled="inviting || !inviteEmail.trim()"
                @click="submitInvite"
              >
                <Loader2 v-if="inviting" :size="16" class="spin" />
                {{ $t('team.inviteModal.send') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* ── 카드 껍질 ─────────────────────────────────────────── */
.team-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── 헤더 ──────────────────────────────────────────────── */
.team-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.team-card-title-wrap { display: flex; align-items: center; gap: 8px; }
.team-card-icon { color: var(--accent); }
.team-card-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

/* ── 버튼 ──────────────────────────────────────────────── */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--accent);
  border-radius: 9999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-primary:hover:not(:disabled) {
  background: #75502E;
  border-color: #75502E;
  transform: translateY(-1px);
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary--block { width: 100%; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  background: none;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); background: rgba(140, 98, 57, 0.05); }
.btn-secondary--block { width: 100%; }

/* ── 로딩 / 빈 상태 ────────────────────────────────────── */
.team-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
  color: var(--text-muted);
}
.team-loading--sm { padding: 12px 0; }

/* 풍성한 빈 상태 — 사용자가 바로 이해할 수 있도록 */
.team-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px 24px;
  gap: 10px;
}
.team-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent);
  margin-bottom: 4px;
}
.team-empty-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.team-empty-body {
  font-size: 0.84rem;
  color: var(--text-muted);
  margin: 0;
  max-width: 320px;
  line-height: 1.55;
}
.team-empty-cta {
  margin-top: 6px;
  padding: 10px 22px;
  font-size: 0.85rem;
}
.team-empty-or {
  font-size: 0.76rem;
  color: var(--text-muted);
  margin: 0;
}

/* ── 팀 목록 ───────────────────────────────────────────── */
.team-list { display: flex; flex-direction: column; gap: 8px; }
.team-item {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
}
.team-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
}
.team-item-head:hover { background: var(--bg-light); }
.team-item-name-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
.team-item-role-icon { color: var(--accent); flex-shrink: 0; }
.team-item-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-item-role { font-size: 0.72rem; color: var(--text-muted); }
.team-item-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.team-item-chevron { color: var(--text-muted); }

/* ── 아이콘 버튼 ───────────────────────────────────────── */
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.icon-action:hover { background: var(--bg-light); color: var(--text-main); }
.icon-action--danger:hover { background: rgba(220, 38, 38, 0.1); color: #b91c1c; }
.icon-action--bordered { border-color: var(--border-light); }
.icon-action--bordered:hover { border-color: var(--accent); color: var(--accent); background: rgba(140, 98, 57, 0.05); }
.copy-ok { color: var(--primary-moss, #2E4036); }

/* ── 팀 상세 ───────────────────────────────────────────── */
.team-detail {
  border-top: 1px solid var(--border-light);
  background: var(--bg-light, #F7F5EB);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.team-section { display: flex; flex-direction: column; gap: 8px; }
.team-section-head { display: flex; align-items: center; justify-content: space-between; }
.team-section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.team-section-label--block { display: block; }
.team-invite-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  color: var(--accent);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background 0.15s;
}
.team-invite-link:hover { background: rgba(140, 98, 57, 0.08); }

/* ── 멤버/초대 행 ──────────────────────────────────────── */
.team-rows { display: flex; flex-direction: column; gap: 2px; }
.team-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}
.team-row:hover { background: var(--bg-card, #fff); }
.team-row--invite {
  background: rgba(140, 98, 57, 0.05);
  border: 1px solid rgba(140, 98, 57, 0.12);
}
.team-row-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.team-row-icon { color: var(--text-muted); flex-shrink: 0; }
.team-row-icon--invite { color: var(--accent); }
.team-row-email {
  font-size: 0.82rem;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-row-role { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
.team-row-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.team-row:hover .team-row-controls { opacity: 1; }

/* ── 역할 셀렉트 ───────────────────────────────────────── */
.team-role-select {
  border: 1px solid var(--border-light);
  background: var(--bg-card, #fff);
  color: var(--text-main);
  font-size: 0.72rem;
  border-radius: 6px;
  padding: 3px 6px;
  cursor: pointer;
}
.team-role-select--lg {
  font-size: 0.82rem;
  padding: 8px 12px;
  border-radius: 8px;
}
.team-role-select:focus { outline: none; border-color: var(--accent); }

/* ── 모달 ──────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(42, 36, 33, 0.4);
  backdrop-filter: blur(3px);
}
.modal-card {
  width: 100%;
  max-width: 24rem;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 12px 40px rgba(42, 36, 33, 0.18);
}
.modal-head { display: flex; align-items: center; justify-content: space-between; }
.modal-title { font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; }
.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.15s;
}
.modal-close:hover { color: var(--text-main); background: var(--bg-light); }
.modal-body { display: flex; flex-direction: column; gap: 12px; }

.modal-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--text-main);
  background: var(--bg-page);
  outline: none;
  transition: border-color 0.2s;
}
.modal-input:focus { border-color: var(--accent); }
.modal-input--readonly { flex: 1; height: 34px; font-size: 0.74rem; color: var(--text-muted); }

.modal-warning {
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.2);
  border-radius: 10px;
  padding: 12px;
  font-size: 0.82rem;
  color: var(--accent);
}
.modal-success {
  background: rgba(46, 64, 54, 0.08);
  border: 1px solid rgba(46, 64, 54, 0.2);
  border-radius: 10px;
  padding: 12px;
  font-size: 0.82rem;
  color: var(--primary-moss, #2E4036);
}

.invite-link-block { display: flex; flex-direction: column; gap: 6px; }
.invite-link-label { font-size: 0.72rem; color: var(--text-muted); margin: 0; }
.invite-link-row { display: flex; align-items: center; gap: 8px; }
.invite-input-row { display: flex; gap: 8px; }
.invite-send-btn { flex: 1; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
