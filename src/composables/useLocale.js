import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, LOCALE_STORAGE_KEY } from '@/plugins/i18n'
import { updateMeApi } from '@/utils/auth'

const LOCALE_LABELS = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
}

export function useLocale() {
  const { locale } = useI18n()

  const currentLocale = computed(() => locale.value)

  const localeOptions = SUPPORTED_LOCALES.map((code) => ({
    code,
    label: LOCALE_LABELS[code] ?? code,
  }))

  async function setLocale(newLocale, { syncProfile = true } = {}) {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return
    locale.value = newLocale
    document.documentElement.lang = newLocale
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
    if (syncProfile) {
      // updateMeApi 는 내부에서 try/catch 하므로 throw 하지 않음 — await 만 하면 됨
      await updateMeApi({ locale: newLocale })
    }
  }

  // 로그인 후 BE 프로필에 저장된 locale 을 반영 (로컬 우선)
  function syncFromProfile(user) {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored) return // 로컬 설정이 있으면 우선
    const profileLocale = user?.locale
    if (profileLocale && SUPPORTED_LOCALES.includes(profileLocale)) {
      locale.value = profileLocale
      document.documentElement.lang = profileLocale
      // localStorage 에도 저장 — 없으면 다음 새로고침 시 detectLocale() 이 되돌림
      localStorage.setItem(LOCALE_STORAGE_KEY, profileLocale)
    }
  }

  return { currentLocale, localeOptions, setLocale, syncFromProfile }
}
