/**
 * useNotionExport — 진입 버튼들이 공유하는 게이팅 + 다이얼로그 상태.
 *
 * open(docs) 호출 시 Notion 연동 여부를 확인하고, 연동돼 있으면 export 다이얼로그를
 * 열고, 미연동이면 안내 토스트 + 프로필(연동 페이지)로 이동.
 * 페이지는 반환된 dialogOpen/docs 로 <NotionExportDialog> 를 마운트한다.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { fetchNotionStatusApi } from '@/utils/auth'
import { useSnackbar } from '@/composables/useSnackbar'

const ALL_DOCS = ['cps', 'prd', 'design']

export function useNotionExport() {
  const { t } = useI18n()
  const router = useRouter()
  const { showError } = useSnackbar()

  const dialogOpen = ref(false)
  const docs = ref([...ALL_DOCS])
  const checking = ref(false)

  /** @param {Array<'cps'|'prd'|'design'>} which 공유할 문서 (기본 전체) */
  const open = async (which = ALL_DOCS) => {
    if (checking.value) return
    checking.value = true
    const r = await fetchNotionStatusApi()
    checking.value = false
    if (r.success && r.status?.linked) {
      docs.value = Array.isArray(which) && which.length ? which : [...ALL_DOCS]
      dialogOpen.value = true
    } else {
      // 미연동 → 안내 + 프로필 연동 페이지로 유도
      showError(t('plan.notion.err_not_linked'))
      router.push('/profile')
    }
  }

  return { dialogOpen, docs, checking, open }
}
