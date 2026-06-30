/**
 * 핸드오프 경로 동등성 (재발 방지 가드 ① — 2026-06-13).
 *
 * [왜 이 테스트가 존재하나] 같은 설계 그래프를 가공하는 FE 경로가 3개
 * (designGraphToMarkdown spec md · buildObsidianVault · HandoffSection 도
 * designGraphToMarkdown 사용)인데, 갭 판정·집계가 각 경로에 흩어져 있어 한쪽만
 * 고치면 다른 쪽이 드리프트했다. '2 vs 3' 카운트 회귀가 그 증상. 단위 테스트가
 * '경로별 자기일관성'만 봐서 '경로 간 차이'를 구조상 못 잡았다 — 그 사각을 메운다.
 *
 * 하나의 fixture 를 모든 FE 산출 경로에 흘려보내 '미정 N건'이 정확히 같음을 단언한다.
 * 갭 로직을 바꿀 때 한 경로만 고치면 이 테스트가 적색이 된다.
 */
import { describe, it, expect } from 'vitest'
import { designGraphToMarkdown, apiGaps, entityGaps, buildSpackMappingCtx } from '@/utils/designMarkdown'
import { buildObsidianVault } from '@/utils/obsidianExport'
import i18n from '@/plugins/i18n'

i18n.global.locale.value = 'ko'
// design.spec_md.*(갭 헤더/라벨)만 실제 ko, folder 등은 키-테일(결정적) — 카운트 정규식(미정 N건) 통과.
const t = (k, params) => (k.startsWith('design.spec_md') ? i18n.global.t(k, params) : k.split('.').pop())

// 대표 fixture — 갭 종류를 골고루: 요청·응답·담당서비스·속성. (실데이터 계약대로
// api_service_rels 에 target_id·type 포함 — BE 디코더가 드롭하지 않는 형태.)
const SPACK = {
  apis: [
    { id: 'a1', method: 'post', path: '/users', request_body: { fields: [] }, response_body: { fields: [] } }, // 요청·응답
    { id: 'a2', method: 'get', path: '/items', response_body: { fields: [{ name: 'r' }] } },                    // 미매핑 → 담당서비스(MSA)
  ],
  entities: [
    { id: 'e1', name: 'User' },                                  // 속성
    { id: 'e2', name: 'Account', attributes: [{ name: 'id' }] }, // 채워짐 → 갭 없음
  ],
  api_service_rels: [{ source_id: 'a1', target_id: 's1', type: 'HANDLED_BY', target_name: 'Svc' }],
}
const ARCH = { services: [{ id: 's1', name: 'Svc' }, { id: 's2', name: 'Svc2' }] }  // MSA(2개)
const ARCH_COUNT = ARCH.services.length

// 손계산 기대 라벨 수: a1[요청,응답]=2 + a2[담당서비스]=1 + e1[속성]=1 = 4
const EXPECTED_GAPS = 4

const headerCount = (md) => Number((md.match(/미정 (\d+)건/) || [])[1] || 0)

describe('핸드오프 경로 갭 카운트 동등성', () => {
  it('직접 합산(apiGaps+entityGaps) == 기대값', () => {
    const ctx = buildSpackMappingCtx(SPACK, ARCH_COUNT)
    const sum = SPACK.apis.reduce((n, a) => n + apiGaps(a, ctx).length, 0)
      + SPACK.entities.reduce((n, e) => n + entityGaps(e).length, 0)
    expect(sum).toBe(EXPECTED_GAPS)
  })

  it('spec md(designGraphToMarkdown) 헤더 N == 기대값', () => {
    const md = designGraphToMarkdown(t, 'spack', SPACK, { archServiceCount: ARCH_COUNT })
    expect(headerCount(md)).toBe(EXPECTED_GAPS)
  })

  it('Obsidian vault 홈 "미정 N건" == spec md == 기대값 (세 경로 일치)', () => {
    const specMd = designGraphToMarkdown(t, 'spack', SPACK, { archServiceCount: ARCH_COUNT })
    const vault = buildObsidianVault({ projectName: 'p', spack: SPACK, arch: ARCH, t })
    const home = vault.find((f) => f.path.includes('home_title'))
    expect(headerCount(home.content)).toBe(EXPECTED_GAPS)
    expect(headerCount(home.content)).toBe(headerCount(specMd))  // 경로 간 일치 강제
  })

  it('담당서비스 게이트 동등 — vault 도 multiService 기준(arch 1개면 면제)', () => {
    const single = buildObsidianVault({ projectName: 'p', spack: SPACK, arch: { services: [{ id: 's1' }] }, t })
    const home = single.find((f) => f.path.includes('home_title'))
    // arch 1개 → 담당서비스 면제 → a1[요청,응답]2 + e1[속성]1 = 3
    expect(headerCount(home.content)).toBe(3)
    const specMd = designGraphToMarkdown(t, 'spack', SPACK, { archServiceCount: 1 })
    expect(headerCount(specMd)).toBe(3)
  })
})
