import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/axios', () => ({ default: { post: vi.fn() } }))
vi.mock('@/store/harness', () => ({ API_BASE: '/api/gateway' }))

import axios from '@/utils/axios'
import { useSkillImprove } from '@/composables/useSkillImprove'

describe('useSkillImprove', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('result 래퍼(data.result)를 매핑한다', async () => {
    axios.post.mockResolvedValue({ data: { result: {
      improved: true, name: 'React 컴포넌트 규칙', scope: 'Frontend',
      trigger_condition: 'React 작성 시', instructions: ['a', 'b'], explanation: '구체화함',
    } } })
    const { improve, result } = useSkillImprove()
    const r = await improve({ name: 'Rule 1', instructions: ['대충'] })
    expect(r.improved).toBe(true)
    expect(r.name).toBe('React 컴포넌트 규칙')
    expect(r.instructions).toEqual(['a', 'b'])
    expect(result.value.explanation).toBe('구체화함')
  })

  it('result 래퍼가 없는 응답(data 직접)도 처리한다', async () => {
    axios.post.mockResolvedValue({ data: {
      improved: false, name: 'x', scope: '', trigger_condition: '', instructions: [], explanation: '',
    } })
    const { improve } = useSkillImprove()
    const r = await improve({ name: 'x' })
    expect(r.improved).toBe(false)
  })

  it('빈/공백 지시사항은 전송 전에 거른다', async () => {
    axios.post.mockResolvedValue({ data: { result: { improved: true, name: 'a', instructions: ['a'] } } })
    const { improve } = useSkillImprove()
    await improve({ name: 'x', instructions: ['valid', '', '   '] })
    expect(axios.post).toHaveBeenCalledWith(
      '/api/gateway/improveSkill',
      expect.objectContaining({ instructions: ['valid'] }),
    )
  })

  it('실패 시 null 반환 + error 설정', async () => {
    axios.post.mockRejectedValue({ message: 'boom' })
    const { improve, error, result } = useSkillImprove()
    const r = await improve({ name: 'x' })
    expect(r).toBeNull()
    expect(error.value).toBeTruthy()
    expect(result.value).toBeNull()
  })

  it('reset 은 result/error 를 비운다', async () => {
    axios.post.mockResolvedValue({ data: { result: { improved: true, name: 'a', instructions: ['a'] } } })
    const { improve, reset, result } = useSkillImprove()
    await improve({ name: 'x' })
    expect(result.value).not.toBeNull()
    reset()
    expect(result.value).toBeNull()
  })
})
