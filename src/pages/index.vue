<script setup>
/**
 * / — 전국 가요제 목록(공개 브라우즈).
 *
 * gayoje-server GET /api/v1/festivals 연동. 카드형, 모바일 우선.
 * 3상태: 로딩(스켈레톤) · 빈 · 에러(재시도). 카드 클릭 → /events/:id.
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MapPin, CalendarDays, Building2, Music2, AlertCircle, RefreshCw } from 'lucide-vue-next'
import { fetchFestivals } from '@/api/festivals'

const router = useRouter()

const items = ref([])
const total = ref(0)
const loading = ref(true)
const error = ref(false)

const load = async () => {
  loading.value = true
  error.value = false
  try {
    const data = await fetchFestivals({ limit: 100 })
    items.value = data.items || []
    total.value = data.total || items.value.length
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ISO(YYYY-MM-DD) → 'YYYY.MM.DD'. 기간이면 'start ~ end'(같은 날은 단일).
const dot = (iso) => (iso ? iso.replaceAll('-', '.') : '')
const fmtPeriod = (s, e) => {
  if (!s && !e) return '일정 미정'
  if (s && e && s !== e) return `${dot(s)} ~ ${dot(e)}`
  return dot(s || e)
}

// 지역: '서울특별시 동작구 ...' → 앞 2토큰만.
const shortRegion = (r) => {
  if (!r) return ''
  return r.split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
}

const goDetail = (id) => router.push(`/events/${id}`)
</script>

<template>
  <v-container class="pa-4 mx-auto" style="max-width: 720px">
    <!-- 헤더 -->
    <div class="d-flex align-center mb-1">
      <Music2 :size="22" class="mr-2" />
      <h1 class="text-h6 font-weight-bold mb-0">전국 가요제</h1>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      공공데이터 기반으로 정리한 전국 가요제
      <span v-if="!loading && !error">· 총 {{ total }}건</span>
    </p>

    <!-- 로딩 -->
    <template v-if="loading">
      <v-skeleton-loader
        v-for="n in 5" :key="n" type="article"
        class="mb-3 rounded-lg"
      />
    </template>

    <!-- 에러 -->
    <v-sheet v-else-if="error" class="pa-8 text-center rounded-lg" color="surface">
      <AlertCircle :size="36" class="mb-3 text-medium-emphasis" />
      <p class="text-body-1 mb-4">목록을 불러오지 못했습니다.</p>
      <v-btn variant="tonal" @click="load">
        <RefreshCw :size="16" class="mr-1" /> 다시 시도
      </v-btn>
    </v-sheet>

    <!-- 빈 -->
    <v-sheet v-else-if="!items.length" class="pa-8 text-center rounded-lg" color="surface">
      <Music2 :size="36" class="mb-3 text-medium-emphasis" />
      <p class="text-body-1 mb-1">등록된 가요제가 없습니다.</p>
      <p class="text-body-2 text-medium-emphasis">수집되는 대로 여기에 표시됩니다.</p>
    </v-sheet>

    <!-- 목록 -->
    <template v-else>
      <v-card
        v-for="f in items" :key="f.id"
        class="mb-3 rounded-lg" variant="outlined"
        role="button" tabindex="0"
        @click="goDetail(f.id)"
        @keyup.enter="goDetail(f.id)"
      >
        <v-card-item class="pb-1">
          <v-card-title class="text-body-1 font-weight-bold" style="white-space: normal; line-height: 1.35">
            {{ f.title }}
          </v-card-title>
        </v-card-item>
        <v-card-text class="pt-0">
          <div class="d-flex align-center text-body-2 mb-1">
            <CalendarDays :size="15" class="mr-2 flex-shrink-0 text-medium-emphasis" />
            <span>{{ fmtPeriod(f.startDate, f.endDate) }}</span>
          </div>
          <div v-if="f.venue" class="d-flex align-center text-body-2 mb-1">
            <Building2 :size="15" class="mr-2 flex-shrink-0 text-medium-emphasis" />
            <span class="text-truncate">{{ f.venue }}</span>
          </div>
          <div v-if="shortRegion(f.regionName)" class="d-flex align-center text-body-2">
            <MapPin :size="15" class="mr-2 flex-shrink-0 text-medium-emphasis" />
            <span>{{ shortRegion(f.regionName) }}</span>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>
