import { describe, it, expect } from 'vitest'
import { getNodeProp } from '@/utils/nodeUtils'

describe('getNodeProp', () => {
  it('flat 객체에서 직접 키 조회', () => {
    expect(getNodeProp({ name: 'foo' }, 'name')).toBe('foo')
  })

  it('Neo4j-style nested properties 조회', () => {
    expect(getNodeProp({ properties: { name: 'foo' } }, 'name')).toBe('foo')
  })

  it('flat이 properties보다 우선', () => {
    expect(getNodeProp({ name: 'flat', properties: { name: 'nested' } }, 'name')).toBe('flat')
  })

  it('없으면 fallback 반환', () => {
    expect(getNodeProp({}, 'name', 'default')).toBe('default')
    expect(getNodeProp({}, 'name')).toBe('')
  })

  it('null/undefined node 안전 처리', () => {
    expect(getNodeProp(null, 'name', 'X')).toBe('X')
    expect(getNodeProp(undefined, 'name')).toBe('')
  })

  it('falsy 값(0, false, 빈 문자열)도 그대로 반환', () => {
    expect(getNodeProp({ count: 0 }, 'count', 99)).toBe(0)
    expect(getNodeProp({ flag: false }, 'flag', true)).toBe(false)
  })
})
