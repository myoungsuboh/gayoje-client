/**
 * 전역 Confirm 다이얼로그 — Promise 기반.
 *
 * 사용:
 *   import { useConfirm } from '@/composables/useConfirm'
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: '삭제', message: '정말 삭제할까요?', variant: 'danger' })
 *   if (ok) { ... }
 *
 * 단일 다이얼로그 인스턴스를 App.vue에 마운트해 모든 호출이 공유.
 * window.confirm 대체 — 디자인 통일 + 모바일 UX 개선.
 */
import { reactive } from 'vue'

const state = reactive({
  show: false,
  title: '',
  message: '',
  confirmText: '확인',
  cancelText: '취소',
  variant: 'default', // 'default' | 'danger'
  resolver: null,
})

const open = (options) => {
  return new Promise((resolve) => {
    state.title = options.title || '확인'
    state.message = options.message || ''
    state.confirmText = options.confirmText || '확인'
    state.cancelText = options.cancelText || '취소'
    state.variant = options.variant || 'default'
    state.resolver = resolve
    state.show = true
  })
}

const accept = () => {
  state.show = false
  if (state.resolver) {
    state.resolver(true)
    state.resolver = null
  }
}

const reject = () => {
  state.show = false
  if (state.resolver) {
    state.resolver(false)
    state.resolver = null
  }
}

export const useConfirm = () => open
export const useConfirmState = () => ({ state, accept, reject })
