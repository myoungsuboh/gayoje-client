<script setup>
/**
 * MCP 도구 상세 참조 모달.
 * 카드의 도구 목록 옆 "사용 방법" 버튼을 누르면 표시.
 * 두 섹션: 추적성(Lineage) 5개 + 기획 문서(Planning) 3개.
 */
import { ref } from 'vue'
import { X, Copy, Check } from 'lucide-vue-next'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const close = () => emit('update:modelValue', false)

const copiedTool = ref(null)
const copyExample = async (example, name) => {
  try {
    await navigator.clipboard.writeText(example)
    copiedTool.value = name
    setTimeout(() => { if (copiedTool.value === name) copiedTool.value = null }, 1800)
  } catch {}
}

// project_name 은 Harness 에서 "내 프로젝트 이름" 그대로 사용.
const TOOLS = [
  {
    name: 'find_spec_for_file',
    group: 'lineage',
    desc: '코드 파일 하나를 넘기면, 그 파일을 구현하는 PRD Story · Aggregate · API · Service 를 반환해요. 에이전트가 "이 파일이 어떤 기능의 구현인지" 즉시 파악할 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명 (Harness 프로젝트 이름 그대로)' },
      { name: 'file_path', type: 'string', required: true, desc: '조회할 코드 파일 경로 (예: src/components/UserCard.vue)' },
    ],
    returns: 'story_id, story_name, epic_name, aggregate, api_path, service 등 연결된 스펙 항목 목록',
    example: 'find_spec_for_file(project_name="my-app", file_path="src/api/auth.ts")',
    tip: '에이전트가 파일 편집 전에 호출해 "이 파일이 어떤 요구사항의 구현인지" 확인합니다.',
  },
  {
    name: 'trace_upstream',
    group: 'lineage',
    desc: 'Design 노드 ID 를 주면, PRD Story → Epic 으로 거슬러 올라가는 전체 체인을 반환해요. "이 화면/기능이 어떤 Epic 에 속하나" 파악할 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'node_id', type: 'string', required: true, desc: '추적할 Design 노드 ID' },
    ],
    returns: '{ design_node, story, epic } 체인 — 각 단계별 id·name·description 포함',
    example: 'trace_upstream(project_name="my-app", node_id="SCR-LOGIN-001")',
    tip: 'Design 페이지에서 노드를 클릭하면 ID 를 확인할 수 있어요.',
  },
  {
    name: 'list_design_nodes',
    group: 'lineage',
    desc: '프로젝트의 모든 Design 노드(화면·기능·Aggregate 등)와 연결된 Story 요약을 한 번에 가져와요. 에이전트가 프로젝트 전체 구조를 훑을 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
    ],
    returns: 'node_id, node_type, name, story_ids, description 목록',
    example: 'list_design_nodes(project_name="my-app")',
    tip: '프로젝트 킥오프 때 에이전트가 "어떤 화면·기능이 설계됐나" 파악하기 위해 호출합니다.',
  },
  {
    name: 'get_story',
    group: 'lineage',
    desc: 'Story ID 를 주면 상세 내용 + 파생된 Design 노드 + 연결된 화면 목록을 반환해요.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'story_id', type: 'string', required: true, desc: '조회할 Story ID' },
    ],
    returns: '{ story: { id, name, description, acceptance_criteria }, design_nodes: [...], screens: [...] }',
    example: 'get_story(project_name="my-app", story_id="STORY-AUTH-002")',
    tip: 'find_spec_for_file 결과에서 story_id 를 꺼내 이 도구에 넘기면 요구사항 전문을 볼 수 있어요.',
  },
  {
    name: 'search_spec',
    group: 'lineage',
    desc: 'spec 항목(Epic · Story · Design 노드 등) 전체를 이름/설명 기준으로 텍스트 검색해요.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'query', type: 'string', required: true, desc: '검색어 (name + description 부분 일치)' },
    ],
    returns: '매칭된 spec 항목 목록 (type, id, name, description)',
    example: 'search_spec(project_name="my-app", query="로그인")',
    tip: '"로그인 관련 스펙이 뭐가 있나" 처럼 키워드로 전체 스펙을 빠르게 탐색할 때 씁니다.',
  },
  {
    name: 'search_skills',
    group: 'planning',
    desc: '프로젝트에 등록된 AI 코딩 규칙(Skill) 목록을 키워드로 검색해요. 에이전트가 "이 기능을 만들 때 어떤 규칙을 따라야 하나" 확인할 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'keyword', type: 'string', required: false, desc: '스킬명/태그 부분 검색어 (생략 시 전체 반환)' },
    ],
    returns: 'id, name, scope, priority, tags, rule_count, applied_services 목록',
    example: 'search_skills(project_name="my-app", keyword="auth")',
    tip: '키워드를 비우면 전체 스킬을 가져와요. Rule Generator 에서 만든 규칙이 여기 노출됩니다.',
  },
  {
    name: 'get_prd',
    group: 'planning',
    desc: '프로젝트의 마스터 PRD(기획서) 전문을 가져와요. 에이전트가 코드를 작성하기 전에 요구사항 전체를 이해할 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
    ],
    returns: '{ master_prd_id, prd_content, last_updated, related_master_cps_id, absorbed_prd_ids }',
    example: 'get_prd(project_name="my-app")',
    tip: 'PRD 가 아직 없으면 null 을 반환해요. Plan 페이지에서 PRD 를 먼저 생성해야 합니다.',
  },
  {
    name: 'get_cps',
    group: 'planning',
    desc: '프로젝트의 마스터 CPS(핵심 문제 정리)를 가져와요. 프로젝트가 해결하려는 핵심 문제·사용자·솔루션을 에이전트가 이해할 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
    ],
    returns: '{ master_id, version, content, last_updated, absorbed_cps_ids }',
    example: 'get_cps(project_name="my-app")',
    tip: 'CPS 는 PRD 보다 더 압축된 "문제 맥락" 입니다. 에이전트 컨텍스트 창이 부족할 때 PRD 대신 씁니다.',
  },
  {
    name: 'get_api_spec',
    group: 'design',
    desc: '설계(SPACK)에서 만든 API 계약을 가져와요. 메서드·엔드포인트·경로/쿼리 파라미터·요청/응답 본문·에러·인증까지. 라우트 핸들러나 fetch 호출 코드를 짤 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'api_id', type: 'string', required: false, desc: '특정 API id (또는 "/orders" 같은 엔드포인트). 지정 시 full 계약 반환' },
      { name: 'keyword', type: 'string', required: false, desc: '목록 모드에서 endpoint/name/method 부분 검색' },
      { name: 'limit', type: 'number', required: false, desc: '목록 모드 최대 반환 수 (기본 200)' },
    ],
    returns: '{ apis: [{ id, name, method, endpoint, service, ... (단일 모드면 params·body·error·auth 포함) }], count, total, mode, truncated }',
    example: 'get_api_spec(project_name="my-app", api_id="/orders")',
    tip: 'id 없이 호출하면 가벼운 요약 목록, 특정 id 를 주면 그 API 의 전체 계약(본문·에러·인증)을 펼쳐요. 토큰 절약에 유리합니다.',
  },
  {
    name: 'get_screen_spec',
    group: 'design',
    desc: '설계(SPACK)의 화면 정의를 가져와요. 이 화면이 호출하는 API(method·endpoint로 풀어서)와 다음 화면 전이를 함께 줍니다. 화면 컴포넌트(Vue/React 페이지)를 짤 때 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'screen_id', type: 'string', required: false, desc: '특정 화면 id (지정 시 그 화면 상세)' },
      { name: 'keyword', type: 'string', required: false, desc: '목록 모드에서 name/path 부분 검색' },
      { name: 'limit', type: 'number', required: false, desc: '목록 모드 최대 반환 수 (기본 200)' },
    ],
    returns: '{ screens: [{ id, name, path, description, next_screens, calls_apis: [{ id, method, endpoint }] }], count, total, mode, truncated }',
    example: 'get_screen_spec(project_name="my-app", screen_id="scr_order")',
    tip: 'calls_apis 가 단순 id 가 아니라 method·endpoint 로 풀려 나와요 — "이 화면은 POST /orders 를 호출" 처럼 바로 코드로 옮길 수 있습니다.',
  },
  {
    name: 'get_lint_findings',
    group: 'design',
    desc: '직전 코드 점검(Lint) 결과에서 "설계엔 있는데 코드엔 빠진 항목"을 모아 줘요. "설계 대비 빠진 구현을 채워줘" 같은 작업에 씁니다.',
    params: [
      { name: 'project_name', type: 'string', required: true, desc: '대상 프로젝트명' },
      { name: 'only_unapplied', type: 'boolean', required: false, desc: 'true(기본)면 미구현 항목만, false 면 전체' },
      { name: 'limit', type: 'number', required: false, desc: '반환 규칙 최대 수 (기본 100)' },
    ],
    returns: 'status="no_lint" | { status, score, violations, coverage_truncated, findings: [{ case, rule, description, applied, detection_method, evidence }] }',
    example: 'get_lint_findings(project_name="my-app")',
    tip: '⚠️ 마지막으로 Lint 를 실행한 시점의 스냅샷이에요. 한 번도 안 돌렸으면 status="no_lint", 코드가 그 뒤로 바뀌었으면 최신이 아닐 수 있어요.',
  },
]

const lineageTools = TOOLS.filter(t => t.group === 'lineage')
const planningTools = TOOLS.filter(t => t.group === 'planning')
const designTools = TOOLS.filter(t => t.group === 'design')
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="720" scrollable>
    <v-card class="tools-modal">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-left">
          <span class="modal-pill">MCP TOOLS</span>
          <h2 class="modal-title">도구 사용 방법</h2>
          <p class="modal-sub">프로젝트명(project_name)은 Harness 에 등록된 이름 그대로 씁니다. 모든 도구는 read-only 입니다.</p>
        </div>
        <button class="modal-close" @click="close" aria-label="닫기">
          <X :size="18" />
        </button>
      </div>

      <v-card-text class="modal-body">
        <!-- Lineage section -->
        <div class="tool-section">
          <div class="section-badge section-badge--lineage">추적성 (Lineage) · 5종</div>
          <p class="section-desc">코드 파일 ↔ PRD Story ↔ Design 노드 간 연결 관계를 탐색합니다.</p>
          <div v-for="tool in lineageTools" :key="tool.name" class="tool-card">
            <div class="tool-card-head">
              <code class="tool-name tool-name--lineage">{{ tool.name }}</code>
              <button
                class="tool-copy-btn"
                :title="copiedTool === tool.name ? '복사됨' : '예시 복사'"
                @click="copyExample(tool.example, tool.name)"
              >
                <Check v-if="copiedTool === tool.name" :size="12" class="copied-icon" />
                <Copy v-else :size="12" />
              </button>
            </div>
            <p class="tool-desc">{{ tool.desc }}</p>
            <div class="tool-params">
              <div class="param-head">파라미터</div>
              <div v-for="p in tool.params" :key="p.name" class="param-row">
                <code class="param-name">{{ p.name }}</code>
                <span class="param-type">{{ p.type }}</span>
                <span v-if="!p.required" class="param-opt">선택</span>
                <span class="param-desc">{{ p.desc }}</span>
              </div>
            </div>
            <div class="tool-returns">
              <span class="returns-label">반환</span>
              <span class="returns-val">{{ tool.returns }}</span>
            </div>
            <div class="tool-example">
              <pre class="example-code">{{ tool.example }}</pre>
            </div>
            <div class="tool-tip">💡 {{ tool.tip }}</div>
          </div>
        </div>

        <!-- Planning section -->
        <div class="tool-section">
          <div class="section-badge section-badge--planning">기획 문서 (Planning) · 3종</div>
          <p class="section-desc">PRD · CPS · 코딩 규칙(Skill) 을 에이전트가 직접 읽습니다.</p>
          <div v-for="tool in planningTools" :key="tool.name" class="tool-card">
            <div class="tool-card-head">
              <code class="tool-name tool-name--planning">{{ tool.name }}</code>
              <button
                class="tool-copy-btn"
                :title="copiedTool === tool.name ? '복사됨' : '예시 복사'"
                @click="copyExample(tool.example, tool.name)"
              >
                <Check v-if="copiedTool === tool.name" :size="12" class="copied-icon" />
                <Copy v-else :size="12" />
              </button>
            </div>
            <p class="tool-desc">{{ tool.desc }}</p>
            <div class="tool-params">
              <div class="param-head">파라미터</div>
              <div v-for="p in tool.params" :key="p.name" class="param-row">
                <code class="param-name">{{ p.name }}</code>
                <span class="param-type">{{ p.type }}</span>
                <span v-if="!p.required" class="param-opt">선택</span>
                <span class="param-desc">{{ p.desc }}</span>
              </div>
            </div>
            <div class="tool-returns">
              <span class="returns-label">반환</span>
              <span class="returns-val">{{ tool.returns }}</span>
            </div>
            <div class="tool-example">
              <pre class="example-code">{{ tool.example }}</pre>
            </div>
            <div class="tool-tip">💡 {{ tool.tip }}</div>
          </div>
        </div>

        <!-- Design/Spec section -->
        <div class="tool-section">
          <div class="section-badge section-badge--design">설계 계약 (Design) · 3종</div>
          <p class="section-desc">API 계약 · 화면 정의 · 코드↔설계 점검 결과를 코드 작성에 바로 활용합니다.</p>
          <div v-for="tool in designTools" :key="tool.name" class="tool-card">
            <div class="tool-card-head">
              <code class="tool-name tool-name--design">{{ tool.name }}</code>
              <button
                class="tool-copy-btn"
                :title="copiedTool === tool.name ? '복사됨' : '예시 복사'"
                @click="copyExample(tool.example, tool.name)"
              >
                <Check v-if="copiedTool === tool.name" :size="12" class="copied-icon" />
                <Copy v-else :size="12" />
              </button>
            </div>
            <p class="tool-desc">{{ tool.desc }}</p>
            <div class="tool-params">
              <div class="param-head">파라미터</div>
              <div v-for="p in tool.params" :key="p.name" class="param-row">
                <code class="param-name">{{ p.name }}</code>
                <span class="param-type">{{ p.type }}</span>
                <span v-if="!p.required" class="param-opt">선택</span>
                <span class="param-desc">{{ p.desc }}</span>
              </div>
            </div>
            <div class="tool-returns">
              <span class="returns-label">반환</span>
              <span class="returns-val">{{ tool.returns }}</span>
            </div>
            <div class="tool-example">
              <pre class="example-code">{{ tool.example }}</pre>
            </div>
            <div class="tool-tip">💡 {{ tool.tip }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tools-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  max-height: 82vh;
}
/* 다크 배경에서 드래그 선택 시 글자가 검정으로 묻히지 않도록 명시 */
.tools-modal ::selection {
  background: rgba(124, 58, 237, 0.55);
  color: #fff;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}
.modal-header-left { flex: 1; min-width: 0; }
.modal-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}
.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px;
}
.modal-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  line-height: 1.5;
}
.modal-close {
  flex-shrink: 0;
  margin-left: 12px;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

.modal-body { padding: 20px 24px !important; overflow-y: auto; }

.tool-section { margin-bottom: 32px; }
.tool-section:last-child { margin-bottom: 0; }

.section-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}
.section-badge--lineage { background: rgba(124, 58, 237, 0.18); color: #a78bfa; border: 1px solid rgba(124, 58, 237, 0.3); }
.section-badge--planning { background: rgba(16, 185, 129, 0.12); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
.section-badge--design { background: rgba(56, 189, 248, 0.12); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.25); }
.section-desc { font-size: 12px; color: rgba(255, 255, 255, 0.4); margin: 0 0 14px; }

.tool-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 10px;
}
.tool-card:last-child { margin-bottom: 0; }

.tool-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tool-name {
  font-size: 13px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
}
.tool-name--lineage { background: rgba(124, 58, 237, 0.18); color: #a78bfa; }
.tool-name--planning { background: rgba(16, 185, 129, 0.12); color: #6ee7b7; }
.tool-name--design { background: rgba(56, 189, 248, 0.12); color: #7dd3fc; }
.tool-copy-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.tool-copy-btn:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
.copied-icon { color: #10b981; }

.tool-desc { font-size: 12.5px; color: rgba(255, 255, 255, 0.7); margin: 0 0 10px; line-height: 1.6; }

.tool-params {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.param-head { font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.3); letter-spacing: 0.5px; margin-bottom: 6px; }
.param-row { display: flex; align-items: baseline; gap: 6px; font-size: 12px; margin-bottom: 4px; flex-wrap: wrap; }
.param-row:last-child { margin-bottom: 0; }
.param-name { color: #93c5fd; background: rgba(147, 197, 253, 0.1); padding: 1px 5px; border-radius: 3px; font-size: 11.5px; flex-shrink: 0; }
.param-type { color: rgba(255, 255, 255, 0.3); font-size: 10.5px; flex-shrink: 0; }
.param-opt { color: #fbbf24; font-size: 10px; font-weight: 600; background: rgba(251, 191, 36, 0.1); padding: 0 4px; border-radius: 3px; flex-shrink: 0; }
.param-desc { color: rgba(255, 255, 255, 0.55); flex: 1; min-width: 0; }

.tool-returns { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.returns-label { font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.3); letter-spacing: 0.5px; flex-shrink: 0; }
.returns-val { font-size: 12px; color: rgba(255, 255, 255, 0.5); }

.tool-example {
  margin-bottom: 8px;
}
.example-code {
  font-size: 11.5px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  color: #e2e8f0;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
  line-height: 1.5;
}
.tool-tip {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
  padding: 6px 10px;
  background: rgba(251, 191, 36, 0.05);
  border-left: 2px solid rgba(251, 191, 36, 0.3);
  border-radius: 0 4px 4px 0;
}
</style>
