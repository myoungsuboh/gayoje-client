/**
 * AppFooter — 노출 정책 (2026-06-12).
 *
 * 전자상거래법상 신원정보 표시 의무는 "사이버몰 초기화면" — 전 페이지 고정이
 * 아니라 랜딩(/)·결제(/pricing)·법적 페이지(/legal/*)에서만, 문서 흐름 맨
 * 아래(스크롤 끝)에 노출한다. 작업 화면(plan 등)에서는 렌더되지 않아야 한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const mockRoute = { path: '/' }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  // router-link stub 용 — 템플릿의 <router-link> 해석
  RouterLink: { template: '<a><slot /></a>' },
}))

const mountAt = (path) => {
  mockRoute.path = path
  return mount(AppFooter, {
    global: { stubs: { 'router-link': { template: '<a><slot /></a>' }, 'v-footer': { template: '<footer><slot /></footer>' } } },
  })
}

describe('AppFooter — 노출 라우트 게이팅', () => {
  it.each(['/', '/pricing', '/legal/terms', '/legal/privacy-policy'])(
    '%s 에서는 푸터 렌더',
    (path) => {
      const w = mountAt(path)
      expect(w.find('footer').exists()).toBe(true)
      expect(w.text()).toContain('786-04-03787')
    },
  )

  it.each(['/plan', '/design', '/home', '/lint', '/admin/pricing'])(
    '%s (작업 화면) 에서는 렌더 안 함',
    (path) => {
      const w = mountAt(path)
      expect(w.find('footer').exists()).toBe(false)
    },
  )

  it('좌측 사업자 정보 / 우측 링크 — 양쪽 분산 구조', () => {
    const w = mountAt('/')
    // 로케일 무관 값으로 단언 (테스트 환경 기본 로케일이 en 일 수 있음)
    expect(w.find('.footer-side--left').text()).toContain('786-04-03787')
    expect(w.find('.footer-side--right').findAll('a').length).toBeGreaterThanOrEqual(3)
  })

  // [2026-06-12] 약관 3종은 "한 묶음" — 약관 안에서 다른 약관으로 이동은 replace.
  // 뒤로가기 한 번이면 약관 진입 전 페이지로 돌아가야 한다 (순서대로 눌렀다고
  // 그만큼 back 을 반복하지 않게).
  it('약관 페이지(/legal/*)에서는 약관 링크가 replace 모드', () => {
    const w = mountAt('/legal/terms')
    const links = w.find('.footer-links').findAll('a')
    expect(links.length).toBe(3)
    for (const a of links) expect(a.attributes('replace')).toBe('true')
  })

  it('랜딩(/)에서는 약관 링크가 일반 push (진입 히스토리 보존)', () => {
    const w = mountAt('/')
    const links = w.find('.footer-links').findAll('a')
    for (const a of links) expect(a.attributes('replace')).toBe('false')
  })
})
