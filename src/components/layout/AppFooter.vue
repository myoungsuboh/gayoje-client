<script setup>
/**
 * AppFooter — 전역 사업자 정보 푸터 (전자상거래법 사업자 식별정보 표시 의무 대응).
 *
 * [정책]
 * 사이버몰 초기화면(메인) 표시는 법적 필수 — 안전하게 전 페이지 공통 푸터로 노출.
 * 결제(청약) 화면의 거래조건/청약철회 고지는 pricing.vue 가 별도 담당.
 *
 * [i18n]
 * 글로벌 locale 파일(ko/en index.js)이 다른 작업으로 편집 중일 수 있어, 충돌을 피하려
 * 컴포넌트-로컬 메시지로 둔다. 추후 글로벌 `footer` 네임스페이스로 이관 가능.
 *
 * [2026-06-12 실제 사업자 정보 반영]
 * 사업자등록 완료(786-04-03787). 주소는 자택 사업장이라 도로명까지만 표기
 * (동·호수 비노출 — 개인 안전, 실무 관행). 통신판매업신고번호는 신고 전이라
 * 미표기 — 신고 완료 시 BIZ.salesNo 복원 + 템플릿 줄 추가할 것.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({
  useScope: 'local',
  inheritLocale: true,
  fallbackLocale: 'ko',
  messages: {
    ko: {
      company: '하네스 (Harness)',
      address: '울산광역시 북구 화산로 75',
      ceo: '대표', bizNo: '사업자등록번호',
      tel: '전화', email: '이메일', host: '호스팅 제공자',
      terms: '이용약관', privacy: '개인정보처리방침', refund: '환불정책',
      rights: 'All rights reserved.',
    },
    en: {
      company: 'Harness',
      address: '75, Hwasan-ro, Buk-gu, Ulsan, Republic of Korea',
      ceo: 'CEO', bizNo: 'Business Reg. No.',
      tel: 'Tel', email: 'Email', host: 'Hosting',
      terms: 'Terms', privacy: 'Privacy Policy', refund: 'Refund Policy',
      rights: 'All rights reserved.',
    },
    // [2026-06-12] ja/zh — 사이트 지원 로케일(SUPPORTED_LOCALES) 4종과 동기.
    // 이전엔 ko 폴백이라 일/중 사용자에게 한국어 푸터가 노출됐다. 값은 동일, 라벨만 번역.
    ja: {
      company: 'Harness',
      address: '75, Hwasan-ro, Buk-gu, Ulsan, Republic of Korea',
      ceo: '代表', bizNo: '事業者登録番号',
      tel: '電話', email: 'メール', host: 'ホスティング',
      terms: '利用規約', privacy: 'プライバシーポリシー', refund: '返金ポリシー',
      rights: 'All rights reserved.',
    },
    zh: {
      company: 'Harness',
      address: '75, Hwasan-ro, Buk-gu, Ulsan, Republic of Korea',
      ceo: '代表', bizNo: '营业执照号',
      tel: '电话', email: '邮箱', host: '托管服务',
      terms: '服务条款', privacy: '隐私政策', refund: '退款政策',
      rights: 'All rights reserved.',
    },
  },
})

// 실제 사업자 정보 (2026-06-12 사업자등록 완료).
// salesNo(통신판매업신고번호)는 신고 완료 후 추가 — 허위 번호 노출 방지를 위해
// 신고 전엔 항목 자체를 표기하지 않는다 (간이과세자는 신고 면제 대상이기도 함).
const BIZ = {
  ceo: '오해금',
  bizNo: '786-04-03787',
  tel: '010-7573-1723',
  email: 'kaki3010@naver.com',
  host: 'Vercel Inc.',
}

const year = new Date().getFullYear()

// [2026-06-12 노출 정책] 전자상거래법상 신원정보 표시 의무는 "사이버몰 초기화면" —
// 전 페이지 고정 노출은 의무가 아니라 관행이다. 작업 화면(plan/design 등)에선
// 공간만 차지하므로: 랜딩(/) = 법적 의무, /pricing = 결제 직전 신뢰 요소,
// /legal/* = 약관과 한 몸. 이 세 곳에서만, 페이지 흐름 맨 아래(스크롤 끝)에 노출.
const route = useRoute()
const FOOTER_PATHS = new Set(['/', '/pricing'])
const isLegalPage = computed(() => route.path.startsWith('/legal/'))
const showFooter = computed(
  () => FOOTER_PATHS.has(route.path) || isLegalPage.value,
)
</script>

<template>
  <!-- app 프롭 제거 — 뷰포트 고정이 아니라 문서 흐름 맨 아래(스크롤 끝)에 위치. -->
  <v-footer v-if="showFooter" role="contentinfo" class="app-footer">
    <div class="footer-inner">
      <!-- 좌측: 사업자 정보 2줄 -->
      <div class="footer-side footer-side--left">
        <p class="footer-line">
          <span class="biz-item biz-name">{{ t('company') }}</span>
          <span class="biz-item">{{ t('ceo') }} {{ BIZ.ceo }}</span>
          <span class="biz-item">{{ t('bizNo') }} {{ BIZ.bizNo }}</span>
          <span class="biz-item biz-item--addr">{{ t('address') }}</span>
        </p>
        <p class="footer-line">
          <span class="biz-item">{{ t('tel') }} {{ BIZ.tel }}</span>
          <span class="biz-item">{{ t('email') }} {{ BIZ.email }}</span>
          <span class="biz-item">{{ t('host') }} {{ BIZ.host }}</span>
        </p>
      </div>

      <!-- 우측: 약관 링크 + 카피라이트 2줄 -->
      <div class="footer-side footer-side--right">
        <!-- [2026-06-12] 약관 3종은 "한 묶음" — 약관 페이지 안에서 다른 약관으로
             이동할 땐 replace 로 히스토리를 교체해, 뒤로가기 한 번에 약관 진입 전
             페이지로 돌아간다 (약관을 순서대로 눌렀다고 그만큼 back 을 반복하지 않게). -->
        <nav class="footer-line footer-links" :aria-label="t('terms')">
          <router-link to="/legal/terms" :replace="isLegalPage" class="f-link">{{ t('terms') }}</router-link>
          <router-link to="/legal/privacy-policy" :replace="isLegalPage" class="f-link f-link--strong">{{ t('privacy') }}</router-link>
          <router-link to="/legal/refund-policy" :replace="isLegalPage" class="f-link">{{ t('refund') }}</router-link>
        </nav>
        <p class="footer-line footer-copy">© {{ year }} {{ t('company') }}. {{ t('rights') }}</p>
      </div>
    </div>
  </v-footer>
</template>

<style scoped>
.app-footer {
  background: var(--bg-light, #F7F5EB) !important;
  border-top: 1px solid var(--border-light, rgba(140, 98, 57, 0.1));
  padding: 12px var(--page-pad-x, 32px) !important;
  min-height: auto !important;
}
.footer-inner {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;   /* 좌: 사업자 정보 / 우: 링크·카피라이트 */
  align-items: flex-start;
  gap: 24px;
  font-size: 0.72rem;
  line-height: 1.7;
  color: var(--text-muted, #6F665F);
}
.footer-side { display: flex; flex-direction: column; gap: 2px; }
.footer-side--left { text-align: left; }
.footer-side--right { text-align: right; align-items: flex-end; }
.footer-line {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.footer-side--right .footer-line { justify-content: flex-end; }
/* 각 'label value' 를 한 덩어리로 유지하고, 구분자는 항목 뒤(::after)에 붙인다.
   → 줄바꿈돼도 '|' 가 다음 줄 머리에 외톨이로 떨어지지 않아 항상 정돈돼 보인다. */
.biz-item { white-space: nowrap; }
.biz-item:not(:last-child)::after {
  content: "|";
  margin: 0 9px;
  color: rgba(140, 98, 57, 0.3);
}
.biz-item--addr { white-space: normal; }   /* 주소만 길어서 모바일 줄바꿈 허용 */
.biz-name { color: var(--text-main, #2A2421); }   /* [2026-06-12] 굵기 일반 — 사용자 요청 */


.f-link {
  color: var(--text-muted, #6F665F);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s;
}
.f-link:not(:last-child)::after {
  content: "·";
  margin: 0 10px;
  color: rgba(140, 98, 57, 0.45);
}
.f-link:hover { color: var(--accent, #8C6239); }
.f-link--strong { color: var(--text-main, #2A2421); }
.footer-copy { color: var(--text-muted, #6F665F); }

@media (max-width: 600px) {
  .app-footer { padding: 10px 14px !important; }
  /* 모바일 — 한 열 중앙 정렬로 폴백 */
  .footer-inner { flex-direction: column; align-items: center; font-size: 0.66rem; gap: 6px; }
  .footer-side--left, .footer-side--right { text-align: center; align-items: center; }
  .footer-line, .footer-side--right .footer-line { justify-content: center; }
  .biz-item:not(:last-child)::after { margin: 0 6px; }
}
</style>
