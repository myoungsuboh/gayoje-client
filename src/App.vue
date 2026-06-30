<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useRoute, useRouter } from 'vue-router'
import { MapPin, Palette, Code2, Wand2, Package } from 'lucide-vue-next'
import { useHarnessStore } from './store/harness'
import { useSnackbar } from '@/composables/useSnackbar'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import WebVitalsDialog from '@/components/common/WebVitalsDialog.vue'
import MyProjectsModal from '@/components/common/MyProjectsModal.vue'
import UpgradePromptDialog from '@/components/common/UpgradePromptDialog.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useUsageStore } from '@/store/usage'
import { usePricingStore } from '@/store/pricing'
import { useQuotaConfigStore } from '@/store/quotaConfig'
import { useSkillLibraryStore } from '@/store/skillLibrary'
import { logoutApi, verifyToken, getCurrentUser, fetchMyProjects } from '@/utils/auth'
import { useLocale } from '@/composables/useLocale'

const { state: snackbarState, triggerAction } = useSnackbar()
const usageStore = useUsageStore()
const pricingStore = usePricingStore()
const quotaConfigStore = useQuotaConfigStore()
const skillLibraryStore = useSkillLibraryStore()

const { t } = useI18n()
const { xs, smAndDown } = useDisplay()
const route = useRoute()
const router = useRouter()
const harnessStore = useHarnessStore()
const { syncFromProfile } = useLocale()

const tab = ref(null)
// [2026-05] 데시보드(/home) 또는 프로젝트 미선택 시 워크플로우 5탭 비활성화.
//   - /home 자체는 진입점/대시보드 — 5탭은 데시보드 카드로 들어가야 의미 있음.
//   - 프로젝트 없으면 /plan 들어가도 빈 화면 → 사용자가 새 프로젝트 만들도록 유도.
//   - 등록 중(isRegisteringLog) 일 때도 탭 막아 race condition 방지.
const tabsDisabled = computed(() => {
  if (harnessStore.isRegisteringLog) return true
  if (route.path === '/home') return true
  if (!harnessStore.projectName) return true
  return false
})
const isLoginPage = computed(() => {
  const path = route.path || (typeof window !== 'undefined' ? window.location.pathname : '')
  if (path === '/login' || path === '/signup' || path === '/auth/callback') return true
  if (typeof window !== 'undefined' && !localStorage.getItem('harness_token')) return true
  return false
})

const showMyProjectsModal = ref(false)
const myProjectsCount = ref(0)
const refreshMyProjectsCount = async () => {
  if (typeof window === 'undefined' || !localStorage.getItem('harness_token')) return
  const r = await fetchMyProjects()
  if (r.success) myProjectsCount.value = (r.projects || []).length
}
watch(showMyProjectsModal, (open, wasOpen) => {
  if (wasOpen && !open) refreshMyProjectsCount()
})


const currentUser = ref(getCurrentUser() || {})
const isAdmin = computed(() => Boolean(currentUser.value?.is_admin))
const showVitalsBtn = computed(() => import.meta.env.DEV || String(import.meta.env.VITE_SHOW_WEB_VITALS || '').toLowerCase() === 'true')
const webVitalsOpen = ref(false)

const handleLogout = async () => {
  await logoutApi()
  currentUser.value = {}
  usageStore.reset()
  skillLibraryStore.reset()
  myProjectsCount.value = 0
  router.push('/login')
}

watch(
  () => route?.path,
  () => {
    if (typeof window === 'undefined') return
    currentUser.value = getCurrentUser() || {}
    if (localStorage.getItem('harness_token')) {
      refreshMyProjectsCount()
    } else {
      myProjectsCount.value = 0
    }
  }
)

onMounted(async () => {
  pricingStore.fetch()
  // 공개 한도(quota-config) — 업그레이드 모달 / 요금제 카드 perks 동적 표시용. 인증 불필요.
  quotaConfigStore.fetch()
  if (typeof window === 'undefined' || !localStorage.getItem('harness_token')) return
  const r = await verifyToken()
  if (r.valid && r.user) {
    currentUser.value = r.user
    syncFromProfile(r.user)
  }
  refreshMyProjectsCount()
})

// [2026-05-18] 친근한 동사형 네이밍 — 사용자 피드백 "어떻게 사용할지 모르겠다" 대응.
// 라벨은 로케일 기반(common.nav.*), num 은 워크플로우 단계 번호. locale 전환에 반응하도록 computed.
const tabs = computed(() => [
  { name: t('common.nav.tab_plan'), num: '1', icon: MapPin, path: '/plan' },
  { name: t('common.nav.tab_design'), num: '2', icon: Palette, path: '/design' },
  { name: t('common.nav.tab_code'), num: '3', icon: Code2, path: '/code' },
  { name: t('common.nav.tab_lint'), num: '4', icon: Wand2, path: '/lint' },
  { name: t('common.nav.tab_deliverables'), num: '5', icon: Package, path: '/deliverables' },
])

watch(
  () => route?.path,
  (newPath) => {
    if (!newPath) return
    const index = tabs.value.findIndex(item => item.path === newPath)
    // 워크플로우 페이지(/plan, /design, /code, /lint, /deliverables) 면 해당 탭 선택,
    // 그 외(/home, /profile, /admin 등) 는 어떤 탭도 선택 안 함 (잘못된 활성 상태 방지).
    tab.value = index !== -1 ? index : null
  },
  { immediate: true }
)

watch(
  () => harnessStore.currentTab,
  newVal => {
    if (tabs.value[newVal] && route.path !== tabs.value[newVal].path) router.push(tabs.value[newVal].path)
  }
)
</script>

<template>
  <v-app class="app-container">
    <a href="#main-content" class="skip-to-content">{{ $t('common.nav.skip_to_content') }}</a>
    <v-main class="bg-page" id="main-content">
      <template v-if="isLoginPage">
        <router-view />
      </template>

      <template v-else>
        <v-container fluid class="fill-height pa-0 w-100">
          <v-card class="main-card bg-card fill-height w-100 d-flex flex-column" flat>

            <AppHeader
              :is-admin="isAdmin"
              :my-projects-count="myProjectsCount"
              :show-vitals-btn="showVitalsBtn"
              @go-admin="router.push('/admin')"
              @open-my-projects="showMyProjectsModal = true"
              @open-vitals="webVitalsOpen = true"
              @logout="handleLogout"
            />

            <nav role="navigation" :aria-label="$t('common.nav.aria_page_tabs')">
              <v-tabs v-model="tab" bg-color="transparent" align-tabs="start" :show-arrows="true" class="px-6 premium-tabs" height="48" :disabled="tabsDisabled">
                <v-tab
                  v-for="(item, index) in tabs" :key="index" :value="index" :to="!tabsDisabled ? item.path : undefined"
                  class="text-none font-weight-medium tab-item"
                  :class="{ 'tab-item--disabled': tabsDisabled }"
                  :min-width="xs ? '80px' : '100px'"
                  :disabled="tabsDisabled"
                  :title="tabsDisabled
                    ? (route.path === '/home' ? $t('common.nav.tab_disabled_home') : $t('common.nav.tab_disabled_no_project'))
                    : undefined"
                >
                  <span class="tab-label">{{ xs ? item.name : '0' + item.num + ' ' + item.name }}</span>
                </v-tab>
              </v-tabs>
            </nav>

            <div class="flex-grow-1 overflow-hidden w-100 position-relative">
              <div class="content-wrapper h-100 pa-0 w-100">
                <router-view v-slot="{ Component }">
                  <component :is="Component" />
                </router-view>
              </div>
            </div>
          </v-card>
        </v-container>
      </template>
    </v-main>

    <AppFooter />

    <ConfirmDialog />
    <UpgradePromptDialog />
    <MyProjectsModal v-model="showMyProjectsModal" />
    <WebVitalsDialog v-model="webVitalsOpen" />

    <v-snackbar
      v-model="snackbarState.show"
      :color="snackbarState.color"
      :timeout="snackbarState.timeout"
      :location="xs ? 'bottom' : 'top right'" variant="elevated"
      :class="{ 'snackbar--mobile': xs }"
      role="status" :aria-live="snackbarState.color === 'error' ? 'assertive' : 'polite'"
    >
      <!-- [2026-05-21] pre-line — BE 의 다중줄 안내(권장 조치 등) 줄바꿈 보존. -->
      <span style="white-space: pre-line;">{{ snackbarState.message }}</span>
      <template #actions>
        <v-btn v-if="snackbarState.actionLabel" variant="text" size="small" class="font-weight-bold" @click="triggerAction">{{ snackbarState.actionLabel }}</v-btn>
        <v-btn variant="text" icon="mdi-close" size="small" :aria-label="$t('common.nav.aria_close_notice')" @click="snackbarState.show = false" />
      </template>
    </v-snackbar>
  </v-app>
</template>

<style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css");

:root {
  --bg-page: #FCFAEE;
  --bg-card: #FFFFFF;
  --bg-light: #F7F5EB;
  --border-light: rgba(140, 98, 57, 0.1);
  --text-main: #2A2421;
  --text-muted: #6F665F;
  --accent: #8C6239;
  --selection-bg: rgba(140, 98, 57, 0.2);
  --primary-moss: #2E4036;
  --page-pad-x: 32px;
  --card-pad-lg: 32px 36px;
  --card-pad-md: 22px 24px;
  --card-pad-sm: 16px 18px;
}
@media (max-width: 900px) { :root { --page-pad-x: 16px; } }
@media (max-width: 600px) { :root { --page-pad-x: 12px; } }

.page-root, .dashboard-header {
  padding-left: var(--page-pad-x) !important;
  padding-right: var(--page-pad-x) !important;
}

.font-outfit { font-family: 'Outfit', sans-serif !important; }
.font-mono { font-family: 'IBM Plex Mono', monospace !important; }
.font-pretendard { font-family: 'Pretendard', sans-serif !important; }
.rounded-pill-full { border-radius: 9999px !important; }

/* 공용 spinner — 여러 컴포넌트에서 중복 정의하던 회전 애니메이션을 전역으로 통합
   (2026-05-27). class="rotate-anim" / "spinning" 둘 다 지원, 로컬 @keyframes 불필요. */
@keyframes hx-spin { to { transform: rotate(360deg); } }
.rotate-anim, .spinning { animation: hx-spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .rotate-anim, .spinning { animation: none; }
}

::selection { background-color: var(--selection-bg); color: var(--text-main); }

* { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
body {
  background-color: var(--bg-page); color: var(--text-main);
  overflow: hidden; position: relative;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility; word-break: keep-all;
}

.bg-page { background-color: var(--bg-page) !important; }
.bg-card { background-color: var(--bg-card) !important; }
.bg-light { background-color: var(--bg-light) !important; }
.border-light { border: 1px solid var(--border-light) !important; }
.text-main { color: var(--text-main) !important; }
.text-muted { color: var(--text-muted) !important; }
.bg-accent { background-color: var(--accent) !important; }

.main-card { border-radius: 0 !important; box-shadow: none !important; border: none !important; }

.premium-tabs { border-bottom: 1px solid var(--border-light) !important; margin-bottom: 8px; }
.premium-tabs :deep(.v-slide-group__content) { padding: 8px 0; }
.tab-item {
  color: var(--text-muted) !important; transition: all 0.3s ease !important;
  border-radius: 9999px !important; margin-right: 8px;
  height: 36px !important; min-height: 36px !important; text-transform: none !important;
}
.tab-item:hover:not(.tab-item--disabled) { background-color: var(--bg-light) !important; color: var(--text-main) !important; border: 1px solid var(--border-light); }
/* disabled — 데시보드(/home) 진입 또는 프로젝트 미선택 시 시각적으로 비활성. */
.tab-item--disabled {
  opacity: 0.4 !important;
  pointer-events: none !important;
  cursor: not-allowed !important;
}
.premium-tabs .v-tab.v-tab--selected { background-color: var(--accent) !important; color: #FFFFFF !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(140, 98, 57, 0.25) !important; border: 1px solid transparent !important; }
.premium-tabs .v-tab.v-tab--selected * { color: #FFFFFF !important; }
.tab-label { font-size: 0.85rem !important; font-weight: 700 !important; }
.v-tab__slider { display: none !important; }
.hover-light:hover { background-color: var(--bg-light) !important; }

.skip-to-content {
  position: absolute; top: -100px; left: 8px; z-index: 9999;
  background: var(--accent); color: white;
  padding: 10px 18px; border-radius: 0 0 8px 8px;
  font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 700;
  text-decoration: none; transition: top 0.2s;
}
.skip-to-content:focus { top: 0; }

*:focus { outline: none; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible,
select:focus-visible, [role="button"]:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px;
}
:focus:not(:focus-visible) { outline: none; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-page); border-left: 1px solid var(--border-light); }
::-webkit-scrollbar-thumb { background: rgba(140, 98, 57, 0.3); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(140, 98, 57, 0.5); }

.content-wrapper { padding: 16px !important; }

@media (max-width: 600px) {
  .dashboard-header h1.text-h5 { font-size: 1.05rem !important; }
  .dashboard-header .gap-4 { gap: 6px !important; }
  .page-root h2.text-h4 { font-size: 1.4rem !important; line-height: 1.3 !important; }
  .page-root .text-caption { font-size: 0.72rem !important; }

  /* === 모바일 페이지 스크롤 전환 (2026-06-05) ===
     데스크탑은 셸이 100vh 로 고정되고 각 패널이 내부 스크롤을 갖는 구조다.
     모바일에서는 콘텐츠가 뷰포트를 넘으면 내부 스크롤 설정이 어긋나 리스트·버튼이
     잘려 보이고, body{overflow:hidden} 때문에 페이지 스크롤로 빠져나올 수도 없었다.
     → 모바일에서는 셸의 고정 높이·overflow 사슬을 풀어 콘텐츠 높이만큼 늘어나게 하고
        문서가 자연스럽게 세로 스크롤되도록 전환한다. */
  html, body {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch;
  }
  /* v-main 안의 컨테이너·메인 카드: 100% 고정 → 콘텐츠 높이(짧으면 화면 채움).
     Vuetify 버전별 v-main 내부 래퍼(.v-main__wrap 등)에 견고하도록 자손 선택자. */
  .app-container .v-main .v-container.fill-height {
    height: auto !important;
    min-height: 100%;
    align-items: flex-start !important;
  }
  .app-container .main-card {
    height: auto !important;
    min-height: 100%;
  }
  /* 탭 아래 콘텐츠 래퍼의 overflow-hidden 해제 → 페이지로 흘려보냄 */
  .app-container .main-card > .flex-grow-1.overflow-hidden {
    overflow: visible !important;
    flex: 0 0 auto !important;
  }
  .app-container .content-wrapper { height: auto !important; }
  /* 각 페이지 루트(...fill-height...page-root)도 콘텐츠 높이로 */
  .page-root.fill-height { height: auto !important; min-height: 100%; }
}
</style>
