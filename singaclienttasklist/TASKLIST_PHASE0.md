# NORI FE — PHASE 0 (PoC / 토대 검증)

> Phase 0의 FE 범위는 **(1) 최소 앱 셸로 수집 데이터 육안 검증**, **(2) FCM 웹푸시 클라이언트(SW·VAPID·권한) 실도달 검증**에 한정한다.
> 데이터 수집/정규화·기상청 서버 PoC·알림톡 사전조사·발송 ADR은 BE로 분류(dependencies에 BE ID 교차참조).

**Phase 0 요약:** Epic 3 · Task 6

---

## [NAV] EP-NAV-06 · Phase0 PoC 지원(최소 셸 + 커버리지 진입)

### [NAV-T-NAV-0601] PoC 최소 앱 셸 + 임시 홈(수집 데이터 미리보기)
정식 디자인시스템 이전에, 수집된 데이터를 출처 메타와 함께 나열해 **크롤러 커버리지를 사람이 육안 검증**할 수 있는 최소 화면.
- subtask:
  - 최소 헤더 + 단일 리스트(공고명·지역·출처기관·수집시각·수집방식[API/크롤])
  - 지역(시도) / 소스(어댑터) 필터
  - 정식 홈으로 점진 대체 가능한 라우트/슬롯 구조화
  - 출처 4종 결측 행은 시각적 경고 배지(데이터 계약 위반 표시)
- acceptance criteria:
  - 출처 메타가 모든 행에 노출되고, 결측 시 명확히 표시된다
  - 지역/소스 필터로 커버리지를 좁혀 육안 검증할 수 있다
  - 목록은 페이지네이션 또는 더보기로 수백 건을 무리 없이 표시
- edge cases: 0건 수집/일부 어댑터만 데이터 있음/수집시각 미래값·역전/한 공고 다출처
- UI 상태: 로딩(스켈레톤 행) · 빈(수집 데이터 없음 안내) · 에러(재시도) · 오프라인(마지막 캐시 표시)
- dependencies: BE `INGEST-E13-T1`(수집 잡), `INGEST-E1-T1`(수집 데이터모델), `DATA-T-SCHEMA-03`(출처 메타)
- effort: M · priority: P1

### [NAV-T-NAV-0602] 커버리지 대시보드 진입점(내부)
내부 권한자만 진입하는 **지역×소스 커버리지 매트릭스** 진입점.
- subtask:
  - 내부 라우트 + 권한 가드(비인가 404 위장)
  - 지역(17 시도) × 소스(어댑터) 매트릭스 위젯(건수/신선도)
  - 수집 성공률·last_success 표시
- acceptance criteria:
  - 내부 권한자만 진입 가능, 비인가자는 404로 위장
  - 매트릭스에서 빈 셀(미수집 지역×소스)이 한눈에 보인다
- edge cases: 권한 토큰 만료 중 진입/매트릭스 셀 0/소스 추가 시 동적 컬럼
- UI 상태: 로딩 · 빈(집계 없음) · 에러 · 오프라인
- dependencies: NAV-0601, BE `BE-E10-T02`(수집 결과 검토·커버리지 집계)
- effort: S · priority: P2

---

## [NOTI] EPIC-NOTI-00 · Phase0 PoC: 웹푸시 클라이언트 검증 (FE 부분)

> 마스터 `NOTI-T-00-01`의 **클라이언트(SW·VAPID·권한·도달 측정 UI)** 부분만 FE로 가져온다. 기상청 API PoC(`00-02`)·알림톡 조사/이메일 PoC(`00-03`)·발송 ADR(`00-04`)은 BE.

### [NOTI-T-00-01] FCM 웹푸시 발송 PoC — 클라이언트(SW + VAPID + 권한 흐름)
데스크탑·안드로이드·iOS PWA에서 웹푸시가 **실제 도달**하는지 클라이언트 측을 검증하고 OS별 제약을 결론낸다.
- subtask:
  - `firebase-messaging-sw.js` 등록 + VAPID 키 설정
  - 권한 요청 흐름(프리퍼미션 설명 → 브라우저 권한 → 토큰 발급)
  - `getToken()` → 백엔드 등록 호출(PoC 스텁)
  - 포그라운드/백그라운드 메시지 수신 핸들러 + 알림 클릭 딥링크
  - OS/브라우저별 도달률·지연 수동 측정 UI(테스트 푸시 버튼)
  - iOS standalone(홈화면 추가) 감지 및 제약 안내
  - 토큰 회전(refresh) 처리
- acceptance criteria:
  - 데스크탑·안드로이드·iOS PWA(설치 상태)에서 실도달이 증빙된다
  - OS×브라우저 매트릭스로 도달/지연이 기록된다
  - iOS standalone 미설치 시 제약이 명확히 안내된다
- edge cases: 권한 denied/default/unsupported, iOS 미설치 상태, 토큰 만료·UNREGISTERED, 포그라운드 중복 알림, 프라이빗 모드
- UI 상태: 로딩(권한 대기) · 빈(토큰 없음) · 에러(등록 실패) · 오프라인(SW 미활성) · granted/denied/default/unsupported 별도 표시
- dependencies: BE `NOTI-T-00-04`(ADR), `NOTI-T-02-02`(구독 등록 — Phase1 정식), FCM 프로젝트 설정
- effort: M · priority: P0

---

## [COM] EP-COM-P0 · Phase0 FE 부트스트랩 (최소)

> 정식 디자인시스템(Phase1) 이전, PoC 화면을 띄우기 위한 최소 FE 스캐폴딩.

### [COM-P0-01] Vue3+Vuetify3 프로젝트 스캐폴딩 + 빌드/배포 파이프
PoC 화면 구동을 위한 최소 FE 프로젝트 골격과 프리뷰 배포.
- subtask:
  - Vite + Vue3 + Vuetify3 + Pinia + Vue Router 초기화
  - 환경변수(API base URL·FCM 키) 주입 구조
  - Vercel 프리뷰 배포 + 기본 라우팅(`/poc`, `/poc/coverage`)
  - 최소 ESLint/Prettier/타입체크
- acceptance criteria:
  - 단일 명령으로 로컬 구동·프리뷰 배포가 된다
  - 환경변수가 코드에 하드코딩되지 않는다(번들 secret 미포함)
- edge cases: API 미기동 시 graceful 안내/환경변수 누락 시 빌드 경고
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(전역 셸 차원)
- dependencies: 없음
- effort: M · priority: P0

### [COM-P0-02] PoC 출처 메타 표시 공통 컴포넌트(SourceAttribution 프로토)
모든 PoC 행/카드에서 재사용할 출처 4종 표기 프로토타입(Phase1 `COM-DS-05`의 SourceAttribution 전신).
- subtask:
  - source_url·기관·수집시각(상대+절대)·수집방식 표기
  - 원문 링크 안전 새 탭(rel=noopener)
  - 결측 시 경고 슬롯(데이터 계약 위반)
- acceptance criteria:
  - 출처 4종이 일관 포맷으로 표기되고 결측이 시각적으로 드러난다
  - 원문 링크가 안전하게 새 탭으로 열린다
- edge cases: source_url 무효/수집시각 결측/복수 출처
- UI 상태: 빈(출처 없음 경고) · 에러(링크 무효)
- dependencies: BE `DATA-T-SCHEMA-03`(출처 메타 스키마)
- effort: S · priority: P1

### [COM-P0-03] PoC i18n·로깅 최소 셋업
PoC 단계의 최소 다국어(ko 기본) 및 클라이언트 에러 로깅.
- subtask:
  - vue-i18n 최소 설정(ko 기본, 키 구조 합의)
  - 전역 에러 바운더리 + 콘솔/리포팅 훅(Phase1 확장 전제)
- acceptance criteria:
  - ko 라벨이 키 기반으로 렌더된다
  - 미처리 에러가 흰화면 대신 복구 UI로 처리된다
- edge cases: 키 누락(폴백)/렌더 중 예외
- UI 상태: 에러(전역 바운더리) · 오프라인
- dependencies: COM-P0-01
- effort: S · priority: P2

---

### Phase 0 합계
- **NAV:** Epic 1 · Task 2 (0601, 0602)
- **NOTI:** Epic 1 · Task 1 (00-01 FE 부분)
- **COM:** Epic 1 · Task 3 (P0-01~03)
- **합계: Epic 3 · Task 6**
