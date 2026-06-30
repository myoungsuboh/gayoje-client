import { reactive } from 'vue'

// 글로벌 Snackbar 상태 (App.vue에서 단일 v-snackbar로 렌더)
const state = reactive({
  show: false,
  message: '',
  color: 'info', // 'success' | 'error' | 'warning' | 'info'
  timeout: 3000,
  actionLabel: null, // 액션 버튼 라벨 (예: '재시도'). null이면 액션 없음
  actionHandler: null, // 클릭 시 실행될 함수
})

const showSnackbar = (message, options = {}) => {
  state.message = message
  state.color = options.color || 'info'
  state.timeout = options.timeout ?? 3000
  state.actionLabel = options.actionLabel || null
  state.actionHandler = options.actionHandler || null
  state.show = true
}

const showSuccess = (message, options = {}) =>
  showSnackbar(message, { ...options, color: 'success' })
const showError = (message, options = {}) =>
  showSnackbar(message, { ...options, color: 'error', timeout: options.timeout ?? 5000 })
const showWarning = (message, options = {}) =>
  showSnackbar(message, { ...options, color: 'warning' })
const showInfo = (message, options = {}) =>
  showSnackbar(message, { ...options, color: 'info' })

/**
 * 에러 + 재시도 액션을 한 번에. 토스트에 [재시도] 버튼 슬롯이 자동 추가됨.
 * @param {string} message
 * @param {() => void | Promise<void>} retryFn
 * @param {object} options
 */
const showErrorWithRetry = (message, retryFn, options = {}) =>
  showSnackbar(message, {
    color: 'error',
    timeout: options.timeout ?? 8000,
    actionLabel: options.actionLabel || '재시도',
    actionHandler: retryFn,
  })

const triggerAction = () => {
  const handler = state.actionHandler
  state.show = false
  if (typeof handler === 'function') handler()
}

export const useSnackbar = () => ({
  state,
  showSnackbar,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showErrorWithRetry,
  triggerAction,
})
