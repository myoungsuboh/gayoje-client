<script setup>
import {
  Plus, AlertTriangle, Loader2, Github,
  ExternalLink, Edit3, Trash2, FileCode, Activity, Calendar,
} from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'
import { ROLES } from '@/composables/useProjectRepos'
import { langColor } from '@/utils/langColor'
import { formatNum } from '@/utils/format'

const props = defineProps({
  repos: { type: Array, required: true },
  reposByRole: { type: Object, required: true },
  isLoading: { type: Boolean, default: false },
  errorMsg: { type: String, default: '' },
  repoMetaByUrl: { type: Object, required: true },
  repoMetaLoading: { type: Object, required: true },
  lintByUrl: { type: Object, required: true },
  // helpers
  topLanguagesFor: { type: Function, required: true },
  fileCountFor: { type: Function, required: true },
  locFor: { type: Function, required: true },
  lastCommitFor: { type: Function, required: true },
})

const emit = defineEmits(['add', 'edit', 'delete', 'open', 'open-repo'])
</script>

<template>
  <section class="repo-section">
    <div class="section-head">
      <div>
        <span class="section-pill mono-text">{{ $t('deliverables.repo_grid.pill') }}</span>
        <h4 class="section-title serif-text">
          {{ $t('deliverables.repo_grid.title') }}
          <GuideTooltip target="deliv-role-group" placement="bottom" :size="13" />
        </h4>
      </div>
      <span class="d-inline-flex align-center">
        <button class="add-btn" @click="emit('add')">
          <Plus :size="14" class="mr-1" />{{ $t('deliverables.repo_grid.add_btn') }}
        </button>
        <GuideTooltip target="add-repo" placement="bottom" />
      </span>
    </div>

    <div v-if="errorMsg" class="error-bar">
      <AlertTriangle :size="14" class="mr-2" />{{ errorMsg }}
    </div>

    <div v-if="isLoading && !repos.length" class="loading-state">
      <Loader2 :size="22" class="rotate-anim" />
      <span>{{ $t('deliverables.repo_grid.loading') }}</span>
    </div>

    <div v-else-if="!repos.length" class="empty-state">
      <Github :size="36" class="empty-icon" />
      <p class="empty-title">{{ $t('deliverables.repo_grid.empty_title') }}</p>
      <p class="empty-desc">{{ $t('deliverables.repo_grid.empty_desc') }}</p>
    </div>

    <div v-else class="role-groups">
      <div v-for="r in ROLES" :key="r.value" v-show="reposByRole[r.value].length" class="role-group">
        <div class="role-group-head">
          <span class="role-dot" :style="{ background: r.color }"></span>
          <span class="role-name">{{ r.label }}</span>
          <span class="role-count">{{ reposByRole[r.value].length }}</span>
        </div>
        <div class="repo-grid">
          <div
            v-for="repo in reposByRole[r.value]" :key="repo.url"
            class="repo-card"
            role="button"
            tabindex="0"
            :aria-label="$t('deliverables.repo_grid.open_aria', { name: repo.label || repo.url })"
            @click="emit('open', repo)"
            @keydown.enter.prevent="emit('open', repo)"
            @keydown.space.prevent="emit('open', repo)"
          >
            <div class="repo-card-head">
              <div class="d-flex align-center repo-card-head-info">
                <Github :size="14" class="repo-icon" :style="{ color: r.color }" />
                <span class="repo-label" :title="repo.label || repo.url">
                  {{ repo.label || repo.url.replace(/^https?:\/\/github\.com\//, '') }}
                </span>
              </div>
              <div class="repo-actions" @click.stop>
                <button type="button" class="icon-btn" :aria-label="$t('deliverables.repo_grid.open_github_aria', { url: repo.url })" :title="$t('deliverables.repo_grid.github_title')" @click="emit('open-repo', repo.url)"><ExternalLink :size="12" /></button>
                <button type="button" class="icon-btn" :aria-label="$t('deliverables.repo_grid.edit_aria', { name: repo.label || repo.url })" :title="$t('deliverables.repo_grid.edit_title')" @click="emit('edit', repo)"><Edit3 :size="12" /></button>
                <button type="button" class="icon-btn icon-btn--danger" :aria-label="$t('deliverables.repo_grid.delete_aria', { name: repo.label || repo.url })" :title="$t('deliverables.repo_grid.delete_title')" @click="emit('delete', repo)"><Trash2 :size="12" /></button>
              </div>
            </div>

            <div class="repo-url mono-text" :title="repo.url">{{ repo.url.replace(/^https?:\/\//, '') }}</div>

            <div class="repo-langs" v-if="topLanguagesFor(repo.url).length">
              <div class="lang-bar">
                <div v-for="l in topLanguagesFor(repo.url)" :key="l.name"
                  class="lang-bar-seg" :style="{ width: l.percent + '%', background: langColor(l.name) }"
                  :title="`${l.name} ${l.percent}%`">
                </div>
              </div>
              <div class="lang-list">
                <span v-for="l in topLanguagesFor(repo.url).slice(0, 3)" :key="l.name" class="lang-chip">
                  <span class="lang-dot" :style="{ background: langColor(l.name) }"></span>
                  {{ l.name }} <small>{{ l.percent }}%</small>
                </span>
              </div>
            </div>

            <div v-else-if="repoMetaLoading[repo.url]" class="repo-meta-loading">
              <Loader2 :size="12" class="rotate-anim" /> {{ $t('deliverables.repo_grid.meta_loading') }}
            </div>

            <div v-else-if="repoMetaByUrl[repo.url]?.ok === false" class="repo-meta-error">
              <AlertTriangle :size="12" />
              <span>
                {{ repoMetaByUrl[repo.url].status === 404 ? $t('deliverables.repo_grid.meta_error_404')
                   : repoMetaByUrl[repo.url].status === 403 ? $t('deliverables.repo_grid.meta_error_403')
                   : $t('deliverables.repo_grid.meta_error_other') }}
              </span>
            </div>

            <div v-else class="repo-meta-loading">
              <Loader2 :size="12" class="rotate-anim" /> {{ $t('deliverables.repo_grid.meta_waiting') }}
            </div>

            <div class="repo-stats">
              <span class="stat-item" v-if="fileCountFor(repo.url) !== null">
                <FileCode :size="11" />{{ formatNum(fileCountFor(repo.url)) }} {{ $t('deliverables.repo_grid.files_unit') }}
              </span>
              <span class="stat-item" v-if="locFor(repo.url) !== null">
                <Activity :size="11" />{{ formatNum(locFor(repo.url)) }} {{ $t('deliverables.repo_grid.loc_unit') }}
              </span>
              <span class="stat-item">
                <Calendar :size="11" />{{ lastCommitFor(repo.url) }}
              </span>
            </div>

            <div class="repo-card-foot">
              <span v-if="lintByUrl[repo.url]?.loaded">
                <span v-if="lintByUrl[repo.url].score !== null"
                  :class="['lint-pill', lintByUrl[repo.url].score >= 80 ? 'lint-pill--good' : (lintByUrl[repo.url].score >= 60 ? 'lint-pill--mid' : 'lint-pill--bad')]">
                  {{ $t('deliverables.repo_grid.lint_pill', { score: lintByUrl[repo.url].score }) }}
                </span>
                <span v-else class="lint-pill lint-pill--none">{{ $t('deliverables.repo_grid.lint_none') }}</span>
              </span>
              <span v-else class="lint-pill lint-pill--none">
                <Loader2 :size="9" class="rotate-anim mr-1" />{{ $t('deliverables.repo_grid.lint_loading') }}
              </span>
              <span class="card-detail-hint">{{ $t('deliverables.repo_grid.detail_hint') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.repo-section { margin-bottom: 36px; }
.section-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 16px; gap: 16px; flex-wrap: wrap;
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
.add-btn {
  display: inline-flex; align-items: center; padding: 9px 18px;
  background: var(--accent); color: white; border: none; border-radius: 9999px;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800;
  letter-spacing: 0.06em; cursor: pointer; transition: all .15s;
  text-transform: uppercase;
}
.add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(140,98,57,0.3); }

.error-bar {
  display: flex; align-items: center; padding: 11px 16px; margin-bottom: 16px;
  background: rgba(244,67,54,0.06); border: 1px solid rgba(244,67,54,0.2);
  border-radius: 10px; color: #C62828; font-size: 0.78rem; font-weight: 600;
}
.loading-state, .empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: white; border: 1px dashed var(--border-light); border-radius: 16px;
  padding: 56px; text-align: center; gap: 10px;
}
.empty-icon { color: var(--text-muted); opacity: 0.4; }
.empty-title { font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0; }
.empty-desc { font-size: 0.8rem; color: var(--text-muted); margin: 0; line-height: 1.6; max-width: 480px; }

.role-groups { display: flex; flex-direction: column; gap: 26px; }
.role-group-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
  padding-bottom: 8px; border-bottom: 1px solid var(--border-light);
}
.role-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.8); }
.role-name {
  font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 800;
  color: var(--text-main); text-transform: uppercase; letter-spacing: 0.06em;
}
.role-count {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-muted); background: var(--bg-light);
  padding: 1px 9px; border-radius: 9999px;
}

.repo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.repo-card {
  background: white; border: 1px solid var(--border-light); border-radius: 14px;
  padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;
  transition: all .18s; cursor: pointer; position: relative;
}
.repo-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 28px rgba(140,98,57,0.12);
  transform: translateY(-2px);
}
.repo-card-head { display: flex; align-items: center; gap: 8px; }
.repo-card-head-info { gap: 8px; min-width: 0; flex: 1; }
.repo-icon { flex-shrink: 0; }
.repo-label {
  font-family: 'Outfit', sans-serif; font-size: 0.92rem; font-weight: 800;
  color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.repo-actions { display: flex; gap: 3px; flex-shrink: 0; }
.icon-btn {
  width: 26px; height: 26px; border: 1px solid transparent;
  background: transparent; border-radius: 6px; cursor: pointer;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.icon-btn:hover { color: var(--accent); border-color: var(--border-light); background: var(--bg-light); }
.icon-btn--danger:hover { color: #C0392B; border-color: rgba(192,57,43,0.3); background: rgba(192,57,43,0.04); }

.repo-url {
  font-size: 0.7rem; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.repo-langs { display: flex; flex-direction: column; gap: 6px; }
.lang-bar {
  height: 5px; background: #f0f0f0; border-radius: 9999px; overflow: hidden;
  display: flex;
}
.lang-bar-seg { height: 100%; transition: opacity .15s; }
.lang-bar-seg:hover { opacity: 0.85; }
.lang-list { display: flex; flex-wrap: wrap; gap: 6px; }
.lang-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--text-main);
}
.lang-chip small { color: var(--text-muted); font-weight: 500; }
.lang-dot { width: 8px; height: 8px; border-radius: 50%; }

.repo-meta-loading, .repo-meta-error {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; color: var(--text-muted); font-weight: 600;
}
.repo-meta-error { color: #C0392B; }

.repo-stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 2px; }
.stat-item {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; font-weight: 600;
  color: var(--text-muted);
}

.repo-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 8px; border-top: 1px dashed var(--border-light);
}
.lint-pill {
  display: inline-flex; align-items: center;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.68rem; font-weight: 800;
  padding: 4px 11px; border-radius: 9999px;
}
.lint-pill--good { background: rgba(91,161,96,0.12); color: #2E7B33; }
.lint-pill--mid  { background: rgba(224,138,60,0.12); color: #B46723; }
.lint-pill--bad  { background: rgba(192,57,43,0.12); color: #A0291F; }
.lint-pill--none { background: var(--bg-light); color: var(--text-muted); }
.card-detail-hint {
  font-family: 'Outfit', sans-serif; font-size: 0.65rem; font-weight: 700;
  color: var(--accent); opacity: 0.7;
}
.repo-card:hover .card-detail-hint { opacity: 1; }

.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .repo-grid { grid-template-columns: 1fr; }
}
/* [2026-05-30] 모바일: 열기/편집/삭제 아이콘 버튼 터치 타겟 확대(26→38px).
   데스크톱은 밀집 카드 UI 유지를 위해 26px 그대로. */
@media (max-width: 600px) {
  .icon-btn { width: 38px; height: 38px; }
}
</style>
