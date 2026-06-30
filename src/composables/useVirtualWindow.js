/**
 * 고정 row height 가상 스크롤 composable — diff 모달 같은 긴 리스트용.
 *
 * 외부 의존성 없이 ~50줄. 가변 row height 는 미지원 (각 row 가 명시 height 동일하다는 가정).
 *
 * [수학]
 *   total = rows.length
 *   visible = ceil(containerHeight / rowHeight)
 *   start = max(0, floor(scrollTop / rowHeight) - overscan)
 *   end = min(total, start + visible + 2*overscan)
 *
 * - overscan: 위/아래 여유 row 수. 빠른 스크롤에서 빈 영역 방지.
 *
 * [사용 예]
 *   const { containerRef, visibleRows, totalHeight, offsetTop } =
 *     useVirtualWindow(computedRows, { rowHeight: 22, overscan: 8 })
 *
 *   <div ref="containerRef" class="scroll-container">
 *     <div :style="{ height: totalHeight + 'px', position: 'relative' }">
 *       <div :style="{ position: 'absolute', top: offsetTop + 'px', left: 0, right: 0 }">
 *         <div v-for="row in visibleRows" :key="row.virtualIdx" :style="{ height: rowHeight + 'px' }">
 *           ...
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

export function useVirtualWindow(rowsRef, options = {}) {
  const rowHeight = options.rowHeight ?? 22
  const overscan = options.overscan ?? 5
  const defaultHeight = options.defaultContainerHeight ?? 400

  const containerRef = ref(null)
  const scrollTop = ref(0)
  const containerHeight = ref(defaultHeight)

  const onScroll = () => {
    if (containerRef.value) {
      scrollTop.value = containerRef.value.scrollTop
    }
  }
  const onResize = () => {
    if (containerRef.value) {
      containerHeight.value = containerRef.value.clientHeight || defaultHeight
    }
  }

  onMounted(() => {
    if (containerRef.value) {
      containerRef.value.addEventListener('scroll', onScroll, { passive: true })
      onResize()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize)
    }
  })

  onUnmounted(() => {
    if (containerRef.value) {
      containerRef.value.removeEventListener('scroll', onScroll)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onResize)
    }
  })

  // rows 가 바뀌면 scrollTop 리셋 (다른 diff 가 들어왔을 때 빈 영역 방지).
  watch(() => rowsRef.value?.length ?? 0, () => {
    scrollTop.value = 0
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
    }
  })

  const visibleRange = computed(() => {
    const total = rowsRef.value?.length ?? 0
    if (total === 0 || containerHeight.value <= 0) return { start: 0, end: 0 }
    const visible = Math.ceil(containerHeight.value / rowHeight)
    // scrollTop 이 비정상적으로 크면 maxStart 로 clamp — start <= end 보장.
    const maxStart = Math.max(0, total - visible)
    const naturalStart = Math.max(0, Math.floor(scrollTop.value / rowHeight) - overscan)
    const start = Math.min(naturalStart, maxStart)
    const end = Math.min(total, start + visible + 2 * overscan)
    return { start, end }
  })

  const visibleRows = computed(() => {
    const { start, end } = visibleRange.value
    const rows = rowsRef.value ?? []
    return rows.slice(start, end).map((r, i) => ({
      ...r,
      virtualIdx: start + i,
    }))
  })

  const totalHeight = computed(() => (rowsRef.value?.length ?? 0) * rowHeight)
  const offsetTop = computed(() => visibleRange.value.start * rowHeight)

  return {
    containerRef,
    visibleRows,
    totalHeight,
    offsetTop,
    visibleRange,
    rowHeight,
  }
}

/**
 * visible window 계산만 분리 — 단위 테스트용 (DOM 없이 검증 가능).
 */
export function computeVisibleRange({
  total,
  scrollTop,
  containerHeight,
  rowHeight,
  overscan = 5,
}) {
  if (total === 0 || containerHeight <= 0) return { start: 0, end: 0 }
  const visible = Math.ceil(containerHeight / rowHeight)
  const maxStart = Math.max(0, total - visible)
  const naturalStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const start = Math.min(naturalStart, maxStart)
  const end = Math.min(total, start + visible + 2 * overscan)
  return { start, end }
}
