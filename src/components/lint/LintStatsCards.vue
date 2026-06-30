<script setup>
import { computed } from 'vue'
import { Activity, FileCheck, Shield, AlertTriangle, CheckCircle2, Database, RefreshCw, Loader2, Info } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const props = defineProps({
  stats: { type: Object, required: true },
  isFromCache: { type: Boolean, default: false },
  cacheAgeText: { type: String, default: '' },
  isLinting: { type: Boolean, default: false },
})
defineEmits(['rerun'])

// [Sprint1 1.2] 샘플 커버리지. 백엔드가 spec 토큰이 경로에 매칭되는 코드 파일만
// 일부 샘플링해 검사하므로, 전체 대비 검사한 파일 수를 정직하게 노출한다.
const totalCodeFiles = computed(() => props.stats.totalCodeFiles ?? props.stats.scannedFiles ?? 0)
const sampledFiles = computed(() => props.stats.sampledFiles ?? props.stats.scannedFiles ?? 0)
const isTruncated = computed(() => {
  if (props.stats.coverageTruncated != null) return !!props.stats.coverageTruncated
  return sampledFiles.value < totalCodeFiles.value
})
const coveragePct = computed(() => {
  if (!totalCodeFiles.value) return 0
  return Math.round((sampledFiles.value / totalCodeFiles.value) * 100)
})
</script>

<template>
  <div>
    <!-- [2026-05-19] 캐시된 결과는 배너로 강조 — 사용자가 옛 결과 새 결과 혼동 방지. -->
    <div
      v-if="isFromCache"
      class="cache-banner cache-banner--stale"
      role="status"
    >
      <div class="cache-banner__icon">
        <Database :size="16" />
      </div>
      <div class="cache-banner__text">
        <strong>{{ $t('lint.stats.cache_banner_stale_title', { age: cacheAgeText }) }}</strong>
        {{ $t('lint.stats.cache_banner_stale_desc') }}
      </div>
      <button
        type="button"
        class="cache-banner__btn"
        :disabled="isLinting"
        @click="$emit('rerun')"
      >
        <Loader2 v-if="isLinting" :size="13" class="rotate-anim mr-1" />
        <RefreshCw v-else :size="13" class="mr-1" />
        {{ isLinting ? $t('lint.stats.analyzing') : $t('lint.stats.rerun') }}
      </button>
    </div>
    <div v-else class="cache-banner cache-banner--fresh" role="status">
      <div class="cache-banner__icon"><CheckCircle2 :size="16" /></div>
      <div class="cache-banner__text">
        <strong>{{ $t('lint.stats.cache_banner_fresh_title') }}</strong> {{ $t('lint.stats.cache_banner_fresh_desc') }}
      </div>
    </div>

    <!-- [Sprint1 1.1] 점수의 정체 고지 — "코드 품질"로 오해하지 않도록.
         이 점수는 설계 명세 항목(API/Entity/규칙)이 코드에 등장하는 비율이다. -->
    <div class="meaning-banner" role="note">
      <div class="meaning-banner__icon"><Info :size="15" /></div>
      <div class="meaning-banner__text" v-html="$t('lint.stats.meaning_text')"></div>
    </div>

    <!-- [Sprint1 1.2] 샘플 검사 고지 — 큰 레포는 일부 파일만 검사하므로
         점수를 곧이곧대로 신뢰하지 않도록 커버리지를 명시한다. -->
    <div
      v-if="isTruncated"
      class="meaning-banner meaning-banner--warn"
      role="status"
    >
      <div class="meaning-banner__icon"><AlertTriangle :size="15" /></div>
      <div
        class="meaning-banner__text"
        v-html="$t('lint.stats.coverage_text', { total: totalCodeFiles, sampled: sampledFiles, pct: coveragePct })"
      ></div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-box stat-icon-box--moss"><Activity :size="18" /></div>
        <div class="stat-body">
          <span class="stat-value-row">
            <span class="stat-value serif-text">{{ stats.score }}%</span>
            <!-- [2026-06] 점수만 따로 캡처·공유돼도 부분 검사임이 드러나게 —
                 경고 배너와 별개로 점수 카드 자체에 칩으로 명시. -->
            <span v-if="isTruncated" class="stat-partial-chip" :title="$t('lint.stats.coverage_text', { total: totalCodeFiles, sampled: sampledFiles, pct: coveragePct }).replace(/<[^>]+>/g, '')">
              {{ $t('lint.stats.partial_chip', { pct: coveragePct }) }}
            </span>
          </span>
          <span class="stat-label">
            {{ $t('lint.stats.traceability_score') }}
            <GuideTooltip target="lint-analysis-score" placement="bottom" :size="11" />
          </span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box stat-icon-box--blue"><FileCheck :size="18" /></div>
        <div class="stat-body">
          <span class="stat-value serif-text">
            {{ sampledFiles }}<span class="stat-value-sub"> / {{ totalCodeFiles }}</span>
          </span>
          <span class="stat-label">
            {{ $t('lint.stats.files_sampled') }}
            <GuideTooltip target="lint-scanned-files" placement="bottom" :size="11" />
          </span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box stat-icon-box--purple"><Shield :size="18" /></div>
        <div class="stat-body">
          <span class="stat-value serif-text">{{ stats.rulesChecked }}</span>
          <span class="stat-label">
            {{ $t('lint.stats.rules_checked') }}
            <GuideTooltip target="lint-rules-checked" placement="bottom" :size="11" />
          </span>
        </div>
      </div>
      <div class="stat-card stat-card--alert">
        <div class="stat-icon-box stat-icon-box--red"><AlertTriangle :size="18" /></div>
        <div class="stat-body">
          <span class="stat-value stat-value--alert serif-text">{{ stats.violations }}</span>
          <span class="stat-label">
            {{ $t('lint.stats.violations') }}
            <GuideTooltip target="lint-violations" placement="bottom" :size="11" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* [2026-05-19] 캐시 결과 배너 — 기존 작은 chip 대신 한 줄 알림 배너로.
   stale 은 노란 배경 + 새로 실행 CTA, fresh 는 초록 배경 (확신). */
.cache-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-family: 'Pretendard Variable', sans-serif;
}
.cache-banner__icon { flex-shrink: 0; display: inline-flex; }
.cache-banner__text {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.5;
}
.cache-banner__text strong { font-weight: 800; }
.cache-banner__btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  background: white;
  border: 1.5px solid currentColor;
  border-radius: 8px;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  color: inherit;
  transition: all 0.15s;
}
.cache-banner__btn:hover:not(:disabled) {
  background: currentColor;
}
.cache-banner__btn:hover:not(:disabled) > * { color: white !important; }
.cache-banner__btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cache-banner--stale {
  background: rgba(217, 119, 6, 0.08);
  border: 1px solid rgba(217, 119, 6, 0.3);
  color: #B46723;
}
.cache-banner--fresh {
  background: rgba(46, 123, 51, 0.08);
  border: 1px solid rgba(46, 123, 51, 0.25);
  color: #2E7B33;
}

.rotate-anim { animation: rotate 0.9s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 600px) {
  .cache-banner { flex-direction: column; align-items: stretch; gap: 8px; }
  .cache-banner__btn { align-self: flex-start; }
}
/* [Sprint1 1.1/1.2] 점수 의미 + 커버리지 고지 배너. */
.meaning-banner {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 14px; border-radius: 10px; margin-bottom: 12px;
  background: rgba(33, 150, 243, 0.06);
  border: 1px solid rgba(33, 150, 243, 0.22);
  color: #1c5d8f;
  font-family: 'Pretendard Variable', sans-serif;
}
.meaning-banner__icon { flex-shrink: 0; display: inline-flex; margin-top: 1px; }
.meaning-banner__text { flex: 1; min-width: 0; font-size: 0.8rem; line-height: 1.5; }
.meaning-banner__text strong { font-weight: 800; }
.meaning-banner--warn {
  background: rgba(217, 119, 6, 0.08);
  border-color: rgba(217, 119, 6, 0.3);
  color: #B46723;
}
.stat-value-sub { font-size: 0.95rem; font-weight: 700; color: var(--text-muted); }
/* [2026-06] 부분 검사 칩 — 좁은 카드에선 자연 줄바꿈 (flex-wrap). */
.stat-value-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stat-partial-chip {
  font-size: 0.62rem; font-weight: 800; letter-spacing: 0.02em;
  color: #B46723; background: rgba(217, 119, 6, 0.12);
  border: 1px solid rgba(217, 119, 6, 0.3);
  padding: 2px 8px; border-radius: 9999px; white-space: nowrap;
}

.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
.stat-card { display: flex; align-items: center; gap: 16px; padding: 20px 22px; background: white; border: 1px solid var(--border-light); border-radius: 14px; transition: all 0.15s; }
.stat-card:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
.stat-card--alert { border-color: rgba(244,67,54,0.2); }
.stat-icon-box { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.stat-icon-box--moss { background: rgba(46, 64, 54, 0.08); color: var(--primary-moss); }
.stat-icon-box--blue { background: rgba(33, 150, 243, 0.08); color: #2196F3; }
.stat-icon-box--purple { background: rgba(156, 39, 176, 0.08); color: #9C27B0; }
.stat-icon-box--red { background: rgba(244, 67, 54, 0.10); color: #F44336; }
.stat-value--alert { color: var(--accent); }
.stat-body { display: flex; flex-direction: column; }
.stat-value { font-size: 1.5rem; font-weight: 900; color: var(--text-main); line-height: 1.2; }
.stat-label { font-family: 'Outfit', sans-serif; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-top: 2px; }
@media (max-width: 1024px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .stats-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-card { padding: 14px 16px; gap: 12px; }
  .stat-value { font-size: 1.2rem; }
  .stat-icon-box { width: 36px; height: 36px; }
}
</style>
