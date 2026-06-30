/**
 * useSkillImprove — 'AI 로 다듬기' (improveSkill) API 호출 컴포저블.
 *
 * 사용자가 대충 적은 규칙 초안을 BE 가 구체적 규칙으로 다듬어 반환한다.
 * FE 는 /api/gateway/{action} dispatcher 로 호출 → action = improveSkill.
 * 결과는 SkillImproveDialog 가 before/after 로 보여주고, 사용자가 '적용'하면
 * 호출한 컴포넌트가 폼에 반영한다 (이 컴포저블은 호출 + 상태만 소유).
 */
import { ref } from 'vue'
import axios from '@/utils/axios'
import { API_BASE } from '@/store/harness'

export function useSkillImprove() {
  const isImproving = ref(false)
  const result = ref(null)   // { improved, name, scope, trigger_condition, instructions, explanation }
  const error = ref('')

  async function improve(draft) {
    isImproving.value = true
    error.value = ''
    result.value = null
    try {
      const res = await axios.post(`${API_BASE}/improveSkill`, {
        name: (draft?.name || '').trim(),
        scope: draft?.scope || '',
        trigger_condition: draft?.trigger_condition || '',
        instructions: Array.isArray(draft?.instructions)
          ? draft.instructions.filter(i => (i || '').trim())
          : [],
        tags: Array.isArray(draft?.tags) ? draft.tags : [],
      })
      const raw = res?.data?.result ?? res?.data ?? {}
      result.value = {
        improved: !!raw.improved,
        name: raw.name || '',
        scope: raw.scope || '',
        trigger_condition: raw.trigger_condition || '',
        instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
        explanation: raw.explanation || '',
      }
      return result.value
    } catch (e) {
      console.error('improveSkill 오류:', e)
      error.value = e?.response?.data?.message || e.message || ''
      return null
    } finally {
      isImproving.value = false
    }
  }

  function reset() {
    result.value = null
    error.value = ''
  }

  return { isImproving, result, error, improve, reset }
}
