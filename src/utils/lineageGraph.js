/**
 * Lineage 그래프 생성 유틸.
 *
 * 1) buildMermaid(lineageData)
 *    — GitHub 호환 mermaid flowchart 문자열
 *    — PR 코멘트에 그대로 붙이면 자동 렌더링
 *
 * 2) buildGraphLayout(lineageData)
 *    — 우리 SVG가 직접 그릴 수 있는 노드/엣지 구조
 *    — 카테고리 4열 (Story / Aggregate / API / Service) + 산출물 노드 + 파일 노드
 *
 * mermaid ID는 [a-zA-Z_][a-zA-Z0-9_]* 만 허용 — 산출물 id의 특수문자는 escape.
 */

const CATEGORIES = [
  { key: 'stories',    label: 'Story',     short: 'STR' },
  { key: 'aggregates', label: 'Aggregate', short: 'AGG' },
  { key: 'apis',       label: 'API',       short: 'API' },
  { key: 'services',   label: 'Service',   short: 'SVC' },
]

const CATEGORY_COLOR = {
  stories:    '#9460B8',
  aggregates: '#5085C8',
  apis:       '#5BA160',
  services:   '#C77F4A',
  files:      '#8C6239',
  unverified: '#C0392B',
}

const sanitizeId = (s) => {
  const str = String(s ?? '').replace(/[^a-zA-Z0-9_]/g, '_')
  // mermaid ID는 숫자로 시작 불가
  if (/^\d/.test(str)) return `n_${str}`
  return str || 'n_empty'
}

const escapeMermaidLabel = (s) => String(s ?? '')
  .replace(/"/g, '#quot;')
  .replace(/\n/g, ' ')
  .replace(/[<>]/g, ' ')
  .slice(0, 80)

const basename = (path) => {
  const s = String(path || '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
}

/**
 * mermaid flowchart LR 문자열 생성.
 *
 * @param {object} lineageData
 * @param {object} [opts]
 * @param {number} [opts.maxFilesPerItem] - 산출물당 표시할 파일 수 제한 (default 3)
 * @param {Set<string>} [opts.includeCategories] - 표시할 카테고리 (default 4개 모두)
 * @returns {string}
 */
export const buildMermaid = (lineageData, opts = {}) => {
  const { maxFilesPerItem = 3, includeCategories } = opts
  const cats = CATEGORIES.filter(c => !includeCategories || includeCategories.has(c.key))
  if (!lineageData) return 'flowchart LR\n  empty["분석 결과 없음"]'

  const lines = ['flowchart LR']
  const classDefs = new Set()
  const fileNodeIds = new Map() // filePath → mermaid id (재사용)

  for (const cat of cats) {
    const items = lineageData[cat.key] || []
    if (!items.length) continue
    lines.push(`  subgraph ${sanitizeId(cat.short)} ["${cat.label}"]`)
    for (const item of items) {
      const itemId = sanitizeId(`${cat.short}_${item.id || item.name}`)
      const itemLabel = escapeMermaidLabel(item.name || item.id || '?')
      lines.push(`    ${itemId}["${itemLabel}"]`)
      lines.push(`    class ${itemId} cat_${cat.key}`)
    }
    lines.push('  end')
    classDefs.add(cat.key)
  }

  // 산출물 → 파일 엣지
  for (const cat of cats) {
    const items = lineageData[cat.key] || []
    for (const item of items) {
      const itemId = sanitizeId(`${cat.short}_${item.id || item.name}`)
      const impls = (item.implementations || []).slice(0, maxFilesPerItem)
      for (const impl of impls) {
        if (!impl?.filePath) continue
        let fileId = fileNodeIds.get(impl.filePath)
        if (!fileId) {
          fileId = sanitizeId(`file_${impl.filePath}`)
          fileNodeIds.set(impl.filePath, fileId)
          const fileLabel = escapeMermaidLabel(basename(impl.filePath))
          lines.push(`  ${fileId}[/"${fileLabel}"/]`)
          const fileClass = impl.confidence === 'unverified' ? 'cat_unverified' : 'cat_files'
          lines.push(`  class ${fileId} ${fileClass}`)
          classDefs.add(impl.confidence === 'unverified' ? 'unverified' : 'files')
        }
        // 화살표 스타일: unverified는 점선
        const arrow = impl.confidence === 'unverified' ? '-.->' : '-->'
        lines.push(`  ${itemId} ${arrow} ${fileId}`)
      }
      // 추가 파일은 hint
      const extra = (item.implementations || []).length - maxFilesPerItem
      if (extra > 0) {
        const moreId = sanitizeId(`${cat.short}_${item.id || item.name}_more`)
        lines.push(`  ${moreId}(["+${extra}건 더"])`)
        lines.push(`  ${itemId} -.-> ${moreId}`)
      }
    }
  }

  // classDef
  for (const cls of classDefs) {
    lines.push(`  classDef cat_${cls} fill:${CATEGORY_COLOR[cls]},stroke:#2A2421,color:#fff,stroke-width:1px;`)
  }

  return lines.join('\n')
}

/**
 * 직접 SVG 렌더용 노드/엣지 레이아웃.
 *
 * 반환: { nodes: [{ id, type, label, x, y, color, category }], edges: [{ from, to, dashed }] }
 *
 * 레이아웃 정책:
 *   - 4개 카테고리 컬럼 (Story, Aggregate, API, Service)
 *   - 5번째 컬럼: 구현 파일들
 *   - 각 컬럼 내 노드는 세로로 균등 배치
 */
export const buildGraphLayout = (lineageData, opts = {}) => {
  const {
    columnWidth = 200,
    rowHeight = 50,
    paddingX = 24,
    paddingY = 30,
    maxFilesPerItem = 5,
  } = opts

  const nodes = []
  const edges = []
  if (!lineageData) return { nodes, edges, width: 0, height: 0 }

  // 카테고리 컬럼별 산출물 모으기
  const columns = CATEGORIES.map(cat => ({
    cat,
    items: (lineageData[cat.key] || []).map(item => ({
      ...item,
      _id: `${cat.short}_${item.id || item.name}`,
    })),
  }))

  // 파일 노드 모으기 (dedup)
  const fileMap = new Map() // filePath → { id, refCount, hasUnverified }
  for (const col of columns) {
    for (const item of col.items) {
      const impls = (item.implementations || []).slice(0, maxFilesPerItem)
      for (const impl of impls) {
        if (!impl?.filePath) continue
        const existing = fileMap.get(impl.filePath)
        if (existing) {
          existing.refCount++
          if (impl.confidence === 'unverified') existing.hasUnverified = true
        } else {
          fileMap.set(impl.filePath, {
            id: `file_${fileMap.size}`,
            filePath: impl.filePath,
            refCount: 1,
            hasUnverified: impl.confidence === 'unverified',
          })
        }
      }
    }
  }

  // 컬럼별 y 좌표 계산
  const totalCols = columns.length + 1 // +1 = files
  const maxItemsInCol = Math.max(...columns.map(c => c.items.length), fileMap.size, 1)

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx]
    const x = paddingX + colIdx * columnWidth
    const itemsCount = col.items.length || 1
    const colHeight = itemsCount * rowHeight
    const yStart = paddingY + (maxItemsInCol * rowHeight - colHeight) / 2
    for (let i = 0; i < col.items.length; i++) {
      const item = col.items[i]
      nodes.push({
        id: item._id,
        type: 'item',
        category: col.cat.key,
        label: item.name || item.id || '?',
        x,
        y: yStart + i * rowHeight,
        color: CATEGORY_COLOR[col.cat.key],
      })
    }
  }

  // 파일 컬럼
  const fileColX = paddingX + columns.length * columnWidth
  const fileEntries = Array.from(fileMap.values())
  const fileColHeight = fileEntries.length * rowHeight
  const fileYStart = paddingY + (maxItemsInCol * rowHeight - fileColHeight) / 2
  for (let i = 0; i < fileEntries.length; i++) {
    const f = fileEntries[i]
    nodes.push({
      id: f.id,
      type: 'file',
      category: f.hasUnverified ? 'unverified' : 'files',
      label: basename(f.filePath),
      title: f.filePath,
      x: fileColX,
      y: fileYStart + i * rowHeight,
      color: f.hasUnverified ? CATEGORY_COLOR.unverified : CATEGORY_COLOR.files,
    })
  }

  // 엣지 생성
  for (const col of columns) {
    for (const item of col.items) {
      const impls = (item.implementations || []).slice(0, maxFilesPerItem)
      for (const impl of impls) {
        if (!impl?.filePath) continue
        const fileEntry = fileMap.get(impl.filePath)
        if (!fileEntry) continue
        edges.push({
          from: item._id,
          to: fileEntry.id,
          dashed: impl.confidence === 'unverified',
        })
      }
    }
  }

  return {
    nodes,
    edges,
    width: paddingX * 2 + totalCols * columnWidth,
    height: paddingY * 2 + maxItemsInCol * rowHeight,
    categories: CATEGORIES.map(c => ({ ...c, x: paddingX + CATEGORIES.indexOf(c) * columnWidth })),
    fileColumnX: fileColX,
  }
}

export const LINEAGE_CATEGORY_COLOR = CATEGORY_COLOR
