<script setup>
import { ref, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { Zap, Shield, BarChart3, GitBranch, Github } from 'lucide-vue-next'
import { startGithubOAuthLogin, startGoogleOAuthLogin } from '@/utils/auth'
import { isInAppBrowser, openInExternalBrowser } from '@/utils/inAppBrowser'

const route = useRoute()
const errorMsg = ref('')

// OAuth 콜백(Task 15)에서 정지 사용자로 redirect 된 경우 — ?error=suspended&msg=...
if (route.query.error === 'suspended' && route.query.msg) {
  errorMsg.value = String(route.query.msg)
}

// [인앱브라우저] 카카오톡·인스타 등 WebView 에서는 구글 OAuth 가 차단됨
// (403 disallowed_useragent). 감지되면 OAuth 를 막고 외부 브라우저 안내로 전환.
const inApp = isInAppBrowser()
const copiedUrl = ref(false)

// 외부 브라우저로 현재 페이지 열기. Android 는 Chrome 강제, iOS 등은 URL 복사 후 안내.
const openExternal = async () => {
  const url = window.location.href
  if (openInExternalBrowser(url)) return
  try {
    await navigator.clipboard.writeText(url)
    copiedUrl.value = true
  } catch {
    copiedUrl.value = false
  }
}

const handleGithubLogin = () => {
  if (inApp) { openExternal(); return }
  // 백엔드가 GitHub OAuth 미구성이면 503 응답 → 사용자는 BE 의 default 에러 페이지를 보게 됨.
  // 일반적인 케이스(구성됨)에서는 GitHub authorize → /auth/callback 으로 흘러감.
  startGithubOAuthLogin()
}

const handleGoogleLogin = () => {
  if (inApp) { openExternal(); return }
  // BE Google OAuth 미구성 시 503. 구성됨이면 Google consent → /auth/callback 흐름.
  startGoogleOAuthLogin()
}

// login 좌측 브랜딩 features (영어 통일)
const features = [
  { icon: markRaw(GitBranch), label: 'Meeting → PRD', desc: 'Auto-extract requirements from meeting notes' },
  { icon: markRaw(BarChart3), label: 'DDD / Architecture', desc: 'Domain design & system architecture automation' },
  { icon: markRaw(Zap), label: 'Vibe Coding', desc: 'Architecture-driven MD guides for AI coding' },
  { icon: markRaw(Shield), label: 'SPACK / NFR', desc: 'Non-functional requirements & policy analysis' },
]
</script>

<template>
  <div class="login-root">
    <!-- Left: Branding Panel -->
    <div class="login-left">
      <div class="login-left-content">
        <!-- Logo -->
        <div class="brand-logo">
          <div class="brand-icon">
            <Zap :size="28" color="white" />
          </div>
          <span class="brand-name">Harness</span>
        </div>

        <div class="brand-tagline-wrap">
          <h1 class="brand-headline">
            AI-Powered<br />
            <span class="brand-highlight">System Design</span><br />
            Platform
          </h1>
          <p class="brand-sub">
            From meeting notes to vibe coding.<br />
            Harness automates your entire engineering lifecycle.
          </p>
        </div>

        <!-- Features -->
        <div class="feature-list">
          <div v-for="feat in features" :key="feat.label" class="feature-item">
            <div class="feature-icon">
              <component :is="feat.icon" :size="16" />
            </div>
            <div>
              <div class="feature-label">{{ feat.label }}</div>
              <div class="feature-desc">{{ feat.desc }}</div>
            </div>
          </div>
        </div>

        <!-- Deco orbs -->
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
      </div>
    </div>

    <!-- Right: Login Form Panel -->
    <div class="login-right">
      <div class="login-form-wrap">
        <!-- Top badge -->
        <div class="form-badge">
          <Shield :size="12" class="mr-1" />
          {{ $t('auth.login.badge') }}
        </div>

        <h2 class="form-title">{{ $t('auth.login.title') }}</h2>
        <p class="form-sub">{{ $t('auth.login.subtitle') }}</p>

        <!-- Error -->
        <div v-if="errorMsg" class="error-alert">
          <Shield :size="14" class="mr-2" />
          {{ errorMsg }}
        </div>

        <!-- [2026-06] OAuth 우선 — Google/GitHub 를 기본 로그인/가입 수단으로 상단 배치. -->
        <!-- [인앱브라우저] Google/GitHub OAuth 차단(disallowed_useragent) 안내 -->
        <div v-if="inApp" class="inapp-banner" role="alert">
          <Shield :size="14" class="inapp-banner__icon" />
          <div class="inapp-banner__body">
            <p class="inapp-banner__text">{{ $t('auth.inapp.guide') }}</p>
            <button type="button" class="inapp-banner__btn" @click="openExternal">
              {{ $t('auth.inapp.open_button') }}
            </button>
            <p v-if="copiedUrl" class="inapp-banner__copied">{{ $t('auth.inapp.copied') }}</p>
          </div>
        </div>

        <!-- Google OAuth -->
        <button
          type="button"
          class="google-btn"
          @click="handleGoogleLogin"
          :aria-label="$t('auth.login.google')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" class="mr-2" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ $t('auth.login.google') }}
        </button>

        <!-- GitHub OAuth -->
        <button
          type="button"
          class="github-btn"
          @click="handleGithubLogin"
          :aria-label="$t('auth.login.github')"
        >
          <Github :size="18" class="mr-2" />
          {{ $t('auth.login.github') }}
        </button>

        <!-- [2026-06] 약관·개인정보 동의 고지 — 체크박스 게이트 대신 안내 문구.
             로그인(=가입) 진행 시 동의로 간주. 링크는 법적 페이지로 연결. -->
        <p class="oauth-consent" v-html="$t('auth.login.agree_label_html')"></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;600;700&display=swap');

/* ── Root Layout ── */
.login-root {
  display: flex;
  width: 100vw;
  height: 100vh;
  /* [2026-06] 모바일 주소창이 접혔다 펴질 때 100vh 가 튀며 하단이 잘리던 문제 —
     dvh(동적 viewport) 지원 브라우저는 실제 보이는 높이에 맞춤. */
  height: 100dvh;
  overflow: hidden;
  font-family: 'Pretendard Variable', Pretendard, sans-serif;
}

/* ── Left: Branding ── */
.login-left {
  width: 48%;
  flex-shrink: 0;
  background: linear-gradient(140deg, #2A2421 0%, #3D2E1E 40%, #1A1208 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}

.login-left-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 56px;
  width: 100%;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 56px;
}

.brand-icon {
  width: 48px;
  height: 48px;
  background: var(--accent, #8C6239);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(140, 98, 57, 0.45);
}

.brand-name {
  font-family: 'Outfit', sans-serif;
  font-size: 1.8rem;
  font-weight: 900;
  color: white;
  letter-spacing: -0.03em;
}

.brand-tagline-wrap {
  margin-bottom: 48px;
}

.brand-headline {
  font-family: 'Outfit', sans-serif;
  font-size: 2.6rem;
  font-weight: 900;
  color: white;
  line-height: 1.15;
  letter-spacing: -0.04em;
  margin-bottom: 16px;
}

.brand-highlight {
  color: #C89B6A;
}

.brand-sub {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.7;
  margin: 0;
}

/* Features */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(4px);
  transition: all 0.2s;
}

.feature-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(200, 155, 106, 0.3);
}

.feature-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.3);
  color: #C89B6A;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feature-label {
  font-family: 'Outfit', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  color: white;
}

.feature-desc {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 1px;
}

/* Decorative orbs */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  z-index: 1;
}
.orb-1 { width: 300px; height: 300px; background: rgba(140, 98, 57, 0.25); top: -80px; right: -80px; }
.orb-2 { width: 200px; height: 200px; background: rgba(200, 155, 106, 0.12); bottom: 60px; left: 40px; }
.orb-3 { width: 150px; height: 150px; background: rgba(140, 98, 57, 0.15); bottom: -40px; right: 60px; }

/* ── Right: Form ── */
.login-right {
  flex: 1;
  background: #FCFAEE;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  position: relative;
}

.login-right::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(ellipse at 70% 20%, rgba(140, 98, 57, 0.05) 0%, transparent 60%);
  pointer-events: none;
}

.login-form-wrap {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
}

.form-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 9999px;
  background: rgba(140, 98, 57, 0.08);
  border: 1px solid rgba(140, 98, 57, 0.2);
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  color: #8C6239;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 24px;
}

.form-title {
  font-family: 'Outfit', sans-serif;
  font-size: 2rem;
  font-weight: 900;
  color: #2A2421;
  letter-spacing: -0.03em;
  margin-bottom: 6px;
}

.form-sub {
  font-size: 0.88rem;
  color: #8A817C;
  margin-bottom: 28px;
  line-height: 1.5;
}


/* Error */
.error-alert {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(244, 67, 54, 0.06);
  border: 1px solid rgba(244, 67, 54, 0.2);
  color: #c62828;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 20px;
  animation: shake 0.35s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

/* [인앱브라우저] 외부 브라우저 유도 배너 */
.inapp-banner {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: rgba(255, 167, 38, 0.08);
  border: 1px solid rgba(255, 167, 38, 0.35);
}
.inapp-banner__icon {
  color: #b26a00;
  flex-shrink: 0;
  margin-top: 2px;
}
.inapp-banner__body {
  flex: 1;
}
.inapp-banner__text {
  font-size: 0.78rem;
  line-height: 1.5;
  color: #8a5a00;
  margin: 0 0 8px;
  font-weight: 600;
}
.inapp-banner__btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 9px;
  border: none;
  background: #8C6239;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.inapp-banner__btn:hover {
  background: #6B4A2A;
}
.inapp-banner__copied {
  font-size: 0.72rem;
  color: #6b7280;
  margin: 8px 0 0;
}

/* Google OAuth button (2026-05) */
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 13px 20px;
  margin-bottom: 10px;
  border-radius: 14px;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  background: #ffffff;
  color: #1f2937;
  font-family: 'Outfit', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.google-btn:hover:not(:disabled) {
  background: #f9fafb;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
.google-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* GitHub OAuth button */
.github-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 13px 20px;
  margin-bottom: 16px;
  border-radius: 14px;
  border: 1.5px solid #2A2421;
  background: #2A2421;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: all 0.2s;
}
.github-btn:hover:not(:disabled) {
  background: #1A1208;
  border-color: #1A1208;
  transform: translateY(-1px);
}
.github-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* [2026-06] 약관·개인정보 동의 고지 문구 — 체크박스 게이트 제거(로그인 시 동의 간주). */
.oauth-consent {
  text-align: center;
  font-size: 0.78rem;
  color: #8A817C;
  margin: 18px 0 0;
  line-height: 1.6;
}
.oauth-consent :deep(a) {
  color: #8C6239; font-weight: 700; text-decoration: underline;
  text-underline-offset: 2px;
}
.oauth-consent :deep(a:hover) { color: #6B4A2A; }

/* Responsive */

/* Tablet: 900~1200px — left panel 좁아지면 폰트/패딩 축소 */
@media (max-width: 1200px) and (min-width: 901px) {
  .login-left { width: 44%; }
  .login-left-content { padding: 48px 36px; }
  .brand-headline { font-size: 2.2rem; }
  .brand-sub { font-size: 0.88rem; }
  .feature-item { padding: 12px 14px; gap: 12px; }
  .feature-label { font-size: 0.8rem; }
  .feature-desc { font-size: 0.68rem; }
  .login-right { padding: 32px; }
}

/* Mobile: ≤900px — left panel hide, 배경에 데코 살림 */
@media (max-width: 900px) {
  .login-left { display: none; }
  .login-right {
    /* [2026-06] 노치/홈 인디케이터(safe-area) 만큼 여백 확보 — 카드가 시스템 UI 와
       겹치지 않게. 세로 스크롤 가능하도록 align-items: flex-start + 위아래 여백. */
    padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    background: linear-gradient(140deg, #2A2421 0%, #3D2E1E 50%, #1A1208 100%);
    overflow-y: auto;
  }
  /* 모바일 배경 보강 — 화면 자체의 orb 데코 + grid pattern 으로 입체감 */
  .login-right::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 15% 20%, rgba(200, 155, 106, 0.18) 0%, transparent 45%),
      radial-gradient(circle at 85% 75%, rgba(140, 98, 57, 0.22) 0%, transparent 50%),
      radial-gradient(circle at 50% 110%, rgba(200, 155, 106, 0.10) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
    filter: blur(40px);
  }
  .login-right::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(200, 155, 106, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(200, 155, 106, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
    z-index: 0;
    opacity: 0.6;
  }
  .login-form-wrap {
    background: white;
    padding: 32px 24px;
    border-radius: 24px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05);
    position: relative;
    z-index: 1;
    /* 세로 스크롤 시 위쪽에 약간 여백을 두고 시작 — 짧은 화면에서 상단 잘림 방지. */
    margin: auto 0;
  }

  /* OAuth 버튼 — 최소 높이 50px + 글자 약간 키움 */
  .google-btn,
  .github-btn {
    min-height: 50px;
    font-size: 0.92rem;
  }
}

/* Small mobile: ≤480px — 폼 패딩 더 축소(다크 프레임 최소화로 카드 면적 확보) */
@media (max-width: 480px) {
  .login-right {
    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
  }
  .login-form-wrap { padding: 28px 20px; border-radius: 22px; }
  .form-title { font-size: 1.7rem; }
  .form-sub { font-size: 0.85rem; margin-bottom: 24px; }
}
</style>
