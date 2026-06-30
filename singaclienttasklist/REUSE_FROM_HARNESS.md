# FE 이식 가이드 — harness → gayoje-client

> `harness`(Vue3+Vuetify3+Pinia+vue-i18n+Vite)는 gayoje-client와 **스택 동일**.
> 부트스트랩·라우팅·인증·다국어·공통 UI·성능 유틸을 **이식**한다(바닥부터 X).
> 판정: **copy** · **adapt** · **pattern** · **skip**. ⚠️ harness 로컬 경로 기준(`C:\project\harness\...`).

---

## 1. 그대로 복사 (copy-as-is)

| 파일 | 역할 | 절약 | 가요제 매핑 |
|---|---|:--:|---|
| `src/plugins/index.js` | 플러그인 부팅 묶음 | S | COM-P0-01(앱셸) |
| `src/store/index.js` | Pinia 셋업(+persistedstate) | S | COM-P0-01, DATA |
| `src/utils/apiErrors.js` | API 에러 정규화 | M | 전 API 클라이언트, COM-QA |
| `src/utils/safeRedirect.js` | 오픈리다이렉트 방어 | S | AUTH, NAV 가드 |
| **`src/utils/inAppBrowser.js`** | **인앱 브라우저 감지/탈출** — 카카오/네이버 OAuth·토스 결제위젯이 인앱에서 깨지는 문제 대응 | L | AUTH-E4, PAY, COM-QA-02 |
| `src/utils/download.js` | 파일 다운로드 | S | LIST/DETAIL(선곡분석·아카이브 내보내기) |
| `src/composables/useSnackbar.js` | 토스트 | M | COM-DS, PWA 업데이트 토스트 |
| `src/composables/useConfirm.js` | 확인 다이얼로그 | S | COM-DS, 삭제/취소 UX |
| **`src/composables/useVirtualWindow.js`** | **가상 스크롤**(목록 대량 렌더링 성능) | M | LIST(가요제 목록), COM-성능 |
| `src/utils/webVitals.js` | 웹바이탈 측정 | M | COM-PERF |
| `vitest.config.js` · `tests/setup.js` | 테스트 셋업 | M | COM-P0-01, 테스트 |

## 2. 수정해서 이식 (adapt) — 핵심

| 파일 | 역할 | 절약 | adapt 포인트 |
|---|---|:--:|---|
| **`src/utils/axios.js`** | **API 클라이언트 토대.** 토큰 자동첨부·**리프레시 갱신**·에러분기·team context 단방향 주입(순환참조 회피) | **XL** | harness 도메인 분기 제거: Paddle 402→업그레이드, GitHub 프록시 401, `gemini_*` 에러, team_id 자동첨부. BE IP 주석 제거 |
| `src/plugins/i18n.js` | vue-i18n ko/en/ja/zh, runtimeOnly(strict CSP) | L | `LOCALE_STORAGE_KEY 'harness_locale'→'gayoje_locale'`. 도메인 메시지 fallback 정책 |
| `src/plugins/router.js` | 라우터 + 인증 가드(beforeEach) | L | 가요제 라우트로. 가드 패턴 유지 |
| `src/main.js` | **`router.isReady().then(mount)`** — 가드 redirect 완료 후 렌더(깜빡임/튕김 제거) | M | 부팅 시퀀스 유지, 도메인 enforce 제거 |
| `src/utils/auth.js` | 토큰 저장/관리 | L | BE IP 주석(`158.247.196.111`) 제거. **localStorage 토큰=XSS 노출면**(구조적 위험 인지) |
| `src/composables/useLocale.js` | 언어 감지/전환/영속화 | M | COM-I18N-02. 프로필 locale 반영 |
| `src/utils/geoLocale.js` | 국가 기반 기본언어 | M | ⚠️**Vercel Edge 전용** → gayoje는 Caddy(한국 호스팅)라 국가쿠키 주입을 **Caddy/FastAPI로 재구현** 필요 |
| `src/utils/format.js` | KRW·날짜·상대시간 한국 포맷 | M | LIST/DETAIL 가요제 일정 표시 |
| `src/api/notices.js` | 공공데이터 **기계번역+원문토글** 패턴 | M | COM-I18N-03, 운영공지. API 클라 작성 컨벤션 참고 |
| `src/components/common/ConfirmDialog.vue` | 확인 다이얼로그(WCAG) | M | COM-DS, COM-A11y. 테마색/폰트 토큰 교체 |
| `src/components/common/CardCollapseToggle.vue` | 섹션 접기 | S | DETAIL 상세 섹션 |
| `src/components/common/StaleBanner.vue` | 갱신/마감임박 배너 | S | DETAIL(공공데이터 갱신 안내) |
| **`vite.config.js`** | Vite+Vuetify+unplugin(auto-import/components/vue-router/layouts)+VueI18nPlugin | L | **VueI18nPlugin `runtimeOnly:true`+`strictMessage:false`+`include:'*.json'` 유지**(실경험 박제 — CSP/빌드 깨짐 방지) |
| `src/utils/crossTabSync.js` | 탭 간 인증 동기화 | M | AUTH-E8 |

## 3. 패턴만 참고 (pattern)

| 파일 | 패턴 |
|---|---|
| `src/api/teams.js` | API 클라이언트 작성 **컨벤션** |
| `src/utils/cacheKeys.js` | 캐시 키 네이밍(순환참조 끊기) — 프리픽스 교체 |
| `src/utils/userIsolation.js` | 유저 전환 시 캐시 격리 |
| `middleware.js` | geo 미들웨어(Vercel 전용 — Caddy로 대체) |
| `index.html` | SEO/JSON-LD **태그 셋업 구조**(본문 카피는 전량 교체) |
| `vercel.json` | CSP 헤더 **구조**(allowlist는 가요제 도메인으로) |

## 4. 삭제할 것 → `STRIP_PLAN.md` 참조

전체 카피 방식이라 '안 가져옴'이 아니라 '지움'이다. **실제 파일 경로 기준 정확한 삭제 목록 + `git rm` 블록**은 같은 폴더의 **`STRIP_PLAN.md`** 에 정리했다(도메인 components/store/utils/composables/pages·`design.json` 등 도메인 로케일·paddle SDK·MCP 등).

## 5. 이식 시 반드시 바꿀 것

- 🔁 **localStorage 프리픽스 일괄**: `harness_*`(token/refresh_token/user/locale/*_cache_v1/project_state/jobs_state) → **`gayoje_*`**
- 🌐 **인프라 제거**: BE IP `158.247.196.111:8000` 주석, CSP의 `api.harness-system.com`/`*.paddle.com` → gayoje·토스 도메인
- 🍪 **geo 쿠키명** `hf_geo_country`(higgsfield 잔재) → gayoje 명, **Caddy로 주입 재구현**
- 🔐 **한국 OAuth 갭**: harness는 Google/GitHub만 → **카카오/네이버 로그인 버튼·콜백 분기·`auth.json` provider 키 추가**
- 🎨 **테마/폰트**: 모카색(#8C6239)·'Outfit'/'Pretendard'·`var(--accent)` → 가요제 브랜드 토큰
- 📦 **자동생성 d.ts**(auto-imports/components/typed-router) 복사 금지 — 빌드 시 새로 생성됨
- 📌 `pinia-plugin-persistedstate@4.7.1` pin — 버전 바꾸면 `persist({afterRestore})` v4 문법 점검

## 6. 🎁 공짜로 얻는 FE 사고 교훈

1. **부팅 깜빡임 제거**: `main.js`의 `router.isReady().then(mount)` — 가드 토큰체크/redirect 완료 후 첫 렌더("대시보드 깜빡 후 /login 튕김" 제거)
2. **axios↔store 순환참조 회피**: store를 직접 import하지 않고 `setTeamContext()` setter로 단방향 주입
3. **i18n + strict CSP**: `runtimeOnly:true`로 런타임 `new Function` 제거 → unsafe-eval 없이 동작(Caddy CSP에 필수)
4. **인앱 브라우저 제약**: 카카오/네이버 OAuth·토스 결제가 카톡 인앱에서 깨짐 → `inAppBrowser.js`로 외부 브라우저 유도(이미 검증됨)
5. **목록 성능**: `useVirtualWindow` 가상 스크롤로 가요제 대량 목록 렌더링

---
*출처: harness FE 2-서브시스템 코드 스캔. `singaclienttasklist/`와 함께 빌드 세션에 제공할 것.*
