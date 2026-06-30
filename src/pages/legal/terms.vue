<script setup>
/**
 * 이용약관 — 내용은 locales/{loc}/legal.json (terms), 렌더는 LegalDoc.vue.
 *
 * [2026-06-10] 결제 조항(제5조)을 Paddle(MoR)/USD 기준으로 개정.
 * [2026-06-12] 관할법원 placeholder 해소(민사소송법 기준), 불리한 변경 30일 공지,
 *              회사 정보 전화번호 추가. 다국어 전환(ko/en/ja/zh — 한국어 원본 우선).
 * 통신판매업 신고번호는 신고 완료 후 추가 (신고 전 허위 번호 노출 방지).
 */
import { ref } from 'vue'
import LegalDoc from '@/components/legal/LegalDoc.vue'

const lastUpdated = ref('2026-06-12')
</script>

<template>
  <LegalDoc doc="terms" :last-updated="lastUpdated" footer="company" show-effective />
</template>
