/**
 * [2026-06-12 인터뷰 보강 모드 Phase 2] PRD 탭 → 회의록 탭 인터뷰 모달 자동 오픈 신호.
 *
 * PRD 의 "인터뷰로 채우기" CTA 가 기존엔 탭만 전환하고 "인터뷰 버튼을 눌러주세요"
 * 토스트로 사용자에게 다음 클릭을 떠넘겼다 — 비개발자는 여기서 길을 잃는다.
 * 이 신호로 탭 전환 직후 인터뷰 모달까지 자동으로 연다.
 *
 * sticky-until-consumed: 탭 전환으로 MeetingLogEditor 가 신호 이후에 mount 되는
 * 레이스가 기본 경로라, 이벤트(일회성 emit)가 아니라 소비 전까지 유지되는 플래그로
 * 만든다. 받는 쪽은 immediate watch 로 mount 시점에도 집어간다.
 * (의제 데이터 자체는 들고 다니지 않는다 — autofixStore.needsInput 이 단일 소스이고
 * InterviewDialog 가 직접 읽는다. 여기는 "열어라" 신호만.)
 */
import { ref } from 'vue'

const _pending = ref(false)

/** PRD 탭 CTA — 회의록 탭의 인터뷰 모달을 열어 달라는 요청을 건다. */
export function requestInterviewOpen() {
  _pending.value = true
}

/** 요청을 소비(해제)하고 있었는지 여부를 반환. 받는 쪽(MeetingLogEditor) 전용. */
export function consumeInterviewOpen() {
  const had = _pending.value
  _pending.value = false
  return had
}

/** watch 용 — 직접 쓰기 금지(request/consume 로만). */
export const interviewOpenRequested = _pending
