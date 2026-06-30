<script setup>
/**
 * 개인정보처리방침 — 내용은 locales/{loc}/legal.json (privacy), 렌더는 LegalDoc.vue.
 *
 * [2026-06-10] 결제 항목/제3자 제공/처리위탁을 Paddle(MoR) 기준으로 개정.
 * [2026-06-12] 보호책임자 실명 기재 + 국외 이전 고지(제28조의8) 추가.
 *              다국어 전환(ko/en/ja/zh — 한국어 원본 우선).
 */
import { ref } from 'vue'
import LegalDoc from '@/components/legal/LegalDoc.vue'

const lastUpdated = ref('2026-06-12')
</script>

<template>
  <LegalDoc doc="privacy" :last-updated="lastUpdated" footer="history" />
</template>
