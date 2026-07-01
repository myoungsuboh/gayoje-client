<script setup>
/**
 * /events/:id — 가요제 상세(공개 브라우즈).
 *
 * gayoje-server GET /api/v1/festivals/:id 연동. 제목·일정·장소·주최·지역 표시.
 * 값 없는 필드는 렌더하지 않음(우아하게 숨김). 모바일 우선.
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, MapPin, CalendarDays, Building2, Landmark,
  ExternalLink, AlertCircle, RefreshCw,
} from 'lucide-vue-next'
import { fetchFestival } from '@/api/festivals'

const route = useRoute()
const router = useRouter()

const item = ref(null)
const loading = ref(true)
const error = ref(false)

const load = async () => {
  loading.value = true
  error.value = false
  try {
    item.value = await fetchFestival(route.params.id)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

const dot = (iso) => (iso ? iso.replaceAll('-', '.') : '')
const period = computed(() => {
  const s = item.value?.startDate
  const e = item.value?.endDate
  if (!s && !e) return ''
  if (s && e && s !== e) return `${dot(s)} ~ ${dot(e)}`
  return dot(s || e)
})

// 표시할 필드(값 있는 것만).
const rows = computed(() => {
  const it = item.value
  if (!it) return []
  return [
    { icon: CalendarDays, label: '일정', value: period.value },
    { icon: Building2, label: '장소', value: it.venue },
    { icon: Landmark, label: '주최', value: it.hostOrg },
    { icon: MapPin, label: '지역', value: it.regionName },
  ].filter((r) => r.value)
})

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <v-container class="pa-4 mx-auto" style="max-width: 720px">
    <v-btn variant="text" class="px-1 mb-2" @click="goBack">
      <ArrowLeft :size="18" class="mr-1" /> 목록
    </v-btn>

    <!-- 로딩 -->
    <template v-if="loading">
      <v-skeleton-loader type="heading, paragraph, list-item-two-line@3" class="rounded-lg" />
    </template>

    <!-- 에러 -->
    <v-sheet v-else-if="error || !item" class="pa-8 text-center rounded-lg" color="surface">
      <AlertCircle :size="36" class="mb-3 text-medium-emphasis" />
      <p class="text-body-1 mb-4">가요제 정보를 불러오지 못했습니다.</p>
      <v-btn variant="tonal" @click="load">
        <RefreshCw :size="16" class="mr-1" /> 다시 시도
      </v-btn>
    </v-sheet>

    <!-- 상세 -->
    <template v-else>
      <h1 class="text-h5 font-weight-bold mb-4" style="line-height: 1.35">
        {{ item.title }}
      </h1>

      <v-card variant="outlined" class="rounded-lg mb-4">
        <v-list density="comfortable" class="py-1">
          <v-list-item v-for="(r, i) in rows" :key="i" class="px-4">
            <template #prepend>
              <component :is="r.icon" :size="18" class="mr-3 text-medium-emphasis" />
            </template>
            <v-list-item-subtitle class="text-caption">{{ r.label }}</v-list-item-subtitle>
            <v-list-item-title class="text-body-1" style="white-space: normal">
              {{ r.value }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>

      <v-btn
        v-if="item.sourceUrl"
        :href="item.sourceUrl" target="_blank" rel="noopener noreferrer"
        variant="tonal" block class="mb-3"
      >
        <ExternalLink :size="16" class="mr-1" /> 원문/출처 보기
      </v-btn>

      <p class="text-caption text-medium-emphasis text-center">
        공공데이터 기반 · 출처: {{ item.sourceSystem }}
      </p>
    </template>
  </v-container>
</template>
