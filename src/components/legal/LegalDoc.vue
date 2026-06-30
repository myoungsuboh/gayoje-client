<script setup>
/**
 * LegalDoc.vue — 법률 문서 공용 렌더러 (2026-06-12 다국어 전환).
 *
 * [배경] 이용약관/개인정보처리방침/환불정책/자동결제약관 4개 페이지가 전부
 * 한국어 하드코딩이라, 영/일/중 사용자가 번역된 링크("利用規約" 등)를 눌러도
 * 전문 한국어 문서가 나왔다. 문서 내용을 locales/{loc}/legal.json 으로 옮기고
 * 이 컴포넌트가 데이터 구동으로 렌더한다.
 *
 * [법적 우선순위] 비한국어본 상단에 "한국어 원본이 우선" 고지(legal.note)를
 * 표시한다 — 번역 뉘앙스 차이로 인한 분쟁 방지(번역본 표준 관행). ko 는 note
 * 가 빈 문자열이라 미표시.
 *
 * [v-html] 본문 일부에 <strong>/<a>/<ul> 마크업 포함 — 출처가 우리 locale
 * 파일(정적 자산)뿐이므로 XSS 표면 아님.
 *
 * Props:
 *   doc        — legal.json 의 문서 키 ('terms'|'privacy'|'refund'|'autobill')
 *   lastUpdated— 최종 개정일 (페이지가 보유 — locale 무관)
 *   footer     — 하단 변형: 'company'(회사 정보) | 'history'(변경 이력) | 'contact'(문의처)
 *   showMor    — 회사 정보에 결제대행(MoR) 행 추가 (autobill 용)
 *   showEffective — 부칙("본 약관은 {date}부터 적용") 표시
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, FileText } from 'lucide-vue-next'

const props = defineProps({
  doc: { type: String, required: true },
  lastUpdated: { type: String, required: true },
  footer: { type: String, default: 'company' },
  showMor: { type: Boolean, default: false },
  showEffective: { type: Boolean, default: false },
})

const router = useRouter()
const { t, tm, rt } = useI18n()

const sections = computed(() => tm(`legal.${props.doc}.sections`) || [])
const history = computed(() => (props.footer === 'history' ? tm('legal.privacy.history') || [] : []))
// 번역 고지 — ko 는 빈 문자열(미표시)
const note = computed(() => t('legal.note'))
</script>

<template>
  <div class="legal-page page-root">
    <button class="back-btn" @click="router.back()">
      <ArrowLeft :size="16" />
      <span>{{ $t('legal.back') }}</span>
    </button>

    <header class="legal-header">
      <h1 class="legal-title">
        <FileText :size="22" class="mr-2" />{{ $t(`legal.${doc}.title`) }}
      </h1>
      <p class="legal-meta text-muted">{{ $t('legal.updated', { date: lastUpdated }) }}</p>
    </header>

    <!-- 비한국어본 — 한국어 원본 우선 고지 -->
    <p v-if="note" class="note translation-note">{{ note }}</p>

    <div class="legal-content">
      <section v-for="(sec, i) in sections" :key="i">
        <h2>{{ rt(sec.title) }}</h2>
        <p v-if="sec.body" v-html="rt(sec.body)"></p>
        <ol v-if="sec.items">
          <li v-for="(it, j) in sec.items" :key="j" v-html="rt(it)"></li>
        </ol>
        <ul v-if="sec.bullets">
          <li v-for="(it, j) in sec.bullets" :key="j" v-html="rt(it)"></li>
        </ul>
        <table v-if="sec.table" class="info-table">
          <thead>
            <tr><th v-for="(h, j) in sec.table.head" :key="j">{{ rt(h) }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, j) in sec.table.rows" :key="j">
              <td v-for="(cell, k) in row" :key="k">{{ rt(cell) }}</td>
            </tr>
          </tbody>
        </table>
        <!-- 개인정보 보호책임자 (privacy 전용 섹션) -->
        <ul v-if="sec.officer" class="company-info">
          <li><strong>{{ $t('legal.privacy.officer.name_l') }}</strong>: {{ $t('legal.privacy.officer.name_v') }}</li>
          <li><strong>{{ $t('legal.privacy.officer.email_l') }}</strong>: <a href="mailto:kaki3010@naver.com">kaki3010@naver.com</a></li>
          <li><strong>{{ $t('legal.privacy.officer.tel_l') }}</strong>: {{ $t('legal.privacy.officer.tel_v') }}</li>
        </ul>
        <p v-if="sec.note" class="note" v-html="rt(sec.note)"></p>
      </section>

      <!-- ── 하단 변형 ──────────────────────────────────── -->
      <section class="legal-footer">
        <template v-if="footer === 'company'">
          <h2 v-if="showEffective">{{ $t('legal.addendum') }}</h2>
          <p v-if="showEffective">{{ $t('legal.effective', { date: lastUpdated }) }}</p>
          <hr v-if="showEffective" />
          <h3>{{ $t('legal.company_title') }}</h3>
          <ul class="company-info">
            <li><strong>{{ $t('legal.company.name_l') }}</strong>: {{ $t('legal.company.name_v') }}</li>
            <li><strong>{{ $t('legal.company.ceo_l') }}</strong>: {{ $t('legal.company.ceo_v') }}</li>
            <li><strong>{{ $t('legal.company.biz_l') }}</strong>: {{ $t('legal.company.biz_v') }}</li>
            <li><strong>{{ $t('legal.company.addr_l') }}</strong>: {{ $t('legal.company.addr_v') }}</li>
            <li><strong>{{ $t('legal.company.tel_l') }}</strong>: {{ $t('legal.company.tel_v') }}</li>
            <li><strong>{{ $t('legal.company.support_l') }}</strong>: <a href="mailto:kaki3010@naver.com">kaki3010@naver.com</a></li>
            <li v-if="showMor"><strong>{{ $t('legal.company.mor_l') }}</strong>: {{ $t('legal.company.mor_v') }}</li>
          </ul>
        </template>

        <template v-else-if="footer === 'history'">
          <h3>{{ $t('legal.history_title') }}</h3>
          <ul>
            <li v-for="(h, i) in history" :key="i">{{ rt(h) }}</li>
          </ul>
        </template>

        <template v-else-if="footer === 'contact'">
          <h3>{{ $t('legal.contact_title') }}</h3>
          <ul class="company-info">
            <li><strong>{{ $t('legal.company.name_l') }}</strong>: {{ $t('legal.company.name_v') }}</li>
            <li><strong>{{ $t('legal.company.support_l') }}</strong>: <a href="mailto:kaki3010@naver.com">kaki3010@naver.com</a></li>
            <li><strong>{{ $t('legal.company.hours_l') }}</strong>: {{ $t('legal.company.hours_v') }}</li>
          </ul>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.legal-page { padding: 24px var(--page-pad-x, 32px); max-width: 880px; margin: 0 auto; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--border-light, rgba(0,0,0,0.1));
  color: var(--text-main, #2A2421);
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.8rem; cursor: pointer; margin-bottom: 18px;
}
.back-btn:hover { background: rgba(0,0,0,0.04); }

.legal-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.08)); }
.legal-title { display: flex; align-items: center; font-size: 1.5rem; font-weight: 800; margin: 0 0 6px; }
.legal-meta { font-size: 0.78rem; margin: 0; }

.legal-content section { margin-bottom: 28px; }
.legal-content h2 { font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0 0 10px; }
.legal-content h3 { font-size: 0.95rem; font-weight: 700; margin: 16px 0 8px; }
.legal-content p { font-size: 0.88rem; line-height: 1.7; color: var(--text-main); margin: 0 0 8px; }
.legal-content ol, .legal-content ul { padding-left: 22px; margin: 0 0 8px; }
.legal-content ol li, .legal-content ul li { font-size: 0.88rem; line-height: 1.7; margin-bottom: 4px; }

.note {
  background: var(--bg-light, #F7F5EB);
  border-left: 3px solid var(--accent, #8C6239);
  padding: 10px 14px;
  font-size: 0.82rem;
  border-radius: 0 6px 6px 0;
  margin: 10px 0;
}
.translation-note { margin: 0 0 22px; }

.info-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.82rem;
}
.info-table th, .info-table td {
  border: 1px solid var(--border-light, rgba(0,0,0,0.12));
  padding: 8px 10px;
  text-align: left;
}
.info-table th {
  background: var(--bg-light, #F7F5EB);
  font-weight: 700;
}
.info-table td:first-child { white-space: nowrap; font-weight: 600; color: var(--text-muted); }

.legal-footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border-light, rgba(0,0,0,0.08)); }
.legal-footer hr { margin: 16px 0; border: 0; border-top: 1px dashed var(--border-light, rgba(0,0,0,0.12)); }
.company-info { list-style: none; padding: 0; }
.company-info li { font-size: 0.85rem; line-height: 1.8; }
.company-info strong { display: inline-block; min-width: 160px; color: var(--text-muted); }
.company-info a { color: var(--accent, #8C6239); text-decoration: none; }
.company-info a:hover { text-decoration: underline; }

/* 본문 내 링크 (v-html 로 들어온 <a>) */
.legal-content :deep(a) { color: var(--accent, #8C6239); }
</style>
