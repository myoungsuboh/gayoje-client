import { createApp } from 'vue'
import App from './App.vue'
import { registerPlugins } from '@/plugins'
import router from '@/plugins/router'
import { startVitals } from '@/utils/webVitals'
import { installCrossTabSync } from '@/utils/crossTabSync'
import { enforceUserDataIsolationSync } from '@/utils/userIsolation'

// [2026-05 보안] pinia store 가 localStorage 에서 hydrate 되기 *전에* 동기로
// 사용자 데이터 격리. 공용 PC 에서 사용자 전환 후 reload 시 이전 사용자의
// projectName/배치작업이 잠깐 노출되던 race 를 원천 차단한다. (router guard 도
// 매 navigation 마다 재확인 — 이중 안전.)
enforceUserDataIsolationSync()

const app = createApp(App)
registerPlugins(app)

// 멀티탭 sync — 한 탭의 로그아웃/사용자 전환을 다른 탭에 전파.
installCrossTabSync(router)

// router.isReady() 가 resolve 될 때까지 mount 지연 →
// 첫 진입 시 beforeEach 의 token 체크 + redirect 가 완료된 *후* 첫 렌더.
// 결과: 토큰 없는 사용자가 /plan 으로 잘못 진입했을 때 dashboard chrome 이
//       잠깐 보였다가 /login 으로 튕기던 "깜빡임" 제거.
router.isReady().then(() => {
  app.mount('#app')
  // Web Vitals 측정 — mount 직후, 첫 페인트 측정 위해
  startVitals()
})
