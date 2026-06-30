<script setup>
/**
 * 환불정책 — 내용은 locales/{loc}/legal.json (refund), 렌더는 LegalDoc.vue.
 *
 * [2026-06-10] Paddle(MoR) 전환 — USD 결제·고객포털·Paddle 환불 흐름 기준으로 개정.
 * [2026-06-12] 다국어 전환(ko/en/ja/zh — 한국어 원본 우선).
 */
import { ref } from 'vue'
import LegalDoc from '@/components/legal/LegalDoc.vue'

const lastUpdated = ref('2026-06-12')
</script>

<template>
  <LegalDoc doc="refund" :last-updated="lastUpdated" footer="contact" />
</template>
