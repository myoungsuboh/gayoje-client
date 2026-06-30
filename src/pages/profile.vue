<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, HelpCircle } from 'lucide-vue-next'
import UsageCard from '@/components/common/UsageCard.vue'
import McpConnectCard from '@/components/common/McpConnectCard.vue'
import GlossaryModal from '@/components/common/GlossaryModal.vue'
import ProfileAccountCard from '@/components/profile/ProfileAccountCard.vue'
import ActiveSessionsCard from '@/components/profile/ActiveSessionsCard.vue'
import ProfileLibraryCard from '@/components/profile/ProfileLibraryCard.vue'
import ProfileDangerZone from '@/components/profile/ProfileDangerZone.vue'
import TeamProfileSummary from '@/components/profile/TeamProfileSummary.vue'
import { TEAM_FEATURE_ENABLED } from '@/config/features'

const router = useRouter()
const glossaryOpen = ref(false)

// '돌아가기' 버튼 — router.back() 안전 wrapper.
//   - /auth/ 계열(OAuth callback) 또는 /profile 자기 자신이면 /home 으로 fallback.
//     Notion OAuth history 오염 방지 목적.
//   - 이전 history 없으면 /home fallback.
const goBack = () => {
  try {
    const back = window.history.state?.back
    if (
      back &&
      !back.startsWith('/auth/') &&
      back !== '/profile'
    ) {
      router.back()
      return
    }
  } catch {}
  router.push({ path: '/home' })
}
</script>

<template>
  <div class="page-root profile-page">
    <button class="back-btn" @click="goBack">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <div class="profile-title-row">
      <div>
        <h2 class="text-h4 font-weight-bold text-main mb-1">{{ $t('profile.page.title') }}</h2>
        <p class="text-muted text-body-2">{{ $t('profile.page.subtitle') }}</p>
      </div>
      <div class="profile-title-actions">
        <button class="profile-action-btn" :title="$t('common.header.glossary_title')" @click="glossaryOpen = true">
          <BookOpen :size="15" />
          <span>{{ $t('common.header.glossary') }}</span>
        </button>
        <button class="profile-action-btn" :title="$t('common.header.contact_title')" @click="router.push('/contact')">
          <HelpCircle :size="15" />
          <span>{{ $t('common.header.contact') }}</span>
        </button>
      </div>
    </div>

    <UsageCard class="mb-7 mt-8" :show-upgrade="false" />
    <ProfileAccountCard class="mb-7" />
    <ActiveSessionsCard class="mb-7" />
    <McpConnectCard class="mb-7" />
    <TeamProfileSummary v-if="TEAM_FEATURE_ENABLED" class="mb-7" />
    <ProfileLibraryCard class="mb-7" />
    <ProfileDangerZone />

    <GlossaryModal v-model="glossaryOpen" />
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 28px var(--page-pad-x) 56px;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  margin: 0 -6px 20px;
  border-radius: 6px;
  transition: color 0.2s, transform 0.2s, background 0.2s;
}
.back-btn:hover { color: var(--accent); background: rgba(140, 98, 57, 0.06); }
.back-btn:hover :deep(svg) { transform: translateX(-2px); }
.back-btn :deep(svg) { transition: transform 0.2s; }
.back-btn:focus-visible { color: var(--accent); outline-offset: 3px; }
.back-btn:active { transform: scale(0.97); }
.profile-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.profile-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 4px;
}
.profile-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted, #999);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.profile-action-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: var(--text-main, #fff);
  border-color: rgba(255, 255, 255, 0.2);
}
@media (max-width: 600px) {
  .profile-page { padding: 16px var(--page-pad-x) 40px; }
}
</style>
