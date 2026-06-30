/**
 * vitest global setup — 모든 컴포넌트 테스트에 공통 플러그인 주입.
 * vitest.config.js → test.setupFiles 로 등록.
 */
import { config } from '@vue/test-utils'
import i18n from '@/plugins/i18n'

config.global.plugins = [
  ...(config.global.plugins || []),
  i18n,
]

// jsdom 엔 visualViewport 가 없음 — VMenu/VOverlay 의 location strategy 가
// 참조하므로 stub (HistorySidebar 의 ⋯ 보조 액션 메뉴 등).
if (typeof globalThis.visualViewport === 'undefined') {
  globalThis.visualViewport = {
    width: 1280,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true },
  }
}
