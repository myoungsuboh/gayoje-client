/**
 * axios timeout 상수.
 *
 * 이전: 컴포넌트/스토어에 매직 넘버 `300000`, `360000`, `30000` 등 산재 →
 * 의미 분류가 어렵고 한 번에 조정 불가.
 * 공용 상수로 묶어 운영 환경에서 일괄 조절 가능.
 *
 * 의미별 분류:
 *   - SHORT (15s)  : 즉시 응답 보장된 read API (truth list, repo meta 등)
 *   - DEFAULT (30s): 일반 BE 호출 (lint repo, log fetch, github proxy 등)
 *   - LONG (60s)   : LLM 1회 호출 (skill recommend, AI suggest, single agent)
 *   - PIPELINE (5m): 큐 미사용 ?wait=true 시 post_meeting / lint
 *   - DESIGN (6m)  : createDesign — Spack/DDD/Arch 3 stage strict sequential
 *   - LINEAGE (4m) : analyzeLineage — multi-repo tree fetch + matching
 */

export const T_SHORT_MS = 15000
export const T_DEFAULT_MS = 30000
export const T_LONG_MS = 60000
export const T_PIPELINE_MS = 300000     // 5분 — 큐 미사용 wait 모드
export const T_DESIGN_MS = 360000       // 6분 — design 파이프라인 3 stage
export const T_LINEAGE_MS = 240000      // 4분 — analyzeLineage
