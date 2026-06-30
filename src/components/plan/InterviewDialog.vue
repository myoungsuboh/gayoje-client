<script setup>
/**
 * InterviewDialog.vue — 회의록 없는 사용자를 위한 AI 인터뷰 (2026-05-29).
 *
 * "회의록을 요구하는 도구" → "회의 내용을 만들어주는 도구".
 * AI 가 비전공자에게 3~8개 질문을 던져 핵심을 끌어내고, 충분히 모이면
 * 대화 전체를 회의록 텍스트로 합성한다.
 *
 * 완료 시 @complete(meetingContent) 를 emit — 부모(MeetingLogEditor)가
 * editContent 에 채워 사용자가 검토 후 저장하면 기존 post_meeting 파이프라인이 돈다.
 * (음성 전사 흐름과 동일 — 검토 후 저장.)
 */
import { ref, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Send, Sparkles, Loader2, RotateCcw } from 'lucide-vue-next'
import { useHarnessStore } from '@/store/harness'
import { useAutofixStore } from '@/store/autofix'
import { useSnackbar } from '@/composables/useSnackbar'
import { useUpgradePrompt } from '@/composables/useUpgradePrompt'
import { useConfirm } from '@/composables/useConfirm'

const TOKEN_KEY = 'harness_token'
// BE InterviewTurnRequest.existing_content 한도와 일치 — 초과 시 422 방지용 클라이언트 가드.
const MAX_EXISTING_LEN = 20000
// 대화 영속화 — 페이지 이동/모달 닫기로 컴포넌트가 언마운트돼도 대화를 기억하기 위해
// localStorage 에 프로젝트 단위로 저장. 7일 지난 스냅샷은 폐기.
const PERSIST_PREFIX = 'harness_interview_v1::'
const PERSIST_STALE_MS = 1000 * 60 * 60 * 24 * 7

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 사용자가 이미 작성 중인 회의록 초안 — 있으면 보완 인터뷰(빠진 부분만 질문).
  // 비면 빈 상태(cold start)에서 시작. 완료 시 BE 가 초안을 보존·병합해 돌려준다.
  existingContent: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'complete'])

const store = useHarnessStore()
const { showError: notifyError } = useSnackbar()
const { t } = useI18n()
const { showQuotaExceeded } = useUpgradePrompt()
const confirm = useConfirm()

// 보완 인터뷰 여부 — 이미 작성 중인 초안이 있으면 헤더/안내 문구를 바꾼다.
const isSupplement = computed(() => (props.existingContent || '').trim().length > 0)

// [2026-06-12 보강 모드] PRD 'AI로 보완하기'가 근거 부족으로 남긴 질문(needs_input)을
// 인터뷰 의제로 동봉 — BE 가 PRD lint 이슈·그래프 갭과 병합해 우선 질문한다.
// autofixStore 가 단일 소스(탭/페이지 전환 생존)라 진입 경로와 무관하게 항상 읽는다.
// BE InterviewTurnRequest.agenda 캡(10개·항목 200자)에 맞춰 클라이언트에서도 자른다.
const autofixStore = useAutofixStore()
const agendaRaw = computed(() =>
  (autofixStore.needsInput(store.projectName) || []).slice(0, 10),
)
const agendaItems = computed(() =>
  agendaRaw.value
    .map(n => [n?.topic, n?.question].filter(Boolean).join(' — ').trim().slice(0, 200))
    .filter(Boolean),
)
// 진행 중 프로젝트 보강 진입 — 헤더를 '보강 중: {프로젝트}' 로 바꿔 AI 가 프로젝트를
// 알고 대화함을 사용자에게도 보여준다 (의제 > 초안 보완 > 신규 순 우선).
const isProjectSupplement = computed(() => agendaItems.value.length > 0 && !!store.projectName)
const headTitle = computed(() => {
  if (isProjectSupplement.value) return t('interview.header.title_project', { name: store.projectName })
  return isSupplement.value ? t('interview.header.title_supplement') : t('interview.header.title_new')
})
const headSub = computed(() => {
  if (isProjectSupplement.value) return t('interview.header.sub_project')
  return isSupplement.value ? t('interview.header.sub_supplement') : t('interview.header.sub_new')
})

// 대화 상태
const messages = ref([])        // [{ role: 'assistant' | 'user', content }]
const suggestions = ref([])     // 현재 질문의 예시 답변
const coverage = ref([])        // 지금까지 파악된 주제 (진행 표시)
const readiness = ref(0)        // 준비도 0~1 (정량 진행바) — BE 가 그래프 완성도로 보정한 값
const nextFocus = ref('')       // 지금 집중하는 차원 키 (BE next_focus)
const draft = ref('')           // 사용자 입력
const loading = ref(false)      // LLM 응답 대기
const finalizing = ref(false)   // done 후 회의록 합성(Pro) 중 — "정리 중" 표시
const toolChecking = ref(false) // [B-1] AI 가 프로젝트 자료(PRD/회의록/평가) 조회 중
const scrollRef = ref(null)
const restoredNotice = ref(false)  // 저장된 대화를 복원했을 때 잠깐 보여주는 안내

// 영속화 키 — 사용자(ownerEmail)·팀(activeTeamId)·프로젝트 단위로 분리.
// 같은 브라우저의 다른 계정, 개인/팀의 동명 프로젝트 간 대화가 섞이지 않도록.
// (ownerEmail 은 project store 가 사용자 전환 시 격리하는 그 값과 동일 소스.)
const persistKey = computed(() => {
  const email = (store.ownerEmail || '').toLowerCase().trim() || 'anon'
  const team = store.activeTeamId || 'personal'
  const name = store.projectName || '__default__'
  return `${PERSIST_PREFIX}${email}::${team}::${name}`
})

// 진행 중 빈 말풍선(스트리밍 첫 토큰 전)은 빼고 저장 — 새로고침 시 빈 버블 잔존 방지.
// 또한 스트리밍 도중(loading) 저장될 땐 아직 완성되지 않은 AI 말풍선(맨 끝)을 떨군다.
// → 저장본은 항상 '턴 완료' 또는 '사용자 응답 대기' 상태만 담아, 복원 시 잘린 AI
//   메시지가 history 로 BE 에 전송돼 맥락이 오염되는 일을 막는다. (복원 측에서 마지막이
//   user 면 AI 응답을 자동으로 이어받음.)
// 빈 대화는 아무것도 하지 않는다 — 삭제는 clearPersisted 전용. (빈 메모리 상태로
// persist 가 불리는 경로에서 기존 저장본이 지워지는 사고 방지.)
const persist = (key = persistKey.value) => {
  try {
    const cleanMsgs = messages.value.filter(m => m.content)
    if (loading.value && cleanMsgs.length
        && cleanMsgs[cleanMsgs.length - 1].role === 'assistant') {
      cleanMsgs.pop()  // 스트리밍 중이던 미완성 AI 말풍선 제거
    }
    if (!cleanMsgs.length) return
    localStorage.setItem(key, JSON.stringify({
      messages: cleanMsgs,
      suggestions: suggestions.value,
      coverage: coverage.value,
      readiness: readiness.value,
      nextFocus: nextFocus.value,
      draft: draft.value,
      savedAt: Date.now(),
    }))
  } catch { /* localStorage 사용 불가(프라이빗 모드 등) — 무시 */ }
}

// 저장된 대화 복원. 성공 시 true (첫 질문 fetch 를 건너뛰기 위함).
const restore = () => {
  try {
    const raw = localStorage.getItem(persistKey.value)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.messages) || !data.messages.length) return false
    if (data.savedAt && Date.now() - data.savedAt > PERSIST_STALE_MS) {
      localStorage.removeItem(persistKey.value)
      return false
    }
    messages.value = data.messages
    suggestions.value = Array.isArray(data.suggestions) ? data.suggestions : []
    coverage.value = Array.isArray(data.coverage) ? data.coverage : []
    readiness.value = typeof data.readiness === 'number' ? data.readiness : 0
    nextFocus.value = data.nextFocus || ''
    draft.value = data.draft || ''
    return true
  } catch { return false }
}

const clearPersisted = () => {
  try { localStorage.removeItem(persistKey.value) } catch { /* 무시 */ }
}

// 차원 키 → 현지화 라벨 (BE _READINESS_WEIGHTS 와 동일 키, interview.dim.* 카탈로그).
const readinessPct = computed(() => Math.round((readiness.value || 0) * 100))
const focusLabel = computed(() => (nextFocus.value ? t(`interview.dim.${nextFocus.value}`) : ''))

// 스트리밍 말풍선이 아직 비어 있는지(첫 토큰 도착 전). 비었을 때만 "생각 중…"을
// 보여주고, 토큰이 흐르기 시작하면 숨긴다 — 빈 말풍선/모순 표시 방지.
const streamingEmpty = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return !!last && last.role === 'assistant' && !last.content
})

const resetConversation = () => {
  messages.value = []
  suggestions.value = []
  coverage.value = []
  readiness.value = 0
  nextFocus.value = ''
  draft.value = ''
  restoredNotice.value = false
}

// 모달 안 "새로 시작하기" — 저장된 대화까지 지우고 첫 질문부터 다시.
const restart = async () => {
  if (loading.value) return
  // [2026-06 UX] window.confirm → 전역 ConfirmDialog (디자인 통일·모바일 UX)
  if (messages.value.some(m => m.content)) {
    const ok = await confirm({ message: t('interview.header.restart_confirm'), variant: 'danger' })
    if (!ok) return
  }
  clearPersisted()
  resetConversation()
  await callTurnStream()
}

const scrollToBottom = async () => {
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

const callTurnStream = async () => {
  loading.value = true
  finalizing.value = false
  toolChecking.value = false
  suggestions.value = []
  let completed = false  // done(회의록 완성) 도달 시 finally 에서 재저장하지 않도록.
  // 턴 도중 프로젝트/팀/계정이 전환되면(키 변경) 이 스트림의 결과는 모두 버린다 —
  // 이전 프로젝트의 토큰/상태가 새 프로젝트 화면·저장본에 섞이는 것 차단.
  const keyAtStart = persistKey.value

  // 스트리밍 말풍선을 미리 추가 — 토큰이 도착할 때마다 content 에 누적.
  const msgIdx = messages.value.length
  messages.value.push({ role: 'assistant', content: '' })
  await scrollToBottom()

  const v2Base = import.meta.env.VITE_API_BASE_URL ?? ''
  const token = localStorage.getItem(TOKEN_KEY) || ''

  let reader = null
  try {
    const resp = await fetch(`${v2Base}/api/v2/interview/turn/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        project_name: store.projectName || '',
        // 팀 프로젝트면 team_id 동봉 — BE 가 팀 멤버십 확인 후 설계 그래프 갭 질문을
        // 보강한다. (이 모달은 raw fetch 라 axios 의 team_id 자동 첨부가 안 탄다.)
        team_id: store.activeTeamId || null,
        // 보완 인터뷰 — 이미 작성 중인 초안을 함께 보내 AI 가 빠진 부분만 묻게 한다.
        // BE 한도(20k)에 맞춰 앞부분 위주로 잘라 보냄 (초과 시 422 방지). 회의록 한 건 규모면 충분.
        existing_content: (props.existingContent || '').slice(0, MAX_EXISTING_LEN),
        // [2026-06-12 보강 모드] PRD autofix 의 needs_input 질문들 — BE 통합 의제에서 최우선.
        agenda: agendaItems.value,
        history: messages.value
          .slice(0, msgIdx)  // 방금 추가한 빈 assistant 버블 제외
          .map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!resp.ok) {
      // 4xx/5xx — body 를 읽어 에러 표시 후 빈 버블 제거.
      messages.value.splice(msgIdx, 1)
      const errData = await resp.json().catch(() => ({}))
      const d = errData?.detail
      // 토큰/quota 한도 초과(402) — 이 모달은 fetch 라 axios 인터셉터(글로벌 업그레이드
      // 안내)를 안 거친다. 여기서 직접 업그레이드 모달을 띄우고 인터뷰 모달을 닫아
      // 업그레이드로 유도한다. (대화 도중 소진/사전 가드 누락 시의 최종 방어.)
      if (resp.status === 402 && d && typeof d === 'object' && d.code === 'QUOTA_EXCEEDED') {
        showQuotaExceeded(d)
        emit('update:modelValue', false)
        // 대화는 비우지 않는다 — finally 의 persist 가 보존하므로, 업그레이드 후
        // 돌아오면 끊긴 지점부터 이어진다. (이전엔 reset 으로 대화가 유실됐다.)
        return
      }
      // detail 이 객체(구조화 에러)일 수 있으니 문자열일 때만 그대로 노출 — 아니면
      // generic (객체를 그대로 토스트에 넣어 날것 JSON 이 보이던 문제 방지).
      notifyError(typeof d === 'string' ? d : (d?.message || t('interview.error.generic')))
      return
    }

    reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let doneMeta = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      // SSE 이벤트 단위(빈 줄 구분)로 파싱
      const parts = buf.split('\n\n')
      buf = parts.pop()  // 마지막은 불완전할 수 있음

      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue
        let evt
        try { evt = JSON.parse(line.slice(6)) } catch { continue }

        if (evt.type === 'token') {
          // 키가 바뀌었거나(전환) 버블이 사라졌으면(리셋) 이 스트림은 폐기.
          if (persistKey.value !== keyAtStart || !messages.value[msgIdx]) return
          toolChecking.value = false  // 답변 시작 — 자료 확인 표시 해제
          messages.value[msgIdx].content += evt.text
          await scrollToBottom()
        } else if (evt.type === 'tool') {
          // [B-1] AI 가 ACTION 으로 프로젝트 자료를 조회 중 — 상태 표시.
          toolChecking.value = true
          await scrollToBottom()
        } else if (evt.type === 'finalizing') {
          // done 판정 — 회의록 합성(Pro) 시작. 메시지는 이미 보였으니 "정리 중" 표시.
          finalizing.value = true
          await scrollToBottom()
        } else if (evt.type === 'done') {
          doneMeta = evt
        } else if (evt.type === 'error') {
          messages.value.splice(msgIdx, 1)
          notifyError(evt.message || t('interview.error.generic'))
          return
        }
      }
    }

    if (doneMeta && persistKey.value === keyAtStart) {
      // [B-1] 토큰이 전혀 스트림되지 않은 턴(예: 자료 조회 상한 후 폴백 메시지) —
      // 최종 assistant_message 로 버블을 채워 빈 응답을 방지.
      if (messages.value[msgIdx] && !messages.value[msgIdx].content && doneMeta.assistant_message) {
        messages.value[msgIdx].content = doneMeta.assistant_message
      }
      suggestions.value = Array.isArray(doneMeta.suggestions) ? doneMeta.suggestions : []
      coverage.value = Array.isArray(doneMeta.coverage) ? doneMeta.coverage : []
      // [T2/T3] 정량 준비도 진행바 + 다음 집중 차원 힌트 (ask 턴에만 focus 표시).
      if (typeof doneMeta.readiness === 'number') readiness.value = doneMeta.readiness
      nextFocus.value = doneMeta.phase === 'ask' ? (doneMeta.next_focus || '') : ''

      if (doneMeta.phase === 'done' && doneMeta.meeting_content?.trim()) {
        // 인터뷰 완료 — 회의록이 부모로 넘어가므로 저장된 대화는 폐기.
        completed = true
        clearPersisted()
        setTimeout(() => {
          emit('complete', doneMeta.meeting_content)
          emit('update:modelValue', false)
          resetConversation()
        }, 900)
        return
      }
    }
  } catch (e) {
    if (messages.value[msgIdx]?.content === '') {
      messages.value.splice(msgIdx, 1)
    }
    notifyError(t('interview.error.generic'))
  } finally {
    loading.value = false
    finalizing.value = false
    toolChecking.value = false
    reader?.cancel?.()
    // 턴이 끝날 때마다(성공/실패 무관) 현재 대화를 저장 — 이후 이동/닫기 대비.
    // 단, 완료(done) 시엔 방금 폐기한 대화를 되살리지 않도록, 키 전환 시엔
    // 새 컨텍스트의 저장본을 건드리지 않도록 건너뛴다.
    if (!completed && persistKey.value === keyAtStart) persist()
  }
}

const sendMessage = async (text) => {
  const content = (text ?? draft.value).trim()
  if (!content || loading.value) return
  restoredNotice.value = false
  messages.value.push({ role: 'user', content })
  draft.value = ''
  persist()  // 사용자 발화 즉시 저장 — 응답 스트리밍 도중 이동해도 보존.
  await scrollToBottom()
  await callTurnStream()
}

const pickSuggestion = (s) => sendMessage(s)

// [2026-06-12 보강 모드 Phase 3] 의제 칩 클릭 — AI 가 고른 순서를 기다리지 않고
// 사용자가 원하는 갭부터 고른다. 이 발화 + 프롬프트의 [빠진 것들] 목록으로 AI 가
// 해당 주제 질문으로 바로 진입한다. (topic 이 비면 question 을 짧게 잘라 사용.)
const pickAgenda = (n) => {
  const topic = (n?.topic || n?.question || '').trim().slice(0, 80)
  if (!topic) return
  sendMessage(t('interview.agenda.pick', { topic }))
}

// 빈 메모리에서 세션 시작 — 저장된 대화가 있으면 복원, 없으면 첫 질문 fetch.
const beginSession = async () => {
  if (restore()) {
    restoredNotice.value = true
    await scrollToBottom()
    // 마지막이 사용자 메시지면(이전에 AI 응답을 받기 전 중단됨) 응답을 이어서 가져온다.
    // BE 는 stateless 라 저장된 history 그대로 다시 보내면 끊긴 턴이 정확히 이어진다.
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'user') {
      await callTurnStream()
    }
    return
  }
  await callTurnStream()
}

// 다이얼로그가 열릴 때:
//  - 같은 페이지에서 다시 열면 메모리에 대화가 남아 있으니 그대로 둔다.
//  - 새로 마운트(페이지 이동 후)면 저장된 대화를 복원. 없을 때만 첫 질문 fetch.
watch(() => props.modelValue, async (open) => {
  if (!open) {
    persist()  // 닫는 순간 입력 중이던 draft 까지 저장.
    return
  }
  if (messages.value.length > 0) return
  await beginSession()
})

// 프로젝트/팀/계정 전환 — plan 페이지는 전환 시 리마운트되지 않으므로(store watch
// 기반) 이 컴포넌트가 산 채로 유지된다. 이전 컨텍스트의 대화를 이전 키로 저장하고
// 메모리를 비워, 다른 프로젝트/계정으로 대화가 새는 것을 차단한다.
watch(persistKey, async (newKey, oldKey) => {
  persist(oldKey)
  resetConversation()
  if (props.modelValue) await beginSession()  // 열린 채 전환됐으면 새 컨텍스트로 재시작
})

// 페이지 이동 등으로 컴포넌트가 언마운트될 때도 현재 대화를 저장 (catch-all).
onBeforeUnmount(() => persist())

const handleKeydown = (e) => {
  // Enter = 전송, Shift+Enter = 줄바꿈
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const close = () => emit('update:modelValue', false)
</script>

<template>
  <VDialog :model-value="modelValue" max-width="640" persistent scrollable
    @update:model-value="emit('update:modelValue', $event)">
    <VCard class="interview-card">
      <!-- Header -->
      <div class="interview-head">
        <div class="interview-head__title">
          <Sparkles :size="18" class="interview-head__icon" />
          <div>
            <div class="interview-head__name">{{ headTitle }}</div>
            <div class="interview-head__sub">{{ headSub }}</div>
          </div>
        </div>
        <div class="interview-head__actions">
          <button
            v-if="messages.some(m => m.content)"
            class="interview-head__restart"
            :disabled="loading"
            :title="$t('interview.header.restart')"
            :aria-label="$t('interview.header.restart_aria')"
            @click="restart"
          >
            <RotateCcw :size="14" />
            <span>{{ $t('interview.header.restart') }}</span>
          </button>
          <button class="interview-head__close" @click="close" :aria-label="$t('interview.header.close_aria')">✕</button>
        </div>
      </div>

      <!-- 이전 대화 복원 안내 -->
      <div v-if="restoredNotice" class="interview-restored">
        {{ $t('interview.restored.notice') }}
      </div>

      <!-- [2026-06-12 보강 모드] 채울 의제 칩 — 비전공자가 "뭐가 빠졌는지"를 한눈에 보고
           원하는 갭부터 고를 수 있게. 클릭 = "이것부터 채우고 싶어요" 전송. -->
      <div v-if="isProjectSupplement" class="interview-agenda">
        <span class="interview-agenda__label">{{ $t('interview.agenda.label', { count: agendaRaw.length }) }}</span>
        <button
          v-for="(n, i) in agendaRaw" :key="i"
          class="interview-agenda__chip"
          :disabled="loading"
          :title="n.question || n.topic"
          @click="pickAgenda(n)"
        >{{ n.topic || (n.question || '').slice(0, 24) }}</button>
      </div>

      <!-- 준비도 진행바 (정량) -->
      <div v-if="readinessPct > 0" class="interview-progress">
        <span class="interview-progress__label">{{ $t('interview.progress.label') }}</span>
        <div class="interview-progress__track">
          <div class="interview-progress__fill" :style="{ width: readinessPct + '%' }"></div>
        </div>
        <span class="interview-progress__pct">{{ readinessPct }}%</span>
      </div>

      <!-- 진행 표시 (파악된 주제) -->
      <div v-if="coverage.length" class="interview-coverage">
        <span class="interview-coverage__label">{{ $t('interview.coverage.label') }}</span>
        <span v-for="c in coverage" :key="c" class="interview-coverage__chip">{{ c }}</span>
      </div>

      <!-- 지금 집중하는 질문 차원 -->
      <div v-if="focusLabel && !loading" class="interview-focus">
        {{ $t('interview.focus.prefix') }}: <b>{{ focusLabel }}</b>
      </div>

      <!-- 대화 -->
      <div ref="scrollRef" class="interview-body custom-scroll">
        <template v-for="(m, i) in messages" :key="i">
          <div v-if="m.content" class="msg" :class="`msg--${m.role}`">
            <div class="msg__bubble">{{ m.content }}</div>
          </div>
        </template>
        <div v-if="loading && (finalizing || streamingEmpty)" class="msg msg--assistant">
          <div class="msg__bubble msg__bubble--typing">
            <Loader2 :size="15" class="rotate-anim" /> {{ finalizing ? $t('interview.typing.finalizing') : toolChecking ? $t('interview.typing.tool') : $t('interview.typing.thinking') }}
          </div>
        </div>
      </div>

      <!-- 예시 답변 -->
      <div v-if="suggestions.length && !loading" class="interview-suggest">
        <button v-for="s in suggestions" :key="s" class="suggest-chip" @click="pickSuggestion(s)">
          {{ s }}
        </button>
      </div>

      <!-- 입력 -->
      <div class="interview-input">
        <textarea
          v-model="draft"
          class="interview-input__field"
          rows="1"
          :placeholder="$t('interview.input.placeholder')"
          :disabled="loading"
          @keydown="handleKeydown"
        ></textarea>
        <button class="interview-input__send" :disabled="loading || !draft.trim()" @click="sendMessage()">
          <Send :size="16" />
        </button>
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.interview-card {
  font-family: 'Pretendard Variable', sans-serif;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  max-height: 82vh;
}
.interview-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-light);
}
.interview-head__title { display: flex; gap: 10px; }
.interview-head__icon { color: var(--accent); margin-top: 2px; flex-shrink: 0; }
.interview-head__name { font-size: 0.98rem; font-weight: 800; color: var(--text-main); }
.interview-head__sub { font-size: 0.76rem; color: var(--text-muted); margin-top: 2px; line-height: 1.45; }
.interview-head__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.interview-head__restart {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--border-light); border-radius: 9999px;
  color: var(--text-muted); font-family: inherit; font-size: 0.7rem; font-weight: 700;
  padding: 4px 10px; cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.interview-head__restart:hover:not(:disabled) {
  color: var(--accent); border-color: var(--accent); background: rgba(140, 98, 57, 0.06);
}
.interview-head__restart:disabled { opacity: 0.4; cursor: not-allowed; }
.interview-head__close {
  background: transparent; border: none; color: var(--text-muted);
  font-size: 1rem; cursor: pointer; line-height: 1; padding: 4px;
}
.interview-head__close:hover { color: var(--text-main); }

.interview-restored {
  margin: 10px 20px 0; padding: 7px 12px; border-radius: 8px;
  background: #EFF6FF; border: 1px solid #BFDBFE; color: #1D4ED8;
  font-size: 0.72rem; font-weight: 600;
}

.interview-agenda {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 10px 20px 0;
}
.interview-agenda__label { font-size: 0.66rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.interview-agenda__chip {
  font-size: 0.7rem; font-weight: 600; color: var(--accent, #8C6239);
  background: rgba(140, 98, 57, 0.07); border: 1px solid rgba(140, 98, 57, 0.35);
  border-radius: 9999px; padding: 3px 10px; cursor: pointer; transition: all 0.12s;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.interview-agenda__chip:hover:not(:disabled) { background: rgba(140, 98, 57, 0.14); }
.interview-agenda__chip:disabled { opacity: 0.5; cursor: not-allowed; }

.interview-progress {
  display: flex; align-items: center; gap: 8px; padding: 12px 20px 0;
}
.interview-progress__label { font-size: 0.66rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.interview-progress__track {
  flex: 1; height: 6px; background: #F1F5F9; border-radius: 9999px; overflow: hidden;
}
.interview-progress__fill {
  height: 100%; background: var(--accent, #8C6239); border-radius: 9999px;
  transition: width 0.4s ease;
}
.interview-progress__pct {
  font-size: 0.7rem; font-weight: 800; color: var(--accent, #8C6239); flex-shrink: 0;
  min-width: 32px; text-align: right;
}
.interview-focus {
  font-size: 0.72rem; color: var(--text-muted); padding: 6px 20px 0;
}
.interview-focus b { color: var(--text-main); font-weight: 700; }

.interview-coverage {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 10px 20px 0;
}
.interview-coverage__label { font-size: 0.66rem; font-weight: 700; color: var(--text-muted); }
.interview-coverage__chip {
  font-size: 0.68rem; font-weight: 600; color: #2563EB;
  background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 2px 8px;
}

.interview-body {
  flex: 1; min-height: 240px; overflow-y: auto;
  padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;
}
.msg { display: flex; }
.msg--user { justify-content: flex-end; }
.msg--assistant { justify-content: flex-start; }
.msg__bubble {
  max-width: 80%; padding: 10px 14px; border-radius: 14px;
  font-size: 0.86rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}
.msg--assistant .msg__bubble {
  background: #F4F4F5; color: var(--text-main); border-bottom-left-radius: 4px;
}
.msg--user .msg__bubble {
  background: var(--accent, #8C6239); color: white; border-bottom-right-radius: 4px;
}
.msg__bubble--typing { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); }

.interview-suggest {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 8px;
}
.suggest-chip {
  font-size: 0.78rem; color: var(--text-main);
  background: white; border: 1px solid var(--border-light); border-radius: 9999px;
  padding: 6px 12px; cursor: pointer; transition: all 0.12s;
}
.suggest-chip:hover { border-color: var(--accent); background: rgba(140, 98, 57, 0.06); transform: translateY(-1px); }

.interview-input {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 16px 16px; border-top: 1px solid var(--border-light);
}
.interview-input__field {
  flex: 1; resize: none; max-height: 120px;
  border: 1px solid var(--border-light); border-radius: 12px;
  padding: 10px 12px; font-size: 0.86rem; font-family: inherit;
  color: var(--text-main); background: white; line-height: 1.5;
}
.interview-input__field:focus { outline: none; border-color: var(--accent); }
.interview-input__send {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px;
  background: var(--accent, #8C6239); color: white; border: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: opacity 0.12s;
}
.interview-input__send:disabled { opacity: 0.4; cursor: not-allowed; }

/* 모바일 — 헤더가 좁아 '새로 시작하기' 텍스트는 숨기고 아이콘만(툴팁/aria 유지). */
@media (max-width: 600px) {
  .interview-head { padding: 14px 16px 12px; }
  .interview-head__restart span { display: none; }
  .interview-head__restart { padding: 6px; }
}

.rotate-anim { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.custom-scroll::-webkit-scrollbar { width: 5px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 10px; }
</style>
