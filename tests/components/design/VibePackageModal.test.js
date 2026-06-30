/**
 * VibePackageModal — 바이브 코딩 시작 패키지 모달 (2026-06-13 ArchitectureTab 에서 분리).
 *
 * 핵심 가드:
 * - 페이지 레벨 컴포넌트로 어느 서브탭에서든 v-model 만으로 열림 (탭 전환 불필요)
 * - 열릴 때 스킬 확인 + 설계 존재 확인 — 설계 없으면 안내 + 다운로드 비활성
 * - 설계 있으면 다운로드 버튼 활성
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// axios mock — getAllSkill(스킬 확인) / getArchitecture(설계 존재) / eval-score
const axiosGet = vi.hoisted(() => vi.fn())
vi.mock('@/utils/axios', () => ({
  default: { get: axiosGet, post: vi.fn() },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({ showError: vi.fn(), showWarning: vi.fn() }),
}))

// useEvalScore — 모달 내 완성도 경고용. 네트워크 없이 고정값.
vi.mock('@/composables/useEvalScore', () => ({
  useEvalScore: () => ({ score: { value: null }, loading: { value: false } }),
}))

import VibePackageModal from '@/components/design/VibePackageModal.vue'
import { useProjectStore } from '@/store/project'
import i18n from '@/plugins/i18n'

// 컴포넌트와 같은 pinia 인스턴스 공유 — 테스트에서 projectName 주입용.
let pinia

const mountOpts = () => ({
  global: {
    plugins: [pinia, i18n],
    stubs: {
      VDialog: {
        name: 'VDialog',
        props: ['modelValue'],
        template: '<div class="v-dialog-stub" v-if="modelValue"><slot/></div>',
      },
      VOverlay: { name: 'VOverlay', props: ['modelValue'], template: '<div v-if="modelValue"><slot/></div>' },
      VBtn: { name: 'VBtn', props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot/></button>' },
      VProgressCircular: { name: 'VProgressCircular', template: '<span/>' },
      VibeNextStepsModal: true,
    },
  },
})

const skillRes = { data: { result: [] } }
// getArchitecture 응답 — extractRaw 가 result[0] 을 읽는 배열 포장 형태.
const archFull = { data: { result: [{ services: [{ id: 'SVC-01' }], databases: [] }] } }
const archEmpty = { data: { result: [{ services: [], databases: [] }] } }

function wireAxios({ arch = archFull } = {}) {
  axiosGet.mockImplementation((url) => {
    if (url.includes('getAllSkill')) return Promise.resolve(skillRes)
    if (url.includes('getArchitecture')) return Promise.resolve(arch)
    return Promise.resolve({ data: {} })
  })
}

describe('VibePackageModal', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    axiosGet.mockReset()
    i18n.global.locale.value = 'ko'
  })

  it('v-model=true 면 모달 렌더 + 다운로드 버튼 활성 (설계 존재)', async () => {
    wireAxios()
    const w = mount(VibePackageModal, { props: { modelValue: false }, ...mountOpts() })
    useProjectStore().setProjectName('proj-x')
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(w.find('.vibe-modal').exists()).toBe(true)
    const dlBtn = w.find('.vibe-dl-btn')
    expect(dlBtn.exists()).toBe(true)
    expect(dlBtn.attributes('disabled')).toBeUndefined()
    // 설계 없음 안내는 미표시
    expect(w.text()).not.toContain('설계가 아직 없어요')
  })

  it('설계 미생성이면 안내 표시 + 다운로드 비활성', async () => {
    wireAxios({ arch: archEmpty })
    const w = mount(VibePackageModal, { props: { modelValue: false }, ...mountOpts() })
    useProjectStore().setProjectName('proj-x')
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(w.text()).toContain('설계가 아직 없어요')
    expect(w.find('.vibe-dl-btn').attributes('disabled')).toBeDefined()
  })

  it('닫힘 상태에선 아무것도 렌더하지 않고 API 호출도 없다', async () => {
    wireAxios()
    const w = mount(VibePackageModal, { props: { modelValue: false }, ...mountOpts() })
    await flushPromises()
    expect(w.find('.vibe-modal').exists()).toBe(false)
    expect(axiosGet).not.toHaveBeenCalled()
  })

  it('X 닫기 → update:modelValue(false) emit', async () => {
    wireAxios()
    const w = mount(VibePackageModal, { props: { modelValue: true }, ...mountOpts() })
    useProjectStore().setProjectName('proj-x')
    await flushPromises()
    await w.find('.modal-close-btn').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
