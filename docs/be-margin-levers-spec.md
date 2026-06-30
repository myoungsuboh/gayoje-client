# BE 핸드오프 — 마진 3대 레버 스펙 (2026-06-08)

> **대상:** 백엔드 팀 (별도 repo/서버). 프론트엔드에서 마진을 못 바꾸므로 BE 작업.
> **배경:** 사용자 대부분이 quota 풀소진 → 마진 = 토큰당 원가. 목표는 **블렌드 ≤ $0.55/1M**(Pro $9·4M·풀소진·Paddle 포함 시 65% 마진). 차선 ≤ $0.89/1M(50%).
> **원칙: 측정(L1) 먼저 → 비율 보고 레버 선택.** 입력 비싸면 캐싱(L2), 출력 비싸면 라우팅(L3).

## 왜 measure-first
캐싱(L2)은 **입력 토큰만** 깎는다. 출력($2.50/1M)은 못 깎는다. 따라서:
- in:out ≥ 3:1 (입력 우세) → **L2 캐싱**이 정답.
- in:out ≤ 1.5:1 (출력 우세) → **L3 라우팅 + thinking 억제**가 정답.
- 비율을 모르면 어느 레버가 먹힐지 모른다 → L1이 선결.

---

## Lever 1 — 토큰 계측 (P0, 선결)
**목표:** 파이프라인 1회전의 실제 input/output(+cached/thinking) 토큰과 in:out 비율 확보.

**구현:**
- 모든 Gemini 호출 래핑 → 응답 `usageMetadata` 캡처:
  - `promptTokenCount`(입력), `candidatesTokenCount`(출력), `cachedContentTokenCount`(캐시된 입력), **`thoughtsTokenCount`(thinking — 출력 단가로 청구!)**, `totalTokenCount`.
- 저장 `llm_usage_events`: `(id, user_id, project, run_id, stage, model, input_tokens, output_tokens, cached_tokens, thinking_tokens, cost_usd, latency_ms, created_at)`.
  - `stage ∈ {cps, prd, spack, ddd, architecture, lint, autofill, resynthesize}`.
  - `run_id` = 한 파이프라인 회전 묶음 (스테이지별 합산용).
  - `cost_usd` = 로그 시점 모델 rate card로 계산.

**산출 지표(대시보드/쿼리):**
- 스테이지별 평균 in:out, **풀파이프라인 1회전 total + in:out**, 사용자/월 합산(quota 정합).
- **⚠️ 더블체크: `thoughtsTokenCount`가 크면 출력비 폭증의 주범.** thinking이 출력 단가라, 이게 30~50%면 마진 계산이 통째로 바뀐다. 반드시 분리 계측.

**완료 기준:** "미팅 1건 풀런 = X입력 + Y출력 + Z thinking, 블렌드 $W/1M" 수치 확보 → 워크시트 가정 교체.

---

## Lever 2 — 컨텍스트 캐싱 (입력 우세일 때)
**목표:** 재투입되는 입력(직전 산출물·시스템 프롬프트) 비용 ~90%↓.

**구현:**
- **암시적 캐싱(먼저, 무료·무설정):** 프롬프트를 `[안정 prefix(시스템+회의록+확정 직전산출물)] + [가변 instruction tail]`로 구성, prefix를 **바이트 동일**하게 유지 → Gemini 자동 할인.
- **명시적 캐싱(CachedContent API):** 한 회전 내(분 단위)·같은 프로젝트 재실행에서 큰 재사용 컨텍스트를 캐시 핸들로 참조.

**주의:** 입력 전용(출력 못 깎음) / 최소 캐시 토큰 임계 / TTL 저장 소액비 / TTL 내 재사용해야 이득. 우리 파이프라인은 CPS→PRD→설계가 한 잡에서 연속 → 재사용 창 짧아 효과 큼.

**기대:** 입력 비중이 클수록 효과 ↑. (L1 비율로 사전 판단.)

---

## Lever 3 — 모델 라우팅 (출력 우세일 때)
**목표:** 출력 많은/단순한 스테이지를 싼 모델로.

**구현:**
- **Flash-Lite($0.05/$0.20)** vs Flash($0.30/$2.50) — 출력 12.5× 저렴.
- 스테이지→모델 매핑(복잡도 기준):
  - 추출·요약형(회의록→CPS 추출, lint 룰 생성) → **Flash-Lite**.
  - 합성·품질critical(PRD epic/story, SPACK/DDD/architecture) → **Flash 유지**.
- **thinking budget 제어:** thinking 불필요 스테이지는 `thinkingBudget` 축소/0 → 출력비 절감(더블체크 #2 대응).
- **가드레일:** Flash-Lite로 내리기 전 **품질 A/B**(eval 점수 패리티) 확인 — 품질 유지되는 스테이지만 다운그레이드.

---

## 실행 순서 (순차)
1. **L1 배포** → 실런 1~2주 수집.
2. 비율 판독:
   - thinking이 크면 → **먼저 thinking budget 억제**(가장 싼 승리).
   - 입력 우세 → **L2 캐싱**.
   - 출력 우세 → **L3 라우팅**.
3. 레버마다 **재측정** → 블렌드 $/1M을 목표와 비교.
4. 그래도 부족 → quota 축소 or 가격 인상(워크시트 fallback).

## 목표 (구체)
- **블렌드 ≤ $0.55/1M** → Pro $9·4M·풀소진·Paddle 포함 65% 마진.
- 최소선 **≤ $0.89/1M** → 50% 마진.

## 검증
- 레버 적용 후 L1 집계 재실행 → 목표 대비 블렌드 확인.
- 라우팅 시 eval 점수 회귀 없는지 품질 검증.
