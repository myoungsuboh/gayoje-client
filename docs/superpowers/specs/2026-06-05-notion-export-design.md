# Notion Export — "Harness 프로젝트 허브" 공유 기능 설계

- **Date**: 2026-06-05
- **Status**: Approved (design) → ready for implementation plan
- **Repos**: FE `C:\project\harness` (Vue3) · BE `C:\project\harness-server` (FastAPI/Neo4j)

## 1. 목표 / 문제

CPS·PRD·설계(Design) 문서를 사용자의 Notion 워크스페이스에 **보기 좋게(브랜디드 템플릿) 공유**한다. 현재 Notion 연동은 **가져오기(import)만** 존재하고 내보내기(export)는 없다. 연동한 사용자만 사용 가능해야 한다(개인 토큰 기반이라 구조적으로 보장).

성공 기준:
- 한 번의 액션으로 CPS/PRD/설계가 Notion에 "우리만의 틀"로 정리되어 올라간다.
- 다시 공유해도 **중복 페이지가 생기지 않고** 기존 페이지가 최신으로 갱신된다(링크 안정).
- 미연동 사용자는 연동 유도를 본다.

## 2. 기존 연동 컨텍스트 (재사용 자산)

- **인증**: OAuth + 내부 통합 토큰. 유저별 토큰을 Neo4j `User` 노드에 Fernet 암호화 저장(`notion_access_token`, `notion_workspace_id/name`, `notion_bot_id`). `user_repository.get_notion_info(email)`로 복호화.
- **연동 판별(FE)**: `GET /auth/notion/status` → `{ linked, notion_workspace_name, oauth_available }`. (`src/utils/auth.js`: `fetchNotionStatusApi`)
- **Notion client(BE)** `app/clients/notion_client.py`: `search_pages`, `get_page`, `get_page_blocks`. 예외: `NotionUnauthorized(401)`, `NotionRateLimited(429)`, `NotionError`. → **`create_page`/`append_blocks`/`archive_block_children` 없음(추가 필요)**.
- **블록↔마크다운**: `app/core/notion_to_markdown.py`(blocks→md) 존재. → **역변환 `markdown_to_notion_blocks.py` 없음(추가 필요)**.
- **가져오기 picker(FE)**: `src/components/plan/NotionPageList.vue`(검색+무한스크롤). `searchNotionPagesApi` (`GET /api/v2/notion/pages`). → **대상 위치 선택 picker로 재사용**.
- **데이터 shape**:
  - CPS `GET /api/v2/getCPS` → `{ content(markdown), version, last_updated, markdown_stale, ... }` (이미 마크다운). 파서 `src/utils/cpsSections.js`.
  - PRD `GET /api/v2/getPRD` → `{ prd_content(markdown), last_updated, ... }` (이미 마크다운).
  - 설계 `GET /api/v2/getDDD|getSpack|getArchitecture` → `{ nodes, edges, ... }` (**그래프 → 렌더 필요**).

## 3. 페이지 모델 — 허브 + 서브페이지 + 멱등 갱신 (승인됨)

- 프로젝트당 **허브 페이지 1개** + 그 아래 **서브페이지 3개**(CPS/PRD/설계).
- BE가 **(user_email, project_name) 키**로 매핑을 Neo4j에 저장(팀 프로젝트는 트리거한 사용자의 워크스페이스에 생성되므로 user 단위가 맞음):
  - 구현 형태: `(:User)-[:NOTION_EXPORT { hub_page_id, cps_page_id, prd_page_id, design_page_id, synced_at }]->(:Project)` 관계 또는 동등한 키드 저장. (정확한 모델은 구현 플랜에서 기존 user_repository/query_repository 패턴에 맞춰 확정)
- **멱등 갱신**: 재공유 시 해당 서브페이지의 자식 블록을 `archive_block_children` 후 새 블록 append. 서브페이지/허브 자체는 유지 → URL·링크 불변. 저장된 page_id가 Notion에서 삭제됐으면(404) 재생성 후 매핑 갱신.

## 4. 아키텍처

### BE (harness-server)
- `notion_client.py` 확장:
  - `create_page(parent_id, title, icon, blocks=[])` → POST `/v1/pages`.
  - `append_blocks(block_id, blocks)` → POST `/v1/blocks/{id}/children`, **100개씩 분할**.
  - `archive_block_children(block_id)` → 자식 조회 후 각 블록 PATCH `{archived:true}`(또는 DELETE). 페이지네이션.
- **신규 `app/core/markdown_to_notion_blocks.py`**: 마크다운 → Notion 블록.
  - 지원: H1/H2/H3, paragraph, bulleted/numbered/to-do list, quote, callout, code(language), divider, table, (가능 시) toggle.
  - 제약: rich-text **2000자/세그먼트** 분할, append **100블록/콜**, 중첩 **깊이 ≤ 8**(초과분은 평탄화). 미지원 마크다운은 안전하게 paragraph로.
- **신규 `app/service/notion_export_service.py`**:
  - CPS/PRD: 마크다운 → 블록.
  - 설계: DDD/SPACK/Architecture 그래프 → **문서 렌더**(아래 §5) → 블록.
  - 허브 템플릿 조립(§5) + 업서트(매핑 조회/생성/갱신).
- **신규 라우트** `app/api/notion_routes.py`: `POST /api/v2/notion/export`
  - body `{ projectName, docs: ["cps","prd","design"], team_id? }`
  - 응답 `{ hub_url, results: [{ doc, status:"updated|created|skipped|failed", url?, error? }] }`
  - 가드: 인증, 프로젝트 소유/팀 권한, Notion 토큰 존재(없으면 409 `notion_not_linked`).
  - 블록 수가 큰 경우 대비 **arq 잡 + task_id** 옵션(FE `pollJobUntilDone` 재사용). 초기 구현은 동기, 타임아웃 위험 시 잡 전환.

### FE (harness)
- `src/utils/notion.js`: `exportToNotionApi({ projectName, docs, parentPageId? })`.
- **공유 다이얼로그** `src/components/.../NotionExportDialog.vue`:
  - 문서 체크박스(CPS/PRD/설계, 기본 전체).
  - **최초 1회** 대상 위치 picker(`NotionPageList` 재사용) → 선택 후 BE가 기억(매핑 존재 시 picker 생략).
  - 진행률 + 완료 시 "Notion에서 열기"(hub_url) 링크 + 문서별 상태.
- **진입점**:
  - 05 인수(Deliverables) 페이지: "Notion으로 공유"(전체 docs).
  - 각 문서 탭(CPS/PRD/설계): 작은 "Notion" 버튼(해당 doc만 갱신).
- **미연동 처리**: `fetchNotionStatusApi().linked === false` → 버튼이 "Notion 연동하기"로 바뀌고 프로필 연동 다이얼로그로.
- **i18n**: 4개 언어(ko/en/zh/ja) `plan.notion`/공통 네임스페이스 확장.

## 5. "우리만의 틀" — Notion 템플릿 사양

### 허브 페이지
- 제목: `📦 {프로젝트명} — 기획·설계 (by Harness)`, 페이지 아이콘 📦.
- **콜아웃 배너**(브라운 톤): "Harness가 회의록에서 자동 정리한 기획·설계입니다." + 단계 진행(●●●●○) + `마지막 동기화 {일시}`.
- 바로가기(서브페이지 링크 3개) + divider.
- 서브페이지 3개 링크(🎯 핵심정리 / 📋 요구사항 / 🏗️ 시스템 설계).
- 푸터 콜아웃: "🔗 Harness에서 보기"(딥링크) + 동기화 시각.

### 서브페이지 내부
- **CPS** 🎯: `content` 마크다운 → 블록(4섹션 Context/Problem/Solution/Pending 그대로). 상단 메타(version, 갱신일).
- **PRD** 📋: `prd_content` 마크다운 → 블록(Epic→Story→AC 계층).
- **설계** 🏗️:
  - H2 기능 명세(SPACK): API/Entity/Policy를 **Notion 표**로.
  - H2 도메인 모델(DDD): Context별 **토글**, 내부에 Aggregate/Entity/Event 목록.
  - H2 시스템 아키텍처: **mermaid 코드블록**(`graph LR` 서비스/연결) + 텍스트 요약.
- 각 서브페이지 푸터: "🔗 Harness에서 보기" + 동기화 시각.

## 6. 권한 / 멀티테넌시
- 트리거 유저의 **개인 Notion 토큰**으로만 실행 → 연동자만 가능.
- 팀 프로젝트: 누른 사람이 연동돼 있어야 하며, 결과물은 그 사람의 워크스페이스에 생성. 매핑은 (user, project)로 저장하므로 팀원마다 자기 워크스페이스에 자기 허브를 가질 수 있음.

## 7. 에러 / 제약 처리
- `notion_not_linked`(409) → "Notion 연동 필요" + 연동 유도.
- 401(`NotionUnauthorized`) → "연동 만료, 다시 연결".
- 429(`NotionRateLimited`) → Retry-After 안내, 부분 진행분은 유지(멱등).
- append 100블록·rich-text 2000자 초과 → 분할.
- 저장된 page_id 404 → 재생성 + 매핑 갱신.
- 부분 실패 → 문서별 status로 어떤 게 실패했는지 노출.

## 8. 범위
- **포함**: CPS/PRD/설계 export, 허브+서브페이지 템플릿, 멱등 갱신, 위치 picker, 진입 버튼(인수+탭), i18n 4언어, 권한/에러 처리, markdown→blocks 변환기, 설계 그래프 렌더.
- **제외(YAGNI)**: Notion→Harness 역동기화, 자동/실시간 동기화(수동 버튼만), 코드(03)·점검(04) export, Notion DB(데이터베이스) 형태 출력.

## 9. 테스트 전략
- BE 단위: `markdown_to_notion_blocks`(블록 매핑, 2000자/100블록/깊이 분할), 설계 그래프 렌더러(빈 그래프/대형 그래프), export_service 업서트(생성/갱신/404 재생성) — Notion client는 모킹.
- BE 통합: `/api/v2/notion/export` 권한·미연동·부분실패 경로.
- FE 단위: `exportToNotionApi`, 다이얼로그 상태(미연동/문서선택/진행/완료/실패), 버튼 노출 조건.
- 회귀: 기존 import 흐름 무영향.

## 10. 미해결 / 가정
- 동기 vs arq 잡: 초기 동기, 블록 과다로 타임아웃 위험 확인되면 잡 전환(FE 폴링 재사용).
- mermaid는 Notion 뷰어 환경에 따라 렌더가 다를 수 있음 → 실패해도 텍스트 요약이 함께 있어 정보 손실 없음.
