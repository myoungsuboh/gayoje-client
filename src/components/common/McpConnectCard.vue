<script setup>
/**
 * MCP Connect Card — Cursor / Claude Code 가 우리 MCP 서버에 연결하는 안내.
 *
 * [보안 설계 — 2026-05-18 개정]
 * - 평문 토큰은 이 카드에서 절대 노출 안 됨. 발급은 모달에서만, 1회 표시.
 * - 카드의 스니펫은 형식 미리보기 용도 (`YOUR_MCP_TOKEN_HERE` placeholder).
 * - 실제 사용 시엔 발급 모달의 "완성형 스니펫" 을 복사하는 게 더 편함.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Sparkles, Copy, ExternalLink, Check, Plus, BookOpen } from 'lucide-vue-next'
import McpTokenIssueDialog from './McpTokenIssueDialog.vue'
import McpTokenList from './McpTokenList.vue'
import McpToolsModal from './McpToolsModal.vue'
import CardCollapseToggle from './CardCollapseToggle.vue'

const { t } = useI18n()

const MCP_BASE =
  import.meta.env.VITE_API_BACKEND_URL || 'https://api.harness-system.com'
const MCP_ENDPOINT = `${MCP_BASE}/mcp/sse`

const issueOpen = ref(false)
const toolsOpen = ref(false)
const listRef = ref(null)
const copiedField = ref(null)
const collapsed = ref(false)

const TOKEN_PLACEHOLDER = 'YOUR_MCP_TOKEN_HERE'  // 꺾쇠 없음 — paste 시 혼동 방지

// IDE 별 설정 형식을 분리한다.
// - Cursor: 표준이 url+headers (type 없음). type 키 허용 여부가 문서상 불확실해 미포함.
// - Claude Code: 원격 서버에 type:'http'(Streamable HTTP) 필수. 누락 시 deprecated SSE 로
//   오인되어 연결 실패 가능. 서버는 streamable HTTP (create_streamable_http_app) 라 'http' 정확.
// 두 경우 모두 엔드포인트/경로 동일 — 기존 발급 토큰 그대로 유효.
const cursorConfig = computed(() => JSON.stringify({
  mcpServers: {
    harness: {
      url: MCP_ENDPOINT,
      headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
    },
  },
}, null, 2))
const claudeConfig = computed(() => JSON.stringify({
  mcpServers: {
    harness: {
      type: 'http',
      url: MCP_ENDPOINT,
      headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
    },
  },
}, null, 2))

const copy = async (value, field) => {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 1800)
  } catch {
    // clipboard 권한 없거나 비-https — 무시
  }
}

const onIssued = () => {
  listRef.value?.reload?.()
}
</script>

<template>
  <section class="mcp-card" :aria-label="$t('common.mcp.card_aria')">
    <div class="mcp-card-header" :class="{ 'is-collapsed': collapsed }" @click="collapsed = !collapsed">
      <Sparkles :size="18" class="mr-2" />
      <span class="mcp-card-title">{{ $t('common.mcp.card_title') }}</span>
      <span class="mcp-badge">NEW</span>
      <v-spacer />
      <CardCollapseToggle v-model:collapsed="collapsed" />
    </div>

    <div v-show="!collapsed" class="mcp-card-body">
    <p class="mcp-intro text-muted text-body-2" v-html="$t('common.mcp.intro_html')" />

    <!-- 쉬운 3단계 안내 (비개발자용) -->
    <div class="mcp-how">
      <p class="mcp-how-title">{{ $t('common.mcp.how_title') }}</p>
      <ol class="mcp-how-steps">
        <li v-html="$t('common.mcp.how_step1_html')" />
        <li v-html="$t('common.mcp.how_step2_html')" />
        <li v-html="$t('common.mcp.how_step3_html')" />
      </ol>
      <details class="mcp-glossary">
        <summary>{{ $t('common.mcp.glossary_summary') }}</summary>
        <p v-html="$t('common.mcp.glossary_html')" />
      </details>
    </div>

    <!-- Endpoint -->
    <div class="mcp-field">
      <span class="mcp-field-label">{{ $t('common.mcp.endpoint_label') }}</span>
      <div class="mcp-field-row">
        <code class="mcp-value mono-text">{{ MCP_ENDPOINT }}</code>
        <button
          class="mcp-icon-btn"
          :title="copiedField === 'endpoint' ? $t('common.mcp.copied') : $t('common.mcp.copy')"
          @click="copy(MCP_ENDPOINT, 'endpoint')"
        >
          <Check v-if="copiedField === 'endpoint'" :size="14" class="text-success" />
          <Copy v-else :size="14" />
        </button>
      </div>
    </div>

    <!-- Token issuance CTA — 평문 노출 없음 -->
    <div class="mcp-field">
      <span class="mcp-field-label">
        {{ $t('common.mcp.access_token_label') }}
        <span class="mcp-field-hint text-caption text-muted" v-html="$t('common.mcp.access_token_hint_html')" />
      </span>
      <v-btn color="primary" size="small" @click="issueOpen = true">
        <Plus :size="14" class="mr-1" /> {{ $t('common.mcp.issue_new_token') }}
      </v-btn>
    </div>

    <McpTokenList ref="listRef" />

    <!-- Config preview snippet — placeholder 형식 안내 -->
    <div class="mcp-field mt-4">
      <span class="mcp-field-label">
        <span v-html="$t('common.mcp.config_format_label_html')" />
        <span class="mcp-field-hint text-caption text-muted" v-html="$t('common.mcp.config_format_hint_html')" />
      </span>
      <!-- Cursor: type 없는 표준형 -->
      <div class="mcp-client-block">
        <span class="mcp-client-label mono-text">{{ $t('common.mcp.client_cursor') }}</span>
        <div class="mcp-snippet-wrap">
          <pre class="mcp-snippet mono-text">{{ cursorConfig }}</pre>
          <button
            class="mcp-icon-btn mcp-snippet-copy"
            :title="copiedField === 'preview-cursor' ? $t('common.mcp.copied') : $t('common.mcp.copy_with_placeholder')"
            @click="copy(cursorConfig, 'preview-cursor')"
          >
            <Check v-if="copiedField === 'preview-cursor'" :size="14" class="text-success" />
            <Copy v-else :size="14" />
          </button>
        </div>
      </div>
      <!-- Claude Code: type:http 필수 -->
      <div class="mcp-client-block">
        <span class="mcp-client-label mono-text">{{ $t('common.mcp.client_claude') }}</span>
        <div class="mcp-snippet-wrap">
          <pre class="mcp-snippet mono-text">{{ claudeConfig }}</pre>
          <button
            class="mcp-icon-btn mcp-snippet-copy"
            :title="copiedField === 'preview-claude' ? $t('common.mcp.copied') : $t('common.mcp.copy_with_placeholder')"
            @click="copy(claudeConfig, 'preview-claude')"
          >
            <Check v-if="copiedField === 'preview-claude'" :size="14" class="text-success" />
            <Copy v-else :size="14" />
          </button>
        </div>
      </div>
    </div>

    <!-- Available tools 요약 (사용자가 뭘 연결하는지 명확히) -->
    <div class="mcp-tools">
      <div class="mcp-tools-header">
        <span class="mcp-field-label mb-0">{{ $t('common.mcp.tools_label') }}</span>
        <button class="mcp-guide-btn" @click="toolsOpen = true">
          <BookOpen :size="12" class="mr-1" />
          {{ $t('common.mcp.tools_guide_btn') }}
        </button>
      </div>
      <ul class="mcp-tools-list">
        <li><code>find_spec_for_file</code> — {{ $t('common.mcp.tool_find_spec') }}</li>
        <li><code>trace_upstream</code> — {{ $t('common.mcp.tool_trace_upstream') }}</li>
        <li><code>list_design_nodes</code> — {{ $t('common.mcp.tool_list_design_nodes') }}</li>
        <li><code>get_story</code> — {{ $t('common.mcp.tool_get_story') }}</li>
        <li><code>search_spec</code> — {{ $t('common.mcp.tool_search_spec') }}</li>
        <li><code>search_skills</code> — {{ $t('common.mcp.tool_search_skills') }}</li>
        <li><code>get_prd</code> — {{ $t('common.mcp.tool_get_prd') }}</li>
        <li><code>get_cps</code> — {{ $t('common.mcp.tool_get_cps') }}</li>
        <li><code>get_api_spec</code> — {{ $t('common.mcp.tool_get_api_spec') }}</li>
        <li><code>get_screen_spec</code> — {{ $t('common.mcp.tool_get_screen_spec') }}</li>
        <li><code>get_lint_findings</code> — {{ $t('common.mcp.tool_get_lint_findings') }}</li>
      </ul>
    </div>

    <p class="mcp-footnote text-caption text-muted">
      <ExternalLink :size="11" class="mr-1" />
      {{ $t('common.mcp.footnote') }}
    </p>
    </div>

    <McpTokenIssueDialog v-model="issueOpen" @issued="onIssued" />
    <McpToolsModal v-model="toolsOpen" />
  </section>
</template>

<style scoped>
.mcp-card {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}
.mcp-card-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-light);
  cursor: pointer;
}
.mcp-card-header.is-collapsed { border-bottom: none; }
.mcp-card-title { font-size: 0.9rem; font-weight: 700; color: var(--text-main); }
.mcp-card-body { padding: 20px 24px; }
.mcp-badge {
  margin-left: 10px; padding: 2px 8px; border-radius: 4px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
}
.mcp-intro { margin-bottom: 16px; line-height: 1.55; }
.mcp-field { margin-bottom: 14px; }
.mcp-field-label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 6px;
}
.mcp-field-hint { font-weight: 400; margin-left: 4px; }
.mcp-field-row { display: flex; align-items: center; gap: 6px; }
.mcp-value {
  flex-grow: 1; padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 13px; word-break: break-all;
}
.mcp-icon-btn {
  flex-shrink: 0; padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; color: var(--text-muted, #999);
  cursor: pointer; transition: all 0.15s;
}
.mcp-icon-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: var(--text-main, #fff); }
.mcp-client-block { margin-bottom: 12px; }
.mcp-client-block:last-child { margin-bottom: 0; }
.mcp-client-label {
  display: block; font-size: 11px; font-weight: 600;
  color: var(--text-muted, #999); margin-bottom: 4px;
}
.mcp-snippet-wrap { position: relative; }
.mcp-snippet {
  margin: 0; padding: 12px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; font-size: 12px; line-height: 1.5;
  overflow-x: auto; white-space: pre;
}
.mcp-snippet-copy { position: absolute; top: 8px; right: 8px; }
.mcp-tools { margin-top: 18px; margin-bottom: 12px; }
.mcp-tools-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.mcp-guide-btn {
  display: inline-flex; align-items: center;
  padding: 4px 10px; border-radius: 20px;
  border: 1px solid rgba(124, 58, 237, 0.4);
  background: rgba(124, 58, 237, 0.08);
  color: #a78bfa; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.mcp-guide-btn:hover { background: rgba(124, 58, 237, 0.18); border-color: rgba(124, 58, 237, 0.6); }
.mcp-tools-list {
  margin: 6px 0 0 0; padding-left: 18px;
  font-size: 13px; line-height: 1.7;
}
.mcp-tools-list code {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
  padding: 1px 6px; border-radius: 3px; font-size: 12px;
}
.mcp-footnote { display: flex; align-items: center; margin-top: 16px; margin-bottom: 0; }
.text-success { color: #10b981; }

/* 비개발자용 3단계 안내 박스 */
.mcp-how {
  margin-bottom: 16px; padding: 14px 16px;
  background: var(--bg-light, #f7f6f3);
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
}
.mcp-how-title { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--text-main); }
.mcp-how-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; }
.mcp-how-steps li { font-size: 13px; line-height: 1.55; color: var(--text-main); }
.mcp-how-note { color: var(--text-muted, #999); font-size: 11.5px; }
.mcp-glossary { margin-top: 12px; }
.mcp-glossary summary { cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text-muted, #999); }
.mcp-glossary summary:hover { color: var(--text-main); }
.mcp-glossary > p { margin: 8px 0 0; font-size: 12px; line-height: 1.7; color: var(--text-muted, #999); }
.mcp-glossary strong, .mcp-how strong { color: var(--text-main); font-weight: 700; }
</style>
