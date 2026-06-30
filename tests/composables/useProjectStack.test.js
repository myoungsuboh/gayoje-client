import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({ default: { get: vi.fn() } }))
vi.mock('@/store/harness', () => ({ API_BASE: '/api/gateway' }))

import axios from '@/utils/axios'
import { useProjectStack } from '@/composables/useProjectStack'

describe('useProjectStack', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('services/databases 의 tech_stack 을 모아 중복 제거 (평탄/중첩 모두)', async () => {
    axios.get.mockResolvedValue({ data: { result: {
      services: [
        { tech_stack: 'Vue.js' },
        { properties: { tech_stack: 'Spring Boot' } },  // 중첩
        { tech_stack: 'Vue.js' },                        // 중복
      ],
      databases: [{ tech_stack: 'PostgreSQL' }],
    } } })
    const { techStack, hasArchitecture, fetchStack } = useProjectStack()
    await fetchStack('proj')
    expect(techStack.value).toEqual(['Vue.js', 'Spring Boot', 'PostgreSQL'])
    expect(hasArchitecture.value).toBe(true)
  })

  it('result 가 배열로 감싸진 응답도 처리', async () => {
    axios.get.mockResolvedValue({ data: { result: [{ services: [{ tech_stack: 'React' }], databases: [] }] } })
    const { techStack, fetchStack } = useProjectStack()
    await fetchStack('proj')
    expect(techStack.value).toEqual(['React'])
  })

  it('빈 projectName 이면 호출 안 함', async () => {
    const { fetchStack } = useProjectStack()
    await fetchStack('')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('architecture 는 있는데 tech_stack 미설정이면 hasArchitecture=true, techStack 빈 배열', async () => {
    axios.get.mockResolvedValue({ data: { result: { services: [{ name: 'svc' }], databases: [] } } })
    const { techStack, hasArchitecture, fetchStack } = useProjectStack()
    await fetchStack('proj')
    expect(techStack.value).toEqual([])
    expect(hasArchitecture.value).toBe(true)
  })

  it('에러 시 조용히 빈 상태 유지', async () => {
    axios.get.mockRejectedValue(new Error('boom'))
    const { techStack, hasArchitecture, fetchStack } = useProjectStack()
    await fetchStack('proj')
    expect(techStack.value).toEqual([])
    expect(hasArchitecture.value).toBe(false)
  })
})
