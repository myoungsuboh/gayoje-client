/**
 * GlossaryModal — 표시/검색/닫기 스모크.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/plugins/i18n'
import GlossaryModal from '@/components/common/GlossaryModal.vue'

// jsdom navigator.language='en' → i18n 마이그레이션 후 한국어 단언이 깨지지 않도록 ko 고정.
beforeEach(() => { i18n.global.locale.value = 'ko' })

const mountModal = (props = {}) =>
  mount(GlossaryModal, { props: { modelValue: true, ...props } })

describe('GlossaryModal', () => {
  it('modelValue=false 면 렌더링 안 함', () => {
    const w = mount(GlossaryModal, { props: { modelValue: false } })
    expect(w.find('.glossary-modal').exists()).toBe(false)
  })

  it('열리면 제목과 용어 항목들을 보여준다', () => {
    const w = mountModal()
    expect(w.find('#glossary-title').text()).toContain('용어 사전')
    expect(w.findAll('.glossary-item').length).toBeGreaterThan(5)
  })

  it('검색어 입력 시 항목이 필터된다', async () => {
    const w = mountModal()
    const all = w.findAll('.glossary-item').length
    await w.find('.glossary-search__input').setValue('PRD')
    const filtered = w.findAll('.glossary-item').length
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(all)
  })

  it('매칭 없으면 빈 안내 문구 노출', async () => {
    const w = mountModal()
    await w.find('.glossary-search__input').setValue('zzz존재안함')
    expect(w.find('.glossary-empty').exists()).toBe(true)
  })

  it('닫기 버튼/X 클릭 시 update:modelValue(false) emit', async () => {
    const w = mountModal()
    await w.find('.glossary-done').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([false])
  })
})
