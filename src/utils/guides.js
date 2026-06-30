/**
 * GuideTooltip 자산 — UI 기능에 부착하는 ⓘ hover/long-press 가이드.
 *
 * [콘텐츠 위치 — 2026-06-05 i18n 분리]
 * title/desc 본문은 i18n `guides` 네임스페이스로 이동했다:
 *   - src/locales/ko/guides.json  (원문)
 *   - src/locales/en/guides.json  (영문)
 * GuideTooltip 이 target id 로 `guides.<id>.title|desc` 를 t() 로 렌더한다(로케일 반응).
 * 신규 가이드 추가: 두 JSON 에 같은 id 로 { title, desc } 를 넣는다 (ko↔en 패리티 필수).
 *
 * [작성 원칙 — guides.json 편집 시]
 * 1. IT 용어/영문 약어 단독 노출 금지 — 한글 풀이를 옆에. (괄호 약어 CPS/PRD 등은 유지)
 * 2. desc 는 일상 비유로 시작. ("주문", "쇼핑몰", "회의" 같은 친숙한 예시)
 * 3. 화면에 보이는 실제 시각 단서(색·아이콘) 와 어긋나지 않게.
 * 4. title 은 24자 이내(ko) — popover 헤더 공간 제약 (테스트 가드: tests/utils/guides.test.js).
 *
 * [gif 자산 — 선택]
 * 가이드별 짧은 데모 영상. 현재 등록된 항목 없음. 추가 시 아래 맵에 id → 경로:
 *   export const GUIDE_GIFS = { 'meeting-log-new': '/guides/meeting-log-new.webm' }
 * 파일은 /public/guides/*.webm (또는 .mp4). 파일 없어도 텍스트만으로 안전 동작.
 */

/** @type {Record<string, string>} 가이드 id → /guides/*.webm|mp4 경로 (선택) */
export const GUIDE_GIFS = {}
