<script setup>
import { useRouter } from 'vue-router'
import { ArrowLeft, Users, UserPlus, FolderOpen } from 'lucide-vue-next'
import TeamManagementCard from '@/components/profile/TeamManagementCard.vue'

const router = useRouter()

const HOW_ICONS = [Users, UserPlus, FolderOpen]
</script>

<template>
  <div class="page-root team-page">
    <button class="back-btn" @click="router.push('/home')">
      <ArrowLeft :size="16" />
      <span>{{ $t('common.action.back') }}</span>
    </button>

    <h2 class="page-title">{{ $t('team.page.title') }}</h2>
    <p class="page-subtitle">{{ $t('team.page.subtitle') }}</p>

    <!-- 사용 방법 3단계 가이드 -->
    <div class="how-banner">
      <div v-for="(icon, i) in HOW_ICONS" :key="i" class="how-step">
        <div class="how-step-icon">
          <component :is="icon" :size="20" />
        </div>
        <div class="how-step-body">
          <p class="how-step-title">{{ $t(`team.page.how.step${i + 1}.title`) }}</p>
          <p class="how-step-desc">{{ $t(`team.page.how.step${i + 1}.body`) }}</p>
        </div>
        <div v-if="i < 2" class="how-step-arrow">→</div>
      </div>
    </div>

    <TeamManagementCard />
  </div>
</template>

<style scoped>
.team-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 28px var(--page-pad-x) 56px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  margin: 0 -6px 20px;
  border-radius: 6px;
  transition: color 0.2s, transform 0.2s, background 0.2s;
}
.back-btn:hover { color: var(--accent); background: rgba(140, 98, 57, 0.06); }
.back-btn:hover :deep(svg) { transform: translateX(-2px); }
.back-btn :deep(svg) { transition: transform 0.2s; }

.page-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0 0 6px;
}
.page-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0 0 28px;
}

/* 3단계 가이드 배너 */
.how-banner {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 20px 24px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.how-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 160px;
}

.how-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent);
  flex-shrink: 0;
}

.how-step-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.how-step-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.how-step-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.45;
}

.how-step-arrow {
  font-size: 1.1rem;
  color: var(--border-light);
  align-self: center;
  flex-shrink: 0;
  padding: 0 4px;
}

@media (max-width: 600px) {
  .team-page { padding: 16px var(--page-pad-x) 40px; }
  .how-banner { flex-direction: column; }
  .how-step-arrow { display: none; }
}
</style>
