<script setup>
import { computed } from 'vue'
import {
  RefreshCw, ExternalLink, X, Loader2, AlertTriangle,
  Star, GitFork, FileCode, Activity, BookOpen,
} from 'lucide-vue-next'
import { md } from '@/utils/markdown'
import { normalizeLanguages, buildCommitHeatmap, formatRelativeKr, formatBytes } from '@/utils/github'
import { roleColor } from '@/composables/useProjectRepos'
import { langColor } from '@/utils/langColor'
import { formatNum } from '@/utils/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  repo: { type: Object, default: null },           // { url, role, label }
  data: { type: Object, default: null },           // enriched meta or { ok: false, error, status }
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'refresh', 'open-repo'])

const tab = computed({
  get: () => internalTab.value,
  set: (v) => { internalTab.value = v },
})
import { ref, watch, onMounted, onUnmounted } from 'vue'
const internalTab = ref('overview')
watch(() => props.open, (v) => { if (v) internalTab.value = 'overview' })

// ESC 키로 닫기
const onKeydown = (e) => {
  if (e.key === 'Escape' && props.open) {
    e.preventDefault()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const languages = computed(() => normalizeLanguages(props.data?.languages || {}))
const heatmap = computed(() => buildCommitHeatmap(props.data?.commits || [], 90))
const heatmapMax = computed(() => Math.max(1, ...heatmap.value.map(d => d.count)))
const readmeHtml = computed(() => {
  const c = props.data?.readme
  return c ? md.render(c) : ''
})

const heatColor = (count, max) => {
  if (count === 0) return '#F2EAD8'
  const intensity = count / max
  if (intensity < 0.2) return '#E8C49A'
  if (intensity < 0.5) return '#C89B6A'
  if (intensity < 0.8) return '#8C6239'
  return '#6B4A2A'
}

</script>

<template>
  <transition name="drawer">
    <div v-if="open" class="drawer-backdrop" @click="emit('close')">
      <div class="drawer-panel" role="dialog" aria-modal="true" :aria-label="$t('deliverables.drawer.aria_label', { name: repo?.label || repo?.url || '' })" @click.stop>
        <div class="drawer-head">
          <div class="d-flex align-center drawer-head-info">
            <span class="role-dot" :style="{ background: roleColor(repo?.role) }"></span>
            <div class="drawer-head-titlewrap">
              <div class="drawer-title">{{ repo?.label || repo?.url.replace(/^https?:\/\/github\.com\//, '') }}</div>
              <div class="drawer-sub mono-text" :title="repo?.url">{{ repo?.url }}</div>
            </div>
          </div>
          <div class="d-flex align-center drawer-head-actions">
            <button type="button" class="icon-btn" :aria-label="$t('deliverables.drawer.refresh_aria')" :title="$t('deliverables.drawer.refresh_title')" @click="emit('refresh', repo.url)">
              <RefreshCw :size="13" :class="{ 'rotate-anim': isLoading }" />
            </button>
            <button type="button" class="icon-btn" :aria-label="$t('deliverables.drawer.open_github_aria')" :title="$t('deliverables.repo_grid.github_title')" @click="emit('open-repo', repo.url)"><ExternalLink :size="13" /></button>
            <button type="button" class="icon-btn" :aria-label="$t('deliverables.drawer.close_aria')" :title="$t('deliverables.drawer.close_title')" @click="emit('close')"><X :size="14" /></button>
          </div>
        </div>

        <div class="drawer-tabs">
          <button class="drawer-tab" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">{{ $t('deliverables.drawer.tab_overview') }}</button>
          <button class="drawer-tab" :class="{ active: tab === 'readme' }" @click="tab = 'readme'">README</button>
          <button class="drawer-tab" :class="{ active: tab === 'activity' }" @click="tab = 'activity'">{{ $t('deliverables.drawer.tab_activity') }}</button>
          <button class="drawer-tab" :class="{ active: tab === 'team' }" @click="tab = 'team'">{{ $t('deliverables.drawer.tab_team') }}</button>
        </div>

        <div class="drawer-body custom-scroll">
          <div v-if="isLoading && !data" class="drawer-loading">
            <Loader2 :size="22" class="rotate-anim" /><span>{{ $t('deliverables.drawer.loading') }}</span>
          </div>

          <div v-else-if="data?.ok === false" class="drawer-error">
            <AlertTriangle :size="20" />
            <p class="drawer-err-title">
              {{ data.status === 404 ? $t('deliverables.drawer.error.not_found')
                 : data.status === 403 ? $t('deliverables.drawer.error.rate_limit')
                 : $t('deliverables.drawer.error.generic') }}
            </p>
            <p class="drawer-err-desc">
              {{ data.status === 403
                ? $t('deliverables.drawer.error.desc_rate_limit')
                : $t('deliverables.drawer.error.desc_generic') }}
            </p>
          </div>

          <template v-else-if="data">
            <!-- TAB: 개요 -->
            <div v-if="tab === 'overview'">
              <div v-if="data.meta?.description" class="drawer-desc">{{ data.meta.description }}</div>

              <div class="drawer-stat-grid">
                <div class="drawer-stat">
                  <Star :size="14" />
                  <div><b>{{ data.meta?.stargazers || 0 }}</b><span>Stars</span></div>
                </div>
                <div class="drawer-stat">
                  <GitFork :size="14" />
                  <div><b>{{ data.meta?.forks || 0 }}</b><span>Forks</span></div>
                </div>
                <div class="drawer-stat">
                  <FileCode :size="14" />
                  <div><b>{{ formatNum(data.tree?.fileCount || 0) }}</b><span>Files</span></div>
                </div>
                <div class="drawer-stat">
                  <Activity :size="14" />
                  <div><b>{{ formatNum(data.tree?.estimatedLoc || 0) }}</b><span>Est. LOC</span></div>
                </div>
              </div>

              <div class="drawer-section">
                <div class="drawer-section-title">{{ $t('deliverables.drawer.lang_distribution') }}</div>
                <div v-if="languages.length" class="lang-bar lang-bar--big">
                  <div v-for="l in languages" :key="l.name"
                    class="lang-bar-seg" :style="{ width: l.percent + '%', background: langColor(l.name) }"
                    :title="`${l.name} ${l.percent}%`">
                  </div>
                </div>
                <div class="lang-list lang-list--full">
                  <span v-for="l in languages" :key="l.name" class="lang-chip">
                    <span class="lang-dot" :style="{ background: langColor(l.name) }"></span>
                    {{ l.name }} <small>{{ l.percent }}% · {{ formatBytes(l.bytes) }}</small>
                  </span>
                  <span v-if="!languages.length" class="text-muted">{{ $t('deliverables.drawer.no_lang') }}</span>
                </div>
              </div>

              <div class="drawer-section">
                <div class="drawer-section-title">{{ $t('deliverables.drawer.repo_info') }}</div>
                <table class="info-table">
                  <tr><td>Default Branch</td><td class="mono-text">{{ data.branch }}</td></tr>
                  <tr><td>License</td><td class="mono-text">{{ data.meta?.license || '—' }}</td></tr>
                  <tr><td>Visibility</td><td>{{ data.meta?.visibility }}</td></tr>
                  <tr><td>Last Push</td><td>{{ formatRelativeKr(data.meta?.pushedAt) }}</td></tr>
                  <tr><td>Open Issues</td><td>{{ data.meta?.openIssues || 0 }}</td></tr>
                  <tr v-if="data.fetchedAt"><td>{{ $t('deliverables.drawer.fetched_at') }}</td><td class="mono-text">{{ formatRelativeKr(data.fetchedAt) }}</td></tr>
                </table>
              </div>
            </div>

            <!-- TAB: README -->
            <div v-if="tab === 'readme'">
              <div v-if="data.readme" class="readme-render" v-html="readmeHtml"></div>
              <div v-else class="drawer-empty">
                <BookOpen :size="20" />
                <p>{{ $t('deliverables.drawer.no_readme') }}</p>
              </div>
            </div>

            <!-- TAB: 활동 -->
            <div v-if="tab === 'activity'">
              <div class="drawer-section">
                <div class="drawer-section-title">{{ $t('deliverables.drawer.commit_heatmap') }}</div>
                <div class="heatmap">
                  <div v-for="day in heatmap" :key="day.date" class="heatmap-cell"
                    :style="{ background: heatColor(day.count, heatmapMax) }"
                    :title="`${day.date}: ${day.count} commits`">
                  </div>
                </div>
                <div class="heatmap-legend">
                  <span class="text-muted">Less</span>
                  <span class="legend-cell legend-cell--1"></span>
                  <span class="legend-cell legend-cell--2"></span>
                  <span class="legend-cell legend-cell--3"></span>
                  <span class="legend-cell legend-cell--4"></span>
                  <span class="legend-cell legend-cell--5"></span>
                  <span class="text-muted">More</span>
                </div>
              </div>

              <div class="drawer-section">
                <div class="drawer-section-title">{{ $t('deliverables.drawer.recent_commits', { count: data.commits?.length || 0 }) }}</div>
                <div class="commit-list">
                  <div v-for="c in (data.commits || []).slice(0, 20)" :key="c.sha" class="commit-row">
                    <span class="commit-sha mono-text">{{ c.sha }}</span>
                    <span class="commit-msg" :title="c.message">{{ c.message }}</span>
                    <span class="commit-meta mono-text">{{ c.author }} · {{ formatRelativeKr(c.date) }}</span>
                  </div>
                  <div v-if="!data.commits?.length" class="text-muted">{{ $t('deliverables.drawer.no_commits') }}</div>
                </div>
              </div>
            </div>

            <!-- TAB: 팀 -->
            <div v-if="tab === 'team'">
              <div class="drawer-section">
                <div class="drawer-section-title">{{ $t('deliverables.drawer.contributors', { count: data.contributors?.length || 0 }) }}</div>
                <div class="contributor-list">
                  <div v-for="c in data.contributors" :key="c.login" class="contributor-row">
                    <img :src="c.avatarUrl" :alt="c.login" class="contributor-avatar" />
                    <div class="contributor-info">
                      <div class="contributor-name">{{ c.login }}</div>
                      <div class="contributor-stats mono-text">{{ c.contributions }} commits</div>
                    </div>
                    <div class="contributor-bar">
                      <div class="contributor-bar-fill" :style="{ width: ((c.contributions / (data.contributors[0]?.contributions || 1)) * 100) + '%' }"></div>
                    </div>
                  </div>
                  <div v-if="!data.contributors?.length" class="text-muted">{{ $t('deliverables.drawer.no_contributors') }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(42,36,33,0.45); backdrop-filter: blur(2px);
  display: flex; justify-content: flex-end;
}
.drawer-panel {
  width: 600px; max-width: 92vw; height: 100%;
  background: var(--bg-page);
  display: flex; flex-direction: column;
  box-shadow: -8px 0 40px rgba(0,0,0,0.15);
}
.drawer-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 18px 22px; background: white;
  border-bottom: 1px solid var(--border-light);
}
.drawer-head-info { gap: 10px; min-width: 0; flex: 1; display: flex; }
.drawer-head-titlewrap { min-width: 0; flex: 1; }
.drawer-head-actions { gap: 6px; display: flex; }
.role-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.drawer-title {
  font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 800;
  color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.drawer-sub {
  font-size: 0.7rem; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px;
}
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; background: transparent;
  border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all .12s;
}
.icon-btn:hover { background: var(--bg-light); color: var(--text-main); }

.drawer-tabs {
  display: flex; gap: 2px; background: white;
  border-bottom: 1px solid var(--border-light); padding: 0 18px;
}
.drawer-tab {
  padding: 12px 16px; background: transparent; border: none;
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 800;
  color: var(--text-muted); cursor: pointer; transition: all .15s;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.drawer-tab:hover { color: var(--text-main); }
.drawer-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.drawer-body { flex-grow: 1; overflow-y: auto; padding: 22px 24px; }
.drawer-loading, .drawer-empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 60px 20px; color: var(--text-muted); font-size: 0.85rem;
}
.drawer-error {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 50px 20px; color: #C0392B;
}
.drawer-err-title { font-size: 0.95rem; font-weight: 800; margin: 0; }
.drawer-err-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.drawer-desc {
  font-size: 0.88rem; color: var(--text-main); line-height: 1.6;
  padding: 14px 16px; background: white;
  border: 1px solid var(--border-light); border-radius: 10px; margin-bottom: 18px;
}
.drawer-stat-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px;
}
.drawer-stat {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; background: white;
  border: 1px solid var(--border-light); border-radius: 10px;
  color: var(--accent);
}
.drawer-stat > div { display: flex; flex-direction: column; }
.drawer-stat b {
  font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 900;
  color: var(--text-main); line-height: 1;
}
.drawer-stat span {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.62rem; font-weight: 700;
  color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase;
  margin-top: 4px;
}
.drawer-section { margin-bottom: 22px; }
.drawer-section-title {
  font-family: 'Outfit', sans-serif; font-size: 0.78rem; font-weight: 800;
  color: var(--text-main); margin-bottom: 10px;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.info-table {
  width: 100%; border-collapse: collapse; background: white;
  border: 1px solid var(--border-light); border-radius: 10px; overflow: hidden;
  font-size: 0.82rem;
}
.info-table td { padding: 8px 14px; border-bottom: 1px solid var(--border-light); }
.info-table tr:last-child td { border-bottom: none; }
.info-table td:first-child {
  color: var(--text-muted); font-weight: 600;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.72rem;
  width: 35%;
}

.lang-bar {
  display: flex; height: 6px; border-radius: 9999px; overflow: hidden;
  background: var(--bg-light); margin-bottom: 10px;
}
.lang-bar--big { height: 8px; }
.lang-bar-seg { height: 100%; }
.lang-list { display: flex; flex-wrap: wrap; gap: 6px; }
.lang-list--full { gap: 10px; }
.lang-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.7rem;
  color: var(--text-main);
}
.lang-chip small { color: var(--text-muted); margin-left: 4px; }
.lang-dot { width: 7px; height: 7px; border-radius: 50%; }

.readme-render {
  background: white; border: 1px solid var(--border-light); border-radius: 10px;
  padding: 18px 22px; font-size: 0.85rem; line-height: 1.7; color: var(--text-main);
}
.readme-render :deep(h1) { font-size: 1.4rem; font-weight: 900; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-light); }
.readme-render :deep(h2) { font-size: 1.15rem; font-weight: 800; margin: 18px 0 8px; }
.readme-render :deep(h3) { font-size: 1rem; font-weight: 800; margin: 14px 0 6px; }
.readme-render :deep(p) { margin: 0 0 10px; }
.readme-render :deep(code) { background: var(--bg-light); padding: 1px 6px; border-radius: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; }
.readme-render :deep(pre) { background: #2A2421; color: #FCFAEE; padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
.readme-render :deep(pre code) { background: transparent; color: inherit; padding: 0; }
.readme-render :deep(a) { color: var(--accent); text-decoration: underline; }
.readme-render :deep(ul), .readme-render :deep(ol) { padding-left: 22px; margin: 6px 0 10px; }
.readme-render :deep(blockquote) { border-left: 3px solid var(--accent); padding-left: 12px; color: var(--text-muted); margin: 8px 0; }
.readme-render :deep(table) { border-collapse: collapse; width: 100%; margin: 10px 0; }
.readme-render :deep(th), .readme-render :deep(td) { border: 1px solid var(--border-light); padding: 6px 10px; }

.heatmap {
  display: grid; grid-template-columns: repeat(13, 1fr); gap: 3px;
  padding: 12px; background: white; border: 1px solid var(--border-light);
  border-radius: 10px;
}
.heatmap-cell {
  aspect-ratio: 1; border-radius: 2px; transition: transform .12s;
}
.heatmap-cell:hover { transform: scale(1.4); z-index: 5; }
.heatmap-legend {
  display: flex; align-items: center; gap: 4px; margin-top: 8px;
  font-size: 0.7rem; color: var(--text-muted);
}
.legend-cell { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
.legend-cell--1 { background: #F2EAD8; }
.legend-cell--2 { background: #E8C49A; }
.legend-cell--3 { background: #C89B6A; }
.legend-cell--4 { background: #8C6239; }
.legend-cell--5 { background: #6B4A2A; }

.commit-list {
  background: white; border: 1px solid var(--border-light); border-radius: 10px;
  overflow: hidden;
}
.commit-row {
  display: grid; grid-template-columns: 60px 1fr auto;
  gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--border-light);
  align-items: center; font-size: 0.77rem;
}
.commit-row:last-child { border-bottom: none; }
.commit-row:hover { background: var(--bg-light); }
.commit-sha { font-size: 0.7rem; color: var(--accent); font-weight: 700; }
.commit-msg { color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.commit-meta { font-size: 0.66rem; color: var(--text-muted); white-space: nowrap; }

.contributor-list { display: flex; flex-direction: column; gap: 8px; }
.contributor-row {
  display: grid; grid-template-columns: 36px 1fr 80px;
  gap: 12px; padding: 10px 14px; align-items: center;
  background: white; border: 1px solid var(--border-light); border-radius: 10px;
}
.contributor-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--border-light);
}
.contributor-info { min-width: 0; }
.contributor-name {
  font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 700;
  color: var(--text-main);
}
.contributor-stats { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }
.contributor-bar {
  width: 100%; height: 6px; background: var(--bg-light);
  border-radius: 9999px; overflow: hidden;
}
.contributor-bar-fill { height: 100%; background: var(--accent); border-radius: 9999px; }

.drawer-enter-active, .drawer-leave-active { transition: opacity .2s ease; }
.drawer-enter-active .drawer-panel, .drawer-leave-active .drawer-panel { transition: transform .25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer-panel, .drawer-leave-to .drawer-panel { transform: translateX(100%); }

.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scroll::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 10px; }
</style>
