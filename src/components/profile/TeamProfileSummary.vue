<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Users, ArrowRight, Loader2 } from 'lucide-vue-next'
import { listMyTeams } from '@/api/teams'

const { t } = useI18n()
const router = useRouter()

const teams = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    teams.value = await listMyTeams()
  } catch {
    // 조회 실패 시 빈 상태 유지
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="team-summary-card" :aria-label="$t('team.profileCard.title')">
    <div class="summary-left">
      <div class="summary-icon">
        <Users :size="18" />
      </div>
      <div class="summary-info">
        <p class="summary-title">{{ $t('team.profileCard.title') }}</p>
        <p class="summary-desc">
          <template v-if="loading">
            <Loader2 :size="12" class="spin" />
          </template>
          <template v-else-if="teams.length > 0">
            {{ $t('team.profileCard.teamCount', { count: teams.length }) }}
          </template>
          <template v-else>
            {{ $t('team.profileCard.description') }}
          </template>
        </p>
      </div>
    </div>
    <button class="summary-link" @click="router.push('/team')">
      {{ $t('team.profileCard.manage') }}
      <ArrowRight :size="14" />
    </button>
  </section>
</template>

<style scoped>
.team-summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 16px 20px;
}

.summary-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.summary-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(140, 98, 57, 0.1);
  color: var(--accent);
  flex-shrink: 0;
}

.summary-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.summary-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.summary-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  background: none;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
}
.summary-link:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  transform: translateY(-1px);
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
