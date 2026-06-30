# NORI FE — PHASE 1 (무료 통합 디렉토리)

> Phase 1 FE 범위: 인트로/온보딩 → 홈/검색/리스트/필터/지도/캘린더 → 상세 전 섹션 → 회원/찜/제보/알림설정 화면 → 작년 아카이브·영상·선곡분석 → 신청 가이드·LLM 작성도움·음원검증 UI + 디자인시스템·PWA·a11y·i18n·SEO·성능·분석·FE보안/QA.
> 공유 에픽(AUTH/NOTI)은 **화면·UX·클라이언트 로직만** 가져오고 BE API ID를 dependencies에 명시.

**Phase 1 요약:** Epic 43 · Task 163 (GROUNZ 신규 Task 12건 포함)

각 Task: `[ID] 제목 / 설명 / subtask / acceptance criteria / edge cases / UI 상태 / dependencies / effort / priority`

---

# A. NAV — 인트로/온보딩·홈·검색바·글로벌 내비

## [NAV] EP-NAV-01 · 앱 셸 · 스플래시 · 부팅/PWA 초기화

### [NAV-T-NAV-0101] AppShell 레이아웃 컨테이너
모바일 하단탭+슬림헤더 / 데스크탑 헤더+푸터, 콘텐츠 슬롯만 교체하는 전역 셸.
- subtask: v-app 슬롯 구성 / 브레이크포인트 표시규칙 / safe-area-inset / max-width 컨테이너 / 단일 스크롤 컨테이너+뒤로가기 스크롤 복원 / 토스트·모달 teleport 루트 / skip-link
- acceptance criteria: 모바일·태블릿·데스크탑에서 셸이 무깨짐 / 뒤로가기 시 스크롤 위치 복원 / skip-link로 본문 점프 가능 / 콘텐츠만 교체되고 셸은 유지
- edge cases: 키보드 노출 시 하단탭 처리 / 노치/홈인디케이터 safe-area / 초장문 콘텐츠 스크롤 복원
- UI 상태: 로딩(부팅 스플래시) · 빈 · 에러(전역 바운더리) · 오프라인(배너)
- dependencies: 없음
- effort: L · priority: P0

### [NAV-T-NAV-0102] 스플래시 + 부팅 시퀀스 오케스트레이션
첫방문→온보딩 / 재방문→홈 분기, 병렬 부팅과 오프라인 셸.
- subtask: 인라인 스플래시 / 병렬 부팅(세션·feature flag·원격설정·i18n·SW) / 타임아웃(2.5s) / 콜드·웜 분기 / 최소 노출 300ms / 오프라인 셸 / aria-busy
- acceptance criteria: 첫방문은 온보딩, 재방문은 홈으로 분기 / 2.5s 실패 시 캐시 진입 / 완전 오프라인 시 캐시 셸 표시 / reduced-motion 준수
- edge cases: 부팅 일부 실패(부분 진입) / 세션 만료 중 부팅 / SW 미지원 브라우저
- UI 상태: 로딩(스플래시) · 에러(부팅 실패 복구 CTA) · 오프라인(캐시 셸)
- dependencies: NAV-0101, AUTH `AUTH-E8-T1`(세션 부트스트랩)
- effort: L · priority: P0

### [NAV-T-NAV-0103] 라우터 가드·첫방문/온보딩/인증 분기
딥링크 게스트 온보딩 미강제, 보호 라우트 로그인 후 복귀.
- subtask: 온보딩 플래그(로컬+서버) / 딥링크 스킵 / meta.requiresAuth / redirect 보존 / 404 NotFound / 오픈리다이렉트 화이트리스트
- acceptance criteria: 딥링크 진입 게스트는 온보딩 강제 안 됨 / 보호 라우트는 로그인 후 원위치 복귀 / 서버 플래그가 로컬보다 우선 / 오픈리다이렉트 차단
- edge cases: returnUrl 외부 도메인(차단) / 온보딩 플래그 로컬·서버 불일치 / 존재하지 않는 라우트
- UI 상태: 로딩(가드 평가) · 에러(404/리다이렉트 차단) · 오프라인
- dependencies: NAV-0102, AUTH `AUTH-E8-T1`
- effort: M · priority: P0

### [NAV-T-NAV-0104] 오프라인/네트워크 전역 핸들링·업데이트 배너
오프라인 배너, 새버전 새로고침, 저속 이미지 다운그레이드.
- subtask: onLine+헬스핑 / 오프라인 배너+기능제한 / 재시도 큐 / SW updatefound 배너 / Network Information API / 디바운스
- acceptance criteria: 3초 내 오프라인 배너 노출·재연결 시 자동 해제 / 새 버전 감지 시 새로고침 유도 / 저속 네트워크에서 이미지 다운그레이드
- edge cases: 플랩핑 네트워크(디바운스) / SW 업데이트 중 사용자 액션 / 헬스핑 실패 vs 오프라인 구분
- UI 상태: 오프라인(배너) · 에러(헬스핑 실패) · 업데이트(새버전 토스트)
- dependencies: NAV-0101
- effort: M · priority: P1

## [NAV] EP-NAV-02 · 첫방문 온보딩 플로우

### [NAV-T-NAV-0201] 온보딩 컨테이너/스텝퍼/진행상태
8스텝 온보딩, 이탈 후 복원, 키보드 완주.
- subtask: 8스텝 정의 / 진행률 N/7+건너뛰기 / Pinia+localStorage 부분저장 / 스와이프·화살표·탭 / 분석 이벤트 / 완료 시 서버·로컬 분기
- acceptance criteria: 이탈 후 재진입 시 진행 복원 / 전 단계 스킵 가능 / 완료 플래그 저장 / 키보드만으로 완주
- edge cases: 중도 이탈/브라우저 종료 / 모든 단계 스킵 / 게스트 vs 로그인 완료 처리
- UI 상태: 로딩 · 빈 · 에러(저장 실패) · 오프라인(로컬만 저장)
- dependencies: EP-NAV-01
- effort: L · priority: P0

### [NAV-T-NAV-0202] 가치제안 인트로 슬라이드
스와이프/도트 캐러셀, 이미지 미로딩 시에도 카피 전달, 다국어.
- subtask: 슬라이드 캐러셀 / 도트 인디케이터 / 이미지 폴백 / i18n 카피
- acceptance criteria: 스와이프·도트로 이동 / 이미지 미로딩 시 카피로 가치 전달 / 4언어 렌더
- edge cases: 이미지 로드 실패 / reduced-motion(자동전환 off)
- UI 상태: 로딩(이미지) · 빈 · 에러 · 오프라인(캐시 이미지)
- dependencies: NAV-0201
- effort: M · priority: P1

### [NAV-T-NAV-0203] 위치 권한 + 역지오코딩 지역 프리필
허용 시 시군구 프리필, 거부 시 수동 전환, 좌표 라운딩+동의 고지.
- subtask: 권한 사전 설명 / Geolocation→백엔드 역지오코딩 / 폴백 / 최소수집(PIPA 좌표 라운딩) / 권한 상태 영속화
- acceptance criteria: 허용 시 시군구 프리필 / 거부 시 수동 선택으로 전환 / 좌표 라운딩+동의 고지 표시
- edge cases: 권한 거부/타임아웃 / 역지오코딩 실패 / 위치 서비스 OS 차단
- UI 상태: 로딩(좌표 취득) · 빈(권한 미허용) · 에러(역지오코딩 실패) · 오프라인
- dependencies: NAV-0201, NAV-0204, BE `DATA-T-MED-03`(역지오코딩)
- effort: M · priority: P1

### [NAV-T-NAV-0204] 관심지역 선택(시도·시군구 다중)
시도17+시군구 트리, 초성/부분검색, 전국 토글.
- subtask: 시도17+시군구 트리 / 초성 검색 / 칩 / 전국 토글 / 최대개수 가이드 / 정적 캐시+버전
- acceptance criteria: 초성·부분검색 동작 / 위치감지 프리필 반영 / 전국 토글 동작
- edge cases: 세종(시군구 없음)/제주 특수 / 최대 개수 초과 / 캐시 버전 불일치
- UI 상태: 로딩(트리) · 빈(검색 무결과) · 에러 · 오프라인(캐시 트리)
- dependencies: NAV-0201
- effort: M · priority: P0

### [NAV-T-NAV-0205] 장르/대회유형 선택
다중선택, 코드 시드 저장, 백엔드 분류 1:1.
- subtask: 장르 칩 다중 / 대회유형 / 코드 시드 매핑
- acceptance criteria: 다중선택 코드가 시드로 저장 / 백엔드 분류 코드와 1:1 매칭
- edge cases: 미선택(스킵) / 코드 미존재
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(로컬 저장)
- dependencies: NAV-0201
- effort: S · priority: P1

### [NAV-T-NAV-0206] 음역대/보컬 프로필 설정
모르면 스킵+기본값, 표준 보컬 스키마 재사용(선곡분석/제출대행 공유).
- subtask: 음역대 선택+자가진단 / 최고·최저음 슬라이더 / 참가경험 / 스킵 / 표준 스키마
- acceptance criteria: 모르면 스킵+기본값 적용 / 표준 보컬 스키마로 저장(선곡분석·제출대행 공유)
- edge cases: 전체 스킵 / 슬라이더 역전(최고<최저) 방지
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0201
- effort: M · priority: P2

### [NAV-T-NAV-0207] 알림 권한(웹푸시) + 채널 선택
허용 시 구독 서버등록, 거부 시 이메일 대안, 광고/정보 동의 분리.
- subtask: 가치 설명 후 권한 / 구독 생성→백엔드 / 채널 토글(웹푸시·이메일·알림톡) / iOS 사파리 제약 안내 / 정보통신망법 광고 동의 분리
- acceptance criteria: 허용 시 구독 서버 등록 / 거부 시 이메일 대안 제시 / 광고·정보 동의가 분리 저장
- edge cases: iOS 미설치(standalone 안내) / 권한 거부 / 알림톡 미연동
- UI 상태: 로딩(구독 등록) · 빈 · 에러(등록 실패) · 오프라인 · granted/denied/unsupported
- dependencies: NAV-0201, NAV-0102, BE `NOTI-T-02-02`(구독 등록 API)
- effort: L · priority: P0

### [NAV-T-NAV-0208] 미니 튜토리얼(코치마크) + 완료 화면
실제 요소 하이라이트, 1회 자동노출/재시작.
- subtask: 코치마크 오버레이 / 실제 요소 하이라이트 / 요약 화면 / 1회 노출+재시작
- acceptance criteria: 실제 요소를 정확히 하이라이트 / 요약이 입력값과 일치 / 1회 자동노출 후 재시작 가능
- edge cases: 요소 미렌더(스킵) / 화면 회전 중 위치 어긋남
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0201, EP-NAV-03
- effort: M · priority: P2

### [NAV-T-NAV-0209] 온보딩 영속화 + 게스트→회원 병합 + 프로필 동기화
게스트 취향을 로그인 후 유실 없이 병합, 동의 이력 버전/타임스탬프.
- subtask: 결과 스키마 확정(regions/genres/contestTypes/vocalProfile/notifyChannels/consents) / 게스트 localStorage / 로그인 업서트(병합정책) / 동의 이력(PIPA) / 추천 캐시 무효화
- acceptance criteria: 게스트 취향이 로그인 후 유실 없이 병합 / 동의 이력에 버전·타임스탬프 / 프로필 변경 시 추천 갱신
- edge cases: 게스트·서버 취향 충돌(병합 정책) / 중복 동의 / 로그인 중 네트워크 실패
- UI 상태: 로딩(병합) · 빈 · 에러(병합 실패) · 오프라인(로컬 보존)
- dependencies: NAV-0204~0207, BE `GET/PUT /users/me/preferences`·`/onboarding/state`
- effort: L · priority: P0

## [NAV] EP-NAV-03 · 메인/홈 화면

### [NAV-T-NAV-0301] 홈 컴포지션/레이아웃·데이터 오케스트레이션
섹션 독립 로딩/에러 격리, above-the-fold 우선, 풀투리프레시.
- subtask: 섹션 순서 / 섹션별 스켈레톤 / IntersectionObserver 지연로드 / 풀투리프레시 / SWR+TTL / 에러 격리
- acceptance criteria: 섹션이 독립적으로 로딩/에러 격리 / above-the-fold 우선 렌더 / 풀투리프레시 동작 / 게스트·로그인 분기
- edge cases: 일부 섹션 실패(나머지 정상) / 빠른 연속 새로고침 / 게스트 폴백
- UI 상태: 로딩(섹션 스켈레톤) · 빈(섹션별) · 에러(섹션 격리) · 오프라인(캐시)
- dependencies: EP-NAV-01, NAV-0312
- effort: XL · priority: P0

### [NAV-T-NAV-0302] 마감임박 캐러셀(D-day 카운트다운)
KST D-day 정확, 지역/장르 시드 반영.
- subtask: 마감일 정렬+지역·장르 가중 / 카드(포스터·D-day·찜·빠른 가이드) / KST 자정 경계 / 빈 상태
- acceptance criteria: KST D-day 정확 / 지역·장르 시드 반영 / 키보드·스와이프 동작
- edge cases: KST 자정 경계 전환 / 마감 임박 0건 / 자동스크롤 없음
- UI 상태: 로딩 · 빈(임박 없음) · 에러 · 오프라인(캐시)
- dependencies: NAV-0301, NAV-0309
- effort: M · priority: P0

### [NAV-T-NAV-0303] 맞춤 추천 피드
카드별 추천 사유, 게스트 폴백, 관심없음 즉시반영, 1차 출처 표기.
- subtask: 온보딩 시드+행동+위치 개인화 / 사유 태그 / 관심없음·지역빼기 피드백 / 게스트 인기·신규 폴백 / source 표기
- acceptance criteria: 카드별 추천 사유 노출 / 게스트는 인기·신규로 폴백 / 관심없음 즉시 반영 / 1차 출처 표기
- edge cases: 추천 0건(폴백) / 피드백 후 빈 피드 / 게스트→로그인 전환
- UI 상태: 로딩 · 빈(폴백) · 에러 · 오프라인(캐시)
- dependencies: NAV-0301, NAV-0209, BE 추천(Neo4j 유사)
- effort: L · priority: P0

### [NAV-T-NAV-0304] 지역별 섹션(관심지역 스위처)
칩 전환 갱신, 미설정 시 의미있는 기본.
- subtask: 관심지역 칩 / 전환 시 섹션 갱신 / 미설정 기본값
- acceptance criteria: 칩 전환 시 갱신 / 미설정 시 의미있는 기본 지역
- edge cases: 관심지역 미설정 / 해당 지역 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0301
- effort: M · priority: P1

### [NAV-T-NAV-0305] 신규 등록 섹션
수집시각 정렬, NEW 배지 규칙, 1차 출처 표기.
- subtask: 수집시각 정렬 / NEW 배지 규칙 / 출처 표기
- acceptance criteria: 수집시각 기준 정렬 / NEW 배지 규칙 일관 / 1차 출처 표기
- edge cases: NEW 기준 시간 경계 / 신규 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0301
- effort: S · priority: P1

### [NAV-T-NAV-0306] 인기 섹션(조회/찜/클릭)
집계 랭킹, 기간 토글, 어뷰징 보정.
- subtask: 집계 랭킹 / 기간 토글 / 어뷰징 보정 표시
- acceptance criteria: 집계 기반 랭킹 / 기간 토글 동작 / 어뷰징 보정 반영
- edge cases: 집계 데이터 부족 / 기간 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0301
- effort: M · priority: P1

### [NAV-T-NAV-0307] 공지/프로모션 배너(원격 구성)
배포 없이 추가/타겟팅, 닫기 기억.
- subtask: 원격 fetch(이미지·링크·우선순위·기간·타겟) / 캐러셀 / 닫기 억제 / 타겟 조건 / UTM 보존 / 안전 폴백
- acceptance criteria: 배포 없이 추가·타겟팅 / 닫기 기억 / 기간·타겟 평가
- edge cases: 원격 fetch 실패(폴백) / 타겟 미해당 / 만료 배너
- UI 상태: 로딩 · 빈(배너 없음) · 에러(폴백) · 오프라인
- dependencies: NAV-0301, NAV-0102
- effort: M · priority: P1

### [NAV-T-NAV-0308] 캘린더·지도 진입 모듈(프리뷰+진입)
필터 컨텍스트 유지 진입, 위치 미허용 기본 지역.
- subtask: 캘린더·지도 프리뷰 / 필터 컨텍스트 유지 진입
- acceptance criteria: 필터 컨텍스트 유지하며 진입 / 위치 미허용 시 기본 지역
- edge cases: 위치 미허용 / 프리뷰 데이터 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: NAV-0301
- effort: M · priority: P2

### [NAV-T-NAV-0309] 가요제 카드 컴포넌트(공용)+찜 토글
포스터 폴백, 낙관적 찜+롤백, 출처 표기. (전 화면 공용)
- subtask: 포스터(AVIF/WebP+blur-up) / 메타+상태 배지 / 출처(기관·방식 아이콘) / 찜(낙관적) / 공유(Web Share/OG) / aria-pressed / variant(캐러셀·리스트·그리드)
- acceptance criteria: 포스터 폴백 일관 / 낙관적 찜+실패 시 롤백 / 게스트 찜 로그인 후 유지 / 출처 표기
- edge cases: 포스터 없음(장르 폴백) / 찜 토글 연타 / 게스트→로그인 머지 / 공유 미지원 브라우저
- UI 상태: 로딩(스켈레톤) · 빈 · 에러(찜 롤백) · 오프라인(찜 큐잉)
- dependencies: EP-NAV-01, BE `BE-E04-T01`(찜 API)
- effort: L · priority: P0

### [NAV-T-NAV-0310] 홈 SEO/OG/구조화데이터·SSR/프리렌더
OG 카드, WebSite SearchAction, hreflang(ko/en/ja/zh).
- subtask: 동적 메타 / JSON-LD(WebSite SearchAction+ItemList Event) / hreflang+canonical / Vercel 프리렌더 / OG 이미지 파이프
- acceptance criteria: OG 카드 정상 / WebSite SearchAction 유효 / hreflang 4언어
- edge cases: 봇 렌더 / OG 이미지 생성 실패(폴백)
- UI 상태: (SSR/프리렌더) 로딩 없음 · 에러(프리렌더 폴백)
- dependencies: NAV-0301, COM `COM-SEO-01/02`
- effort: M · priority: P1

### [NAV-T-NAV-0311] 홈 분석 이벤트 트래킹 스키마
섹션 임프레션/클릭/검색 진입 일관, 동의 전 비식별.
- subtask: 이벤트 스키마 / IntersectionObserver 임프레션 / 스크롤 깊이 / 온보딩 퍼널 / 동의 기반 수집 / 배치+오프라인 큐
- acceptance criteria: 임프레션·클릭·검색 진입 일관 발화 / 동의 전 비식별
- edge cases: 동의 거부(최소 수집) / 오프라인(큐) / 중복 임프레션
- UI 상태: (백그라운드) 오프라인(큐잉)
- dependencies: NAV-0301, EP-NAV-02, COM `COM-ANALYTICS-01`
- effort: M · priority: P1

### [NAV-T-NAV-0312] 홈 집계 데이터 소비(섹션 통합 API 연동) — FE
홈 집계 API(`GET /home` 또는 섹션 분할) 소비·캐시·개인화 파라미터 전달. (서버 집계는 BE 소유)
- subtask: 개인화 파라미터 전달(regions/genres/vocalProfile) / 단일 또는 분할 요청 전략 / 클라 SWR 캐시 / 출처 필드 렌더 / 커서 처리
- acceptance criteria: above-the-fold 단일 요청 우선 / 게스트·로그인 분기 / 출처 메타 표시 / 캐시 적중 시 즉시 렌더
- edge cases: 일부 섹션 실패 / 캐시 stale / 개인화 파라미터 없음(게스트)
- UI 상태: 로딩(섹션) · 빈 · 에러 · 오프라인(캐시)
- dependencies: BE `NAV-T-NAV-0312`(홈 집계 API), 데이터 수집/정규화
- effort: M · priority: P0

## [NAV] EP-NAV-04 · 글로벌 검색바

### [NAV-T-NAV-0401] 검색바 컴포넌트 + 오버레이/포커스 모드
포커스 시 최근/인기/추천, 디바운스 자동완성, 모바일 풀스크린.
- subtask: 인라인·풀스크린 / 최근·인기·추천 칩 / 디바운스250ms / 키보드 내비+aria(combobox) / 클리어 / IME compositionend
- acceptance criteria: 포커스 시 최근·인기·추천 표시 / 디바운스 자동완성 / 키보드 combobox 동작 / 모바일 풀스크린
- edge cases: IME 조합 중 요청 방지 / 빠른 타이핑 경합 / 빈 입력
- UI 상태: 로딩(자동완성) · 빈(무결과) · 에러 · 오프라인(최근만)
- dependencies: EP-NAV-01, BE `NAV-T-NAV-0402`(자동완성 API)
- effort: L · priority: P0

### [NAV-T-NAV-0403] 최근/인기 검색어 관리
개별/전체 삭제, 집계 노출+비속어 필터.
- subtask: 최근 검색어 로컬 / 개별·전체 삭제 / 인기 집계 노출 / 비속어 필터
- acceptance criteria: 개별·전체 삭제 / 인기 집계 노출 시 비속어 필터
- edge cases: 저장 off / 로컬 가득참 / 비속어
- UI 상태: 빈(기록 없음) · 에러 · 오프라인(로컬)
- dependencies: NAV-0401
- effort: M · priority: P1

### [NAV-T-NAV-0404] 음성 검색(Web Speech API)
인식 결과 반영, 미지원 숨김.
- subtask: Web Speech API / 결과 반영 / 미지원 감지 숨김
- acceptance criteria: 인식 결과가 검색에 반영 / 미지원 브라우저 숨김
- edge cases: 권한 거부 / 인식 실패 / 미지원
- UI 상태: 로딩(인식 중) · 에러(인식 실패) · 오프라인 · unsupported(숨김)
- dependencies: NAV-0401
- effort: S · priority: P2

## [NAV] EP-NAV-05 · 글로벌 내비게이션

### [NAV-T-NAV-0501] 전역 헤더(로고·검색·알림·프로필·언어)
게스트/로그인 분기, 미읽음 뱃지, 언어 즉시반영.
- subtask: 로고·검색·알림·프로필·언어 / 게스트·로그인 분기 / 미읽음 뱃지 / 언어 전환
- acceptance criteria: 게스트·로그인 분기 / 미읽음 뱃지 정확 / 언어 즉시반영+유지
- edge cases: 뱃지 0/99+ / 로그인 상태 변경 / 언어 전환 중 fetch
- UI 상태: 로딩(뱃지) · 빈 · 에러 · 오프라인
- dependencies: EP-NAV-01, EP-NAV-04
- effort: L · priority: P0

### [NAV-T-NAV-0502] 모바일 하단탭 내비
홈/탐색/찜/알림/마이, 재탭 스크롤톱, 게스트 보호탭 로그인 유도.
- subtask: 5탭 / 활성 하이라이트 / 뱃지 / role=tablist / 키보드 노출 시 숨김
- acceptance criteria: 현재 위치 반영+재탭 스크롤톱 / 게스트 보호탭 로그인 유도 / safe-area
- edge cases: 키보드 노출(숨김) / 보호탭 게스트 진입 / 뱃지 동기화
- UI 상태: 로딩(뱃지) · 빈 · 에러 · 오프라인
- dependencies: EP-NAV-01
- effort: M · priority: P0

### [NAV-T-NAV-0503] 데스크탑 드로어/메뉴·전체메뉴
전 라우트/법적 링크 접근, 포커스 트랩/Esc/바깥클릭.
- subtask: 드로어 / 전체메뉴 / 법적 링크 / 포커스 트랩·Esc·바깥클릭
- acceptance criteria: 전 라우트·법적 링크 접근 / 포커스 트랩·Esc·바깥클릭 닫기
- edge cases: 포커스 복귀 / 긴 메뉴 스크롤
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: EP-NAV-01
- effort: M · priority: P1

### [NAV-T-NAV-0504] 전역 푸터(법적 링크·사업자정보·SNS·앱설치)
전자상거래/통신판매 법정 표기, 공공데이터 출처 고지.
- subtask: 사업자등록번호·통신판매업 신고번호·대표·주소·연락처 / 약관·방침·청소년·환불 링크 / 공공데이터 출처 고지 / PWA A2HS
- acceptance criteria: 전자상거래·통신판매 법정 표기 / 개인정보처리방침 강조 / 공공데이터 출처 고지
- edge cases: Phase1 사업자번호 미확정(placeholder) / 법정 표기 누락 방지
- UI 상태: (정적) 빈 · 에러
- dependencies: EP-NAV-01, COM `COM-LEGAL-02/03`
- effort: M · priority: P1

### [NAV-T-NAV-0505] 게스트 vs 로그인 전역 제어 + 로그인 유도 모달
보호 액션 로그인 후 자동완료, 카카오/네이버 모달.
- subtask: 전역 auth 스토어 / 보호 액션 가드 / 카카오·네이버 모달+약관 / intent 재개 / 다중탭 동기화(BroadcastChannel)
- acceptance criteria: 보호 액션 로그인 후 자동완료 / 로그아웃 게스트 초기화 / 세션 만료 부드러운 재로그인
- edge cases: 모달 중 취소 / intent 만료 / 다중탭 로그인/아웃
- UI 상태: 로딩(로그인) · 에러(로그인 실패) · 오프라인
- dependencies: EP-NAV-01, NAV-0309, AUTH `AUTH-E4-T1`
- effort: L · priority: P0

### [NAV-T-NAV-0506] 언어 전환(i18n)+로케일 영속/감지
자동 선택+유지, KST/KRW 포맷, 서버 콘텐츠 갱신.
- subtask: 언어 감지·전환·영속 / KST·KRW 포맷 / 서버 콘텐츠 갱신
- acceptance criteria: 자동 선택+유지 / KST·KRW 포맷 / 서버 콘텐츠 갱신
- edge cases: 미지원 로케일(폴백 ko) / 전환 중 fetch
- UI 상태: 로딩(콘텐츠 갱신) · 에러 · 오프라인
- dependencies: EP-NAV-01, COM `COM-I18N-02`
- effort: M · priority: P1

### [NAV-T-NAV-0507] 테마(라이트/다크/시스템)+접근성 설정
전역 적용+유지, WCAG AA, 모션 감소.
- subtask: 테마 토글 / 시스템 연동 / 모션 감소 / 접근성 설정 영속
- acceptance criteria: 전역 적용+유지 / WCAG AA 대비 / 모션 감소 반영
- edge cases: 시스템 테마 변경 실시간 / FOUC 방지
- UI 상태: (즉시 적용) 오프라인
- dependencies: EP-NAV-01, COM `COM-DS-02`
- effort: M · priority: P2

### [NAV-T-NAV-0508] PWA 설치 유도(A2HS)+iOS 안내
비침습 유도+닫기 제한, iOS 수동 가이드, 설치 후 숨김.
- subtask: beforeinstallprompt / iOS 수동 가이드 / 닫기 제한 / 설치 후 숨김
- acceptance criteria: 비침습 유도+닫기 제한 / iOS 수동 가이드 / 설치 후 숨김
- edge cases: iOS(prompt 미지원) / 이미 설치됨 / 반복 닫기
- UI 상태: 빈(미지원 숨김)
- dependencies: EP-NAV-01, COM `COM-PWA-03`
- effort: S · priority: P2

### [NAV-T-NAV-0509] 전역 에러 바운더리·404/오프라인/점검
흰화면 대신 복구 페이지, 모니터링 리포팅.
- subtask: 에러 바운더리 / 404·점검·오프라인 페이지 + CTA / 모니터링 리포팅
- acceptance criteria: 흰화면 대신 복구 페이지 / 404·점검·오프라인 CTA / 모니터링 리포팅
- edge cases: 렌더 중 예외 / 점검 모드 원격 플래그 / 중첩 에러
- UI 상태: 에러(복구) · 오프라인 · 점검
- dependencies: EP-NAV-01
- effort: M · priority: P1

### [GRNZ-NAV-01] 음역대/장르/지역 개인화 피드 (GROUNZ 벤치 — 차별화)
온보딩의 음역대·장르·지역 프로필로 홈 피드를 개인화하는 차별화 피드. (GROUNZ는 영감만, 데이터 스크래핑 금지)
- subtask: 개인화 시드(음역대+장르+지역) 활용 / 사유 태그(음역대 적합 등) / 게스트 폴백 / "내게 맞는 곡 난이도" 힌트
- acceptance criteria: 음역대·장르·지역 기반 정렬이 추천에 반영 / 사유 태그 노출 / 게스트는 인기 폴백
- edge cases: 음역대 미설정(스킵) / 데이터 부족 / 피드백 즉시 반영
- UI 상태: 로딩 · 빈(폴백) · 에러 · 오프라인(캐시)
- dependencies: NAV-0303, NAV-0206, BE 추천(Neo4j)
- effort: M · priority: P1

### [GRNZ-NAV-02] 이벤트 카운터·인스타 링크·로그인 보상형 프롬프트·마스코트 톤 (GROUNZ 벤치)
홈/내비의 그로스 위젯(이벤트 카운터·SNS 링크·로그인 보상 프롬프트)과 마스코트 톤 적용. (GROUNZ는 영감만)
- subtask: 진행중 이벤트 카운터 위젯 / 인스타 등 SNS 링크 / 비로그인 보상형 프롬프트(가입 시 혜택) / 마스코트 일러스트·카피 톤
- acceptance criteria: 이벤트 카운터 표시 / SNS 링크 안전 새 탭 / 게스트 보상 프롬프트 비침습 노출 / 마스코트 톤 일관
- edge cases: 진행 이벤트 0(숨김) / 보상 프롬프트 반복 억제 / SNS 링크 무효
- UI 상태: 로딩 · 빈(숨김) · 에러 · 오프라인
- dependencies: NAV-0301, NAV-0307
- effort: S · priority: P1

---

# B. LIST — 리스트/카드·필터·검색·지도·캘린더·찜·비교·URL

## [LIST] E1 · 리스트/카드 뷰 셸 & 뷰 토글

### [LIST-E1-T1] ContestListPage 라우트·반응형 셸
3 브레이크포인트 무깨짐, 뒤로가기 스크롤/필터/뷰 복원, sticky 사이드바.
- subtask: /contests 라우트 / useDisplay 분기(데스크탑 사이드바·모바일 바텀시트) / 스크롤 복원 / sticky 헤더+safe-area
- acceptance criteria: 3 브레이크포인트 무깨짐 / 뒤로가기 시 스크롤·필터·뷰 복원 / sticky 사이드바 / 1초 내 스켈레톤
- edge cases: 매우 긴 리스트 복원 / 회전 / 필터 적용 중 뒤로가기
- UI 상태: 로딩(스켈레톤) · 빈 · 에러 · 오프라인
- dependencies: 없음
- effort: L · priority: P0

### [LIST-E1-T2] 결과 헤더(건수·뷰 토글·정렬)
뷰/정렬 URL 반영+복원, 필터 칩 즉시반영.
- subtask: 총 건수(i18n 복수형) / 뷰토글(카드·리스트·지도·캘린더) URL 동기화 / 정렬(마감임박·최신·상금·인기·거리) / 활성 필터 칩+초기화
- acceptance criteria: 뷰·정렬 URL 반영+복원 / 필터 칩 즉시반영 / 거리순은 위치 권한 시만 / 건수 스켈레톤
- edge cases: 위치 미허용(거리순 비활성) / 건수 0 / 잘못된 URL 정렬값
- UI 상태: 로딩(건수) · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1
- effort: M · priority: P0

### [LIST-E1-T3] 전 상태(로딩/빈/에러/오프라인/부분실패) 컴포넌트
6상태 전용화면+복구, 오프라인 stale 표시, 1회 자동재시도.
- subtask: 뷰모드별 스켈레톤 / 빈결과(완화 CTA) / 에러(지수백오프+수동) / 오프라인 캐시 / 부분실패 배너 / online 자동 재페치 / AbortController
- acceptance criteria: 6상태 전용화면+복구 / 오프라인 stale 표시 / 1회 자동재시도
- edge cases: 부분실패(일부 섹션) / 재시도 폭주 방지 / 오프라인→온라인 자동
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 부분실패
- dependencies: LIST-E1-T1
- effort: M · priority: P0

### [LIST-E1-T4] 리스트/검색 a11y·SEO/OG·i18n·분석
키보드 전 흐름, 결과수 aria-live, JSON-LD Rich Results, 4언어.
- subtask: tab order / aria-live 결과수 / 카드 alt·대비 / 무한스크롤 '더보기' 병행 / JSON-LD(Event/ItemList) / 필터 조합 noindex/canonical / 분석 이벤트
- acceptance criteria: 키보드 전 흐름 / 결과수 aria-live / canonical·JSON-LD Rich Results / 4언어·로케일 포맷 / 이벤트 발화
- edge cases: 무한스크롤 스크린리더 / 필터 조합 폭발(canonical) / 4언어 키 누락
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1, LIST-E1-T2, COM `COM-SEO-02`, `COM-A11Y-02`
- effort: M · priority: P1

## [LIST] E2 · 카드/리스트 뷰 & 무한스크롤

### [LIST-E2-T1] ContestCard(포스터·상태·메타)
포스터 폴백, 상태 4종 색맹대비, KST D-day, 출처 표기.
- subtask: v-img(webp/avif·blur-up·3:4) / 장르 그라데이션 폴백 / 상태 배지 / D-day(KST) / 상금 한국식 / 장르 칩 / 찜·비교·공유 / 출처 라벨 / prefetch
- acceptance criteria: 포스터 폴백 일관 / 상태 4종 색맹대비 / KST D-day 정확 / 찜·비교·공유 충돌 없음 / 출처 표기
- edge cases: 포스터 없음 / 상금 비공개 / D-day 마감 경계 / 액션 연타
- UI 상태: 로딩(스켈레톤) · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1, BE `LIST-E5-T1`(목록 API)
- effort: L · priority: P0

### [LIST-E2-T2] ContestListRow(컴팩트)
동일 데이터 형태 전환, 터치 타깃 48px.
- subtask: 가로형 행 / useContestMeta 컴포저블 공유 / 테이블 모드 옵션
- acceptance criteria: 카드와 동일 데이터 형태 전환 / 터치 타깃 48px / 메타 일관
- edge cases: 좁은 폭 줄바꿈 / 긴 제목 말줄임
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E2-T1
- effort: M · priority: P1

### [LIST-E2-T3] 무한스크롤+페이지네이션 토글·성능
자연 로드+중복없음, 가상스크롤 60fps, 뒤로가기 복원 무재요청.
- subtask: IntersectionObserver sentinel / 커서 페이징 / in-flight 가드 / '더보기' 병행 / 페이지네이션 모드 / 가상 스크롤 / 클라 dedupe / CLS 최소화
- acceptance criteria: 자연 로드+중복없음 / 추가실패 인라인 재시도 / 커서 리셋 / 가상스크롤 60fps / 뒤로가기 복원 무재요청
- edge cases: 동시 로드 경합 / 커서 변경(필터) / 빠른 스크롤
- UI 상태: 로딩(추가 행) · 빈 · 에러(인라인 재시도) · 오프라인
- dependencies: LIST-E2-T1, LIST-E1-T3
- effort: L · priority: P0

### [LIST-E2-T4] 카드 액션: 찜·공유·비교
낙관적 찜+롤백, 게스트 저장/로그인 유도, 카카오 공유.
- subtask: 낙관적 찜 / 게스트 머지·로그인 게이트 / Web Share·카카오 공유 / 비교 트레이 / 디바운스
- acceptance criteria: 낙관적 찜+롤백 / 비로그인 게스트 저장/로그인 유도 / 공유 URL 상세 / 비교 개수 초과 안내
- edge cases: 게스트→로그인 머지 / 공유 미지원 / 비교 초과
- UI 상태: 로딩 · 빈 · 에러(롤백) · 오프라인(큐잉)
- dependencies: LIST-E2-T1, BE `BE-E04-T01`
- effort: M · priority: P1

## [LIST] E3 · 필터 패널 & 다차원 필터링

### [LIST-E3-T1] 지역 필터(시도→시군구 종속)
종속 시군구, 내 주변 반경 변환, URL/칩 일관.
- subtask: 시도17 다중 / 종속 시군구 / 내 주변(권한+반경 슬라이더→거리 필터) / 카운트 프리뷰 / 세종·제주 특수
- acceptance criteria: 종속 시군구만 노출 / 다중 조합 / 내 주변 반경 변환 / URL·칩 일관
- edge cases: 세종(시군구 없음)/제주 / 위치 미허용 / 카운트 0
- UI 상태: 로딩(카운트) · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1, BE `LIST-E5-T1`
- effort: L · priority: P0

### [LIST-E3-T2] 장르 필터
다중선택, 미분류 처리 일관.
- subtask: 칩 다중(트로트·발라드·창작·대학·실버·동요·가스펠·국악·기타) / 그룹핑·평면 / OR 매칭
- acceptance criteria: 다중선택 정확 반영 / 미분류 처리 일관
- edge cases: 미분류 항목 / 전체 선택
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1
- effort: M · priority: P0

### [LIST-E3-T3] 상금·접수상태·온오프라인·참가자격
슬라이더/입력 동기화, 기본 '모집중+마감임박', 정규화 필드 매칭.
- subtask: 상금 레인지+직접입력 / 상태 다중(D-7) / 온·오프라인·혼합 / 참가자격(연령·거주·아마추어·개인팀) / 카운트 프리뷰
- acceptance criteria: 슬라이더·입력 동기화 / 기본 '모집중+마감임박' / 정규화 필드 매칭
- edge cases: 상금 비공개 / 자격 미상 / 슬라이더 역전
- UI 상태: 로딩(카운트) · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1
- effort: L · priority: P0

### [LIST-E3-T4] 행사일/접수기간 범위 필터
기준 전환(행사일/접수마감), 캘린더뷰 상태 공유.
- subtask: 행사일·접수마감 기준 토글 / 범위 피커+프리셋(주말·이번달·3개월) / KST 경계 / 캘린더 공유
- acceptance criteria: 결과 정확 / 기준 전환 / 캘린더뷰 상태 공유
- edge cases: 범위 역전 / KST 경계 / 미정 일정
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1
- effort: M · priority: P0

### [LIST-E3-T5] 필터 패널 셸(바텀시트·적용/초기화·카운트·딥링크)
모바일 적용 전 미변경, 데스크탑 디바운스 즉시.
- subtask: 데스크탑 즉시(디바운스300ms)·모바일 임시상태+적용 / 아코디언+뱃지 / 전체·섹션 초기화 / count-only 프리뷰 / URL 양방향 / 프리셋 저장(Phase2)
- acceptance criteria: 모바일 적용 전 미변경 / 데스크탑 디바운스 즉시 / 초기화 정확 / 활성 개수 뱃지
- edge cases: 적용 취소 / 카운트 fetch 실패 / URL 복원
- UI 상태: 로딩(카운트) · 빈 · 에러 · 오프라인
- dependencies: LIST-E3-T1~T4
- effort: L · priority: P0

## [LIST] E4 · 통합검색·자동완성·오타보정·검색기록

### [LIST-E4-T1] 검색바 컴포넌트·입력 UX
IME 불필요 요청 없음, 경합 없이 최신 추천.
- subtask: 입력 UX / IME compositionend / 최신 추천 경합 처리 / Enter·추천 제출 URL 반영
- acceptance criteria: IME 중 불필요 요청 없음 / 경합 없이 최신 추천 / Enter·추천 제출 URL 반영
- edge cases: IME 조합 / 빠른 타이핑 / 빈 제출
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E1-T1
- effort: M · priority: P0

### [LIST-E4-T2] 자동완성·오타보정·추천 패널
엔티티 그룹+하이라이트, did-you-mean, 키보드 선택.
- subtask: 그룹화(가요제·지역·장르·주최) / 하이라이트 / did-you-mean / 무결과 유사어 / aria-activedescendant / 추천→필터 변환
- acceptance criteria: 엔티티 그룹+하이라이트 / 오타 제안 / 키보드 선택 / 지역·장르 필터 변환
- edge cases: 무결과(유사어) / 초성·자모 / 키보드 wrap
- UI 상태: 로딩 · 빈(유사어) · 에러 · 오프라인
- dependencies: LIST-E4-T1, BE `LIST-E5-T2`(검색·자동완성)
- effort: L · priority: P0

### [LIST-E4-T3] 최근/인기·검색기록 관리
로컬 저장/삭제 최신순, 인기 랭킹 클릭 검색, 저장 off.
- subtask: 로컬 저장·삭제 / 인기 랭킹 / 저장 off 시 미저장
- acceptance criteria: 로컬 저장·삭제 최신순 / 인기 랭킹 클릭 검색 / 저장 off 시 미저장
- edge cases: 저장 off / 로컬 가득 / 인기 0건
- UI 상태: 빈 · 에러 · 오프라인(로컬)
- dependencies: LIST-E4-T1, BE `LIST-E5-T2`
- effort: M · priority: P1

## [LIST] E6 · 지도 뷰

### [LIST-E6-T1] 지도 SDK 통합·마커/클러스터
카카오맵 SDK, 상태별 마커, 클러스터, SDK 실패 리스트 폴백.
- subtask: 카카오맵 SDK / 상태별 마커 / 서버+클라 클러스터 / bounds_changed 디바운스 / 미니카드 / 위치없음 배지
- acceptance criteria: 줌·드래그 갱신+클러스터 / 마커 미니카드 / 상태별 색 / SDK 실패 시 리스트 폴백
- edge cases: SDK 로드 실패(폴백) / 좌표 없음 / 대량 마커
- UI 상태: 로딩(지도·마커) · 빈 · 에러(SDK 실패→리스트) · 오프라인
- dependencies: BE `LIST-E5-T3`(지도 경량 API), LIST-E1-T1
- effort: L · priority: P0

### [LIST-E6-T2] 현위치·이 지역 재검색·리스트-지도 동기화
위치 거리정렬/반경, bbox 재검색, 양방향 하이라이트.
- subtask: Geolocation+반경 / 이 지역 재검색(자동·수동 토글) / 하단 미니리스트 하이라이트 / 권한 폴백(서울)
- acceptance criteria: 위치 거리정렬·반경 / bbox 재검색 / 양방향 하이라이트 / 거부 시 기본 위치
- edge cases: 권한 거부(서울) / 빠른 드래그 재검색 / 리스트·지도 동기화 누락
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E6-T1, LIST-E3-T1
- effort: L · priority: P1

## [LIST] E7 · 캘린더 뷰

### [LIST-E7-T1] 월간/주간 렌더·일자별 표시
월/주 전환, 멀티데이 막대, 행사일/마감 색 구분.
- subtask: 월간 6주 그리드+주간 / 도트·개수·+N / 행사(파랑)·마감(빨강) 토글 / 멀티데이 막대 / 공휴일 / 프리·넥스트 프리페치
- acceptance criteria: 월·주 전환+정확 표시 / 멀티데이 막대 / 행사일·마감 색 구분 / 필터 적용
- edge cases: 멀티데이 경계 / 같은 날 다수 / 공휴일
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `LIST-E5-T3`(캘린더 API), LIST-E1-T1
- effort: L · priority: P1

### [LIST-E7-T2] 일자 선택 패널·ICS 내보내기·알림 연동
일자별 목록, 유효 .ics, 찜 필터.
- subtask: 일자 클릭 패널 / .ics·구글캘린더 / 찜만 보기 토글 / D-day 알림 진입
- acceptance criteria: 일자별 목록 / 유효 .ics / 찜 필터
- edge cases: .ics 멀티데이 / 알림 미허용 / 찜 0
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E7-T1
- effort: M · priority: P2

## [LIST] E8 · 찜 & 다중 대회 비교

### [LIST-E8-T1] 찜 상태 store·게스트/로그인 동기화
전 뷰 일관 즉시반영, 게스트 머지, 오프라인 동기화.
- subtask: Pinia(optimistic·rollback) / 게스트 localStorage+머지(dedupe) / 디바운스 / 카운트 뱃지 / 오프라인 큐잉
- acceptance criteria: 전 뷰 일관 즉시반영 / 게스트 머지 / 오프라인 동기화
- edge cases: 게스트→로그인 머지 충돌 / 오프라인 큐 재생 / 중복 찜
- UI 상태: 로딩 · 빈 · 에러(롤백) · 오프라인(큐)
- dependencies: LIST-E2-T4, BE `BE-E04-T01`
- effort: M · priority: P0

### [LIST-E8-T2] 비교 트레이·비교 테이블
최대 개수+초과 안내, 차이 강조, 모바일 가로스크롤, URL 재현.
- subtask: 플로팅 트레이(최대4) / 비교 테이블(상금·일정·마감·지역·장르·자격·상태·D-day) / 차이 하이라이트 / 공유 URL
- acceptance criteria: 최대 개수+초과 안내 / 항목 나란히+차이 강조 / 모바일 가로스크롤 / URL 재현
- edge cases: 초과 추가 / 항목 제거 / URL 복원
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E8-T1, LIST-E2-T4
- effort: L · priority: P1

## [LIST] E9 · URL 쿼리 동기화 & 상태 관리

### [LIST-E9-T1] 필터/검색/정렬/뷰 ↔ URL 양방향 동기화
URL 반영+새로고침/공유 복원, 기본값 생략, 잘못된 값 폴백.
- subtask: 직렬화 스키마(csv·기본값 생략) / 복원+검증 / replace·push 전략 / 뷰별 파라미터(map bbox/zoom·calendar month/basis) / 히스토리 정리 / 새니타이즈
- acceptance criteria: URL 반영+새로고침·공유 복원 / 기본값 생략 / 뒤로·앞으로 직관 / 잘못된 값 폴백
- edge cases: 잘못된 파라미터 / 히스토리 폭주 / 뷰 전환 파라미터
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E3-T5, LIST-E4-T1, LIST-E1-T2
- effort: L · priority: P0

### [GRNZ-LIST-01] 택소노미·필터 IA(카테고리탭+대상+지역+분야+상금+진행중+정렬) (GROUNZ 벤치)
GROUNZ식 통합 필터 IA: 카테고리탭 + 대상(아티스트/단체/공간) + 지역17 + 분야(장르 이모지) + 상금구간 + 진행중 토글 + 정렬을 한 패널로 통합. (GROUNZ는 영감만, 스크래핑 금지)
- subtask: 상단 카테고리 탭 / 대상 세그먼트(아티스트·단체·공간) / 지역17 / 분야 칩(장르 이모지) / 진행중 토글 / 정렬 / 기존 LIST-E3 필터와 IA 통합
- acceptance criteria: 카테고리·대상·지역·분야·상금·진행중·정렬이 한 IA로 일관 동작 / 장르 이모지 노출 / 진행중 토글 기본값 합의
- edge cases: 대상 미분류 / 이모지 폰트 폴백 / 필터 조합 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: LIST-E3-T5, LIST-E9-T1
- effort: L · priority: P1

### [GRNZ-LIST-02] 상금 구간 필터 (GROUNZ 벤치)
상금을 구간(예: ~50만/~100만/~500만/500만+)으로 빠르게 거르는 프리셋 필터. (GROUNZ는 영감만)
- subtask: 상금 구간 프리셋 칩 / 직접입력 레인지 연동 / 비공개 상금 처리 / 카운트 프리뷰
- acceptance criteria: 구간 프리셋이 상금 레인지와 동기화 / 비공개 상금 별도 처리 / 카운트 반영
- edge cases: 비공개 상금 / 구간 경계 / 직접입력과 충돌
- UI 상태: 로딩(카운트) · 빈 · 에러 · 오프라인
- dependencies: LIST-E3-T3, GRNZ-LIST-01
- effort: S · priority: P1

### [GRNZ-LIST-03] 실시간 인기 공고 Top10(조회수 랭킹 사이드바) (GROUNZ 벤치)
조회수 기반 실시간 인기 Top10을 리스트/홈 사이드바에 노출. (GROUNZ는 영감만)
- subtask: Top10 사이드바 위젯 / 조회수·순위 표시 / 기간 토글 / 어뷰징 보정 / 데스크탑 sticky·모바일 섹션
- acceptance criteria: 조회수 랭킹 Top10 표시 / 클릭 시 상세 이동 / 어뷰징 보정 반영
- edge cases: 데이터 부족(10개 미만) / 동률 / 모바일 배치
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(캐시)
- dependencies: BE 인기 집계(`NAV-T-NAV-0306` 연계)
- effort: M · priority: P1

### [GRNZ-LIST-04] 카드 anatomy 확장(조회수+카테고리배지+주최명+D-day+찜) (GROUNZ 벤치)
ContestCard에 조회수·카테고리 배지·주최명을 추가해 GROUNZ식 카드 정보 밀도 확보. (GROUNZ는 영감만)
- subtask: 조회수 표시(천단위) / 카테고리 배지 / 주최명 / 기존 D-day·찜·출처와 정렬 / variant 일관
- acceptance criteria: 조회수·카테고리·주최명이 카드에 일관 노출 / 출처 표기 유지 / 색맹 대비 유지
- edge cases: 조회수 0 / 주최명 결측 / 긴 주최명 말줄임
- UI 상태: 로딩(스켈레톤) · 빈 · 에러 · 오프라인
- dependencies: LIST-E2-T1, NAV-0309
- effort: S · priority: P1

### [GRNZ-LIST-05] 게시요청(제보) 진입 버튼/폼 (GROUNZ 벤치)
리스트/상세에서 누락 가요제를 제보하는 게시요청 진입 버튼과 폼. (GROUNZ는 영감만, 1차 출처 검수 게이트)
- subtask: 게시요청 진입 버튼(리스트·상세) / 제보 폼(공고명·출처 링크·지역·연락) / 비로그인 캡차 / 접수번호 안내 / 중복 rate-limit
- acceptance criteria: 게시요청 버튼 노출 / 제보 폼 제출 시 접수번호 / 비로그인 캡차 / 검수 전 비공개 안내
- edge cases: 비로그인 / 중복 제보 / 출처 링크 무효 / 스팸
- UI 상태: 로딩(제출) · 빈 · 에러 · 오프라인 · 성공(접수번호)
- dependencies: BE `BE-E04-T02`(제보 API), `DETAIL-T-01-04`
- effort: M · priority: P1

---

# C. DETAIL — 상세 화면 전 섹션 UI

## [DETAIL] EP-DETAIL-02 · 상세 셸/라우팅/상태관리/SEO 기반

### [DETAIL-T-02-01] 라우트·slug 정규화·딥링크/앵커
id만으로 동작+canonical 정규화, 해시 섹션 스크롤, 없는 가요제 404.
- subtask: id 기반 라우트 / slug canonical 정규화 / 해시 섹션 스크롤 / 404
- acceptance criteria: id만으로 동작+canonical 정규화 / 해시 섹션 스크롤 / 없는 가요제 404
- edge cases: 잘못된 slug / 존재하지 않는 id / 앵커 미존재 섹션
- UI 상태: 로딩 · 에러(404) · 오프라인
- dependencies: BE `DETAIL-T-01-01`(상세 aggregate API)
- effort: S · priority: P0

### [DETAIL-T-02-02] Pinia 상세 스토어·페치 오케스트레이션
메인 즉시 렌더+보조 lazy, 이탈 시 abort, 섹션 실패 격리.
- subtask: useFestivalDetailStore / IntersectionObserver lazy fetch / dedupe+abort / SWR
- acceptance criteria: 메인 즉시 렌더+보조 lazy / 이탈 시 abort / 섹션 실패 격리
- edge cases: 빠른 이탈(abort) / 보조 일부 실패 / 중복 fetch
- UI 상태: 로딩(섹션) · 빈 · 에러(섹션 격리) · 오프라인(캐시)
- dependencies: BE `DETAIL-T-01-01`, `DETAIL-T-01-02`(보조 엔드포인트)
- effort: L · priority: P0

### [DETAIL-T-02-03] DetailView 셸·반응형·스티키 CTA
360/768/1280 무깨짐, 모바일 스티키 CTA, 앵커 스무스 스크롤.
- subtask: 데스크탑 2컬럼(본문+사이드 요약·제출·날씨·공유) / 모바일 하단 CTA(찜·공유·제출대행) / 앵커 칩
- acceptance criteria: 360/768/1280 무깨짐 / 모바일 스티키 CTA safe-area / 앵커 스무스 스크롤
- edge cases: 짧은 본문 / 긴 사이드 / safe-area
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: DETAIL-T-02-02
- effort: M · priority: P0

### [DETAIL-T-02-04] 전역 상태: 스켈레톤/빈/에러/오프라인/404/검수중
섹션 독립 전환, 취소/연기/검수중 상단 노출.
- subtask: 섹션 스켈레톤 / 빈·에러·오프라인·404·검수중 / 취소·연기·검수중 상단 배너
- acceptance criteria: 섹션 독립 전환 / 오프라인 캐시 표시 / 취소·연기·검수중 상단 노출
- edge cases: 검수중 배지 / 취소·연기 동시 / 일부 섹션만 실패
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 404 · 검수중
- dependencies: DETAIL-T-02-02
- effort: M · priority: P0

### [DETAIL-T-02-05] SEO/OG/JSON-LD/SSR·i18n·a11y 랜드마크
카톡 OG 미리보기, Event Rich Results, Lighthouse 90+.
- subtask: 동적 메타·OG / schema.org Event(eventStatus 매핑) / hreflang / 랜드마크 / OG 이미지 폴백 / 프리렌더
- acceptance criteria: 카톡 OG 미리보기 / Event Rich Results 유효 / Lighthouse SEO·a11y 90+ / 4언어 키 CI
- edge cases: eventStatus 매핑 / OG 이미지 생성 실패 / 비공개 noindex
- UI 상태: (SSR/프리렌더) 에러(폴백)
- dependencies: BE `DETAIL-T-01-01`, COM `COM-SEO-02`
- effort: L · priority: P0

### [DETAIL-T-02-06] 분석 이벤트 계측(전 섹션)
핵심 CTA/섹션 1회 발화, 상세→제출대행 퍼널 재구성.
- subtask: 섹션 임프레션 / CTA 클릭 / 퍼널 이벤트 / 동의 거부 최소수집
- acceptance criteria: 핵심 CTA·섹션 1회 발화 / 상세→제출대행 퍼널 재구성 / 동의 거부 최소수집
- edge cases: 중복 임프레션 / 동의 거부 / 오프라인 큐
- UI 상태: (백그라운드) 오프라인(큐)
- dependencies: DETAIL-T-02-02, COM `COM-ANALYTICS-01`
- effort: M · priority: P1

## [DETAIL] EP-DETAIL-03 · 히어로·포스터·핵심요약

### [DETAIL-T-03-01] 포스터 갤러리·확대 라이트박스·캐러셀
blurhash 점진로드, 라이트박스 키보드/포커스 트랩, 출처 항상.
- subtask: 캐러셀 / 핀치·더블탭 줌·스와이프·키보드 / LQIP→full / srcset / 출처·공식 표기 / 0장 기본 비주얼
- acceptance criteria: blurhash 점진로드 / 라이트박스 키보드·포커스 트랩 / 출처 항상 표기
- edge cases: 0장(기본 비주얼) / 줌 한계 / 포커스 복귀
- UI 상태: 로딩(blurhash) · 빈(기본 비주얼) · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: M · priority: P0

### [DETAIL-T-03-02] 핵심요약 카드
무스크롤 핵심 파악, 상태 색+아이콘, 참가비 0=무료 명확.
- subtask: 핵심 요약(일정·지역·상금·상태·D-day) / 상태 색+아이콘 / 무료 명확
- acceptance criteria: 무스크롤 핵심 파악 / 상태 색+아이콘(색만 금지) / 참가비 0=무료 명확
- edge cases: 참가비 0 / 상금 비공개 / 일정 미정
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: S · priority: P0

### [DETAIL-T-03-03] 헤더 액션: 찜/공유/조회수/신고
낙관적 찜+롤백, 비로그인 모달 후 원복, 조회수 천단위.
- subtask: 낙관적 찜 / 공유 시트 / 조회수(천단위) / 신고 진입
- acceptance criteria: 낙관적 찜+롤백 / 비로그인 모달 후 원복 / 조회수 천단위
- edge cases: 비로그인 / 연타 / 조회수 0
- UI 상태: 로딩 · 빈 · 에러(롤백) · 오프라인
- dependencies: DETAIL-T-02-02, EP-DETAIL-08, EP-DETAIL-09
- effort: S · priority: P0

### [DETAIL-T-03-04] 출처/원문 투명 표기(법무 핵심)
1+ 출처+원문 링크, 상대+절대 시각, 안전 새 탭.
- subtask: 기관·방식·수집시각·원문 / 복수 출처 우선표시 / AI 정규화 안내 / last_verified_at / rel=noopener
- acceptance criteria: 1+ 출처+원문 링크 / 상대+절대 시각 / 안전 새 탭
- edge cases: 출처 결측(게시 차단) / 복수 출처 / 링크 무효
- UI 상태: 빈(출처 경고) · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`, COM `COM-LEGAL-01`
- effort: S · priority: P0

## [DETAIL] EP-DETAIL-04 · 일정/상금/자격/신청방법

### [DETAIL-T-04-01] 일정 타임라인+D-day+캘린더 추가
KST 자정 D-day, 마감 자동 전환, .ics/구글캘린더, TBD 처리.
- subtask: 단계별 타임라인 / 다음 핵심 마감 자동 선택+카운트다운 / 진행률 바 / 알림 진입 / 날짜 역전 경고
- acceptance criteria: KST 자정 D-day / 마감 자동 전환 / .ics·구글캘린더 / TBD 일정 미정 표시
- edge cases: 날짜 역전 / TBD / 자정 경계
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: M · priority: P0

### [DETAIL-T-04-02] 상금/시상 내역
순위·금액·인원 표+합계, 비공개 안내, 만원 보조.
- subtask: 상금 표(순위·금액·인원) / 합계 / 비공개 안내 / 만원 보조
- acceptance criteria: 순위·금액·인원 표+합계 / 비공개 안내 / 만원 보조 표기
- edge cases: 비공개 / 부분 공개 / 비금전 상품
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: S · priority: P1

### [DETAIL-T-04-03] 참가자격+자가진단 체크
불릿+원문 대조, 자가진단 로컬만/즉시 폐기, 모호 원문 확인.
- subtask: 자격 불릿 / 원문 대조 토글 / 자가진단 체크(로컬·즉시 폐기) / 모호 안내
- acceptance criteria: 불릿+원문 대조 / 자가진단 로컬만·즉시 폐기 / 모호 시 원문 확인 안내
- edge cases: 자격 미상 / 모호 표현 / 개인정보 비저장
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: M · priority: P1

### [DETAIL-T-04-04] 신청방법+가이드/대행 연결
채널/서류 한눈, mailto/tel, 마감 임박 강조+대행 CTA(Phase2 게이팅).
- subtask: 신청 채널·서류 / mailto·tel / 마감 임박 강조 / 가이드·대행 CTA(Phase2 게이팅)
- acceptance criteria: 채널·서류 한눈 / mailto·tel 동작 / 마감 임박 강조+대행 CTA 게이팅
- edge cases: 마감 후(비활성) / 대행 Phase1 미오픈 / 채널 결측
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`, DETAIL-T-04-01
- effort: M · priority: P0

## [DETAIL] EP-DETAIL-05 · ★음원/악보 제출처·제출방식 (최우선)

### [DETAIL-T-05-01] 제출처/제출방식 정보 카드
채널/형식/용량/네이밍/마감 명확, 음원·악보 필요여부 명시, 제출 마감 별도 D-day.
- subtask: 제출 채널 / 음원(포맷·용량·길이) / 악보(포맷·매수·조성) / MR / 네이밍 규칙 강조 / 제출 마감 D-day / 원문 규정 펼치기
- acceptance criteria: 채널·형식·용량·네이밍·마감 명확 / 음원·악보 필요여부 명시 / 제출 마감 별도 D-day
- edge cases: 음원만/악보만 / 네이밍 규칙 결측 / 제출 마감 ≠ 접수 마감
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-01`, DETAIL-T-04-01
- effort: M · priority: P0

### [DETAIL-T-05-02] 제출 준비 체크리스트+파일 사전 검증(클라)
서버 전송 없이 형식/용량/길이 검증, 권장 파일명 생성.
- subtask: 체크리스트 / File API·Web Audio 메타 / 네이밍 생성기 / 검증 배지 / Phase1 서버 미전송
- acceptance criteria: 서버 전송 없이 형식·용량·길이 검증 / 권장 파일명 생성 / 초과 사유 표시
- edge cases: 미지원 포맷 / Web Audio 실패 / 대용량
- UI 상태: 로딩(검증) · 빈 · 에러(검증 실패) · 오프라인
- dependencies: DETAIL-T-05-01
- effort: M · priority: P1

### [DETAIL-T-05-03] 제출 대행 CTA·진입 게이팅(Phase2 연결)
Phase1 사전등록 전환 측정, Phase2 규격 전달, 마감 후 비활성.
- subtask: 가격·절차 미니카드 / Phase1 사전관심 / Phase2 컨텍스트 전달(festival_id·제출규격) / 자격·마감 활성·비활성
- acceptance criteria: Phase1 사전등록 전환 측정 / Phase2 규격 전달 / 마감 후 비활성
- edge cases: 마감 후 / Phase2 미오픈 / 자격 미달
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: DETAIL-T-05-01
- effort: S · priority: P0

## [DETAIL] EP-DETAIL-06 · 요강·신청서 다운로드·미리보기·LLM 파싱요약

### [DETAIL-T-06-01] 첨부 목록·안전 다운로드 UI
프록시 안정+파일명 보존, 스캔 미통과 차단, 형식/용량/유형 표기.
- subtask: 첨부 목록 / 안전 다운로드(프록시·파일명 보존) / 스캔 미통과 차단 / 형식·용량·유형 표기
- acceptance criteria: 프록시 안정+파일명 보존 / 스캔 미통과 차단 / 형식·용량·유형 표기
- edge cases: 스캔 미통과 / 대용량 / 파일명 인코딩
- UI 상태: 로딩 · 빈(첨부 없음) · 에러(스캔 차단) · 오프라인
- dependencies: BE `DETAIL-T-01-05`(첨부 프록시·스캔)
- effort: S · priority: P0

### [DETAIL-T-06-02] 인라인 미리보기(PDF/HWP→PDF/이미지)
PDF 인라인 페이지/줌, HWP 불가 시 다운로드 폴백, 모바일 사용성.
- subtask: pdf.js / HWP·HWPX→PDF / 이미지 라이트박스 재사용 / 첫 페이지 썸네일 카드
- acceptance criteria: PDF 인라인 페이지·줌 / HWP 불가 시 다운로드 폴백 / 모바일 사용성
- edge cases: HWP 변환 실패(폴백) / 대용량 PDF / 모바일 줌
- UI 상태: 로딩(렌더) · 빈 · 에러(폴백) · 오프라인
- dependencies: BE `DETAIL-T-01-05`, DETAIL-T-06-01
- effort: M · priority: P1

### [DETAIL-T-06-03] LLM 파싱요약 패널(핵심 추출+원문 대조+신뢰도)
구조화 요약+근거, AI 면책 항상, 부정확 피드백 evals.
- subtask: 섹션별 bullet+원문 근거 토글 / 신뢰도 배지+면책 / 비동기 생성 / 신청서 프리필 컨텍스트 / 품질 피드백
- acceptance criteria: 구조화 요약+근거 / AI 면책 항상 / 미생성 시 생성중 / 부정확 피드백 evals 연계
- edge cases: 생성중 / 신뢰도 낮음 / 근거 환각 표시
- UI 상태: 로딩(생성중) · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-02`, `DETAIL-T-01-05`
- effort: L · priority: P0

## [DETAIL] EP-DETAIL-07 · 날씨·위치/지도/교통/주차

### [DETAIL-T-07-01] 행사일 날씨 카드(기상청, D-14부터)
D-14 이내 실예보/이전 준비중, venue 좌표 정확, 기상청+갱신시각 표기.
- subtask: D-14~D-11 준비중 / D-14 이내 예보(기온·강수·하늘·풍속) / 우천 안내 / 캐시 stale
- acceptance criteria: D-14 이내 실예보·이전 준비중 / venue 좌표 정확 / 기상청+갱신시각 표기
- edge cases: D-14 이전(준비중) / 좌표 없음 / 다회차
- UI 상태: 로딩 · 빈(준비중) · 에러 · 오프라인(stale)
- dependencies: BE `DETAIL-T-01-02`, `NOTI-T-05-03`(날씨 조회 API)
- effort: M · priority: P1

### [DETAIL-T-07-02] 위치 지도·길찾기·대중교통/주차
venue 마커+주소 복사, 길찾기 딥링크+웹 폴백, 주차/교통 표기.
- subtask: 카카오·네이버 지도 임베드+정적 폴백 / 길찾기 딥링크(카카오내비·T맵·네이버) / transit·parking note / lazy 로드 / 온라인 행사 처리
- acceptance criteria: venue 마커+주소 복사 / 길찾기 딥링크+웹 폴백 / 주차·교통 표기
- edge cases: 온라인 행사(좌표 없음) / SDK 실패(정적) / 딥링크 미설치
- UI 상태: 로딩 · 빈(온라인 행사) · 에러(정적 폴백) · 오프라인
- dependencies: BE `DETAIL-T-01-01`
- effort: M · priority: P1

## [DETAIL] EP-DETAIL-08 · 과거 영상·선곡, 보컬강사, 유사 대회, 찜

### [DETAIL-T-08-01] 과거 영상 임베드+선정곡/수상곡
공식 임베드(재호스팅 없음), 차수별 선정곡, 삭제 unavailable.
- subtask: 유튜브·네이버TV 임베드(facade) / 차수별 수상·선정곡 / 출처·채널 표기 / 곡→외부 검색 링크
- acceptance criteria: 공식 임베드 재호스팅 없음 / 차수별 선정곡 정리 / 삭제 영상 unavailable 표시
- edge cases: 영상 삭제 / 임베드 불가(링크) / 차수 결측
- UI 상태: 로딩(facade) · 빈 · 에러(unavailable) · 오프라인
- dependencies: BE `DETAIL-T-01-02`, ARCH `VID-E2-T2`
- effort: M · priority: P1

### [DETAIL-T-08-02] 선곡 분석 패널(인사이트)
경향 시각화/요약, 데이터 부족 안내, AI 면책.
- subtask: 경향 시각화 / 요약 / 데이터 부족 안내 / AI 면책
- acceptance criteria: 경향 시각화·요약 / 데이터 부족 안내 / AI 면책
- edge cases: 표본 미달 / 데이터 0 / 색맹 팔레트
- UI 상태: 로딩 · 빈(데이터 부족) · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-02`, ARCH `STAT-E4-T3`
- effort: M · priority: P2

### [DETAIL-T-08-03] 추천 보컬강사(제휴, Phase3 게이팅)
Phase3 미만 coming soon, 지역/장르 매칭+제휴 표기.
- subtask: coming soon(Phase3 미만) / 지역·장르 매칭 / 제휴 표기 / 연결 플로우
- acceptance criteria: Phase3 미만 coming soon / 지역·장르 매칭+제휴 표기 / 연결 플로우
- edge cases: Phase3 미오픈 / 매칭 0 / 제휴 표기 누락 방지
- UI 상태: 로딩 · 빈(coming soon) · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-02`
- effort: S · priority: P2

### [DETAIL-T-08-04] 유사 대회 추천
관련성 추천+상세 이동, 마감 시 신청가능 우선, 0건 빈상태.
- subtask: Neo4j 유사도(지역·장르·대상·시기·상금) / 카드 / 더보기→리스트 프리셋
- acceptance criteria: 관련성 추천+상세 이동 / 마감 시 신청가능 우선 / 0건 빈상태
- edge cases: 0건 / 모두 마감 / 추천 편향
- UI 상태: 로딩 · 빈(0건) · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-02`(similar)
- effort: M · priority: P1

### [DETAIL-T-08-05] 찜 토글+알림 연동
즉시반영+롤백, D-day 알림 옵트인, 로그인 후 임시찜 동기화.
- subtask: 찜 토글 / D-day 알림 옵트인 / 로그인 후 임시찜 동기화
- acceptance criteria: 즉시반영+롤백 / D-day 알림 옵트인 / 로그인 후 임시찜 동기화
- edge cases: 비로그인 / 연타 / 알림 미허용
- UI 상태: 로딩 · 빈 · 에러(롤백) · 오프라인(큐)
- dependencies: DETAIL-T-02-02, BE `BE-E04-T01`
- effort: S · priority: P0

## [DETAIL] EP-DETAIL-09 · 공유 & OG 이미지 & 오류·변경 신고

### [DETAIL-T-09-01] 공유 시트(카카오톡/링크/Web Share/QR)
카톡 포스터/제목/일정 정상, 링크복사 전 브라우저, 모바일 네이티브 우선.
- subtask: 카카오 공유(포스터·제목·일정) / 링크 복사 / Web Share / QR / 모바일 네이티브 우선
- acceptance criteria: 카톡 포스터·제목·일정 정상 / 링크복사 전 브라우저 / 모바일 네이티브 우선
- edge cases: Web Share 미지원(폴백) / 카카오 SDK 실패 / QR
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: DETAIL-T-09-02, DETAIL-T-02-05
- effort: M · priority: P0

### [DETAIL-T-09-02] 동적 OG 이미지 연동(소비) — FE
OG 이미지 엔드포인트(`/og/festivals/{id}.png`) 메타 주입·SNS 검증. (생성은 BE/Edge)
- subtask: OG 메타 주입 / 카톡·SNS 검증 / 한글 줄바꿈·말줄임 확인 / 저작권 불확실 시 자체 카드 폴백 확인
- acceptance criteria: 1200x630 SNS 정상 / 한글 줄바꿈·말줄임 / 저작권 불확실 시 자체 카드
- edge cases: 생성 실패(폴백) / 긴 제목 / 포스터 저작권
- UI 상태: (메타) 에러(폴백)
- dependencies: BE `DETAIL-T-09-02`/`BE-E07-T02`(OG 생성)
- effort: M · priority: P1

### [DETAIL-T-09-03] 오류·변경·취소 신고 모달+takedown
접수번호+안내, 저작권 우선 라우팅, rate limit.
- subtask: 신고 모달(오류·변경·취소) / 접수번호 / 저작권 takedown 우선 라우팅 / rate limit / 비로그인 캡차
- acceptance criteria: 접수번호+안내 / 저작권 우선 라우팅 / rate limit
- edge cases: 비로그인 / 중복 신고 / 저작권 takedown
- UI 상태: 로딩(제출) · 빈 · 에러 · 오프라인 · 성공(접수번호)
- dependencies: BE `DETAIL-T-01-04`(신고·모더레이션)
- effort: M · priority: P1

### [GRNZ-DETAIL-01] 조회수 노출 (GROUNZ 벤치)
상세 헤더에 조회수를 노출하고 어뷰즈 방지 카운팅을 연동. (GROUNZ는 영감만)
- subtask: 조회수 표시(천단위) / sendBeacon 카운팅 트리거 / 30분 디듀프 / 봇 미반영
- acceptance criteria: 조회수 천단위 표시 / 30분 디듀프 1회 / LCP 비차단
- edge cases: 봇 / 새로고침 폭주 / 조회수 0
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `DETAIL-T-01-03`(조회수 카운팅)
- effort: S · priority: P1

### [GRNZ-DETAIL-02] 행사일 날씨 위젯 강화 (GROUNZ 벤치 — 차별화)
DETAIL-07-01 날씨 카드를 차별화 위젯으로 강화(우천 대비 팁·다회차 탭·시각 아이콘). (GROUNZ는 영감만)
- subtask: 시각 아이콘 강화 / 우천 대비 팁 / 다회차 탭 / 특보 role=alert / 갱신시각·출처
- acceptance criteria: 날씨 위젯 시각성 강화 / 우천 안내 / 특보 강조 / 출처·갱신시각 표기
- edge cases: D-14 이전(준비중) / 좌표 없음 / 특보
- UI 상태: 로딩 · 빈(준비중) · 에러 · 오프라인(stale)
- dependencies: DETAIL-T-07-01, BE `NOTI-T-05-03`
- effort: S · priority: P1

---

# D. APP — 신청 가이드·LLM 작성도움·음원/악보 검증 UI

## [APP] EP-APP-01 · 대회별 신청 가이드 & 체크리스트

### [APP-T-01-03] 신청 가이드 상세 화면(스텝바이스텝)
반응형 스테퍼/체크리스트, D-day 서버 동기화, 전 블록 출처+제보, 키보드 토글.
- subtask: GuideStepper / D-day 카운트다운 / step 카드(서류·링크·도움받기) / HWP 변환텍스트+다운로드·PDF 임베드 / SourceBadge / CTA(작성도움·음원가이드·제출대행) / 마감 readonly / 오프라인 큐잉
- acceptance criteria: 반응형 스테퍼·체크리스트 / D-day 서버 동기화 / 진행률 저장·복원 / 전 블록 출처+제보 / 키보드 토글
- edge cases: 마감 후(readonly) / 비로그인(본문 가능·저장 불가) / 오프라인 체크 큐잉
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(큐)
- dependencies: BE `APP-T-01-02`(가이드 API)
- effort: L · priority: P0

### [APP-T-01-04] 마이페이지 '내 신청 진행' 위젯
마감임박순 정렬, 1탭 이동, 제출 대행 상태 반영.
- subtask: 진행 위젯 / 마감임박순 정렬 / 1탭 이동 / 제출 대행 상태(Phase2)
- acceptance criteria: 마감임박순 정렬 / 1탭 이동 / 제출 대행 상태 반영
- edge cases: 진행 0(빈상태) / 마감 후 / 대행 Phase2 미오픈
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `APP-T-01-02`, APP-T-01-03
- effort: M · priority: P1

## [APP] EP-APP-02 · LLM 신청서 작성 도움

### [APP-T-02-03] 신청서 작성 도움 UI(동적 폼+인라인 어시스트)
스키마 동적 렌더+실시간 제약, 인라인 예시/다듬기/이어쓰기, 자동저장 복원, HWP/PDF 내보내기.
- subtask: FieldRenderer / 인라인 어시스트 바+게이지 / 예시 패널(어조) / diff 모달 / SSE 고스트 텍스트 / 폴리시 리포트 / 자동저장+버전 / 내보내기(HWP 템플릿·PDF·복사·대행 전달) / PIPA 고지
- acceptance criteria: 스키마 동적 렌더+실시간 제약 / 인라인 예시·다듬기·이어쓰기 즉시 반영 / 자동저장 복원 / HWP·PDF 내보내기 / 쿼터 안내 / 키보드·스크린리더 완수
- edge cases: 쿼터 초과(429 안내) / SSE 끊김 / 자동저장 충돌 / 민감항목 마스킹
- UI 상태: 로딩(생성·SSE) · 빈 · 에러(쿼터·SSE 실패) · 오프라인(자동저장 로컬)
- dependencies: BE `APP-T-02-01`(폼 스키마), `APP-T-02-02`(작성도움 API)
- effort: XL · priority: P0

## [APP] EP-APP-03 · 음원/악보 준비 가이드 & 검증

### [APP-T-03-01] 음원/악보/MR 준비 가이드 화면 — FE
대회별 길이/포맷/수 매핑 반영, 저작권 체크리스트, 다국어.
- subtask: 표준 가이드(포맷·비트레이트·길이·네이밍) / MR·반주 안내 / 악보 가이드 / 저작권 체크리스트(KOMCA·표절·AI) / 맞춤 차이 하이라이트 / 면책
- acceptance criteria: 대회별 요구사항 반영 / 저작권 체크리스트(공통+대회별) / 다국어
- edge cases: 요구사항 결측 / 대회별 차이 / 저작권 모호
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `APP-T-03-01`(요구사항 매핑)
- effort: M · priority: P0

### [APP-T-03-03] 음원/악보 준비·검증 UI(업로드·미리듣기·체크리스트)
검증 결과 즉시 시각화, 파형+길이 게이지, 저작권 완료 전 대행 불가.
- subtask: 드래그앤드롭+재개 / 검증 배지+사유 / 파형 플레이어 / 악보 캐러셀 / 저작권 체크리스트 / 트림·재인코딩 / 제출대행 CTA(Phase2)
- acceptance criteria: 검증 결과 즉시 시각화 / 미리듣기·파형+길이 게이지 / 저작권 완료 전 대행 불가 / 실패 해결 안내 / 모바일 동작
- edge cases: 업로드 중단·재개 / 검증 실패(pass/warn/fail) / 미지원 포맷 / 대용량
- UI 상태: 로딩(업로드·검증) · 빈 · 에러(검증 실패) · 오프라인
- dependencies: BE `APP-T-03-02`(업로드·검증 API)
- effort: L · priority: P0

---

# E. ARCH — 작년 아카이브 화면·영상 임베드·선곡분석 시각화

## [ARCH] UI-E5 · 작년 가요제 아카이브 화면

### [ARCH-UI-E5-T1] 아카이브 인덱스(연도/가요제 목록)
4상태, 필터/정렬/검색 URL 반영, 스크린리더, SSR OG.
- subtask: 연도·가요제 목록 / 필터·정렬·검색 URL / 스크린리더 / SSR OG
- acceptance criteria: 4상태 / 필터·정렬·검색 URL 반영 / 스크린리더 / SSR OG
- edge cases: 연도 결손 / 0건 / URL 복원
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `STAT-E4-T3`(선곡 분석 공개 API)
- effort: M · priority: P0

### [ARCH-UI-E5-T2] 회차 상세(공연·수상·영상 임베드·선곡)
영상 공식 임베드/링크만, 출처 전 노출, play 분석, 키보드 접근.
- subtask: 회차 헤더 / 수상 섹션 / 라인업 / 영상 임베드(lazy+타임스탬프 딥링크) / 임베드 불가 링크 폴백 / 선곡 카드(난이도+면책) / 출처 / VideoObject embedUrl
- acceptance criteria: 영상 공식 임베드/링크만 / 출처 전 노출 / play 분석 / 키보드 접근
- edge cases: 영상 삭제 / 임베드 불가(링크) / 타임스탬프 없음 / 수상 결측
- UI 상태: 로딩 · 빈 · 에러(unavailable) · 오프라인
- dependencies: BE `STAT-E4-T3`, `VID-E2-T2`(영상 검증)
- effort: XL · priority: P0

### [ARCH-UI-E5-T3] 곡 상세·플레이리스트
사용 이력 정렬, 공식 임베드 순차재생, 난이도 면책.
- subtask: 곡 사용 이력 / 플레이리스트(공식 임베드 순차) / 난이도 면책
- acceptance criteria: 사용 이력 정렬 / 공식 임베드 순차재생 / 난이도 면책
- edge cases: 임베드 불가 / 난이도 데이터 부족 / 동명이곡
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: ARCH-UI-E5-T2, BE `STAT-E4-T3`
- effort: L · priority: P1

### [ARCH-UI-E5-T4] 선곡 분석 대시보드
차트+데이터테이블 대체뷰, 표본 미달 표시, 필터 URL, 색맹 팔레트.
- subtask: 차트(장르분포·인기선곡·수상경향·난이도·아티스트빈도) / 데이터테이블 대체뷰 / 표본 미달 표시 / 필터 URL / 색맹 팔레트
- acceptance criteria: 차트+데이터테이블 대체뷰 / 표본 미달 표시 / 필터 URL / 색맹 팔레트
- edge cases: 표본 미달 / 데이터 0 / 차트 a11y(테이블 대체)
- UI 상태: 로딩 · 빈(표본 미달) · 에러 · 오프라인
- dependencies: BE `STAT-E4-T3`
- effort: L · priority: P1

### [ARCH-UI-E5-T5] 연도별 비교 화면
추이 비교, 결손 구분, 인사이트 근거.
- subtask: N개 연도 추이 / 결손 구분 / 인사이트(근거 표시)
- acceptance criteria: 추이 비교 / 결손 구분 / 인사이트 근거
- edge cases: 연도 결손 / 표본 미달 / 인사이트 환각
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `STAT-E4-T2`(연도 비교), ARCH-UI-E5-T4
- effort: M · priority: P1

### [GRNZ-ARCH-01] 아티클(콘텐츠) 화면 (GROUNZ 벤치)
가요제 준비 팁·후기 등 아티클(콘텐츠) 목록/상세 화면. (GROUNZ는 영감만)
- subtask: 아티클 목록 / 아티클 상세(본문·이미지·관련 가요제 링크) / 카테고리·태그 / SSR OG / 공유
- acceptance criteria: 아티클 목록·상세 렌더 / 관련 가요제 링크 / SSR OG / 공유
- edge cases: 본문 결측 / 이미지 로드 실패 / 0건
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE 콘텐츠 API(Admin `BE-E10-T06` 연계)
- effort: M · priority: P2

### [GRNZ-ARCH-02] 선정곡 분석 시각화 강화 (GROUNZ 벤치 — 차별화)
ARCH-UI-E5-T4 대시보드를 차별화 시각화(난이도 분포·음역대 적합도·트렌드 인터랙션)로 강화. (GROUNZ는 영감만)
- subtask: 음역대 적합도 시각화(내 프로필 대비) / 난이도 분포 / 인터랙티브 트렌드 / 면책 / 색맹 팔레트
- acceptance criteria: 음역대 적합도 시각화 / 난이도 분포 / 인터랙션 / 면책·테이블 대체뷰
- edge cases: 음역대 미설정 / 표본 미달 / 차트 a11y
- UI 상태: 로딩 · 빈(표본 미달) · 에러 · 오프라인
- dependencies: ARCH-UI-E5-T4, NAV-0206(음역대 프로필)
- effort: M · priority: P2

---

# F. AUTH — 로그인/회원가입/프로필/마이/2FA 화면 + FE 인증 인프라

## [AUTH] AUTH-E4 · 인증 프론트엔드 화면

### [AUTH-E4-T1] 로그인 화면(이메일+소셜+자동로그인)
3경로 로그인, 카카오/네이버 버튼(가이드 준수), returnUrl 복귀.
- subtask: 이메일 로그인 / 카카오·네이버 버튼(가이드 준수) / 자동로그인 / returnUrl 오픈리다이렉트 방지 / aria-live 안내
- acceptance criteria: 3경로 로그인 / 자동로그인 유지 / 미인증 재인증 CTA / aria-live 안내 / returnUrl 복귀
- edge cases: returnUrl 외부 도메인(차단) / 소셜 콜백 실패 / 미인증 계정
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `AUTH-E2-T2`(로그인), `AUTH-E3-T1/T2`(소셜), `BE-E02-T01`
- effort: M · priority: P0

### [AUTH-E4-T2] 회원가입 화면+분리 동의 UI
필수 3종 없이 비활성, 마케팅 채널별 분리, 약관 전문+버전, 강도/일치 실시간.
- subtask: 동의([필수]약관·개인정보·만14세, [선택]마케팅(이메일·SMS·푸시·알림톡 개별)·제3자) / 전체·개별 동기화 / 약관 전문+버전 / 재전송 쿨다운 / 강도·일치 실시간 / fieldset·legend
- acceptance criteria: 필수 3종 없이 비활성 / 마케팅 채널별 분리 / 전체·개별 동기화 / 약관 전문+버전 / 재전송 쿨다운 / 강도·일치 실시간
- edge cases: 필수 미동의 / 중복 이메일 / 마케팅 부분 동의 / 재전송 쿨다운
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `AUTH-E2-T1`(가입)
- effort: L · priority: P0

### [AUTH-E4-T3] 이메일 인증+비밀번호 재설정 화면
유효 토큰 완료/만료 재요청, 열거 불가 응답, 재설정 후 로그인 유도.
- subtask: 이메일 인증(토큰) / 비밀번호 재설정 / 만료 재요청 / 열거 불가 응답
- acceptance criteria: 유효 토큰 완료·만료 재요청 / 열거 불가 응답 / 재설정 후 로그인 유도
- edge cases: 만료 토큰 / 잘못된 토큰 / 미가입 이메일(동일 응답)
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `AUTH-E2-T1`, `AUTH-E2-T3`(재설정)
- effort: M · priority: P0

### [AUTH-E4-T4] 온보딩/인트로+라우트 가드+세션 부트스트랩
보호 페이지 로그인 후 복귀, 재방문 silent refresh, 원격 로그아웃 안전 종료.
- subtask: silent refresh / 401 단일 갱신 큐잉 / 다기기 감지 / 403 처리 / 온보딩 1회
- acceptance criteria: 보호 페이지 로그인 후 복귀 / 재방문 silent refresh / 만료 자동 갱신 / 원격 로그아웃 안전 종료 / 온보딩 1회
- edge cases: 401 동시 다발 / refresh 실패(안전 로그아웃) / 원격 로그아웃 / 403
- UI 상태: 로딩(부트스트랩) · 에러 · 오프라인
- dependencies: BE `AUTH-E2-T2`
- effort: M · priority: P0

## [AUTH] AUTH-E5 · 프로필 (음역대·장르·지역·경력)

### [AUTH-E5-T2] 프로필 편집 화면
전 필드 편집, 시도→시군구 종속, 아바타 크롭, 완성도 게이지, 공개/비공개.
- subtask: 전 필드 편집(음역대·장르·지역·경력·소개) / 시도→시군구 종속 / 아바타 크롭·업로드 / 완성도 게이지 / 공개·비공개 토글 / bio 모더레이션 안내
- acceptance criteria: 전 필드 편집 / 시도→시군구 종속 / 아바타 크롭 / 완성도 게이지 / 공개·비공개
- edge cases: 아바타 대용량·크롭 취소 / bio 부적절(모더레이션) / 시군구 종속
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공(저장)
- dependencies: BE `AUTH-E5-T1`(프로필 API)
- effort: L · priority: P1

## [AUTH] AUTH-E6 · 마이페이지 허브

### [AUTH-E6-T1] 마이페이지 대시보드+찜 목록
찜 D-day+상태, 즉시 해제, 정렬/필터, 빈 둘러보기 CTA, 요약.
- subtask: 찜 목록(D-day·상태) / 즉시 해제 / 정렬(임박·최근·지역)·필터 / 빈 CTA / 요약 / 오프라인 캐시
- acceptance criteria: 찜 D-day+상태 / 즉시 해제 / 정렬·필터 / 빈 둘러보기 CTA / 요약
- edge cases: 찜 0(빈 CTA) / 마감 찜 / 오프라인
- UI 상태: 로딩 · 빈(둘러보기 CTA) · 에러 · 오프라인(캐시)
- dependencies: BE `AUTH-E6-T1`/`BE-E04-T01`, AUTH-E4-T4
- effort: M · priority: P0

### [AUTH-E6-T2] 알림 설정 화면(채널·D-day·마케팅)
채널×유형 개별 on/off, 웹푸시 권한+구독+테스트, D-day 다중 시점.
- subtask: 채널(push·email·alimtalk)×유형 매트릭스 / D-day 시점(D-7/3/1/0) / PushSubscription 등록 / 알림톡 번호 안내 / iOS 제약 / 마케팅 동의 이력
- acceptance criteria: 채널×유형 개별 on/off / 웹푸시 권한+구독+테스트 / 마케팅 동의 이력 / D-day 다중 시점 / 차단 안내
- edge cases: 푸시 미허용 / iOS 미설치 / 알림톡 미연동 / 결제(정보성) 끌 수 없음
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · granted/denied
- dependencies: BE `NOTI-T-04-01`(설정 API), `NOTI-T-02-02`(구독)
- effort: M · priority: P0

### [AUTH-E6-T3] 신청이력 화면(Phase2 골격)
상태+타임라인(연동 전 빈상태), 필터/정렬, 이력 없음 CTA.
- subtask: 상태+타임라인(빈상태) / 필터·정렬 / 이력 없음 CTA
- acceptance criteria: 상태+타임라인(연동 전 빈상태) / 필터·정렬 / 이력 없음 CTA
- edge cases: 이력 0 / Phase2 연동 전 / 마감 후
- UI 상태: 로딩 · 빈(CTA) · 에러 · 오프라인
- dependencies: AUTH-E6-T1
- effort: M · priority: P1

### [AUTH-E6-T4] 계정 설정(이메일·비번·소셜·기기·2FA·언어)
이메일 변경 인증, 비번 변경/소셜 연동, 원격 세션 종료, 동의 현황+이력.
- subtask: 이메일 변경(인증) / 비번 변경 / 소셜 연동·해제 / 기기·세션 관리(원격 종료) / 2FA 진입 / 언어 / 동의 현황+이력
- acceptance criteria: 이메일 변경 인증 후 반영 / 비번 변경·소셜 연동 / 원격 세션 종료 / 언어 반영 / 동의 현황+이력
- edge cases: 마지막 소셜 해제 불가 / 동일 이메일 충돌 / 세션 다수
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `AUTH-E2-T2/T3`, `AUTH-E3-T3`(연동), `AUTH-E5-T1`
- effort: L · priority: P1

### [AUTH-E6-T5] 탈퇴+데이터 삭제/내보내기(PIPA) — FE
본인확인 후 유예 안내, 유예 내 복구, 데이터 내보내기, 진행 거래 안내.
- subtask: 탈퇴 본인확인 / 유예 안내(scheduled purge) / 복구 / 데이터 내보내기(JSON) / 진행 거래 안내
- acceptance criteria: 본인확인 후 유예 안내 / 유예 내 복구 / 데이터 내보내기 / 진행 거래 안내
- edge cases: 진행 거래 존재 / 유예 내 재로그인(복구) / 내보내기 대용량
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `AUTH-E6-T5`(탈퇴 처리)
- effort: M · priority: P0

## [AUTH] AUTH-E7 · 선택적 2단계 인증 (FE)

### [AUTH-E7-T2] 2FA 프론트엔드(설정 마법사+챌린지)
QR+복구코드 저장 강제, 코드/복구 인증, 신뢰기기 생략, 오류 안내.
- subtask: 설정 마법사(QR·복구코드) / 복구코드 저장 강제 / 로그인 챌린지(코드·복구) / 신뢰기기 생략 / 오류 안내
- acceptance criteria: QR+복구코드 저장 강제 / 코드·복구 인증 / 신뢰기기 생략 / 오류 안내
- edge cases: 복구코드 미저장 / 코드 오입력 잠금 / 신뢰기기
- UI 상태: 로딩 · 빈 · 에러(잠금) · 오프라인 · 성공
- dependencies: BE `AUTH-E7-T1`(2FA 백엔드)
- effort: M · priority: P2

## [AUTH] AUTH-E8 · FE 인증 인프라(상태관리·보안·a11y·SEO·분석)

### [AUTH-E8-T1] Pinia auth store+API 인터셉터
단일 소스 일관, 401 단일 refresh 큐잉, refresh 실패 안전 로그아웃, access 비영속.
- subtask: 단일 auth store / 401 단일 refresh 큐잉 / 다기기·원격 로그아웃 / 탭 간 동기화(BroadcastChannel) / 에러 정규화 / access 메모리(비영속)
- acceptance criteria: 단일 소스 일관 / 401 단일 refresh 큐잉 / refresh 실패 안전 로그아웃 / access 비영속
- edge cases: 401 동시 다발 / refresh 만료 / 다중탭 충돌
- UI 상태: (백그라운드) 에러 · 오프라인
- dependencies: BE `AUTH-E2-T2`, AUTH-E4-T4
- effort: M · priority: P0

### [AUTH-E8-T3] AUTH i18n·a11y·SEO/OG·분석(FE)
4언어, 키보드 완수, 인증 noindex/공개 프로필 OG, 퍼널 PII 없음.
- subtask: 4언어 / 키보드 완수 / 인증 noindex·공개 프로필 OG / 퍼널 이벤트(PII 없음)
- acceptance criteria: 4언어 / 키보드 완수 / 인증 noindex·공개 프로필 OG / 퍼널 PII 없음
- edge cases: 4언어 키 누락 / 공개 프로필 인덱싱 정책 / 동의 거부
- UI 상태: (횡단) 에러 · 오프라인
- dependencies: AUTH-E4-T1/T2, AUTH-E5-T2, AUTH-E6-T1, COM `COM-I18N-*`, `COM-SEO-01`
- effort: L · priority: P1

---

# G. NOTI — 알림 설정·알림센터 화면 + 클라이언트 웹푸시·날씨 위젯 (FE)

## [NOTI] EPIC-NOTI-02 · 웹푸시(FCM) — 클라이언트

### [NOTI-T-02-01] 프론트 SW+푸시 권한 온보딩 UX
동의→토큰 등록→테스트 푸시, iOS 미설치 홈화면 안내, 포그라운드 중복 방지.
- subtask: firebase-messaging-sw.js / 프리퍼미션 / getToken→등록 / iOS standalone 감지 / 포그라운드 중복 방지 / 테스트 푸시
- acceptance criteria: 동의→토큰 등록→테스트 푸시 / iOS 미설치 홈화면 안내 / denied 설정 가이드 / 포그라운드 중복 방지
- edge cases: denied/default/unsupported / iOS 미설치 / 토큰 회전 / 포그라운드 중복
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · granted/denied/default/unsupported
- dependencies: BE `NOTI-T-02-02`(구독 등록), `NOTI-T-01-01`
- effort: L · priority: P0

## [NOTI] EPIC-NOTI-04 · 알림 설정 화면 (FE)

### [NOTI-T-04-02] 알림 설정 UI(반응형/a11y/i18n/상태)
토글 저장+유지, 푸시 미허용 비활성+안내, 결제 끌 수 없음, 키보드/스크린리더.
- subtask: 채널×유형 토글 / 푸시 미허용 비활성+안내 / 결제(정보성) 잠금 / 키보드·스크린리더 / 4언어
- acceptance criteria: 토글 저장+유지 / 푸시 미허용 비활성+안내 / 결제 끌 수 없음 / 키보드·스크린리더
- edge cases: 푸시 미허용 / iOS 제약 / 결제 정보성 잠금
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `NOTI-T-04-01`, NOTI-T-02-01
- effort: L · priority: P0

### [NOTI-T-04-03] 알림센터(인앱 목록)
시간 역순+읽음, 딥링크, 미읽음 동기화, 스크린리더.
- subtask: 인앱 목록(시간 역순) / 읽음 처리 / 딥링크 / 미읽음 동기화 / 스크린리더
- acceptance criteria: 시간 역순+읽음 / 딥링크 / 미읽음 동기화 / 스크린리더
- edge cases: 알림 0 / 딥링크 무효 / 미읽음 동기화 지연
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(캐시)
- dependencies: BE `NOTI-T-01-01`(알림 로그)
- effort: M · priority: P1

## [NOTI] EPIC-NOTI-05 · 기상청 날씨 위젯 (FE)

### [NOTI-T-05-03] 날씨 조회 위젯 UI — FE
행사일 날씨/특보/출처/갱신시각, 준비중/없음/특보 구분, 색만 금지, 4언어.
- subtask: 위젯(강수·기온·하늘·특보 role=alert) / 다회차 탭 / 준비중·없음·특보 구분 / 출처·갱신시각 / 4언어
- acceptance criteria: 행사일 날씨·특보·출처·갱신시각 / 준비중·없음·특보 구분 / 색만 금지 / 4언어
- edge cases: D-14 이전(준비중) / 좌표 없음 / 특보 / 다회차
- UI 상태: 로딩 · 빈(준비중/없음) · 에러 · 오프라인(stale)
- dependencies: BE `NOTI-T-05-03`(날씨 조회 API)
- effort: M · priority: P0

---

# H. COM — 디자인시스템·PWA·a11y·i18n·SEO·성능·분석·FE보안/QA

## [COM] DS · 디자인시스템

### [COM-DS-01] 디자인 토큰
시맨틱 토큰만(하드코딩 없음), 라이트/다크 AA, Pretendard self-host.
- subtask: 컬러·타이포·스페이싱(8pt)·radius·elevation·motion·z-index·breakpoint / 상태색(D-day·모집중·마감) / SCSS+JS+CSS var 3중
- acceptance criteria: 시맨틱 토큰만 / 라이트·다크 AA / Pretendard self-host swap / 단일 파일 반영
- edge cases: 다크 대비 / 폰트 로드 실패(swap) / 하드코딩 잔존 방지
- UI 상태: —
- dependencies: 없음
- effort: M · priority: P0

### [COM-DS-02] 라이트/다크 테마+토글+시스템+영속화
유지+system 실시간, FOUC 없음, 토글 a11y.
- subtask: 테마 토글 / system 연동(실시간) / 영속화 / FOUC 방지 / 토글 a11y
- acceptance criteria: 유지+system 실시간 / FOUC 없음 / 토글 a11y
- edge cases: 시스템 테마 변경 / 초기 FOUC / SSR 불일치
- UI 상태: —
- dependencies: COM-DS-01
- effort: M · priority: P0

### [COM-DS-03] 반응형 breakpoint+그리드+컨테이너
360~1920 무스크롤, safe-area, 네비 전환 무깨짐.
- subtask: breakpoint / 그리드 / 컨테이너 / safe-area / 네비 전환
- acceptance criteria: 360~1920 무스크롤 / safe-area / 네비 전환 무깨짐
- edge cases: 노치 / 가로 회전 / 초광폭
- UI 상태: —
- dependencies: COM-DS-01
- effort: M · priority: P0

### [COM-DS-04] 공통 상태 패턴(로딩/스켈레톤/빈/에러/오프라인/권한)
4상태 표준, 재시도 멱등, aria-live 전환 안내.
- subtask: 스켈레톤 / 빈 / 에러(재시도) / 오프라인 / 권한 / aria-live
- acceptance criteria: 4상태 표준 / 재시도 멱등 / aria-live 전환 안내
- edge cases: 재시도 폭주 / 부분 실패 / 권한 거부
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 권한
- dependencies: COM-DS-01, COM-DS-03
- effort: L · priority: P0

### [COM-DS-05] 공통 컴포넌트 라이브러리(도메인 포함)
라이브러리만으로 화면 구성, 키보드/포커스/aria, ContestCard 반응형 정렬.
- subtask: 기본(버튼·입력·셀렉트·칩·카드·모달·탭·페이지네이션) / 도메인(ContestCard·StatusChip·DdayBadge·SourceAttribution·PosterThumbnail·FilterBar·RegionSelect·DateRangePicker·ShareSheet·BookmarkToggle)
- acceptance criteria: 라이브러리만으로 화면 구성 / 키보드·포커스·aria / ContestCard 반응형 정렬
- edge cases: 키보드 트랩 / 긴 콘텐츠 / 빈 props
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: COM-DS-01, COM-DS-04
- effort: XL · priority: P0

### [COM-DS-06] 아이콘/일러스트/모션+폼 검증 규약
사업자번호/휴대폰 한국 규격, 에러 스크린리더+포커스 이동, reduced-motion.
- subtask: 아이콘·일러스트·모션 / 폼 검증(사업자번호·휴대폰) / 에러 스크린리더+포커스 이동 / reduced-motion
- acceptance criteria: 사업자번호·휴대폰 한국 규격 / 에러 스크린리더+포커스 이동 / reduced-motion
- edge cases: 잘못된 형식 / reduced-motion / 포커스 이동
- UI 상태: 에러(폼)
- dependencies: COM-DS-01
- effort: M · priority: P1

## [COM] PWA

### [COM-PWA-01] Web App Manifest+아이콘/스플래시+설치 요건
Lighthouse installable, standalone+maskable, iOS 스플래시.
- subtask: manifest(shortcuts·share_target) / 아이콘 192/512/maskable / iOS 메타·스플래시
- acceptance criteria: Lighthouse installable / standalone+maskable / iOS 스플래시
- edge cases: iOS 메타 / maskable 여백 / shortcuts
- UI 상태: —
- dependencies: 없음
- effort: M · priority: P0

### [COM-PWA-02] 서비스워커(precache/런타임캐시/오프라인/업데이트)
오프라인 캐시 열람, 새 배포 1탭 갱신, 인증/결제 미캐시.
- subtask: vite-plugin-pwa / 런타임 캐시(리스트 NetworkFirst·상세 SWR·이미지 CacheFirst) / 오프라인 폴백 / 업데이트 토스트
- acceptance criteria: 오프라인 캐시 열람 / 새 배포 1탭 갱신 / 인증·결제 미캐시
- edge cases: 캐시 만료 / 인증 응답 미캐시 / 업데이트 충돌
- UI 상태: 오프라인 · 업데이트(토스트)
- dependencies: COM-PWA-01, COM-DS-04
- effort: L · priority: P0

### [COM-PWA-03] 설치 프롬프트(A2HS)+iOS 안내
비과노출 적시, iOS 수동 가이드, 전환 분석.
- subtask: beforeinstallprompt / iOS 수동 가이드 / 전환 분석
- acceptance criteria: 비과노출 적시 / iOS 수동 가이드 / 전환 분석
- edge cases: iOS 미지원 / 이미 설치 / 반복 노출
- UI 상태: 빈(미지원 숨김)
- dependencies: COM-PWA-01, COM-ANALYTICS-01
- effort: S · priority: P1

### [COM-PWA-04] 웹푸시 구독/권한/표시(D-day·날씨) — FE
허용 후 테스트 푸시 딥링크, 구독 일관, iOS standalone 후 구독.
- subtask: 권한·구독 / 표시 / 딥링크 / iOS standalone 후 구독 (NOTI-02-01과 정합)
- acceptance criteria: 허용 후 테스트 푸시 딥링크 / 구독 일관 / iOS standalone 후 구독
- edge cases: iOS 미설치 / 권한 거부 / 토큰 무효
- UI 상태: 로딩 · 에러 · 오프라인 · granted/denied
- dependencies: COM-PWA-02, NOTI-T-02-01
- effort: L · priority: P0

## [COM] A11Y · 접근성 WCAG 2.2 AA

### [COM-A11Y-01] 키보드 내비+포커스 관리+스킵링크
마우스 없이 핵심 완수, 모달 트랩+복귀, 라우트 announce.
- subtask: 키보드 내비 / 포커스 트랩+복귀 / 스킵링크 / 라우트 announce
- acceptance criteria: 마우스 없이 핵심 완수 / 모달 트랩+복귀 / 라우트 announce
- edge cases: 모달 중첩 / 포커스 복귀 / 동적 라우트
- UI 상태: —
- dependencies: COM-DS-05
- effort: L · priority: P0

### [COM-A11Y-02] 스크린리더/ARIA/라이브리전+명도 대비
리스트→상세 인지, 색 비의존, AA 대비.
- subtask: ARIA·라이브리전 / 색 비의존 / AA 대비
- acceptance criteria: 리스트→상세 인지 / 색 비의존 / AA 대비
- edge cases: 동적 콘텐츠 announce / 상태 색 비의존 / 대비 미달
- UI 상태: —
- dependencies: COM-DS-01, COM-DS-04
- effort: L · priority: P0

### [COM-A11Y-03] 폼 접근성+axe 회귀+감사 체크리스트
axe critical 0, 폼 에러 접근성, 스크린리더 라운드.
- subtask: 폼 라벨·에러 연결 / axe 회귀 / 감사 체크리스트
- acceptance criteria: axe critical 0 / 폼 에러 접근성 / 스크린리더 라운드
- edge cases: 동적 에러 / 복합 폼 / axe false-positive
- UI 상태: 에러(폼)
- dependencies: COM-DS-06, COM-QA-02
- effort: M · priority: P0

## [COM] I18N · ko/en/ja/zh

### [COM-I18N-01] i18n 인프라/네임스페이스/CSP-precompile/폴백
strict CSP 동작, ko 폴백, lazy 청크.
- subtask: vue-i18n / 네임스페이스 / @intlify precompile(runtimeOnly) / 누락키 리포트
- acceptance criteria: strict CSP 동작 / ko 폴백 / lazy 청크
- edge cases: 누락키(폴백) / CSP / lazy 로드 실패
- UI 상태: —
- dependencies: 없음
- effort: M · priority: P0

### [COM-I18N-02] 감지/전환/영속화+한국 포맷
우선순위 초기 언어, KRW/날짜/상대시간 로케일, 전환 즉시.
- subtask: 감지·전환·영속 / KRW·날짜·상대시간 포맷
- acceptance criteria: 우선순위 초기 언어 / KRW·날짜·상대시간 로케일 / 전환 즉시
- edge cases: 미지원 로케일 / 전환 중 fetch / 상대시간 KST
- UI 상태: 로딩(전환) · 오프라인
- dependencies: COM-I18N-01
- effort: M · priority: P0

### [COM-I18N-03] 번역 거버넌스+hreflang+콘텐츠 i18n 한계
placeholder CI 차단, hreflang 4언어+x-default, 수집 원문 보존.
- subtask: placeholder CI / hreflang / 기계번역 라벨+원문 토글(공공데이터 한국어 원문)
- acceptance criteria: placeholder CI 차단 / hreflang 4언어+x-default / 수집 원문 보존
- edge cases: 번역 누락 / 원문 토글 / x-default
- UI 상태: —
- dependencies: COM-I18N-01, COM-SEO-01
- effort: M · priority: P1

## [COM] SEO/GEO

### [COM-SEO-01] 메타/OG/Twitter/canonical/hreflang 헤드
고유 메타, 카톡/SNS OG, 비공개 noindex.
- subtask: @unhead/vue / 동적 OG 이미지(Vercel OG) / hreflang
- acceptance criteria: 고유 메타 / 카톡·SNS OG / 비공개 noindex
- edge cases: 비공개 noindex / OG 생성 실패 / canonical 중복
- UI 상태: —
- dependencies: COM-I18N-01
- effort: L · priority: P0

### [COM-SEO-02] JSON-LD(Event/Breadcrumb/FAQ/Organization/VideoObject)
Rich Results 오류 0, eventStatus 동기화, 출처 반영.
- subtask: JSON-LD 타입별 / eventStatus 동기화 / 출처 반영
- acceptance criteria: Rich Results 오류 0 / eventStatus 동기화 / 출처 반영
- edge cases: eventStatus 매핑 / 결측 필드 / 중복 schema
- UI 상태: —
- dependencies: COM-SEO-01
- effort: M · priority: P0

### [COM-SEO-03] 롱테일 랜딩 자동생성+렌더링(SSR/프리렌더)+LCP
봇 완전 렌더, 사이트맵 자동+색인, LCP<2.5s.
- subtask: 지역×연도×장르 매트릭스 / 유니크 콘텐츠(doorway 회피) / Vercel ISR / 동적 사이트맵
- acceptance criteria: 봇 완전 렌더 / 사이트맵 자동+색인 / LCP<2.5s
- edge cases: doorway 회피 / 빈 매트릭스 셀 / ISR 무효화
- UI 상태: 로딩 · 빈 · 에러
- dependencies: COM-SEO-01, COM-SEO-02, COM-PERF-01
- effort: XL · priority: P1

### [COM-SEO-04] robots/사이트맵/네이버·다음+GEO+llms.txt
검색엔진 인식, 네이버/다음 색인, llms.txt 정확.
- subtask: robots·사이트맵 / 네이버·다음 등록 / GEO 요약 / llms.txt
- acceptance criteria: 검색엔진 인식 / 네이버·다음 색인 / llms.txt 정확
- edge cases: 네이버·다음 차이 / llms.txt / 사이트맵 크기
- UI 상태: —
- dependencies: COM-SEO-01
- effort: M · priority: P1

## [COM] PERF · 성능

### [COM-PERF-01] 이미지 최적화(포스터/썸네일/OG)
CLS<0.1, AVIF/WebP 적정 용량, LCP 우선.
- subtask: AVIF/WebP / srcset / 비율 고정 / LCP priority / blur-up
- acceptance criteria: CLS<0.1 / AVIF·WebP 적정 용량 / LCP 우선
- edge cases: 비율 미상 / 대용량 / 폴백 포맷
- UI 상태: 로딩(blur-up)
- dependencies: COM-DS-05
- effort: L · priority: P0

### [COM-PERF-02] 코드분할/프리페치+폰트 최적화
JS 예산 내, 폰트 swap, 써드파티 비블로킹.
- subtask: 코드분할·프리페치 / 폰트 swap·subset / 써드파티 facade(유튜브·지도)
- acceptance criteria: JS 예산 내 / 폰트 swap / 써드파티 비블로킹
- edge cases: 폰트 로드 실패 / 써드파티 차단 / 청크 과분할
- UI 상태: —
- dependencies: COM-DS-01
- effort: M · priority: P0

### [COM-PERF-03] RUM(web-vitals)+캐싱/CDN+성능 회귀
p75 LCP<2.5s/CLS<0.1/INP<200ms, Lighthouse CI 차단.
- subtask: web-vitals RUM / CDN 캐시 / Lighthouse CI
- acceptance criteria: p75 LCP<2.5s/CLS<0.1/INP<200ms / 정적 장기 캐시 / Lighthouse CI 차단
- edge cases: RUM 동의 / 캐시 무효화 / CI flaky
- UI 상태: —
- dependencies: COM-ANALYTICS-01
- effort: M · priority: P1

## [COM] ANALYTICS

### [COM-ANALYTICS-01] 이벤트 택소노미+GA4/자체 SDK+동의 게이팅
일관 스키마, 동의 전 차단/후 발화, UTM 귀속.
- subtask: Consent Mode v2 / useAnalytics 래퍼 / 디버그 모드 / UTM
- acceptance criteria: 일관 스키마 / 동의 전 차단·후 발화 / UTM 귀속
- edge cases: 동의 거부 / 오프라인 큐 / 중복 발화
- UI 상태: —
- dependencies: COM-LEGAL-02
- effort: M · priority: P0

### [COM-ANALYTICS-02] 퍼널/전환/수익+대시보드+서버이벤트 정합
퍼널 전환율, 결제 서버 진실 일치, 수익 리포트.
- subtask: 퍼널·전환·수익 / 대시보드 / 서버이벤트 정합
- acceptance criteria: 퍼널 전환율 / 결제 서버 진실 일치 / 수익 리포트
- edge cases: 서버·클라 불일치 / 환불 반영 / 비식별
- UI 상태: —
- dependencies: COM-ANALYTICS-01
- effort: M · priority: P1

## [COM] LEGAL · 법무/컴플라이언스 (FE 표기·동의 UI)

### [COM-LEGAL-01] 저작권/출처표기/임베드 정책 반영+takedown (FE)
출처표기+원문링크, 공식 임베드만(재호스팅 0), takedown SLA.
- subtask: SourceAttribution 의무화+결측 시 게시 차단 / 1차 출처 표기 / 공공누리 라이선스 안내 / 공식 임베드만
- acceptance criteria: 출처표기+원문링크 / 공식 임베드만(재호스팅 0) / takedown SLA 안내
- edge cases: 출처 결측(차단) / 라이선스 유형 / 임베드 불가
- UI 상태: 빈(출처 경고) · 에러
- dependencies: COM-DS-05
- effort: L · priority: P0

### [COM-LEGAL-02] PIPA(처리방침/약관/동의관리) (FE)
필수/선택 분리+이력, 위탁/국외이전 고지, 쿠키 배너.
- subtask: 약관·방침·마케팅·푸시 동의 버전 / 위탁(NCP·AWS·LiteLLM Gemini) 고지 / 만14세 / 쿠키 배너 / 열람·삭제 창구
- acceptance criteria: 필수·선택 분리+이력 / 위탁·국외이전 고지 / 탈퇴 파기·보존 분리
- edge cases: 약관 개정 재동의 / 만14세 / 마케팅 철회
- UI 상태: 빈 · 에러
- dependencies: COM-DS-05
- effort: L · priority: P0

### [COM-LEGAL-03] 통신판매업/전자금융 고지(FE, Phase1 골격)
푸터 사업자/통신판매 표기, 결제 전 고지(Phase2 강제).
- subtask: 푸터 사업자·통신판매 표기 / 결제 전 고지 골격 / 환불·철회·해지 일관(Phase2)
- acceptance criteria: 푸터 사업자·통신판매 표기 / 결제 전 고지 / 환불·철회·해지 일관
- edge cases: 사업자번호 미확정(placeholder) / Phase2 결제 도입 시점
- UI 상태: 빈 · 에러
- dependencies: COM-LEGAL-02
- effort: M · priority: P0

## [COM] SEC · FE 보안

### [COM-SEC-01] CSP/보안헤더+XSS/출력인코딩+안전 리다이렉트/임베드
unsafe-eval 없는 CSP, XSS/오픈리다이렉트 0.
- subtask: CSP(unsafe-eval 없음) / XSS·출력인코딩 / 안전 리다이렉트·임베드(facade)
- acceptance criteria: unsafe-eval 없는 CSP / securityheaders A / XSS·오픈리다이렉트 0
- edge cases: 인라인 스크립트 / 외부 임베드 / 리다이렉트 화이트리스트
- UI 상태: —
- dependencies: COM-I18N-01
- effort: L · priority: P0

### [COM-SEC-02] 인증/세션/토큰+CSRF+소셜·결제 콜백 (FE)
httpOnly 토큰, 콜백 위변조/CSRF 방어, 권한 가드 정합.
- subtask: httpOnly refresh / CSRF / 소셜·결제 콜백 검증 / 권한 가드(라우트·UI 정합)
- acceptance criteria: httpOnly 토큰 / 콜백 위변조·CSRF 방어 / 권한 가드 정합
- edge cases: 콜백 위조 / 토큰 탈취 / 가드 우회
- UI 상태: 에러
- dependencies: COM-SEC-01
- effort: L · priority: P0

### [COM-SEC-03] Secrets/암호화+의존성·시크릿 스캐닝+회귀 (FE)
번들 secret 미포함, PII 마스킹.
- subtask: 번들 secret 검사 / 의존성·시크릿 스캐닝 / PII 마스킹
- acceptance criteria: 번들 secret 미포함 / critical 0·시크릿 커밋 0 / PII 마스킹
- edge cases: 빌드 시 env 노출 / 의존성 취약점 / PII 로깅
- UI 상태: —
- dependencies: COM-QA-04
- effort: M · priority: P0

## [COM] QA · 테스트

### [COM-QA-01] 단위/통합 테스트+커버리지 게이트 (FE)
핵심 커버리지 충족, API 회귀 감지, flaky 0 목표.
- subtask: Vitest 단위·통합 / MSW 모킹 / 커버리지 게이트
- acceptance criteria: 핵심 커버리지 충족 / API 회귀 감지 / flaky 0 목표
- edge cases: flaky / 비동기 / MSW 누락
- UI 상태: —
- dependencies: COM-DS-05
- effort: L · priority: P0

### [COM-QA-02] E2E(Playwright)+a11y/시각 회귀+모바일 매트릭스
핵심 플로우 그린, axe critical 0, 시각 회귀 감지.
- subtask: Playwright E2E / axe / 시각 회귀 / 모바일 매트릭스(삼성인터넷·Safari·인앱)
- acceptance criteria: 핵심 플로우 그린 / axe critical 0 / 시각 회귀 감지
- edge cases: 인앱 브라우저 / 시각 회귀 false-positive / 모바일 차이
- UI 상태: —
- dependencies: COM-QA-01, COM-PWA-02
- effort: XL · priority: P0

### [COM-QA-04] CI/CD+품질 게이트+환경/릴리스 (FE)
게이트 통과 머지, 프리뷰 배포, 롤백/캐시 무효화 안전.
- subtask: CI 게이트(린트·타입·테스트·Lighthouse·보안스캔) / 프리뷰 배포 / 롤백·캐시 무효화
- acceptance criteria: 게이트 통과 머지 / 프리뷰 배포 / 롤백·캐시 무효화 안전
- edge cases: 게이트 실패 / 프리뷰 환경변수 / 캐시 무효화
- UI 상태: —
- dependencies: COM-QA-01, COM-QA-02, COM-PERF-03, COM-SEC-03
- effort: L · priority: P0

### [GRNZ-COM-01] 커뮤니티/Q&A/익명 화면 (GROUNZ 벤치 — 후순위)
커뮤니티 게시판·Q&A·익명 글 화면(후순위). (GROUNZ는 영감만)
- subtask: 게시판 목록·상세 / Q&A / 익명 작성 / 신고·모더레이션 진입 / 비속어 필터
- acceptance criteria: 목록·상세 렌더 / 익명 작성 / 신고 진입 / 비속어 필터
- edge cases: 익명 어뷰징 / 0건 / 모더레이션 대기
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE 커뮤니티 API(후순위)
- effort: L · priority: P2

---

### Phase 1 합계 (FE)
- **NAV:** Epic 5 · Task 39 (0101–0509 + GRNZ-NAV-01/02)
- **LIST:** Epic 8 · Task 28 (E1–E9 FE Task + GRNZ-LIST-01~05)
- **DETAIL:** Epic 8 · Task 32 (EP02–EP09 + GRNZ-DETAIL-01/02)
- **APP:** Epic 3 · Task 5 (가이드·작성도움·음원검증 UI)
- **ARCH:** Epic 1 · Task 7 (UI-E5-T1~T5 + GRNZ-ARCH-01/02)
- **AUTH:** Epic 5 · Task 13 (E4·E5·E6·E7·E8 FE Task)
- **NOTI:** Epic 3 · Task 4 (02-01·04-02·04-03·05-03)
- **COM:** Epic 10 · Task 35 (DS·PWA·A11Y·I18N·SEO·PERF·ANALYTICS·LEGAL·SEC·QA + GRNZ-COM-01)
- **합계: Epic 43 · Task 163** (GRNZ 12건 포함)

> 영역별 Task 수는 각 영역의 `### [ID]` 헤더 실수치(`### [` 기준 grep)이다.
