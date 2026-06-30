/**
 * GitHub linguist 기준 언어 색상 매핑.
 *
 * 이전: deliverables.vue / RepoGrid.vue / RepoDrawer.vue 3 곳에 중복 정의.
 * 공용화 → 한 곳만 갱신하면 전체 화면이 일관.
 */
export const LANG_COLOR = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Vue: '#42B883',
  HTML: '#E34F26',
  CSS: '#264DE4',
  SCSS: '#CD6799',
  Java: '#B07219',
  Kotlin: '#A97BFF',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Ruby: '#701516',
  PHP: '#777BB4',
  Shell: '#89E051',
  Dockerfile: '#384D54',
  YAML: '#CB171E',
  JSON: '#969696',
  Markdown: '#999999',
  SQL: '#E38C00',
}

export const langColor = (name) => LANG_COLOR[name] || '#B0B0B0'
