# NORI 프론트엔드(FE) 작업 리스트 — 개요

> 코드명 **NORI** · 폴더 `singa-client` · 레포 `gayoje-client`
> 이 문서는 통합 마스터(`MASTER_TASKLIST.md`)에서 **프론트엔드(클라이언트/브라우저)에 해당하는 모든 것**만 추출·재구성한 FE 전용 작업 리스트의 개요다.
> 백엔드(크롤링/수집·데이터 가공·FastAPI 내부로직·결제 웹훅/정산·알림 발송 서버·Admin 백엔드·제출 대행 서버처리)는 제외하되, FE가 의존하는 **BE API ID는 dependencies에 교차참조**로 적었다.

---

## 1. 제품 한줄 요약

전국에 흩어진 가요제·노래대회 정보를 1차 공공 출처에서 자동 수집·정규화하여 통합 디렉토리로 제공하고(무료), ★음원/악보 제출 대행·주최측 접수 SaaS·제휴 마켓으로 수익화하는 **PWA 플랫폼**. FE 스택: **Vue 3 + Vuetify 3 + Pinia + vue-i18n + vite-plugin-pwa**, 카카오맵 SDK, 토스 결제위젯, FCM 웹푸시. (BE: FastAPI + PostgreSQL + Neo4j + Redis + arq + LiteLLM)

---

## 2. Phase별 FE 목표

| Phase | FE 목표 | 핵심 FE 산출물 |
|---|---|---|
| **Phase 0 (PoC)** | 최소 앱 셸로 수집 데이터 육안 검증, FCM 웹푸시 클라이언트(SW/VAPID/권한) 실도달 검증 | PoC 셸 화면, 커버리지 대시 진입점, 웹푸시 PoC SW |
| **Phase 1 (무료 디렉토리)** | 인트로/온보딩 → 홈/검색/리스트/필터/지도/캘린더 → 상세 전 섹션 → 회원/찜/제보/알림설정 → 작년 아카이브·영상·선곡분석 → 신청 가이드·LLM 작성도움·음원검증 UI + 디자인시스템·PWA·i18n·SEO·a11y·성능·분석 토대 | 공개 PWA(검색→상세→찜→알림), 4언어, WCAG 2.2 AA |
| **Phase 2 (거래)** | ★음원/악보 제출 대행 위저드 UI, 주최 접수 SaaS 공개 폼 렌더러, 요금제/결제(토스·카카오·네이버페이)/구독관리 화면, 무료↔유료 게이팅 UI, 알림톡 거래 알림 연동 | 결제·구독 화면, 제출 대행 플로우, 게이팅 UI |
| **Phase 3 (마켓)** | 제휴 마켓(보컬강사·녹음실·반주·의상) 디렉토리·리드·리뷰 화면 | 파트너 디렉토리/예약/리뷰 UI |

---

## 3. FE 정보구조(IA) & 디자인 원칙

### 3.1 글로벌 정보구조
```
[앱 셸]
 ├─ 인트로/온보딩 (첫방문)
 ├─ 홈 (마감임박·맞춤추천·지역·신규·인기·배너)
 ├─ 탐색(리스트) ── 필터패널 / 검색 / 뷰토글[카드·리스트·지도·캘린더]
 │     └─ 상세 (히어로·일정·상금·자격·★제출처·요강·날씨·위치·영상/선곡·유사·공유·신고)
 │           ├─ 신청 가이드 (스텝바이스텝)
 │           ├─ LLM 신청서 작성 도움 (동적 폼)
 │           └─ 음원/악보 준비·검증
 ├─ 아카이브 (작년 가요제·회차·곡·선곡분석·연도비교)
 ├─ 찜 / 비교
 ├─ 알림센터
 └─ 마이페이지 (프로필·찜·알림설정·신청이력·계정·결제내역·구독)
[Phase2+] 제출 대행 · 구독/결제 · 주최 접수 폼 · 제휴 마켓
```

### 3.2 내비게이션
- **모바일:** 하단탭(홈·탐색·찜·알림·마이) + 슬림 헤더(로고·검색·알림)
- **태블릿/데스크탑:** 상단 헤더(로고·검색바·알림·프로필·언어) + 드로어/전체메뉴 + 푸터(법적 표기)

### 3.3 반응형 breakpoint
| 구간 | 폭 | 레이아웃 |
|---|---|---|
| Mobile | 360–599px | 하단탭, 단일 컬럼, 바텀시트 필터 |
| Tablet | 600–959px | 2컬럼 그리드, 사이드 시트 |
| Desktop | 960–1919px | sticky 사이드바 + 본문, 헤더 내비 |
| Wide | ≥1920px | max-width 컨테이너 센터링 |

### 3.4 디자인 원칙
- **출처 투명성:** 모든 카드/섹션/추천에 출처 4종(source_url·기관·수집시각·방식) 표기. 결측 시 게시 차단(법무 핵심).
- **색 비의존:** 상태(모집중/마감임박/마감)·D-day는 색+아이콘+텍스트 동시 제공.
- **4상태 의무화:** 모든 UI는 로딩·빈·에러·오프라인 상태를 갖는다.
- **KST 단일 계산:** D-day·마감·상태는 서버 KST 계산값을 표시(클라 계산 금지).
- **한글 우선 타이포:** Pretendard self-host(font swap), 한국식 금액(만원 보조), KRW/날짜/상대시간 로케일 포맷.
- **재호스팅 금지:** 포스터/영상은 공식 임베드·썸네일·링크만(바이너리 재호스팅 금지).

---

## 4. 전체 Epic / Task 수 요약표 (FE 스코프)

| Phase | 파일 | Epic 수 | Task 수 |
|---|---|---:|---:|
| Phase 0 | `TASKLIST_PHASE0.md` | 3 | 6 |
| Phase 1 | `TASKLIST_PHASE1.md` | 43 | 163 |
| Phase 2 | `TASKLIST_PHASE2.md` | 12 | 18 |
| Phase 3 | `TASKLIST_PHASE3.md` | 3 | 9 |
| **합계** | — | **61** | **196** |

> Epic 수 = 각 Phase 파일의 `## [TAG]` 영역-에픽 섹션 수, Task 수 = `### [ID]` 헤더 수(GROUNZ `GRNZ-` 14건 포함).

> Task 수에는 GROUNZ 벤치마크 반영 신규 Task(`GRNZ-` 접두사)가 포함된다.

### 영역별 분포(FE)

| 영역 | 설명 | 주요 Phase |
|---|---|---|
| **NAV** | 인트로/온보딩·홈·검색바·글로벌 내비·거래/제휴 진입점 | P0·P1·P2·P3 |
| **LIST** | 리스트/카드·필터·검색·지도·캘린더·찜·비교·URL 동기화 | P1 |
| **DETAIL** | 상세 전 섹션 UI(포스터·일정·상금·자격·★제출처·요강·날씨·위치·영상/선곡·유사·공유·신고) | P1 |
| **APP** | 신청 가이드·LLM 작성도움·음원/악보 검증·제출 대행 플로우 | P1·P2 |
| **ARCH** | 작년 아카이브 화면·영상 임베드·선곡분석 시각화 | P1 |
| **AUTH** | 로그인/회원가입/프로필/마이페이지/알림설정/2FA 화면 + FE 인증 인프라 | P1 |
| **NOTI** | 알림 설정·알림센터 화면 + 클라이언트 웹푸시 등록/권한 + 날씨 위젯 | P0·P1·P2 |
| **PAY** | 요금제/결제/구독관리 화면 + 무료↔유료 게이팅 UI | P2 |
| **COM** | 디자인시스템·PWA·A11y·i18n·SEO/GEO·성능·분석·FE 보안/QA | P1 |
| **BIZ(FE)** | 제출 대행 위저드·주최 접수 공개 폼·제휴 마켓 디렉토리 | P2·P3 |
| **GRNZ** | GROUNZ 벤치마크 반영 신규 FE Task | P1·P3 |

---

## 5. 추천 빌드 순서 (FE 스프린트, 약 2주)

- **S0 (Phase0):** `NAV-0601/0602`(PoC 셸·커버리지 진입) · `NOTI-00-01`(웹푸시 PoC SW) → 수집 데이터 육안 검증·iOS 푸시 제약 결론
- **S1:** `COM-DS-*`(디자인시스템) · `COM-I18N-*` · `NAV-0101~0104`(앱셸/부팅/PWA 초기화) · `AUTH-E4/E8`(로그인 화면·FE 인증 인프라) → 토대
- **S2:** `NAV-0201~0209`(온보딩) · `NAV-0301~0312`(홈) · `NAV-0401~0404`(검색바) · `NAV-0501~0509`(글로벌 내비)
- **S3:** `LIST-E1~E5`(셸·카드·필터·검색) · `LIST-E9`(URL 동기화) · `GRNZ-LIST-*`(택소노미 필터·인기Top10·게시요청)
- **S4:** `LIST-E6/E7/E8`(지도·캘린더·찜/비교) · `DETAIL-EP02~EP04`(셸·히어로·일정/상금/자격)
- **S5:** `DETAIL-EP05~EP09`(★제출처·요강·날씨·위치·영상/선곡·공유/신고) · `GRNZ-DETAIL-*`(날씨 위젯·선곡 시각화)
- **S6:** `APP-EP01~03`(가이드·작성도움·음원검증) · `AUTH-E5/E6/E7`(프로필·마이·2FA) · `NOTI-02-01/04-02/04-03/05-03`(웹푸시 온보딩·알림설정·알림센터·날씨)
- **S7:** `ARCH-UI-E5-*`(아카이브 화면·영상 임베드·선곡 대시보드·연도비교) · `GRNZ-ARCH-*`(개인화 피드·아티클)
- **S8:** `COM-SEO-*` · `COM-A11Y-*` · `COM-PERF-*` · `COM-ANALYTICS-*` · `COM-LEGAL-*` · `COM-SEC-*` · `COM-QA-*`(FE 품질 게이트)
- **S9 (Phase2):** `PAY-E1-T1/T4`(FE 상수) · `PAY-E2`(게이팅 UI) · `PAY-E3-T3`(체크아웃) · `PAY-E4`(구독관리) · `PAY-E5-T5`(결제내역) · `NAV-0701/0702`(거래 진입)
- **S10 (Phase2):** `APP-EP04-06`(제출 대행 위저드) · `APP-EP05`(리마인더 UI) · `BIZ-E1-T4`(대행 추적 화면) · `BIZ-E2-T3`(주최 접수 공개 폼) · `NOTI-07`(알림톡 거래 알림 UI)
- **S11 (Phase3):** `NAV-0703`(제휴 진입) · `BIZ-E3`(제휴 마켓 디렉토리/리드/리뷰) · `DETAIL-08-03`(보컬강사 활성) · `GRNZ-P3-*`(구인구직·스토어/레슨)

---

## 6. 파일 안내

| 파일 | 내용 |
|---|---|
| `TASKLIST.md` | (이 문서) 개요·IA·요약표·빌드순서·크로스커팅 체크리스트·GROUNZ 반영표·Open Questions |
| `TASKLIST_PHASE0.md` | PoC 셸·커버리지 진입·웹푸시 PoC 클라이언트 |
| `TASKLIST_PHASE1.md` | 무료 디렉토리 전 FE 화면 + COM(디자인시스템·PWA·a11y·i18n·SEO·성능·분석·FE보안/QA) |
| `TASKLIST_PHASE2.md` | 결제/구독/게이팅·제출 대행·주최 접수 공개 폼·알림톡 거래 알림 FE |
| `TASKLIST_PHASE3.md` | 제휴 마켓 디렉토리/리드/리뷰 FE + 구인구직·스토어/레슨(GROUNZ) |

각 Task는 `[ID] 제목 / 설명 / 하위 subtask / acceptance criteria / edge cases / UI 상태(로딩·빈·에러·오프라인) / dependencies(BE ID 포함) / effort(S·M·L·XL) / priority(P0·P1·P2)` 구조를 따른다. ID는 마스터와 동일하게 안정 유지(`NAV-…`, `LIST-…`, `DETAIL-…` 등).

---

## 7. FE 크로스커팅 체크리스트

### 7.1 디자인시스템
- [ ] 시맨틱 디자인 토큰만 사용(하드코딩 색·간격 금지), SCSS+JS+CSS var 3중 (COM-DS-01)
- [ ] 라이트/다크/시스템 테마 토글+영속화, FOUC 없음 (COM-DS-02)
- [ ] 360–1920 반응형 그리드·safe-area, 네비 전환 무깨짐 (COM-DS-03)
- [ ] 공통 상태 패턴(스켈레톤/빈/에러/오프라인/권한) 표준 컴포넌트 (COM-DS-04)
- [ ] 도메인 컴포넌트(ContestCard·StatusChip·DdayBadge·SourceAttribution·PosterThumbnail·FilterBar·RegionSelect·DateRangePicker·ShareSheet·BookmarkToggle) (COM-DS-05)
- [ ] 한국 규격 폼 검증(사업자번호·휴대폰), reduced-motion (COM-DS-06)

### 7.2 PWA
- [ ] Web App Manifest + 아이콘 192/512/maskable + iOS 스플래시, Lighthouse installable (COM-PWA-01)
- [ ] 서비스워커(precache·런타임캐시[리스트 NetworkFirst/상세 SWR/이미지 CacheFirst]·오프라인 폴백·업데이트 토스트), 인증/결제 미캐시 (COM-PWA-02)
- [ ] A2HS 설치 프롬프트(비과노출) + iOS 수동 안내 (COM-PWA-03)
- [ ] 웹푸시 구독/권한/표시(D-day·날씨), iOS standalone 구독 (COM-PWA-04, NOTI-02-01)

### 7.3 접근성 (WCAG 2.2 AA)
- [ ] 키보드 완전 조작, 모달/라이트박스 포커스 트랩, 스킵링크, 라우트 announce (COM-A11Y-01)
- [ ] 스크린리더(VoiceOver/TalkBack/NVDA), aria-live(결과수·로딩·에러), 색 비의존 (COM-A11Y-02)
- [ ] 명도 대비 4.5:1, 터치 타깃 44px, 폼 라벨/에러 연결, axe critical 0 (COM-A11Y-03)
- [ ] 차트/영상 대체 텍스트, reduced-motion (ARCH-UI-E5-T4, COM-DS-06)

### 7.4 i18n (ko/en/ja/zh)
- [ ] vue-i18n + @intlify precompile(strict CSP), ko 폴백, lazy 청크 (COM-I18N-01)
- [ ] 언어 감지/전환/영속화 + KRW·날짜·상대시간 한국 포맷 (COM-I18N-02)
- [ ] 번역 거버넌스 + hreflang 4언어 + 공공데이터 한국어 원문 보존(기계번역 라벨+원문 토글) (COM-I18N-03)

### 7.5 SEO / GEO
- [ ] 메타/OG/Twitter/canonical/hreflang, 카톡 OG 미리보기, 비공개 noindex (COM-SEO-01)
- [ ] JSON-LD(Event/Breadcrumb/FAQ/Organization/VideoObject), eventStatus 동기화 (COM-SEO-02)
- [ ] 롱테일 랜딩(지역×연도×장르) SSR/프리렌더, doorway 회피, 동적 사이트맵, LCP<2.5s (COM-SEO-03)
- [ ] robots/사이트맵/네이버·다음 등록 + llms.txt/GEO 요약 (COM-SEO-04)

### 7.6 성능
- [ ] 이미지 AVIF/WebP·srcset·비율 고정(CLS<0.1)·LCP priority·blur-up (COM-PERF-01)
- [ ] 코드분할/프리페치, 폰트 swap+subset, 써드파티 facade(유튜브/지도) (COM-PERF-02)
- [ ] RUM(web-vitals) p75 LCP<2.5s/CLS<0.1/INP<200ms, CDN 캐시, Lighthouse CI 회귀 (COM-PERF-03)
- [ ] 목록 커서 페이징+가상 스크롤, 지도 서버 클러스터, 홈/캘린더 경량 응답 (LIST-E5, NAV-0312)

### 7.7 분석
- [ ] 이벤트 택소노미 + GA4/자체 SDK + Consent Mode v2(동의 게이팅), UTM 귀속 (COM-ANALYTICS-01)
- [ ] 퍼널/전환/수익 대시보드 + 결제 서버 이벤트 정합 (COM-ANALYTICS-02)
- [ ] 동의 전 비식별, 상세→제출대행 퍼널 재구성 (DETAIL-02-06, COM-LEGAL-02)

### 7.8 FE 보안 / QA
- [ ] access 토큰 메모리(비영속) / refresh HttpOnly+Secure+SameSite, 회전·재사용 탐지 (AUTH-E8-T1, COM-SEC-02)
- [ ] CSP unsafe-eval 없음, 보안헤더 A, XSS/오픈리다이렉트 0, 안전 새 탭(rel=noopener) (COM-SEC-01)
- [ ] 번들 secret 미포함, 결제 콜백/소셜 콜백 CSRF·위변조 방어 (COM-SEC-02/03)
- [ ] 단위/통합(Vitest+MSW), E2E(Playwright)+axe+시각회귀+모바일 매트릭스(삼성인터넷/Safari/인앱) (COM-QA-01/02)
- [ ] 모든 UI loading/empty/error/offline 4상태 (COM-DS-04)
- [ ] CI/CD 게이트(린트/타입/테스트/Lighthouse/보안스캔), 프리뷰 배포, 롤백 (COM-QA-04)

---

## 8. GROUNZ 벤치마크 반영표 (FE 관련만)

> **법적 주의:** GROUNZ는 **영감(UX 패턴)만** 참고한다. GROUNZ 데이터 **스크래핑은 절대 금지**(1차 출처만 가공, COM-LEGAL-01/INGEST-E7-T1). 아래 신규 Task는 `GRNZ-` 접두사 + "(GROUNZ 벤치)" 표기.

| 채택 패턴 | 반영 Task ID | Phase |
|---|---|---|
| 택소노미·필터 IA(카테고리탭+대상[아티스트/단체/공간]+지역17시도+분야[장르 이모지]+상금구간+진행중+정렬) | `GRNZ-LIST-01` | P1 |
| 상금 구간 필터 | `GRNZ-LIST-02` | P1 |
| 실시간 인기 공고 Top10(조회수 랭킹 사이드바) | `GRNZ-LIST-03` | P1 |
| 카드 anatomy(포스터+카테고리배지+조회수+주최명+D-day+찜) | `GRNZ-LIST-04` | P1 |
| 게시요청(제보) 진입 버튼/폼 | `GRNZ-LIST-05` | P1 |
| 조회수 노출 | `GRNZ-DETAIL-01` | P1 |
| 아티클(콘텐츠) 화면 | `GRNZ-ARCH-01` | P1 |
| 음역대/장르/지역 **개인화 피드**(차별화) | `GRNZ-NAV-01` | P1 |
| 선정곡 분석 시각화(차별화) | `GRNZ-ARCH-02` | P1 |
| 행사일 날씨 위젯(차별화) | `GRNZ-DETAIL-02` | P1 |
| 이벤트 카운터·인스타 링크·로그인 보상형 프롬프트·마스코트 톤 | `GRNZ-NAV-02` | P1 |
| 커뮤니티/Q&A/익명 화면(후순위) | `GRNZ-COM-01` | P1(후순위) |
| 구인구직 화면 | `GRNZ-P3-01` | P3 |
| 스토어/레슨 화면 | `GRNZ-P3-02` | P3 |

---

## 9. Open Questions / 리스크 (FE 관련)

**제품/정책**
1. 관심지역 최대 선택 개수, NEW 배지 기준 시간, 마감임박 D-day 임계값(D-7? D-14?) 확정. → 홈 캐러셀·필터 기본값·카드 배지에 직결. (NAV·LIST)
2. 게스트 허용 범위: 찜·검색기록 로컬 저장 후 머지 vs 로그인 필수 게이트. → 게스트→회원 병합 UX·로그인 유도 모달 빈도. (NAV·LIST·AUTH)
3. '종료' 가요제 기본 노출(숨김 vs 흐림) — 카드/리스트 상태 표현. (LIST)
4. 공개 프로필 노출 범위(닉네임/지역/장르 vs 자기소개)와 검색엔진 인덱싱 허용 → 프로필 화면 공개/비공개 토글·noindex 정책. (AUTH)

**기술/UX**
5. 지도 SDK 1차: 카카오맵 vs 네이버맵(쿼터·약관·길찾기 딥링크·국내 정확도) → 지도 뷰·상세 위치 위젯 SDK 결정. (LIST-E6, DETAIL-07)
6. 홈/목록 집계: 단일 `/home` vs 섹션별 분할 → 초기 렌더 전략·스켈레톤 구조. (NAV-0312)
7. 다국어: 공공데이터 한국어 원문(공고명) LLM 번역 vs 원문+안내 → 카드/상세 라벨 i18n 처리. (COM-I18N-03)
8. 포스터 자체 썸네일 생성/CDN 캐싱이 '재호스팅 금지'와 충돌하는지(법무 확정) → PosterThumbnail 컴포넌트 동작 범위. (DATA-T-MED-02, COM-LEGAL-01)

**거래/결제(FE)**
9. PG 1차: 토스 단독 vs 아임포트(멀티PG로 카카오/네이버페이 커버) → 체크아웃 화면 SDK·결제수단 버튼 구성. (PAY-E3)
10. 빌링키 정기결제 지원 수단(카카오/네이버페이 빌링 지원 여부 → 카드만 자동갱신?) → 구독관리 화면 결제수단 표기. (PAY-E4)
11. 제출 대행 법적 성격·마감 보장 SLA·MR 제공 금지 문구 → 제출 대행 위저드 고지/동의 카피. (BIZ-E1, APP-04)
12. iOS 사파리 웹푸시 제약(홈화면 추가 필요) → 온보딩/알림설정 안내 카피·대안(이메일) 흐름. (NOTI-02-01)

**리스크**
- iOS 웹푸시는 PWA 설치(standalone) 후에만 동작 → 온보딩·알림설정 전반에 명확한 안내 필요.
- HWP 인라인 미리보기 한계(HWP→PDF 변환 성공률) → 미리보기 실패 시 다운로드 폴백 UX 필수. (DETAIL-06-02)
- 출처 결측 시 게시 차단 정책 → FE는 SourceAttribution 결측을 에러 상태로 다뤄야 함(빈칸 노출 금지). (COM-LEGAL-01)
