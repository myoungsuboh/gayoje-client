<script setup>
/**
 * GithubImportPanel — GitHub repo URL → AI 가 코드 분석 → V1 자동 생성.
 *
 * [용도 — 2026-05-26 Vibe Coding entry Phase 1]
 * 회의록 없이 시스템에 첫 진입하려는 Vibe Coding 사용자 (Cursor / Claude Code /
 * Cline 등) 를 위해 GitHub URL 한 줄로 V1 markdown 생성. 기존 NewProjectModal /
 * MyProjectsModal 의 "+ 새 프로젝트" 인라인 폼 옆에 탭으로 노출.
 *
 * [흐름]
 *   1. 사용자가 이름 + GitHub URL 입력 → "분석 시작" 클릭
 *   2. POST /api/v2/pipelines/onboard_from_github → task_id
 *   3. jobsStore.startJob — 백그라운드 폴링 시작 (3초 간격, 30분 한계)
 *   4. 완료 시: store.setProjectName + router.push('/plan') + 토스트
 *
 * [실패 모드]
 * - 같은 사용자가 동일 project_name 보유 (409) → 토스트 + 다른 이름 유도
 * - GitHub 404 / private OAuth 미연결 → 422 + 친화적 안내 (프로필 GitHub 연결 링크)
 * - URL 형식 위반 → 422 + 인라인 에러 (regex 도 사전 검증)
 * - LLM 환각 (V1 너무 짧음) → 폴링 결과 onError → 토스트 + 재시도 유도
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Github, AlertCircle, Loader2, ArrowRight, X } from 'lucide-vue-next'

import axios from '@/utils/axios'
import { useHarnessStore } from '@/store/harness'
import { extractTaskId } from '@/utils/asyncJob'
import { useJobsStore } from '@/store/jobs'
import { useSnackbar } from '@/composables/useSnackbar'

const { t } = useI18n()
const router = useRouter()
const store = useHarnessStore()
const jobs = useJobsStore()
const { showSuccess, showError, showWarning } = useSnackbar() ?? {}

const emit = defineEmits([
  'cancel',  // 사용자가 X 또는 취소 누르면 — 부모 모달이 폼 closed.
  'started', // submit 성공 (task_id 받음) — 부모가 모달 닫고 싶을 때.
])

// ─── 입력 ─────────────────────────────────────────
const projectName = ref('')
const githubUrl = ref('')
const submitting = ref(false)
const errorMsg = ref('')

// GitHub URL 형식 — owner/repo (.git 선택). 클라이언트 사전 검증으로 BE 422 회피.
// `git@github.com:owner/repo.git` 형식도 허용 (BE 의 _GITHUB_URL_RE 와 동일 패턴).
const GITHUB_URL_RE = /github\.com[/:]([^/?#\s]+)\/([^/?#\s]+?)(?:\.git)?\/?(?:[?#].*)?$/i

const urlError = computed(() => {
  const v = githubUrl.value.trim()
  if (!v) return ''
  if (!GITHUB_URL_RE.test(v)) {
    return t('plan.github.url_invalid')
  }
  return ''
})

const projectNameError = computed(() => {
  const v = projectName.value.trim()
  if (!v) return ''
  if (v.length > 50) return t('plan.github.name_too_long')
  return ''
})

const canSubmit = computed(() =>
  !submitting.value
  && projectName.value.trim().length >= 1
  && !projectNameError.value
  && githubUrl.value.trim().length >= 1
  && !urlError.value,
)

// ─── 제출 ─────────────────────────────────────────

const submit = async () => {
  if (!canSubmit.value) return
  errorMsg.value = ''
  submitting.value = true
  const name = projectName.value.trim()
  const url = githubUrl.value.trim()

  try {
    // v2 라우트는 axios baseURL (VITE_API_BASE_URL) 로 직접 호출 — /api/gateway 는
    // gateway compat dispatcher 전용이라 /api/v2/* 에 붙이면 이중 prefix 로 거부됨.
    // (PrdTab / CpsTab 등 다른 v2 호출과 동일 패턴.)
    const base = import.meta.env.VITE_API_BASE_URL ?? ''
    const { data } = await axios.post(`${base}/api/v2/pipelines/onboard_from_github`, {
      project_name: name,
      github_url: url,
    })
    const taskId = extractTaskId(data) || data?.task_id
    if (!taskId) {
      throw new Error(t('plan.github.empty_response'))
    }

    // 백그라운드 폴링 — 페이지 떠나도 계속 동작.
    jobs.startJob({
      taskId,
      label: t('plan.github.job_label', { name }),
      projectName: name,
      kind: 'githubOnboard',
      onComplete: (finalInfo) => {
        const result = finalInfo?.result || {}
        const reductionInfo = result.v1_markdown_size
          ? t('plan.github.complete_reduction', { chars: result.v1_markdown_size.toLocaleString() })
          : ''
        showSuccess?.(
          t('plan.github.complete_toast', { name, reduction: reductionInfo }),
          { timeout: 7000 },
        )
        // store.projectName 설정 + plan 페이지로 이동.
        store.setProjectName(name)
        router.push('/plan').catch(() => {})
      },
      onError: (err) => {
        const msg = String(err?.message || err || t('plan.github.unknown_error'))
        showError?.(t('plan.github.job_fail', { msg }))
      },
    })

    // 부모 모달 닫기 신호 — 사용자는 토스트로 진행 상황 인지.
    showWarning?.(
      t('plan.github.started_toast', { name }),
      { timeout: 6000 },
    )
    emit('started', { taskId, projectName: name })
    // 폼 초기화
    projectName.value = ''
    githubUrl.value = ''
  } catch (err) {
    // BE 가 422 detail.code 로 분기 안내 (INVALID_GITHUB_URL / GITHUB_REPO_NOT_FOUND /
    // GITHUB_REPO_PRIVATE_NEEDS_AUTH). 409 는 ownership conflict.
    const status = err?.response?.status
    const detail = err?.response?.data?.detail
    if (status === 409) {
      const msg = typeof detail === 'string' ? detail : t('plan.github.err_name_taken')
      errorMsg.value = msg
    } else if (status === 422 && detail && typeof detail === 'object' && detail.code) {
      errorMsg.value = detail.message || t('plan.github.err_invalid_input')
    } else if (status === 402) {
      // quota 초과는 글로벌 UpgradePromptDialog 가 자동 노출 (axios interceptor) — 별도 처리 X.
      errorMsg.value = t('plan.github.err_quota')
    } else {
      errorMsg.value =
        err?.response?.data?.detail
        || err?.message
        || t('plan.github.err_request_fail')
    }
  } finally {
    submitting.value = false
  }
}

const cancel = () => {
  projectName.value = ''
  githubUrl.value = ''
  errorMsg.value = ''
  emit('cancel')
}
</script>

<template>
  <div class="gh-panel">
    <p class="gh-intro">
      <Github :size="13" class="mr-1" />
      {{ $t('plan.github.intro') }}
      <span class="gh-eta">{{ $t('plan.github.eta') }}</span>
    </p>

    <div class="gh-field">
      <label class="gh-label">{{ $t('plan.github.label_project_name') }}</label>
      <input
        v-model="projectName"
        type="text"
        class="gh-input"
        :placeholder="$t('plan.github.name_placeholder')"
        maxlength="50"
        :disabled="submitting"
      />
      <p v-if="projectNameError" class="gh-input-error">
        <AlertCircle :size="11" class="mr-1" />{{ projectNameError }}
      </p>
    </div>

    <div class="gh-field">
      <label class="gh-label">{{ $t('plan.github.label_repo_url') }}</label>
      <input
        v-model="githubUrl"
        type="text"
        class="gh-input"
        placeholder="https://github.com/owner/repo"
        :disabled="submitting"
        @keydown.enter="canSubmit && submit()"
      />
      <p v-if="urlError" class="gh-input-error">
        <AlertCircle :size="11" class="mr-1" />{{ urlError }}
      </p>
    </div>

    <p v-if="errorMsg" class="gh-server-error">
      <AlertCircle :size="12" class="mr-1" />{{ errorMsg }}
    </p>

    <div class="gh-actions">
      <button class="gh-submit" :disabled="!canSubmit" @click="submit" type="button">
        <Loader2 v-if="submitting" :size="13" class="mr-1 spin" />
        <ArrowRight v-else :size="13" class="mr-1" />
        {{ submitting ? $t('plan.github.submitting') : $t('plan.github.submit') }}
      </button>
      <button class="gh-cancel" @click="cancel" type="button" :disabled="submitting">
        <X :size="13" class="mr-1" />
        {{ $t('plan.github.cancel') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.gh-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  margin-bottom: 12px;
}

.gh-intro {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted, #6F665F);
  line-height: 1.5;
  gap: 4px;
}
.gh-eta {
  margin-left: 6px;
  padding: 1px 7px;
  background: #E5E7EB;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #4B5563;
}

.gh-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gh-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted, #6F665F);
}
.gh-input {
  border: 1.5px solid #E5E7EB;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.85rem;
  font-family: inherit;
  background: white;
  outline: none;
}
.gh-input:focus {
  border-color: var(--accent, #8C6239);
}
.gh-input:disabled {
  opacity: 0.6;
  background: #F3F4F6;
}
.gh-input-error {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  color: #C53030;
  margin: 0;
}
.gh-server-error {
  display: inline-flex;
  align-items: center;
  font-size: 0.74rem;
  color: #C53030;
  background: #FEF2F2;
  border-radius: 6px;
  padding: 6px 10px;
  margin: 0;
  line-height: 1.4;
}

.gh-actions {
  display: flex;
  gap: 6px;
}
.gh-submit, .gh-cancel {
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.gh-submit {
  background: var(--accent, #8C6239);
  color: white;
  flex: 1;
  justify-content: center;
}
.gh-submit:hover:not(:disabled) {
  transform: translateY(-1px);
}
.gh-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.gh-cancel {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
}
.gh-cancel:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
}
.gh-cancel:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .gh-panel {
    padding: 10px;
  }
  .gh-actions {
    flex-direction: column;
  }
  .gh-cancel {
    justify-content: center;
  }
}
</style>
