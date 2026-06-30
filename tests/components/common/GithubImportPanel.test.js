/**
 * GithubImportPanel.vue — 컴포넌트 mount 테스트.
 *
 * [범위]
 * 1) URL 사전 검증 (GITHUB_URL_RE) — 빨간 inline 에러
 * 2) 프로젝트 이름 50자 제한
 * 3) canSubmit gate — 둘 다 유효해야 submit 가능
 * 4) submit 성공 — axios.post + jobs.startJob 호출 + emit('started')
 * 5) submit 실패 (409 ownership conflict) — errorMsg 표시 + startJob 호출 안 됨
 * 6) submit 실패 (422 GITHUB_REPO_NOT_FOUND) — detail.message 표시
 * 7) cancel — emit('cancel') + 입력 초기화
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({ components, directives })

const mocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  axiosPost: vi.fn(async () => ({ data: { task_id: 't-xyz' } })),
  startJob: vi.fn(),
  routerPush: vi.fn(() => ({ catch: () => {} })),
  setProjectName: vi.fn(),
}))

vi.mock('@/utils/axios', () => ({
  default: { post: mocks.axiosPost },
}))

vi.mock('@/composables/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showWarning: mocks.showWarning,
  }),
}))

vi.mock('@/store/jobs', () => ({
  useJobsStore: () => ({ startJob: mocks.startJob }),
}))

vi.mock('@/store/harness', () => ({
  API_BASE: 'http://test',
  useHarnessStore: () => ({ setProjectName: mocks.setProjectName }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

import GithubImportPanel from '@/components/common/GithubImportPanel.vue'
import i18n from '@/plugins/i18n'

const mountPanel = () => mount(GithubImportPanel, {
  global: { plugins: [vuetify] },
})

beforeEach(() => {
  i18n.global.locale.value = 'ko'
  Object.values(mocks).forEach(fn => fn.mockClear?.())
  mocks.axiosPost.mockImplementation(async () => ({ data: { task_id: 't-xyz' } }))
})


describe('GithubImportPanel — URL 사전 검증', () => {
  it('잘못된 URL → inline 에러 표시 + canSubmit false', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const vm = wrapper.vm
    vm.projectName = 'my-app'
    vm.githubUrl = 'not-a-url'
    await flushPromises()

    expect(vm.urlError).toContain('올바른 GitHub URL')
    expect(vm.canSubmit).toBe(false)
  })

  it('정상 URL (https://github.com/owner/repo) → 에러 없음, canSubmit true', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const vm = wrapper.vm
    vm.projectName = 'my-app'
    vm.githubUrl = 'https://github.com/myuser/my-repo'
    await flushPromises()

    expect(vm.urlError).toBe('')
    expect(vm.canSubmit).toBe(true)
  })

  it('git@github.com:owner/repo.git 형식도 허용', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const vm = wrapper.vm
    vm.projectName = 'my-app'
    vm.githubUrl = 'git@github.com:myuser/my-repo.git'
    await flushPromises()

    expect(vm.urlError).toBe('')
    expect(vm.canSubmit).toBe(true)
  })

  it('정상 URL + .git 접미사 허용', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const vm = wrapper.vm
    vm.projectName = 'my-app'
    vm.githubUrl = 'https://github.com/u/r.git'
    await flushPromises()

    expect(vm.urlError).toBe('')
  })

  it('빈 URL 은 inline 에러 안 표시 (placeholder 상태)', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'x'
    vm.githubUrl = ''
    await flushPromises()
    expect(vm.urlError).toBe('')
  })
})


describe('GithubImportPanel — 프로젝트 이름 검증', () => {
  it('50자 초과 시 에러', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'a'.repeat(51)
    vm.githubUrl = 'https://github.com/u/r'
    await flushPromises()
    expect(vm.projectNameError).toContain('50자')
    expect(vm.canSubmit).toBe(false)
  })
})


describe('GithubImportPanel — submit 성공 흐름', () => {
  it('axios.post 호출 + jobs.startJob 호출 + emit(started)', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const vm = wrapper.vm
    vm.projectName = 'my-app'
    vm.githubUrl = 'https://github.com/myuser/my-repo'
    await flushPromises()

    await vm.submit()
    await flushPromises()

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/pipelines/onboard_from_github'),
      expect.objectContaining({
        project_name: 'my-app',
        github_url: 'https://github.com/myuser/my-repo',
      }),
    )
    expect(mocks.startJob).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 't-xyz',
        kind: 'githubOnboard',
        projectName: 'my-app',
      }),
    )
    expect(wrapper.emitted('started')).toBeTruthy()
    expect(wrapper.emitted('started')[0][0]).toEqual({
      taskId: 't-xyz', projectName: 'my-app',
    })
    // 폼 초기화
    expect(vm.projectName).toBe('')
    expect(vm.githubUrl).toBe('')
  })

  it('onComplete 콜백 → store.setProjectName + router.push(/plan)', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'app'
    vm.githubUrl = 'https://github.com/u/r'
    await flushPromises()
    await vm.submit()
    await flushPromises()

    const onComplete = mocks.startJob.mock.calls[0][0].onComplete
    onComplete({ result: { v1_markdown_size: 1234 } })

    expect(mocks.setProjectName).toHaveBeenCalledWith('app')
    expect(mocks.routerPush).toHaveBeenCalledWith('/plan')
    expect(mocks.showSuccess).toHaveBeenCalledWith(
      expect.stringContaining('app'),
      expect.any(Object),
    )
  })
})


describe('GithubImportPanel — submit 실패 처리', () => {
  it('409 ownership conflict → 인라인 에러 + startJob 미호출', async () => {
    mocks.axiosPost.mockImplementation(async () => {
      const err = new Error('Conflict')
      err.response = {
        status: 409,
        data: { detail: '이미 다른 사용자가 사용 중인 이름입니다.' },
      }
      throw err
    })

    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'taken-name'
    vm.githubUrl = 'https://github.com/u/r'
    await flushPromises()
    await vm.submit()
    await flushPromises()

    expect(vm.errorMsg).toContain('다른 사용자')
    expect(mocks.startJob).not.toHaveBeenCalled()
  })

  it('422 GITHUB_REPO_NOT_FOUND → detail.message 표시', async () => {
    mocks.axiosPost.mockImplementation(async () => {
      const err = new Error('UR2')
      err.response = {
        status: 422,
        data: {
          detail: {
            code: 'GITHUB_REPO_NOT_FOUND',
            message: 'GitHub 저장소를 찾을 수 없습니다.',
          },
        },
      }
      throw err
    })

    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'x'
    vm.githubUrl = 'https://github.com/ghost/repo'
    await flushPromises()
    await vm.submit()
    await flushPromises()

    expect(vm.errorMsg).toContain('찾을 수 없')
  })

  it('422 GITHUB_REPO_PRIVATE_NEEDS_AUTH → 사용자 친화 메시지', async () => {
    mocks.axiosPost.mockImplementation(async () => {
      const err = new Error('private')
      err.response = {
        status: 422,
        data: {
          detail: {
            code: 'GITHUB_REPO_PRIVATE_NEEDS_AUTH',
            message: 'GitHub 계정 연결이 필요합니다.',
          },
        },
      }
      throw err
    })

    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'private-app'
    vm.githubUrl = 'https://github.com/me/secret'
    await flushPromises()
    await vm.submit()
    await flushPromises()

    expect(vm.errorMsg).toContain('GitHub 계정 연결')
  })
})


describe('GithubImportPanel — cancel', () => {
  it('cancel 클릭 → emit(cancel) + 폼 초기화', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm
    vm.projectName = 'temp'
    vm.githubUrl = 'https://github.com/u/r'
    vm.errorMsg = 'some error'
    vm.cancel()
    await flushPromises()

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(vm.projectName).toBe('')
    expect(vm.githubUrl).toBe('')
    expect(vm.errorMsg).toBe('')
  })
})
