# NORI FE — PHASE 2 (거래: 제출 대행·접수 SaaS·결제·정산)

> Phase 2 FE 범위: ★음원/악보 제출 대행 위저드 UI, 주최 접수 SaaS **공개 폼 렌더러**(참가자 화면), 요금제/결제(토스·카카오·네이버페이)/구독관리 화면, 무료↔유료 게이팅 UI, 알림톡 거래 알림 연동, 거래 진입점.
> BE(결제 웹훅/정산·정산 엔진·제출 대행 서버처리·주최 폼 빌더 백엔드·접수 관리/심사·세금)는 제외 — dependencies에 BE ID 교차참조.

**Phase 2 요약:** Epic 12 · Task 18

---

# A. NAV — 거래 진입점

## [NAV] EP-NAV-07 · 거래 진입점

### [NAV-T-NAV-0701] 홈/내비에 '제출 대행·신청' 진입 섹션
로그인 진행 현황+대행 CTA, 마감임박 카드에서 대행 진입.
- subtask: '내 신청/제출 현황' 섹션 / 내비·하단탭 진입점 / 마감임박 빠른 액션 / 진행 상태 배지
- acceptance criteria: 로그인 진행 현황+대행 CTA / 마감임박 카드에서 대행 진입
- edge cases: 진행 0(빈상태) / 마감 후 / 게스트(로그인 유도)
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: EP-NAV-03, EP-NAV-05, BE `BE-E08-T01`(대행 주문)
- effort: M · priority: P0

### [NAV-T-NAV-0702] 구독/결제 진입점+멤버십 내비 반영
멤버십 상태 반영+업그레이드, 결제/통신판매 고지.
- subtask: 멤버십 뱃지 / 프리미엄 배너 / 결제 수단 로고+고지 / 만료·실패 배너
- acceptance criteria: 멤버십 상태 반영+업그레이드 / 결제·통신판매 고지
- edge cases: 만료 / 결제 실패(past_due) / 게스트
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: EP-NAV-05, BE `BE-E06-T01`(구독 상품)
- effort: M · priority: P1

---

# B. PAY — 요금제/게이팅/결제/구독관리/결제내역 (FE)

## [PAY] E1 · 요금제 FE 상수·플랜 비교

### [PAY-E1-T1] 등급/플랜 FE 상수·TIER_META fallback
FE에서 등급/플랜 표시에 쓰는 상수·헬퍼와 서버 실패 시 fallback.
- subtask: subscription 상수(FREE/PREMIUM/HOST_*) FE 미러 / is_paid·is_host 헬퍼 / TIER_META fallback
- acceptance criteria: FE TIER_META fallback 동작 / is_paid·is_host 단위테스트 / 서버 가격 실패 시 안전 표시
- edge cases: 서버 가격 실패(fallback) / 미지원 등급 / 통화 포맷
- UI 상태: —
- dependencies: BE `PAY-E1-T1`(등급 상수)
- effort: M · priority: P0

### [PAY-E1-T4] 플랜 비교/perks 화면 + VAT 분리 표기
한도 변경 perks 무코드 갱신, VAT 합 일치, 무료 perks 정확.
- subtask: 플랜 비교 테이블 / perks 동적 렌더 / VAT 분리 표기 / 무료 perks
- acceptance criteria: 한도 변경 perks 무코드 갱신 / VAT 합 일치 / 무료 perks 정확
- edge cases: 가격 변경 / VAT 계산 / 무료 등급
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `PAY-E1-T2`(가격 공개 API), `PAY-E1-T3`(한도)
- effort: S · priority: P1

## [PAY] E2 · 무료↔유료 게이팅 UI

### [PAY-E2-T2] FE 전역 업그레이드 모달+402 인터셉터
402 자동 모달, exceeded/info 구분, 구독 사전선택 진입.
- subtask: 402 인터셉터 / 업그레이드 모달 / exceeded·info 구분 / 구독 사전선택 진입
- acceptance criteria: 402 자동 모달 / exceeded·info 구분 / 구독 사전선택 진입
- edge cases: 402 연속 / 모달 중복 / locale 메시지
- UI 상태: 로딩 · 에러 · 오프라인
- dependencies: BE `PAY-E2-T1`(게이팅 미들웨어/402), PAY-E1-T2/T4
- effort: M · priority: P0

### [PAY-E2-T3] FE 사용량 표시(UsageCard/칩)+80%/100% 넛지
동작 직후 갱신, 80% 1회 토스트, 무제한 텍스트.
- subtask: UsageCard·칩 / 80%·100% 넛지 / 무제한 텍스트 / 동작 직후 갱신
- acceptance criteria: 동작 직후 갱신 / 80% 1회 토스트 / 무제한 텍스트
- edge cases: 무제한 / 월간 리셋 / 80% 경계
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `PAY-E2-T1`(usage)
- effort: M · priority: P1

### [PAY-E2-T4] 기능별 잠금 UI(락/블러/티저)+미리보기 게이팅
무료 티저/전체 접근 불가, 권한 시 투명 통과, 락 CTA 정확.
- subtask: FeatureGate 래퍼 / 선곡분석 블러 티저(BE 미전송) / 제출대행·주최 게이트 / 락 CTA
- acceptance criteria: 무료 티저·전체 접근 불가 / 권한 시 투명 통과 / 락 CTA 정확 모달
- edge cases: 권한 변경 실시간 / 블러 우회 방지(BE 미전송) / 락 CTA
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 잠금
- dependencies: PAY-E2-T2, BE `PAY-E1-T1`
- effort: M · priority: P1

## [PAY] E3 · 결제 화면/체크아웃 (FE)

### [PAY-E3-T3] FE 결제 화면/체크아웃(토스 SDK·카카오/네이버페이)
금액 일치, confirm 완료 후 활성, 자동결제 동의 필수.
- subtask: 토스 결제위젯(카드·카카오페이·네이버페이) / success·fail 콜백 / 빌링키 등록 / 중복클릭 방지 / 정기결제 고지
- acceptance criteria: 금액 일치 / confirm 완료 후 활성 / 자동결제 동의 필수
- edge cases: 금액 불일치(취소) / 콜백 실패 / 중복 클릭 / 결제수단 미지원
- UI 상태: 로딩(결제) · 빈 · 에러(실패) · 오프라인 · 성공
- dependencies: BE `PAY-E3-T2`(주문/결제 모델), `PAY-E3-T4`(confirm)
- effort: XL · priority: P0

### [PAY-E3-T5] 단건 결제 ★음원/악보 제출 대행 결제 화면 — FE
견적=결제 일치, 결제 후만 대행 in_progress, 무료/유료 분기.
- subtask: 대행 상품·옵션 가격 표시 / `/quote` 견적 / kind=proxy_submission 결제 / 무료 quota 분기
- acceptance criteria: 견적=결제 일치 / 결제 후만 대행 진행 / 무료·유료 분기
- edge cases: 무료 quota 소진 / 견적 변경 / 마감 후
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `PAY-E3-T5`, PAY-E3-T3
- effort: L · priority: P0

## [PAY] E4 · 구독관리 화면 (FE)

### [PAY-E4-T4] 업/다운그레이드(proration)+해지/재구독 화면 — FE
업그레이드 차액 표시, 다운그레이드 다음 주기, 해지 기간 유지.
- subtask: 업·다운그레이드 / proration 차액 표시 / 해지(기간 유지)·재구독 / 결제수단 변경
- acceptance criteria: 업그레이드 차액 정확 / 다운그레이드 다음 주기 / 해지 기간 유지
- edge cases: 다운그레이드 예약 / 해지 후 재구독 / 차액 0
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 성공
- dependencies: BE `PAY-E4-T4`, `PAY-E4-T1`(구독 상태머신)
- effort: L · priority: P0

### [PAY-E4-T5] 연체(dunning) 안내 UI+카드 갱신 딥링크 — FE
past_due 배너, 재시도 안내, 카드 갱신 딥링크.
- subtask: past_due 배너 / 재시도 단계 안내 / 유예 기능 제한 표시 / 카드 갱신 딥링크
- acceptance criteria: 연체 상태 명확 안내 / 카드 갱신 딥링크 / 유예 제한 표시
- edge cases: 재시도 중 / 복구 / 만료
- UI 상태: 로딩 · 빈 · 에러 · 오프라인 · 연체(past_due)
- dependencies: BE `PAY-E4-T5`(dunning)
- effort: M · priority: P0

## [PAY] E5 · 결제·구독 내역 화면 (FE)

### [PAY-E5-T5] 결제·구독 내역 화면(마이페이지 Billing)
최신순 금액/상태, 항목 액션, 결제수단 즉시 반영.
- subtask: 내역 목록(최신순·금액·상태) / 항목 액션(영수증·현금영수증·환불 진입) / 결제수단 관리
- acceptance criteria: 최신순 금액·상태 / 항목 액션 / 결제수단 즉시 반영
- edge cases: 환불 항목 / 영수증 미발급 / 내역 0
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `PAY-E3-T4`, `PAY-E4-T1`, `PAY-E5-T2`(영수증)
- effort: M · priority: P1

---

# C. APP — 제출 대행 플로우 UI

## [APP] EP-APP-04 · 제출 대행 플로우 (FE)

### [APP-T-04-06] 제출 대행 UI(시작→결제→추적→재제출)
끊김 없는 진행, 검증/마감/누락 차단+보완, 4종 결제+동의, 실시간 타임라인+영수증.
- subtask: 위저드(자료확인→재검증→동의→결제→전달중→완료) / 상태추적 화면 / 재제출 화면 / Phase2 미오픈 폴백 / 위임·제3자·환불 동의 캡처 / 영수증
- acceptance criteria: 끊김 없는 진행 / 검증·마감·누락 차단+보완 / 4종 결제+동의 / 실시간 타임라인+영수증 / 재제출 이어짐 / 모바일·키보드·스크린리더
- edge cases: 검증 실패(보완) / 마감 후(차단) / 결제 실패(안전 복귀) / 이탈 후 DRAFT 복원
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(DRAFT 로컬) · 성공
- dependencies: BE `APP-T-04-01`(상태머신), `APP-T-04-03`(전달 엔진), `APP-T-04-04`(추적/영수증), 결제 `PAY-E3-T5`
- effort: XL · priority: P0

## [APP] EP-APP-05 · 마감 리마인더 & 영수증/확인 알림 (FE 부분)

### [APP-T-05-02] 제출 이벤트 알림 인앱 동기화 — FE
상태 전이 알림 인앱 반영, 실패+재제출 경로, 영수증 링크.
- subtask: 상태 전이 인앱 알림 동기화 / 실패→재제출 경로 / 영수증·접수증 딥링크
- acceptance criteria: 상태 전이 알림 인앱 동기화 / 실패+재제출 경로 / 영수증 링크
- edge cases: 실패(재제출) / 환불 / 영수증 미발급
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `APP-T-04`(이벤트), NOTI `NOTI-T-04-03`(알림센터)
- effort: S · priority: P0

---

# D. BIZ(FE) — 제출 대행 추적 화면·주최 접수 공개 폼

## [BIZ] E1 · 제출 대행 사용자 플로우 화면 (FE)

### [BIZ-E1-T4] 제출 대행 사용자 플로우 화면(위저드·추적) — FE
이탈 후 DRAFT 복원, fail 미해결 진행 불가, 결제 실패 안전 복귀, 모바일 전과정, WCAG AA.
> APP-T-04-06과 정합 — BIZ 측은 운영/전달·상태 추적 관점의 화면 정합.
- subtask: 위저드 진행·복원 / 상태 추적 타임라인 / fail 차단·보완 / 결제 실패 복귀 / 4상태 / 모바일·a11y
- acceptance criteria: 이탈 후 DRAFT 복원 / fail 미해결 진행 불가 / 결제 실패 안전 복귀 / 4상태 / 모바일 전과정 / WCAG AA
- edge cases: DRAFT 복원 / fail 미해결 / 결제 실패 / 모바일
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(DRAFT) · 성공
- dependencies: BE `BIZ-E1-T1`(상태머신), `BIZ-E1-T2`(검증), `BIZ-E1-T3`(전달채널), 정산 `BIZ-E4`
- effort: XL · priority: P0

## [BIZ] E2 · 주최측 B2B 접수 SaaS — 참가자 공개 화면 (FE)

### [BIZ-E2-T3] 참가자 접수 페이지(공개 렌더러) — FE
모바일 음원 첨부 완료, 정원 마감 차단/대기열, 유료 결제 후 확정, 비회원 인증.
- subtask: 공개 URL 렌더 / 폼 렌더+조건부 로직 / 사전검증(음원 형식) / 비회원·회원 / 접수비 결제 / 완료 확인 / 임시저장 / 미성년자 동의
- acceptance criteria: 모바일 음원 첨부 완료 / 정원 마감 차단·대기열 / 유료 결제 후 확정 / 비회원 인증
- edge cases: 정원 마감(대기열) / 비회원 / 미성년자 동의 / 임시저장 복원 / 음원 검증 실패
- UI 상태: 로딩 · 빈 · 에러 · 오프라인(임시저장) · 성공
- dependencies: BE `BIZ-E2-T2`(폼 빌더), 정산 `BIZ-E4`, 검증 `BIZ-E1-T2`
- effort: L · priority: P1

---

# E. NOTI — 알림톡 거래 알림 (FE 부분)

## [NOTI] EPIC-NOTI-07 · 카카오 알림톡 (FE 연동)

### [NOTI-T-07-03] 결제·구독·제출 대행 거래 알림 인앱 연동 — FE
상태 변화 1회, 영수증/접수증 딥링크, 인앱 동기화.
- subtask: 거래 알림 인앱 동기화(결제·구독·제출) / 영수증·접수증 딥링크 / 알림센터 반영
- acceptance criteria: 상태 변화 1회 / 영수증·접수증 딥링크 / 인앱 동기화
- edge cases: webhook 중복(무중복) / 정보성 야간 무관 / 딥링크 무효
- UI 상태: 로딩 · 빈 · 에러 · 오프라인
- dependencies: BE `NOTI-T-07-02`(AlimtalkNotifier), NOTI `NOTI-T-04-03`(알림센터)
- effort: M · priority: P1

---

# F. COM — Phase2 법무 강화 (FE)

## [COM] LEGAL-03 (Phase2 강화) · 전자금융·통신판매 (FE)

### [COM-LEGAL-03-P2] 결제 UX 법정 고지 강제 적용 — FE
결제 도입 시점에 사업자/통신판매업 신고번호·전자금융·세금계산서·청약철회를 푸터/결제 UX에 강제.
- subtask: 푸터 사업자·통신판매 신고번호 확정 반영 / 결제 전 청약철회·환불 고지 / 자동결제 동의 이력 UI / 세금계산서·현금영수증 발급 진입
- acceptance criteria: 푸터·결제 UX 법정 표기 / 결제 전 고지 강제 / 동의 이력(버전·시각·IP)
- edge cases: 사업자번호 확정 시점 / 정기결제 고지 / 청약철회 예외(디지털 콘텐츠)
- UI 상태: 빈 · 에러
- dependencies: COM `COM-LEGAL-03`(Phase1 골격), BE `PAY-E7-T1`(약관·고지)
- effort: M · priority: P0

---

### Phase 2 합계 (FE)
- **NAV:** Epic 1 · Task 2 (0701, 0702)
- **PAY:** Epic 5 · Task 10 (E1-T1/T4·E2-T2/T3/T4·E3-T3/T5·E4-T4/T5·E5-T5)
- **APP:** Epic 2 · Task 2 (04-06·05-02)
- **BIZ(FE):** Epic 2 · Task 2 (E1-T4·E2-T3)
- **NOTI:** Epic 1 · Task 1 (07-03)
- **COM:** Epic 1 · Task 1 (LEGAL-03-P2)
- **합계: Epic 12 · Task 18**

> Epic 12 = NAV(1)+PAY(5)+APP(2)+BIZ-FE(2)+NOTI(1)+COM(1), 각 `## [TAG]` 영역-에픽 섹션 기준. PAY는 마스터 PAY 에픽(E1·E2·E3·E4·E5)을 FE Task 단위로 분할.
