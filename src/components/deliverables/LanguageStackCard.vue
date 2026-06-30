<script setup>
/**
 * LanguageStackCard — 등록된 모든 저장소의 언어를 합쳐서 분포 표시.
 *
 * "인수받는 팀이 어떤 기술 알아야 하는가" 질문에 한눈에 답.
 * GitHub Languages API 의 byte 단위를 모든 repo 합산 → top N 까지 bar.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code2 } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

const { t } = useI18n()

const props = defineProps({
  repos: { type: Array, required: true },
  repoMetaByUrl: { type: Object, required: true },
})

// 언어별 GitHub 표준 색상 (자주 나오는 것만 — fallback: accent).
const LANG_COLORS = {
  JavaScript: '#F7DF1E',
  TypeScript: '#3178C6',
  Python: '#3776AB',
  Java: '#ED8B00',
  Kotlin: '#7F52FF',
  Swift: '#FA7343',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Ruby: '#CC342D',
  PHP: '#777BB4',
  'C#': '#239120',
  'C++': '#00599C',
  C: '#A8B9CC',
  Vue: '#41B883',
  HTML: '#E34F26',
  CSS: '#1572B6',
  SCSS: '#CC6699',
  Shell: '#89E051',
  Dart: '#00B4AB',
  SQL: '#E38C00',
  Dockerfile: '#384D54',
  YAML: '#CB171E',
}

const aggregated = computed(() => {
  const totals = {} // lang -> bytes 합
  let grandTotal = 0
  let reposWithData = 0

  for (const r of props.repos) {
    const meta = props.repoMetaByUrl[r.url]
    if (!meta || meta.ok === false || !meta.languages) continue
    const langs = meta.languages
    let hadAny = false
    for (const [lang, bytes] of Object.entries(langs)) {
      const n = Number(bytes) || 0
      if (n <= 0) continue
      totals[lang] = (totals[lang] || 0) + n
      grandTotal += n
      hadAny = true
    }
    if (hadAny) reposWithData++
  }

  if (grandTotal === 0) return { items: [], grandTotal: 0, reposWithData: 0 }

  // 정렬 + percentage 계산
  const items = Object.entries(totals)
    .map(([lang, bytes]) => ({
      lang,
      bytes,
      pct: (bytes / grandTotal) * 100,
      color: LANG_COLORS[lang] || 'var(--accent)',
    }))
    .sort((a, b) => b.bytes - a.bytes)

  // top 6 + 나머지 합쳐서 "기타"
  const TOP = 6
  if (items.length > TOP) {
    const top = items.slice(0, TOP)
    const otherBytes = items.slice(TOP).reduce((sum, x) => sum + x.bytes, 0)
    if (otherBytes > 0) {
      top.push({
        lang: t('deliverables.lang_stack.others', { count: items.length - TOP }),
        bytes: otherBytes,
        pct: (otherBytes / grandTotal) * 100,
        color: '#9CA3AF',
      })
    }
    return { items: top, grandTotal, reposWithData }
  }

  return { items, grandTotal, reposWithData }
})

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <section class="lang-section">
    <div class="lang-head">
      <div>
        <span class="section-pill mono-text">
          <Code2 :size="11" class="mr-1" />{{ $t('deliverables.lang_stack.pill') }}
        </span>
        <h4 class="section-title serif-text">
          {{ $t('deliverables.lang_stack.title') }}
          <GuideTooltip target="deliv-tech-stack" placement="bottom" :size="13" />
        </h4>
        <p class="lang-desc">{{ $t('deliverables.lang_stack.desc') }}</p>
      </div>
      <div v-if="aggregated.grandTotal > 0" class="lang-total mono-text">
        <span class="lang-total-label">{{ $t('deliverables.lang_stack.analyzed_label') }}</span>
        <span class="lang-total-value">{{ aggregated.reposWithData }} / {{ repos.length }}</span>
      </div>
    </div>

    <!-- 데이터 없음 -->
    <div v-if="!aggregated.items.length" class="lang-empty">
      <p>{{ $t('deliverables.lang_stack.empty') }}</p>
    </div>

    <!-- 스택 바 (한 줄에 비율로 누적) -->
    <template v-else>
      <div class="lang-stack-bar" role="img" :aria-label="$t('deliverables.lang_stack.distribution_aria', { list: aggregated.items.map(i => `${i.lang} ${i.pct.toFixed(1)}%`).join(', ') })">
        <span
          v-for="item in aggregated.items"
          :key="item.lang"
          class="lang-stack-seg"
          :style="{ width: item.pct + '%', background: item.color }"
          :title="`${item.lang} — ${item.pct.toFixed(1)}% (${formatBytes(item.bytes)})`"
        ></span>
      </div>

      <!-- 항목별 상세 (legend + 퍼센트) -->
      <ul class="lang-list">
        <li v-for="item in aggregated.items" :key="item.lang" class="lang-item">
          <span class="lang-dot" :style="{ background: item.color }"></span>
          <span class="lang-name">{{ item.lang }}</span>
          <span class="lang-pct mono-text">{{ item.pct.toFixed(1) }}%</span>
          <span class="lang-bytes mono-text">{{ formatBytes(item.bytes) }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.lang-section {
  background: white; border: 1px solid var(--border-light); border-radius: 16px;
  padding: 22px 24px; margin-bottom: 24px;
}
.lang-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: 14px;
}
.section-pill {
  display: inline-flex; align-items: center; padding: 3px 10px;
  background: var(--bg-light); color: var(--accent);
  font-size: 0.62rem; font-weight: 800; letter-spacing: 0.08em;
  border-radius: 9999px; margin-bottom: 6px;
}
.section-title {
  font-family: 'Fraunces', 'Outfit', serif; font-size: 1.3rem; font-weight: 700;
  color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;
}
.lang-desc { font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0; }

.lang-total {
  display: flex; flex-direction: column; align-items: flex-end;
  padding: 8px 14px; background: var(--bg-light); border-radius: 10px;
}
.lang-total-label {
  font-size: 0.62rem; font-weight: 700; color: var(--text-muted);
  letter-spacing: 0.04em; text-transform: uppercase;
}
.lang-total-value {
  font-size: 1rem; font-weight: 800; color: var(--text-main); margin-top: 2px;
}

.lang-empty {
  padding: 30px; text-align: center; color: var(--text-muted);
  font-size: 0.82rem; background: var(--bg-light); border-radius: 10px;
}

.lang-stack-bar {
  display: flex; width: 100%; height: 14px;
  background: var(--bg-light);
  border-radius: 9999px; overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
}
.lang-stack-seg {
  height: 100%; transition: opacity 0.15s;
}
.lang-stack-seg:hover { opacity: 0.85; }

.lang-list {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;
}
.lang-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: var(--bg-light); border-radius: 8px;
}
.lang-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.lang-name {
  font-size: 0.82rem; font-weight: 700; color: var(--text-main);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lang-pct {
  font-size: 0.78rem; font-weight: 700; color: var(--text-main);
  font-variant-numeric: tabular-nums;
}
.lang-bytes {
  font-size: 0.7rem; color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .lang-head { flex-direction: column; }
  .lang-total { align-self: flex-start; align-items: flex-start; }
}
</style>
