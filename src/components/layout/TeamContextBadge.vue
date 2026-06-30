<script setup>
/**
 * [Phase F] 헤더 팀 컨텍스트 배지.
 *
 * 팀 프로젝트를 열어 activeTeamId 가 set 되면, 현재 어떤 팀의 워크스페이스에서
 * 작업 중인지 명확히 보여준다. 개인 프로젝트(activeTeamId 없음) 일 땐 렌더 안 함.
 *
 * "나가기" 클릭 → 팀 컨텍스트 + 선택 프로젝트 해제 후 /home 으로 이동해 사용자가
 * 개인/다른 프로젝트를 다시 고르게 한다. (팀 컨텍스트가 남은 채 개인 프로젝트를
 * 건드려 권한 오류가 나는 상황 방지.)
 */
import { computed } from 'vue'
import { Users, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useHarnessStore } from '@/store/harness'

const router = useRouter()
const store = useHarnessStore()

const active = computed(() => !!store.activeTeamId)
const teamName = computed(() => store.activeTeamName || '팀')

const exitTeam = () => {
  // 프로젝트명도 비워 워크플로우 탭이 비활성화되고, 사용자가 명시적으로 재선택.
  store.setProjectContext('', '', '')
  if (router.currentRoute.value.path !== '/home') {
    router.push('/home')
  }
}
</script>

<template>
  <div v-if="active" class="team-context-badge" :title="`${teamName} 팀 워크스페이스에서 작업 중`">
    <Users :size="13" class="team-context-badge__icon" aria-hidden="true" />
    <span class="team-context-badge__label mono">TEAM</span>
    <span class="team-context-badge__name">{{ teamName }}</span>
    <button
      class="team-context-badge__exit"
      type="button"
      aria-label="팀 워크스페이스 나가기"
      title="팀 워크스페이스 나가기"
      @click="exitTeam"
    >
      <X :size="13" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.team-context-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 9px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.08);
  color: rgb(79, 70, 229);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  max-width: 220px;
}
.team-context-badge__icon { flex: 0 0 auto; }
.team-context-badge__label {
  font-size: 10px;
  letter-spacing: 0.06em;
  opacity: 0.7;
}
.team-context-badge__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.team-context-badge__exit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}
.team-context-badge__exit:hover {
  opacity: 1;
  background: rgba(99, 102, 241, 0.18);
}
</style>
