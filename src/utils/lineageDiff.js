/**
 * Lineage 분석 결과 diff.
 *
 * 입력 두 lineage 결과 (analyzeLineage 결과 형식):
 *   { aggregates: [...], apis: [...], services: [...], stories: [...], missingImpl: [...], stats: {...} }
 *
 * 출력:
 *   {
 *     added:   { aggregates: [...], apis: [...], ... }  // B에만 있는 산출물
 *     removed: { ... }                                   // A에만 있는 산출물
 *     changed: { ... }                                   // implementations가 달라진 산출물
 *     unchanged: { ... }                                 // 동일
 *     summary: { addedCount, removedCount, changedCount, unchangedCount,
 *                implsAdded, implsRemoved, totalA, totalB }
 *   }
 *
 * 매칭 키: item.id (없으면 item.name)
 * implementations 비교: 정규화된 filePath set
 */
import { normalizeFilePath } from '@/utils/lineageQuality'

const ITEM_KEYS = ['aggregates', 'apis', 'services', 'stories']

const itemKey = (item) => String(item.id || item.name || '')

const implFilePaths = (item) =>
  new Set((item.implementations || [])
    .map(i => normalizeFilePath(i?.filePath))
    .filter(Boolean))

const setEquals = (a, b) => {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

const setDiff = (a, b) => {
  const out = []
  for (const v of a) if (!b.has(v)) out.push(v)
  return out
}

const indexByKey = (items) => {
  const m = new Map()
  for (const it of items || []) m.set(itemKey(it), it)
  return m
}

export const diffLineage = (a, b) => {
  const result = {
    added: {}, removed: {}, changed: {}, unchanged: {},
    summary: {
      addedCount: 0, removedCount: 0, changedCount: 0, unchangedCount: 0,
      implsAdded: 0, implsRemoved: 0,
      totalA: 0, totalB: 0,
    },
  }

  for (const key of ITEM_KEYS) {
    const aItems = (a && a[key]) || []
    const bItems = (b && b[key]) || []
    result.summary.totalA += aItems.length
    result.summary.totalB += bItems.length

    const aIdx = indexByKey(aItems)
    const bIdx = indexByKey(bItems)

    result.added[key] = []
    result.removed[key] = []
    result.changed[key] = []
    result.unchanged[key] = []

    // B에 있고 A에 없음 → added
    for (const [k, bItem] of bIdx.entries()) {
      if (!aIdx.has(k)) {
        result.added[key].push(bItem)
        result.summary.addedCount++
        result.summary.implsAdded += (bItem.implementations || []).length
      }
    }
    // A에 있고 B에 없음 → removed
    for (const [k, aItem] of aIdx.entries()) {
      if (!bIdx.has(k)) {
        result.removed[key].push(aItem)
        result.summary.removedCount++
        result.summary.implsRemoved += (aItem.implementations || []).length
      }
    }
    // 둘 다 있음 → impls 비교
    for (const [k, aItem] of aIdx.entries()) {
      const bItem = bIdx.get(k)
      if (!bItem) continue
      const aFiles = implFilePaths(aItem)
      const bFiles = implFilePaths(bItem)
      if (setEquals(aFiles, bFiles)) {
        result.unchanged[key].push(aItem)
        result.summary.unchangedCount++
      } else {
        const addedFiles = setDiff(bFiles, aFiles)
        const removedFiles = setDiff(aFiles, bFiles)
        result.changed[key].push({
          id: aItem.id || aItem.name,
          name: aItem.name,
          before: { count: aFiles.size },
          after: { count: bFiles.size },
          addedFiles,
          removedFiles,
        })
        result.summary.changedCount++
        result.summary.implsAdded += addedFiles.length
        result.summary.implsRemoved += removedFiles.length
      }
    }
  }

  return result
}
