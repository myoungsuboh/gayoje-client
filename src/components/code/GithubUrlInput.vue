<script setup>
/**
 * GitHub URL 입력 + Load 버튼 + 에러 메시지.
 * GitHub 연결 사용자에게는 "내 레포" 드롭다운을 추가로 제공.
 *
 * Props:
 *   modelValue   — 현재 URL (v-model)
 *   isLoading    — Loader 표시 + 입력/버튼 disabled
 *   errorMessage — 입력 줄 아래 빨간 에러 (빈 문자열이면 미표시)
 *
 * Emits:
 *   update:modelValue (string) — input 변경
 *   load                       — Enter 또는 Load 버튼 클릭
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Loader2, ChevronDown, Lock } from 'lucide-vue-next'
import axios from '@/utils/axios'
import { fetchGithubStatusApi } from '@/utils/auth'

const props = defineProps({
  modelValue: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'load'])

const url = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const triggerLoad = () => {
  if (props.isLoading) return
  emit('load')
}

// ─── My Repos dropdown ────────────────────────────────────
const githubLinked = ref(false)
const repos = ref([])
const reposLoading = ref(false)
const showDropdown = ref(false)
const searchQuery = ref('')
const dropdownEl = ref(null)

onMounted(async () => {
  // 리스너 등록을 await 앞에 둔다 — async onMounted 의 await 도중 컴포넌트가
  // 언마운트되면 onBeforeUnmount 가 먼저(no-op) 돌고 await 재개 후 리스너가
  // 등록돼 영구 누수되던 문제 방지.
  document.addEventListener('click', onOutsideClick)
  const result = await fetchGithubStatusApi()
  if (result.success && result.data?.linked) {
    githubLinked.value = true
    loadRepos()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onOutsideClick)
})

const loadRepos = async () => {
  reposLoading.value = true
  try {
    const res = await axios.get('/api/github/repos')
    repos.value = res.data?.repos || []
  } catch {
    repos.value = []
  } finally {
    reposLoading.value = false
  }
}

const filteredRepos = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return repos.value
  return repos.value.filter(r =>
    r.full_name.toLowerCase().includes(q) ||
    (r.description || '').toLowerCase().includes(q)
  )
})

const toggleDropdown = () => {
  if (props.isLoading) return
  showDropdown.value = !showDropdown.value
  if (showDropdown.value) searchQuery.value = ''
}

const selectRepo = (repo) => {
  emit('update:modelValue', repo.html_url)
  showDropdown.value = false
  emit('load')
}

const onOutsideClick = (e) => {
  if (dropdownEl.value && !dropdownEl.value.contains(e.target)) {
    showDropdown.value = false
  }
}
</script>

<template>
  <div>
    <!-- 입력 + Load 버튼 + (GitHub 연결 시) 내 레포 버튼 -->
    <div class="github-url-row d-flex align-center gap-3 mb-2">
      <div
        class="github-input-wrap d-flex align-center flex-grow-1"
        :class="{ 'github-input-wrap--loading': isLoading }"
      >
        <VIcon icon="mdi-github" size="18" class="mx-3 text-muted flex-shrink-0" />
        <input
          v-model="url"
          class="github-input mono-text flex-grow-1"
          placeholder="https://github.com/owner/repository"
          :disabled="isLoading"
          @keydown.enter="triggerLoad"
        />
        <button class="load-repo-btn" :disabled="isLoading" @click="triggerLoad">
          <Loader2 v-if="isLoading" :size="13" class="mr-1 spin" />
          <span>{{ isLoading ? $t('code.url_input.loading') : $t('code.url_input.load') }}</span>
        </button>
      </div>

      <!-- 내 레포 드롭다운 트리거 — GitHub 연결 시만 표시 -->
      <div v-if="githubLinked" ref="dropdownEl" class="my-repos-wrap" style="position:relative">
        <button
          class="my-repos-btn d-flex align-center gap-1"
          :disabled="isLoading"
          @click="toggleDropdown"
        >
          <VIcon icon="mdi-github" size="14" />
          <span>{{ $t('code.url_input.my_repos_btn') }}</span>
          <ChevronDown :size="13" :class="{ 'rotate-180': showDropdown }" style="transition:transform 0.2s" />
        </button>

        <!-- 드롭다운 패널 -->
        <div v-if="showDropdown" class="repos-dropdown">
          <div class="repos-search-wrap">
            <VIcon icon="mdi-magnify" size="14" class="repos-search-icon" />
            <input
              v-model="searchQuery"
              class="repos-search-input"
              :placeholder="$t('code.url_input.my_repos_search')"
              autofocus
            />
          </div>

          <div class="repos-list">
            <div v-if="reposLoading" class="repos-state-msg">
              <Loader2 :size="13" class="mr-1 spin" />
              {{ $t('code.url_input.my_repos_loading') }}
            </div>
            <div v-else-if="filteredRepos.length === 0" class="repos-state-msg repos-state-msg--empty">
              {{ $t('code.url_input.my_repos_empty') }}
            </div>
            <button
              v-for="repo in filteredRepos"
              :key="repo.full_name"
              class="repo-item"
              @click="selectRepo(repo)"
            >
              <span class="repo-name">{{ repo.full_name }}</span>
              <span v-if="repo.private" class="repo-private-badge">
                <Lock :size="10" class="mr-1" />{{ $t('code.url_input.my_repos_private') }}
              </span>
              <span v-if="repo.language" class="repo-lang">{{ repo.language }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Error 메시지 + 재시도 CTA -->
    <div v-if="errorMessage" class="repo-error-card">
      <div class="repo-error-msg">
        <VIcon icon="mdi-alert-circle-outline" size="14" class="mr-1" />
        <span>{{ errorMessage }}</span>
      </div>
      <div class="repo-error-actions">
        <button
          type="button"
          class="repo-error-btn"
          :disabled="isLoading"
          @click="triggerLoad"
        >
          <Loader2 v-if="isLoading" :size="12" class="mr-1 spin" />
          <span v-else class="mr-1">⟳</span>
          {{ $t('code.url_input.retry') }}
        </button>
        <span class="repo-error-hint">{{ $t('code.url_input.retry_hint') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mono-text { font-family: 'IBM Plex Mono', monospace !important; }
.github-url-row { gap: 12px; }

.github-input-wrap {
  border: 1.5px solid var(--border-light);
  border-radius: 12px;
  background: white;
  transition: border-color 0.15s;
  overflow: hidden;
}
.github-input-wrap:focus-within { border-color: var(--accent); }
.github-input-wrap--loading { opacity: 0.7; }

.github-input {
  border: none;
  outline: none;
  background: transparent;
  padding: 10px 12px 10px 0;
  font-size: 0.78rem;
  color: var(--text-main);
  width: 100%;
}
.github-input::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}
.github-input:disabled { cursor: not-allowed; }

.load-repo-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 0 10px 10px 0;
  font-family: 'Outfit', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.load-repo-btn:hover:not(:disabled) { opacity: 0.85; }
.load-repo-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 내 레포 버튼 ── */
.my-repos-wrap { flex-shrink: 0; }

.my-repos-btn {
  padding: 8px 14px;
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  background: white;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-main);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  white-space: nowrap;
}
.my-repos-btn:hover:not(:disabled) { border-color: var(--accent); background: var(--bg-subtle, #f9f9f9); }
.my-repos-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 드롭다운 패널 ── */
.repos-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 999;
  min-width: 280px;
  max-width: 360px;
  background: white;
  border: 1.5px solid var(--border-light);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
  overflow: hidden;
}

.repos-search-wrap {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  gap: 6px;
}
.repos-search-icon { color: var(--text-muted); flex-shrink: 0; }
.repos-search-input {
  border: none;
  outline: none;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  color: var(--text-main);
  background: transparent;
  width: 100%;
}
.repos-search-input::placeholder { color: var(--text-muted); opacity: 0.7; }

.repos-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
}

.repos-state-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: 'Pretendard Variable', sans-serif;
}
.repos-state-msg--empty { color: #9ca3af; }

.repo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.repo-item:hover { background: var(--bg-subtle, #f5f5f5); }

.repo-name {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.73rem;
  color: var(--text-main);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-private-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3f4f6;
  font-size: 0.65rem;
  font-weight: 600;
  color: #6b7280;
  font-family: 'Pretendard Variable', sans-serif;
}

.repo-lang {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: #9ca3af;
  font-family: 'Pretendard Variable', sans-serif;
}

/* ── 에러 카드 ── */
.repo-error-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 8px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
}
.repo-error-msg {
  display: flex;
  align-items: center;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: #c0392b;
  line-height: 1.5;
}
.repo-error-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.repo-error-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  background: white;
  color: #c0392b;
  border: 1.5px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.repo-error-btn:hover:not(:disabled) { background: #c0392b; color: white; border-color: #c0392b; }
.repo-error-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.repo-error-hint {
  font-size: 0.72rem;
  color: #6b7280;
  font-weight: 500;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin { animation: spin 0.9s linear infinite; }
.rotate-180 { transform: rotate(180deg); }

@media (max-width: 600px) {
  .load-repo-btn { padding: 9px 12px; font-size: 0.66rem; letter-spacing: 0.04em; }
  .my-repos-btn { padding: 8px 10px; font-size: 0.7rem; }
  .repos-dropdown { min-width: 240px; right: -40px; }
}
</style>
