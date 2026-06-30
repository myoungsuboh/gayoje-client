<script setup>
/**
 * OnboardingWelcome — 신규/처음 사용자를 위한 한눈에 보는 시작 안내 (dismissible).
 *
 * [왜 필요한가 — B2C 온보딩]
 * 가입 직후 사용자는 "무엇을, 어디서부터" 를 모른 채 빈 화면을 마주한다. 이탈의
 * 가장 큰 원인. 이 배너는 (1) 제품이 무엇을 해주는지 한 문장, (2) 5단계를 쉬운
 * 말로, (3) "샘플로 바로 체험" 액션을 제공한다 — 클릭하면 샘플 회의록이 에디터에
 * 미리 채워진 채로 Plan 페이지로 이동(복사·붙여넣기 불필요).
 *
 * 닫으면 localStorage 에 기억해 다시 뜨지 않는다(사용자별 키는 상위에서 격리됨 —
 * userIsolation 이 사용자 전환 시 정리하진 않지만, 안내성 플래그라 위험 없음).
 */
import { ref } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'

const emit = defineEmits(['start', 'try-sample'])

const DISMISS_KEY = 'harness_onboarding_welcome_dismissed_v1'

const _initiallyDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}
const dismissed = ref(_initiallyDismissed())

const close = () => {
  dismissed.value = true
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
}

// 쉬운 말 5단계 — 전문용어(CPS/PRD/DDD)는 괄호로만 보조 표기.
// 문구는 i18n 키만 보관하고 템플릿에서 $t 로 렌더 (globalInjection).
const STEPS = [
  { n: '1', t: 'home.onboarding.step1_t', d: 'home.onboarding.step1_d' },
  { n: '2', t: 'home.onboarding.step2_t', d: 'home.onboarding.step2_d' },
  { n: '3', t: 'home.onboarding.step3_t', d: 'home.onboarding.step3_d' },
  { n: '4', t: 'home.onboarding.step4_t', d: 'home.onboarding.step4_d' },
  { n: '5', t: 'home.onboarding.step5_t', d: 'home.onboarding.step5_d' },
]
</script>

<template>
  <section v-if="!dismissed" class="onb-card" :aria-label="$t('home.onboarding.aria')">
    <button type="button" class="onb-close" :aria-label="$t('home.onboarding.close_aria')" @click="close">
      <X :size="16" />
    </button>

    <div class="onb-head">
      <span class="onb-badge"><Sparkles :size="13" /> {{ $t('home.onboarding.badge') }}</span>
      <h2 class="onb-title">{{ $t('home.onboarding.title') }}</h2>
      <p class="onb-sub">{{ $t('home.onboarding.sub') }}</p>
    </div>

    <ol class="onb-steps">
      <li v-for="s in STEPS" :key="s.n" class="onb-step">
        <span class="onb-step-n">{{ s.n }}</span>
        <div class="onb-step-body">
          <h3 class="onb-step-t">{{ $t(s.t) }}</h3>
          <p class="onb-step-d">{{ $t(s.d) }}</p>
        </div>
      </li>
    </ol>

    <div class="onb-actions">
      <button type="button" class="onb-cta" @click="emit('start')">
        {{ $t('home.onboarding.cta') }}
      </button>
      <button type="button" class="onb-ghost" @click="emit('try-sample')">
        <Sparkles :size="14" class="mr-1" />
        {{ $t('home.onboarding.ghost') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.onb-card {
  position: relative;
  background: linear-gradient(135deg, #fff 0%, rgba(140, 98, 57, 0.05) 100%);
  border: 1px solid rgba(140, 98, 57, 0.16);
  border-radius: 20px;
  padding: 26px 28px;
  box-shadow: 0 6px 20px -10px rgba(140, 98, 57, 0.18);
}
.onb-close {
  position: absolute; top: 14px; right: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: none; background: transparent;
  color: var(--text-dim, #A89B91);
  border-radius: 8px; cursor: pointer; transition: all .15s;
}
.onb-close:hover { background: rgba(140, 98, 57, 0.1); color: var(--text-main, #2A2421); }

.onb-head { margin-bottom: 18px; padding-right: 32px; }
.onb-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 9999px;
  background: var(--accent, #8C6239); color: white;
  font-size: 0.66rem; font-weight: 800; letter-spacing: 0.02em;
  margin-bottom: 12px;
}
.onb-title {
  font-size: clamp(1.15rem, 2.2vw, 1.5rem); font-weight: 800;
  letter-spacing: -0.022em; color: var(--text-main, #2A2421);
  margin: 0 0 8px; line-height: 1.35;
}
.onb-sub {
  font-size: 0.9rem; line-height: 1.65;
  color: var(--text-muted, #6F665F); margin: 0; max-width: 640px;
}

.onb-steps {
  list-style: none; margin: 0 0 20px; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.onb-step {
  display: flex; align-items: flex-start; gap: 10px;
  background: white; border: 1px solid rgba(140, 98, 57, 0.1);
  border-radius: 12px; padding: 14px 16px;
}
.onb-step-n {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 7px;
  background: rgba(140, 98, 57, 0.1); color: var(--accent, #8C6239);
  font-size: 0.78rem; font-weight: 800;
}
.onb-step-t {
  font-size: 0.86rem; font-weight: 800; letter-spacing: -0.015em;
  color: var(--text-main, #2A2421); margin: 0 0 3px;
}
.onb-step-d {
  font-size: 0.76rem; line-height: 1.5;
  color: var(--text-muted, #6F665F); margin: 0;
}

.onb-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.onb-cta {
  display: inline-flex; align-items: center;
  padding: 12px 22px; border-radius: 9999px;
  background: var(--accent, #8C6239); color: white; border: none;
  font-family: inherit; font-size: 0.84rem; font-weight: 800;
  cursor: pointer; transition: all .2s cubic-bezier(.16,1,.3,1);
  box-shadow: 0 8px 20px -8px rgba(140, 98, 57, 0.4);
}
.onb-cta:hover { background: #6E4E2E; transform: translateY(-2px); }
.onb-ghost {
  display: inline-flex; align-items: center;
  padding: 12px 18px; border-radius: 9999px;
  background: white; color: var(--accent, #8C6239);
  border: 1.5px solid rgba(140, 98, 57, 0.25);
  font-family: inherit; font-size: 0.82rem; font-weight: 700;
  cursor: pointer; transition: all .15s;
}
.onb-ghost:hover { background: rgba(140, 98, 57, 0.08); }
.onb-ghost .mr-1 { margin-right: 5px; }

@media (max-width: 600px) {
  .onb-card { padding: 20px 18px; }
  .onb-cta, .onb-ghost { width: 100%; justify-content: center; }
}
</style>
