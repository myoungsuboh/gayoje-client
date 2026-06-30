/**
 * 공용 markdown-it 싱글톤 인스턴스.
 *
 * 이전: 5 컴포넌트가 각자 `new MarkdownIt({...동일 옵션...})` — 메모리/번들 양쪽
 * 으로 중복.
 *
 * 옵션 정책: `html: false` (XSS 차단), `breaks: true` (\n → <br>), `linkify: true`.
 * 옵션 변경이 필요한 컴포넌트는 별도 인스턴스를 만들거나 plugin 추가 후 import.
 */
import MarkdownIt from 'markdown-it'

export const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})
