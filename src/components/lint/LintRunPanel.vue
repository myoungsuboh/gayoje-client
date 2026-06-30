<script setup>
import { Github, Play, Loader2, RotateCcw, AlertTriangle, BookOpen, X } from 'lucide-vue-next'
import GuideTooltip from '@/components/common/GuideTooltip.vue'

defineProps({
  githubUrl: { type: String, default: '' },
  isLinting: { type: Boolean, default: false },
  hasResult: { type: Boolean, default: false },
  lintError: { type: String, default: '' },
  libraryRepos: { type: Array, default: () => [] },
  libraryIsEmpty: { type: Boolean, default: true },
})
defineEmits(['run', 'goto-code', 'apply-preset', 'remove-library'])
</script>

<template>
  <div class="run-panel">
    <div class="run-panel-header">
      <span class="section-pill">{{ $t('lint.run_panel.pill') }}</span>
      <h4 class="section-title serif-text">{{ $t('lint.run_panel.title') }}</h4>
    </div>
    <div class="run-panel-body">
      <div class="url-input-wrap" :class="{ 'url-input-wrap--empty': !githubUrl }">
        <Github :size="16" class="url-icon" />
        <input
          :value="githubUrl" type="text"
          :placeholder="githubUrl ? '' : $t('lint.run_panel.url_placeholder')"
          class="url-input url-input--readonly" readonly tabindex="-1"
          :title="githubUrl ? $t('lint.run_panel.url_title_set', { url: githubUrl }) : $t('lint.run_panel.url_title_unset')"
        />
        <button v-if="!githubUrl" type="button" class="goto-code-btn" @click="$emit('goto-code')" :title="$t('lint.run_panel.goto_code_title')">{{ $t('lint.run_panel.goto_code') }}</button>
      </div>
      <span class="d-inline-flex align-center run-btn-group">
        <button class="run-btn" :disabled="isLinting" @click="$emit('run', false)">
          <Loader2 v-if="isLinting" :size="14" class="rotate-anim mr-2" />
          <Play v-else :size="14" class="mr-2" />
          <span>{{ isLinting ? $t('lint.run_panel.analyzing') : $t('lint.run_panel.run_lint') }}</span>
        </button>
        <GuideTooltip target="run-lint" placement="bottom" />
      </span>
      <button v-if="hasResult" class="rerun-btn" :disabled="isLinting" :title="$t('lint.run_panel.rerun_title')" @click="$emit('run', true)">
        <RotateCcw :size="13" class="mr-1" /><span>{{ $t('lint.run_panel.rerun') }}</span>
      </button>
    </div>
    <div v-if="!libraryIsEmpty" class="library-block">
      <span class="preset-label mono-text library-block__label">
        <BookOpen :size="12" />{{ $t('lint.run_panel.my_library') }}
        <span class="library-block__count">{{ libraryRepos.length }}</span>
      </span>
      <div class="lib-chip-scroll custom-scroll">
        <span
          v-for="repo in libraryRepos" :key="repo.url"
          class="lib-chip" :class="{ 'lib-chip--disabled': isLinting }" :title="repo.url"
        >
          <button
            type="button" class="lib-chip__main" :disabled="isLinting"
            @click="$emit('apply-preset', repo.url)"
          >{{ repo.label || repo.url.split('/').slice(-2).join(' / ') }}</button>
          <button
            type="button" class="lib-chip__del" :disabled="isLinting"
            :title="$t('common.library.remove_title')" :aria-label="$t('common.library.remove_title')"
            @click.stop="$emit('remove-library', repo)"
          ><X :size="11" /></button>
        </span>
      </div>
    </div>
    <p v-if="lintError" class="error-msg"><AlertTriangle :size="14" class="mr-1" />{{ lintError }}</p>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif !important; }
.section-pill { display: inline-block; white-space: nowrap; flex-shrink: 0; font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.6rem; font-weight: 700; background: var(--accent); color: white; padding: 3px 12px; border-radius: 9999px; letter-spacing: 0.08em; }
.section-title { font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin: 0; }
.run-panel { background: white; border: 1px solid var(--border-light); border-radius: 16px; padding: 22px 24px; margin-bottom: 24px; }
.run-panel-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.run-panel-body { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.url-input-wrap { flex: 1; min-width: 320px; display: flex; align-items: center; gap: 10px; background: #fafbfc; border: 1px solid var(--border-light); border-radius: 10px; padding: 10px 14px; transition: border-color .15s; }
.url-input-wrap:focus-within { border-color: var(--accent); background: white; }
.url-input-wrap--empty { background: rgba(140, 98, 57, 0.04); border-style: dashed; }
.url-icon { color: var(--text-muted); flex-shrink: 0; }
.url-input { flex: 1; border: none; outline: none; background: transparent; font-family: 'IBM Plex Mono', monospace; font-size: 0.82rem; color: var(--text-main); font-weight: 600; min-width: 0; text-overflow: ellipsis; }
.url-input--readonly { cursor: default; user-select: text; }
.url-input--readonly:focus { outline: none; }
.url-input::placeholder { color: var(--text-muted); font-weight: 500; }
.goto-code-btn { flex-shrink: 0; padding: 6px 14px; border-radius: 9999px; border: 1px solid var(--accent); background: var(--accent); color: white; font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
.goto-code-btn:hover { opacity: 0.85; }
.run-btn-group { display: inline-flex; align-items: center; gap: 2px; }
.run-btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; border-radius: 9999px; border: none; background: var(--text-main); color: white; font-family: 'Outfit', sans-serif; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: all .15s; flex-shrink: 0; }
.run-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rerun-btn { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 9999px; border: 1px solid var(--border-light); background: white; color: var(--text-main); font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: all .15s; flex-shrink: 0; }
.rerun-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
.rerun-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.preset-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.preset-label { font-size: 0.6rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.08em; }
.preset-chip { font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.68rem; font-weight: 700; background: rgba(140,98,57,0.06); color: var(--accent); border: 1px solid rgba(140,98,57,0.15); padding: 4px 12px; border-radius: 9999px; cursor: pointer; transition: all .15s; }
.preset-chip:hover:not(:disabled) { background: var(--accent); color: white; border-color: var(--accent); }
.preset-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.preset-chip--library { background: rgba(46, 64, 54, 0.06); color: var(--primary-moss); border-color: rgba(46, 64, 54, 0.2); }
.preset-chip--library:hover:not(:disabled) { background: var(--primary-moss); color: white; border-color: var(--primary-moss); }
/* ── MY LIBRARY 블록 — 라벨 아래로 chip 을 내리고, 많아지면 스크롤 ──────
   [2026-06-24] chip 이 라벨 옆 inline 이라 저장소가 늘면 패널이 무한정 길어지던 문제.
   라벨을 헤더로 올리고 chip 은 그 아래 max-height 캡 + 세로 스크롤 영역에 담는다. */
.library-block { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--border-light); }
.library-block__label { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; font-size: 0.6rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.08em; }
.library-block__count { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 5px; border-radius: 9999px; background: rgba(46, 64, 54, 0.1); color: var(--primary-moss); font-family: 'Outfit', sans-serif; font-size: 0.58rem; font-weight: 800; letter-spacing: 0; }
.lib-chip-scroll { display: flex; flex-wrap: wrap; gap: 8px; max-height: 116px; overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
/* ── 라이브러리 chip — 본문(적용) + × (삭제) 한 알약 ───────────── */
.lib-chip { display: inline-flex; align-items: stretch; border-radius: 9999px; border: 1px solid rgba(46, 64, 54, 0.2); background: rgba(46, 64, 54, 0.06); overflow: hidden; transition: all .15s; }
.lib-chip:hover:not(.lib-chip--disabled) { border-color: var(--primary-moss); background: rgba(46, 64, 54, 0.12); }
.lib-chip--disabled { opacity: 0.5; }
.lib-chip__main { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 8px 4px 12px; border: none; background: transparent; color: var(--primary-moss); font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif; font-size: 0.68rem; font-weight: 700; cursor: pointer; }
.lib-chip__main:disabled { cursor: not-allowed; }
.lib-chip__del { display: inline-flex; align-items: center; justify-content: center; padding: 0 8px 0 4px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; transition: color .15s; }
.lib-chip__del:hover:not(:disabled) { color: #C62828; }
.lib-chip__del:disabled { cursor: not-allowed; }
.error-msg { display: inline-flex; align-items: center; margin-top: 12px; font-family: 'Pretendard Variable', sans-serif; font-size: 0.78rem; color: #F44336; font-weight: 600; }
.rotate-anim { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) {
  .url-input-wrap { min-width: 100%; }
  /* [2026-05-30] 버튼이 <span> 래퍼에 감싸여 width:100% 가 안 먹던 문제 —
     래퍼(run-btn-group)를 100% 로 펴고 버튼이 그 안을 채우게. ⓘ 는 끝에 붙음. */
  .run-btn-group { width: 100%; }
  .run-btn { flex: 1; }
  .rerun-btn { width: 100%; justify-content: center; }
  .run-panel { padding: 18px 16px; }
  /* 태블릿 — 세로폭이 web 보다 빠듯하니 약 3줄 높이로 캡. */
  .lib-chip-scroll { max-height: 104px; }
}
@media (max-width: 600px) {
  /* 배지+제목 가로배치가 좁아 'VIBE LINTER' 가 짜부라지므로 세로로 쌓는다. */
  .run-panel-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .section-title { font-size: 1rem; line-height: 1.3; }
  .run-panel-body { gap: 8px; }
  .preset-row { gap: 6px; }
  .preset-chip { padding: 3px 10px; font-size: 0.64rem; }
  /* 모바일 — chip 한 줄에 1~2개라 금방 쌓이므로 약 2.5줄 높이로 더 낮춰 화면을 덜 먹게. */
  .library-block { margin-top: 12px; padding-top: 12px; }
  .lib-chip-scroll { max-height: 92px; gap: 7px; }
  .lib-chip__main { font-size: 0.7rem; padding: 5px 8px 5px 12px; }
}
</style>
