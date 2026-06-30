# NORI FE — PHASE 3 (제휴 마켓)

> Phase 3 FE 범위: 제휴 마켓(보컬강사·녹음실·반주·의상) 디렉토리/리드/예약/리뷰 **화면**, 상세의 보컬강사 추천 활성화, GROUNZ 벤치 후순위(구인구직·스토어/레슨) 화면.
> BE(제휴사 온보딩 백엔드·리드/예약/정산·수수료·리뷰 모더레이션 서버)는 제외 — dependencies에 BE ID 교차참조.

**Phase 3 요약:** Epic 3 · Task 9 (GRNZ 후순위 2건 포함)

---

# A. NAV — 제휴 마켓 진입점

## [NAV] EP-NAV-07-0703 · 제휴 마켓 진입점

### [NAV-T-NAV-0703] 제휴 마켓 진입점(강사/녹음실/반주/의상)
내비/홈 노출+광고/제휴 명시, 0건 빈상태.
- subtask: 내비·홈 제휴 마켓 진입 / 카테고리(강사·녹음실·반주·의상) / 광고·제휴 명시 / 0건 빈상태
- acceptance criteria: 내비·홈 노출+광고·제휴 명시 / 0건 빈상태
- edge cases: 0건(빈상태) / 광고 표기 누락 방지 / Phase3 미오픈 폴백
- UI 상태: 로딩 · 빈(0건) · 에러 · 오프라인
- dependencies: EP-NAV-05, BE `BE-E09-T01`(리스팅)
- effort: M · priority: P2

---

# B. DETAIL — 보컬강사 추천 활성화

## [DETAIL] EP-DETAIL-08 · 보컬강사 추천 (Phase3 활성)

### [DETAIL-T-08-03-P3] 추천 보컬강사(제휴) 활성화 — FE
DETAIL-08-03의 coming soon을 실제 제휴 강사 매칭·연결 플로우로 활성화.
- subtask: 지역·장르·음역대 매칭 강사 카드 / 제휴·스폰서 표기 / 문의·예약 연결 플로우 / 리뷰 요약
- acceptance criteria: 지역·장르 매칭+제휴 표기 / 연결 플로우 동작 / 리뷰 요약 노출
- edge cases: 매칭 0(빈상태) / 제휴 표기 / 강사 정지(노출 제외)
- UI 상태: 로딩 · 빈(매칭 없음) · 에러 · 오프라인
- dependencies: DETAIL-T-08-03(Phase1 골격), BE `BE-E09-T01/T02`
- effort: M · priority: P2

---

# C. BIZ(FE) — 제휴 마켓 디렉토리/리드/리뷰 화면

## [BIZ] E3 · 제휴 마켓 (Partner Marketplace) — FE 화면

### [BIZ-E3-T1-FE] 제휴사 디렉토리 화면(필터/지도/정렬·스폰서 표기)
미승인 미노출, 지역/장르/가격 필터, 스폰서 명확 표기, 포트폴리오 출처/임베드 준수.
- subtask: 카테고리(보컬강사·녹음실·반주·의상) 탭 / 디렉토리(필터·지도·정렬) / 스폰서·노출 랭킹 표기 / 포트폴리오 임베드(facade·재호스팅 금지) / 출처 표기
- acceptance criteria: 미승인 미노출 / 지역·장르·가격 필터 / 스폰서 명확 표기 / 포트폴리오 출처·임베드 준수
- edge cases: 0건 / 스폰서 표기 / 포트폴리오 임베드 불가 / 정지 제휴사
- UI 상태: 로딩 · 빈(0건) · 에러 · 오프라인
- dependencies: BE `BIZ-E3-T1`(온보딩·디렉토리), `BE-E09-T01`
- effort: L · priority: P2

### [BIZ-E3-T1-FE-DETAIL] 제휴사 상세 화면(프로필·포트폴리오·가격·리뷰)
프로필·포트폴리오·가격·리뷰를 통합한 제휴사 상세.
- subtask: 프로필 헤더 / 포트폴리오 캐러셀(facade) / 가격·서비스 / 리뷰 요약·목록 / 문의·예약 CTA / 스폰서·출처 표기
- acceptance criteria: 프로필·포트폴리오·가격·리뷰 통합 / 문의·예약 CTA / 출처·스폰서 표기
- edge cases: 포트폴리오 없음 / 리뷰 0 / 정지 제휴사 / 가격 비공개
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BIZ-E3-T1-FE, BE `BIZ-E3-T2`(리드·예약)
- effort: M · priority: P2

### [BIZ-E3-T2-FE] 리드·문의·예약 화면(슬롯/보증금/추적)
문의 즉시 전달+추적ID, 예약 확정/취소 통지+충돌 방지, 전환 퍼널.
- subtask: 리드 폼 / 예약(슬롯·보증금) / 송객 추적 ID / 인앱 메시징 진입 / 광고 슬롯 표기(CPC/CPM) / 전환 이벤트
- acceptance criteria: 문의 즉시 전달+추적ID / 예약 확정·취소 통지 / 충돌 방지 / 전환 퍼널
- edge cases: 슬롯 충돌 / 보증금 결제 실패 / 비로그인 / 취소
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `BIZ-E3-T2`(리드·예약), 결제 `BIZ-E4-T1`
- effort: L · priority: P2

### [BIZ-E3-T3-FE] 리뷰·평점 작성/표시 화면
거래 검증 후만 리뷰, 허위/악성 모더레이션 안내, 품질지표 노출.
- subtask: 리뷰 작성(거래 검증 게이트) / 평점·답글 표시 / 신고·모더레이션 진입 / 품질지표(응답률·취소율) 노출
- acceptance criteria: 거래 검증 후만 리뷰 / 허위·악성 신고 진입 / 품질지표 노출
- edge cases: 미거래(작성 불가) / 허위 리뷰 / 답글 / 어뷰징
- UI 상태: 로딩 · 빈(리뷰 없음) · 에러 · 오프라인 · 성공
- dependencies: BE `BIZ-E3-T3`(리뷰·모더레이션)
- effort: M · priority: P2

### [BIZ-E3-T4-FE] 제휴 정산·예치금 노출 화면(제휴사용 대시보드 — FE)
모델별 정산 내역·예치금·페이아웃을 제휴사가 보는 화면(읽기 중심).
- subtask: 정산 내역(CPC/CPM/CPL/CPA/구독) / 예치금 잔액 / 페이아웃 이력 / 원천징수(3.3%)·세금계산서 진입
- acceptance criteria: 모델별 정산 노출 / 예치금 동기화 / 페이아웃 이력 / 세금 데이터 진입
- edge cases: 예치금 0 / 환불 차감 / 정산 보류
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `BIZ-E3-T4`(정산·수수료)
- effort: M · priority: P2

---

# D. GRNZ — GROUNZ 벤치 후순위 화면 (P3)

> GROUNZ는 영감만 참고. 데이터 스크래핑 금지(1차 출처만).

### [GRNZ-P3-01] 구인구직 화면 (GROUNZ 벤치)
가요제·공연 관련 구인구직 목록/상세/지원 화면.
- subtask: 구인구직 목록(필터·검색) / 상세(조건·연락) / 지원 폼 / 비속어·스팸 필터 / 신고 진입
- acceptance criteria: 목록·상세·지원 렌더 / 필터·검색 / 신고 진입 / 스팸 필터
- edge cases: 0건 / 마감 공고 / 스팸 / 비로그인
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE 구인구직 API(P3)
- effort: M · priority: P2

### [GRNZ-P3-02] 스토어/레슨 화면 (GROUNZ 벤치)
레슨 상품·스토어(반주/악보 등) 목록/상세/구매 진입 화면.
- subtask: 스토어·레슨 목록(카테고리·필터) / 상품 상세 / 구매·예약 진입 / 제휴 마켓 연계 / 스폰서·광고 표기
- acceptance criteria: 목록·상세 렌더 / 구매·예약 진입 / 제휴 마켓 연계 / 광고 표기
- edge cases: 품절 / 0건 / 비로그인 / 가격 비공개
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE 스토어/레슨 API(P3), `BIZ-E3-T2`(예약)
- effort: M · priority: P2

---

### Phase 3 합계 (FE)
- **NAV:** Epic 1 · Task 1 (0703)
- **DETAIL:** Epic 1 · Task 1 (08-03 활성)
- **BIZ(FE):** Epic 1 · Task 5 (E3 디렉토리·상세·리드·리뷰·정산 FE)
- **GRNZ:** (BIZ E3 에픽 하위 별도 섹션) Task 2 (구인구직·스토어/레슨)
- **합계: Epic 3 · Task 9**

> GRNZ 후순위 2건은 별도 `## [` 에픽 헤더 없이 `# D. GRNZ` 섹션에 배치되어 에픽 카운트에는 포함하지 않음(Task로만 집계).
