<script setup>
/**
 * 자동결제(정기결제) 약관 — 내용은 locales/{loc}/legal.json (autobill), 렌더는 LegalDoc.vue.
 *
 * [2026-06-10] 토스 빌링키 구조 → Paddle(MoR) 고객포털 구조로 전면 개정.
 * [2026-06-12] 관할법원 placeholder 해소(민사소송법 기준).
 *              다국어 전환(ko/en/ja/zh — 한국어 원본 우선).
 * 통신판매업 신고번호는 신고 완료 후 추가 (신고 전 허위 번호 노출 방지).
 */
import { ref } from 'vue'
import LegalDoc from '@/components/legal/LegalDoc.vue'

const lastUpdated = ref('2026-06-12')
</script>

<template>
  <LegalDoc doc="autobill" :last-updated="lastUpdated" footer="company" show-mor show-effective />
</template>
