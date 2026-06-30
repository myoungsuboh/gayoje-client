import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko/index.js'
import en from '@/locales/en/index.js'
import zh from '@/locales/zh/index.js'
import ja from '@/locales/ja/index.js'

// 메시지 번들이 실제로 존재하는 로케일만 노출.
export const SUPPORTED_LOCALES = ['ko', 'en', 'zh', 'ja']
export const DEFAULT_LOCALE = 'ko'
export const LOCALE_STORAGE_KEY = 'harness_locale'

function detectLocale() {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored

  const browser = navigator.language?.split('-')[0]
  if (browser && SUPPORTED_LOCALES.includes(browser)) return browser

  return DEFAULT_LOCALE
}

const initialLocale = detectLocale()
// index.html 에 lang="en" 하드코딩 → 실제 감지된 언어로 즉시 교정
document.documentElement.lang = initialLocale

const i18n = createI18n({
  legacy: false,
  globalInjection: true,   // $t() 를 모든 컴포넌트 템플릿에서 사용 가능
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ko, en, zh, ja },
  // missing key → 조용히 fallback (한국어 기본값), 콘솔 경고 억제
  missing: () => {},
})

export default i18n
