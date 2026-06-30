<script setup>
import { FolderOpen, ArrowUpRight } from 'lucide-vue-next'
</script>

<template>
  <div class="empty-project-card">
    <div class="empty-project-icon"><FolderOpen :size="36" /></div>
    <h2 class="empty-project-title">{{ $t('home.empty_project.title') }}</h2>
    <p class="empty-project-desc" v-html="$t('home.empty_project.desc')"></p>
    <div class="empty-project-hints">
      <div class="empty-hint">
        <ArrowUpRight :size="14" class="mr-1" />
        <span v-html="$t('home.empty_project.hint1')"></span>
      </div>
      <div class="empty-hint">
        <ArrowUpRight :size="14" class="mr-1" />
        <span v-html="$t('home.empty_project.hint2')"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-project-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 56px 24px; margin: 40px auto; max-width: 560px;
  background: linear-gradient(180deg, #fff 0%, var(--bg-light, #F7F5EB) 100%);
  border: 1.5px dashed var(--accent, #8C6239); border-radius: 16px; text-align: center;
}
.empty-project-icon {
  display: inline-flex; width: 80px; height: 80px;
  align-items: center; justify-content: center;
  background: linear-gradient(135deg, #C77F4A 0%, #8C6239 100%);
  color: white; border-radius: 20px; margin-bottom: 18px;
  box-shadow: 0 6px 18px rgba(140, 98, 57, 0.18);
}
.empty-project-title { font-size: 1.25rem; font-weight: 800; color: var(--text-main, #2A2421); margin: 0 0 10px; letter-spacing: -0.01em; }
.empty-project-desc { font-size: 0.85rem; color: var(--text-muted, #6F665F); margin: 0 0 22px; line-height: 1.7; }
.empty-project-hints {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  width: 100%; max-width: 100%; box-sizing: border-box;
  padding: 14px 20px; background: white; border-radius: 12px;
  border: 1px solid var(--border-light, rgba(140, 98, 57, 0.12));
}
.empty-hint { display: flex; align-items: flex-start; width: 100%; font-size: 0.78rem; color: var(--text-main, #2A2421); line-height: 1.5; text-align: left; }
.empty-hint span { min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.empty-hint strong { color: var(--accent, #8C6239); font-weight: 800; }
.empty-hint .mr-1 { margin-right: 4px; margin-top: 2px; flex-shrink: 0; color: var(--accent, #8C6239); }
@media (max-width: 600px) {
  .empty-project-card { padding: 32px 18px; margin: 24px auto; }
  .empty-project-icon { width: 64px; height: 64px; }
  .empty-project-title { font-size: 1.05rem; }
  .empty-hint { font-size: 0.7rem; }
}
</style>
