<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { LogOut, Activity, Settings, FolderOpen, Loader2, MoreHorizontal, Square, Users, Sparkles } from 'lucide-vue-next'
import { useJobsStore } from '@/store/jobs'
import { useUsageStore } from '@/store/usage'
import { useSnackbar } from '@/composables/useSnackbar'
import UsageHeaderChip from '@/components/common/UsageHeaderChip.vue'
import TeamContextBadge from '@/components/layout/TeamContextBadge.vue'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { TEAM_FEATURE_ENABLED } from '@/config/features'

defineProps({
  isAdmin: { type: Boolean, default: false },
  myProjectsCount: { type: Number, default: 0 },
  showVitalsBtn: { type: Boolean, default: false },
})
defineEmits(['go-admin', 'open-my-projects', 'open-vitals', 'logout'])

const { t } = useI18n()
const router = useRouter()
const jobsStore = useJobsStore()
const usageStore = useUsageStore()
const { showSuccess } = useSnackbar()
const moreOpen = ref(false)

// [2026-06] 상시 /pricing 진입점. 이전엔 최상위(pro_max) 등급에서 버튼을 숨겨
// "토큰을 다 써야 업그레이드 가능"처럼 느껴지던 문제를 풀었는데, 그 과정에서
// pro_max 사용자가 /pricing 자체에 못 가 "구독 관리(해지·결제수단·영수증)" 경로까지
// 사라지는 사고가 있었다(해지 경로 미제공 = 전자상거래법 문제). → 모든 등급에서 항상
// 노출하되, pro_max 는 업셀 대신 "구독 관리" 라벨로 같은 /pricing 으로 보낸다.
const isMaxTier = computed(() => usageStore.subscriptionType === 'pro_max')
const billingLabel = computed(() =>
  isMaxTier.value ? t('common.header.manage_sub') : t('common.header.upgrade'))
const billingTitle = computed(() =>
  isMaxTier.value ? t('common.header.manage_sub_title') : t('common.header.upgrade_title'))
const goToPricing = () => router.push('/pricing')

// [중지 — 2026-06-01] 전역 헤더 칩에서 백그라운드 작업 중지. 단일 잡(postMeeting/
// autofill 등)과 배치 chain 양쪽을 한 번에 멈춘다. 이미 BE 에서 처리된 내용은
// 새로고침하면 반영되므로 "UI 즉시 중지" 만 책임진다(stopBatch 와 동일 철학).
const stopJobs = () => {
  if (jobsStore.batchState?.running) jobsStore.stopBatch()
  jobsStore.stopAllActiveJobs()
  showSuccess(t('common.header.stopped_toast'), { timeout: 6000 })
}

// stage 마커 → i18n 키 매핑. 콜론(design:spack)은 키에서 underscore 로 치환.
// autofill:generating:k/n 은 동적 카운트라 별도 처리. 미지정 stage 는 원문 그대로.
const formatJobStage = (stage) => {
  if (!stage) return ''
  const m = String(stage).match(/^autofill:generating:(\d+)\/(\d+)$/)
  if (m) return t('common.header.stage.autofill_generating', { done: m[1], total: m[2] })
  const key = `common.header.stage.${String(stage).replace(/:/g, '_')}`
  const label = t(key)
  return label === key ? stage : label
}
</script>

<template>
  <header class="dashboard-header pt-6 pb-2" role="banner">
    <!-- Brand — desktop only (scoped CSS controls display, avoids Vuetify d-flex !important conflict) -->
    <div class="header-brand">
      <h1
        class="text-h5 font-weight-bold text-main tracking-tight brand-title"
        role="button"
        tabindex="0"
        :title="$t('common.header.brand_home_title')"
        @click="router.push('/home')"
        @keydown.enter.prevent="router.push('/home')"
        @keydown.space.prevent="router.push('/home')"
      >Harness Dashboard</h1>
    </div>

    <div class="header-spacer" />

    <!-- Desktop right actions (>600px) -->
    <div class="header-actions-desktop">
      <v-btn
        v-if="isAdmin"
        icon variant="text" class="text-muted hover-light" size="small"
        :aria-label="$t('common.header.admin')" :title="$t('common.header.admin')"
        @click="$emit('go-admin')"
      >
        <Settings :size="18" aria-hidden="true" />
      </v-btn>

      <button
        class="upgrade-btn"
        :title="billingTitle"
        :aria-label="billingLabel"
        @click="goToPricing"
      >
        <Settings v-if="isMaxTier" :size="14" aria-hidden="true" />
        <Sparkles v-else :size="14" aria-hidden="true" />
        <span class="upgrade-label">{{ billingLabel }}</span>
      </button>

      <span class="d-inline-flex align-center">
        <UsageHeaderChip />
        <GuideTooltip target="usage-quota" placement="bottom" />
      </span>

      <div
        v-if="jobsStore.hasActive"
        class="bg-job-chip"
        :title="jobsStore.activeJobs.map(j => `${j.label} — ${formatJobStage(j.stage)}`).join('\n')"
      >
        <Loader2 :size="13" class="bg-job-chip__spin" />
        <span class="bg-job-chip__count">{{ jobsStore.activeCount }}</span>
        <span class="bg-job-chip__label">
          {{ formatJobStage(jobsStore.activeJobs[0]?.stage) }}<template v-if="jobsStore.activeCount > 1"> · {{ $t('common.header.jobs_more', { count: jobsStore.activeCount - 1 }) }}</template>
        </span>
        <button
          type="button"
          class="bg-job-chip__stop"
          :title="$t('common.header.stop_jobs_title')"
          :aria-label="$t('common.header.stop_jobs_aria')"
          @click="stopJobs"
        >
          <Square :size="10" />
          {{ $t('common.header.stop_jobs') }}
        </button>
      </div>

      <v-btn
        v-if="TEAM_FEATURE_ENABLED"
        icon variant="text" class="text-muted hover-light" size="small"
        :aria-label="$t('common.header.team')" :title="$t('common.header.team_title')"
        @click="router.push('/team')"
      >
        <Users :size="18" aria-hidden="true" />
      </v-btn>

      <TeamContextBadge />

      <button
        class="my-projects-btn"
        :title="$t('common.header.my_projects_title', { count: myProjectsCount })"
        :aria-label="$t('common.header.my_projects')"
        @click="$emit('open-my-projects')"
      >
        <FolderOpen :size="15" />
        <span class="my-projects-label">{{ $t('common.header.my_projects') }}</span>
        <span class="my-projects-count">{{ myProjectsCount }}</span>
      </button>

      <v-btn
        v-if="showVitalsBtn"
        icon variant="text" class="text-muted hover-light" size="small"
        :aria-label="$t('common.header.vitals')" title="Web Vitals"
        @click="$emit('open-vitals')"
      >
        <Activity :size="18" aria-hidden="true" />
      </v-btn>

      <v-btn
        icon variant="text" class="text-muted hover-light" size="small"
        :aria-label="$t('common.header.logout')" :title="$t('common.header.logout')"
        @click="$emit('logout')"
      >
        <LogOut :size="18" aria-hidden="true" />
      </v-btn>
    </div>

    <!-- Mobile right actions (≤600px only) -->
    <div class="header-actions-mobile">
      <!-- Background job indicator -->
      <div
        v-if="jobsStore.hasActive"
        class="bg-job-chip"
        :title="jobsStore.activeJobs.map(j => `${j.label} — ${formatJobStage(j.stage)}`).join('\n')"
      >
        <Loader2 :size="12" class="bg-job-chip__spin" />
        <span class="bg-job-chip__count">{{ jobsStore.activeCount }}</span>
        <button
          type="button"
          class="bg-job-chip__stop bg-job-chip__stop--icon"
          :title="$t('common.header.stop_jobs_aria')"
          :aria-label="$t('common.header.stop_jobs_aria')"
          @click="stopJobs"
        >
          <Square :size="10" />
        </button>
      </div>

      <!-- Plan / usage chip (profile shortcut) -->
      <UsageHeaderChip />

      <!-- My projects (icon + count) -->
      <button
        class="my-projects-btn"
        :title="$t('common.header.my_projects_title_short', { count: myProjectsCount })"
        :aria-label="$t('common.header.my_projects')"
        @click="$emit('open-my-projects')"
      >
        <FolderOpen :size="15" />
        <span class="my-projects-count">{{ myProjectsCount }}</span>
      </button>

      <!-- More (···) menu -->
      <v-menu v-model="moreOpen" :close-on-content-click="true" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn
            icon variant="text" size="small"
            class="text-muted hover-light"
            :aria-label="$t('common.header.more')"
            v-bind="menuProps"
          >
            <MoreHorizontal :size="20" aria-hidden="true" />
          </v-btn>
        </template>
        <v-list class="mobile-more-list" density="compact" min-width="190">
          <!-- [2026-06] 모바일에선 업그레이드/구독관리 진입을 숨김 — 사용량 칩(→ /프로필)과
               프로필의 플랜 섹션으로 일원화해 헤더 혼잡 해소. (데스크톱은 헤더 버튼 유지.) -->
          <v-list-item v-if="isAdmin" @click="$emit('go-admin')">
            <template #prepend>
              <Settings :size="16" class="mobile-menu-icon text-muted" />
            </template>
            <v-list-item-title>{{ $t('common.header.admin') }}</v-list-item-title>
          </v-list-item>
          <v-list-item v-if="TEAM_FEATURE_ENABLED" @click="router.push('/team')">
            <template #prepend>
              <Users :size="16" class="mobile-menu-icon text-muted" />
            </template>
            <v-list-item-title>{{ $t('common.header.team') }}</v-list-item-title>
          </v-list-item>
          <v-list-item v-if="showVitalsBtn" @click="$emit('open-vitals')">
            <template #prepend>
              <Activity :size="16" class="mobile-menu-icon text-muted" />
            </template>
            <v-list-item-title>Web Vitals</v-list-item-title>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item class="logout-menu-item" @click="$emit('logout')">
            <template #prepend>
              <LogOut :size="16" class="mobile-menu-icon" style="color:#dc2626" />
            </template>
            <v-list-item-title style="color:#dc2626">{{ $t('common.header.logout') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </header>
</template>

<style scoped>
/* === Header base === */
.dashboard-header {
  display: flex;
  align-items: center;
  padding-left: var(--page-pad-x) !important;
  padding-right: var(--page-pad-x) !important;
}

/* === Brand (desktop) === */
.header-brand {
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}
.brand-title {
  cursor: pointer;
  transition: color 0.15s ease, opacity 0.15s ease;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brand-title:hover { color: var(--accent, #8C6239); }
.brand-title:focus-visible {
  outline: 2px solid var(--accent, #8C6239);
  outline-offset: 4px;
  border-radius: 4px;
}

/* === Spacer === */
.header-spacer { flex: 1; }

/* === Desktop actions === */
.header-actions-desktop {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* === Mobile actions (hidden by default) === */
.header-actions-mobile {
  display: none;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* === Job chip === */
.bg-job-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 9999px;
  background: rgba(140, 98, 57, 0.1); color: var(--accent, #8C6239);
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700; cursor: default;
}
.bg-job-chip__count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #8C6239); color: #fff;
  font-size: 0.65rem; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; padding: 0 5px;
}
.bg-job-chip__label { font-size: 0.7rem; white-space: nowrap; }
.bg-job-chip__spin { animation: bg-job-spin 1s linear infinite; }
@keyframes bg-job-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .bg-job-chip__label { display: none; } }

/* 중지 버튼 — 칩 안의 작은 액션. 진행 중인 작업을 즉시 멈춘다. */
.bg-job-chip__stop {
  display: inline-flex; align-items: center; gap: 3px;
  margin-left: 2px; padding: 2px 8px; border-radius: 9999px;
  border: 1px solid rgba(192, 57, 43, 0.35);
  background: #fff; color: #c0392b;
  font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800;
  cursor: pointer; transition: all 0.15s; line-height: 1;
}
.bg-job-chip__stop:hover,
.bg-job-chip__stop:focus-visible { background: #c0392b; color: #fff; }
.bg-job-chip__stop--icon { padding: 3px; }

/* === My projects button === */
.my-projects-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
  background: var(--bg-light, #F7F5EB); border: 1px solid var(--border-light, rgba(140, 98, 57, 0.12));
  border-radius: 9999px; color: var(--text-main, #2A2421);
  font-family: 'Pretendard', sans-serif; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.my-projects-btn:hover {
  background: var(--accent, #8C6239); color: white;
  border-color: var(--accent, #8C6239); transform: translateY(-1px);
}
.my-projects-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: var(--accent, #8C6239); color: white;
  border-radius: 9999px; font-size: 0.62rem; font-weight: 800;
  font-variant-numeric: tabular-nums; transition: background 0.15s;
}
.my-projects-btn:hover .my-projects-count { background: white; color: var(--accent, #8C6239); }

/* === Upgrade button (desktop, accent-filled for discoverability) === */
.upgrade-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px;
  background: var(--accent, #8C6239); border: 1px solid var(--accent, #8C6239);
  border-radius: 9999px; color: #fff;
  font-family: 'Pretendard', sans-serif; font-size: 0.72rem; font-weight: 800;
  cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.upgrade-btn:hover {
  filter: brightness(1.08); transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(140, 98, 57, 0.3);
}
.upgrade-btn:focus-visible {
  outline: 2px solid var(--accent, #8C6239); outline-offset: 2px;
}

/* === Mobile more menu === */
.mobile-more-list { border-radius: 12px !important; }
.mobile-menu-icon { margin-right: 10px; }
.upgrade-menu-item .mobile-menu-icon { color: var(--accent, #8C6239); }

/* === Responsive: mobile ≤600px === */
@media (max-width: 600px) {
  /* Brand hidden — using scoped CSS (no Vuetify d-flex conflict) */
  .header-brand { display: none; }
  /* Swap desktop ↔ mobile action areas */
  .header-actions-desktop { display: none; }
  .header-actions-mobile { display: flex; }
  /* Tighten vertical padding on mobile */
  .dashboard-header { padding-top: 12px !important; padding-bottom: 8px !important; }
  /* Compact my-projects button: icon + badge only */
  .my-projects-label { display: none; }
  .my-projects-btn { padding: 6px 9px; }
  .my-projects-count { min-width: 16px; height: 16px; font-size: 0.58rem; }
}
</style>
