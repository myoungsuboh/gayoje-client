<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen, Plus, Check, X, Trash2, ExternalLink, Loader2 } from 'lucide-vue-next'
import { useLibraryStore } from '@/store/library'
import { useSnackbar } from '@/composables/useSnackbar'
import CardCollapseToggle from '@/components/common/CardCollapseToggle.vue'

const { t, locale } = useI18n()
const { showSuccess, showError } = useSnackbar() ?? {}
const libraryStore = useLibraryStore()

const newRepoUrl = ref('')
const newRepoLabel = ref('')
const showAddForm = ref(false)
const addError = ref('')
const removeConfirmId = ref(null)
const collapsed = ref(false)

const notify = (msg, type = 'success') => {
  if (type === 'success' && showSuccess) showSuccess(msg)
  else if (type === 'error' && showError) showError(msg)
}

const isValidGithubUrl = (url) => {
  try {
    const u = new URL(url.trim().replace(/\/+$/, '').replace(/\.git$/i, ''))
    return u.hostname === 'github.com' && u.pathname.split('/').filter(Boolean).length >= 2
  } catch { return false }
}

const handleAddRepo = async () => {
  addError.value = ''
  const url = newRepoUrl.value.trim()
  if (!url) { addError.value = t('profile.library.url_required'); return }
  if (!isValidGithubUrl(url)) { addError.value = t('profile.library.url_invalid'); return }
  if (libraryStore.hasUrl(url)) { addError.value = t('profile.library.url_duplicate'); return }

  const result = await libraryStore.addRepo({ url, label: newRepoLabel.value.trim() })
  if (result.success) {
    newRepoUrl.value = ''
    newRepoLabel.value = ''
    showAddForm.value = false
    notify(t('profile.library.added_toast'))
  } else {
    addError.value = result.error || t('profile.library.add_failed')
  }
}

const handleRemoveRepo = async (url) => {
  const result = await libraryStore.removeRepo(url)
  removeConfirmId.value = null
  if (result.success) {
    notify(t('profile.library.removed_toast'))
  } else {
    notify(result.error || t('profile.library.remove_failed'), 'error')
  }
}

const repoDisplayName = (repo) => {
  if (repo.label) return repo.label
  try {
    const parts = new URL(repo.url).pathname.split('/').filter(Boolean)
    return parts.slice(0, 2).join(' / ')
  } catch { return repo.url }
}

const formatDate = (ms) => {
  if (!ms) return ''
  try {
    const localeCode = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale.value] || 'en-US'
    return new Date(Number(ms)).toLocaleDateString(localeCode, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch { return '' }
}

onMounted(() => {
  libraryStore.fetchLibrary()
})
</script>

<template>
  <section class="profile-card" :aria-label="$t('profile.library.aria')">
    <div class="profile-card-header" :class="{ 'is-collapsed': collapsed }" @click="collapsed = !collapsed">
      <BookOpen :size="18" class="mr-2" />
      <span class="profile-card-title">{{ $t('profile.library.title') }}</span>
      <span class="repo-count-badge ml-2">{{ libraryStore.repos.length }}</span>
      <v-spacer />
      <button class="add-repo-btn" @click.stop="showAddForm = !showAddForm">
        <Plus :size="14" class="mr-1" />
        {{ $t('profile.library.add') }}
      </button>
      <CardCollapseToggle v-model:collapsed="collapsed" class="ml-1" />
    </div>

    <div v-show="!collapsed">
    <!-- Add form -->
    <div v-if="showAddForm" class="add-form">
      <div class="add-form-fields">
        <input
          v-model="newRepoUrl"
          class="field-input"
          :placeholder="$t('profile.library.url_placeholder')"
          @keydown.enter="handleAddRepo"
          @keydown.esc="showAddForm = false; addError = ''"
          autofocus
        />
        <input
          v-model="newRepoLabel"
          class="field-input field-input--label"
          :placeholder="$t('profile.library.label_placeholder')"
          @keydown.enter="handleAddRepo"
        />
      </div>
      <p v-if="addError" class="add-error">{{ addError }}</p>
      <div class="add-form-actions">
        <button class="icon-btn icon-btn--confirm" :disabled="libraryStore.isAdding" @click="handleAddRepo">
          <Loader2 v-if="libraryStore.isAdding" :size="14" class="spin" />
          <Check v-else :size="14" />
          <span class="ml-1">{{ $t('profile.library.add') }}</span>
        </button>
        <button class="icon-btn icon-btn--cancel" @click="showAddForm = false; addError = ''">
          <X :size="14" />
          <span class="ml-1">{{ $t('common.action.cancel') }}</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="libraryStore.isFetching" class="library-empty">
      <Loader2 :size="20" class="spin text-muted" />
      <span class="text-muted ml-2">{{ $t('common.label.loading') }}</span>
    </div>

    <!-- Empty -->
    <div v-else-if="libraryStore.isEmpty && !showAddForm" class="library-empty">
      <BookOpen :size="28" class="text-muted mb-2" />
      <p class="text-muted text-body-2">{{ $t('profile.library.empty_title') }}</p>
      <p class="text-muted text-caption">{{ $t('profile.library.empty_hint') }}</p>
    </div>

    <!-- Repo List -->
    <ul v-else class="repo-list">
      <li
        v-for="repo in libraryStore.repos"
        :key="repo.url"
        class="repo-item"
      >
        <div class="repo-item-info">
          <span class="repo-name">
            {{ repoDisplayName(repo) }}
            <span v-if="!repo.is_mine" class="repo-badge repo-badge--shared" :title="$t('profile.library.shared_badge_title')">{{ $t('profile.library.shared_badge') }}</span>
          </span>
          <span class="repo-url text-muted">{{ repo.url }}</span>
          <span v-if="repo.added_at" class="repo-date text-muted">{{ formatDate(repo.added_at) }}</span>
        </div>
        <div class="repo-item-actions">
          <a
            :href="repo.url"
            target="_blank"
            rel="noopener noreferrer"
            class="icon-btn icon-btn--link"
            :aria-label="$t('profile.library.open_github_aria')"
          >
            <ExternalLink :size="14" />
          </a>
          <template v-if="removeConfirmId === repo.url">
            <button class="icon-btn icon-btn--confirm" @click="handleRemoveRepo(repo.url)" :aria-label="$t('profile.library.remove_confirm_aria')">
              <Check :size="14" />
            </button>
            <button class="icon-btn icon-btn--cancel" @click="removeConfirmId = null" :aria-label="$t('common.action.cancel')">
              <X :size="14" />
            </button>
          </template>
          <button v-else class="icon-btn icon-btn--delete" @click="removeConfirmId = repo.url" :aria-label="$t('profile.library.remove_aria')">
            <Trash2 :size="14" />
          </button>
        </div>
      </li>
    </ul>
    </div>
  </section>
</template>

<style scoped>
.profile-card {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}
.profile-card-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-light);
  cursor: pointer;
}
.profile-card-header.is-collapsed { border-bottom: none; }
.profile-card-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-main);
}
.repo-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 9999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}
.add-repo-btn {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1.5px solid var(--accent);
  background: none;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.add-repo-btn:hover { background: rgba(140, 98, 57, 0.08); }

.add-form {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-page);
}
.add-form-fields { display: flex; gap: 8px; margin-bottom: 8px; }
.add-form-fields .field-input { min-width: 0; }
.add-error { font-size: 0.78rem; color: #c62828; margin-bottom: 8px; }
.add-form-actions { display: flex; gap: 6px; }

.field-input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--text-main);
  background: var(--bg-page);
  outline: none;
  transition: border-color 0.2s;
}
.field-input:focus { border-color: var(--accent); }
.field-input--label { max-width: 160px; }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  gap: 2px;
}
.icon-btn--confirm {
  background: rgba(140, 98, 57, 0.08);
  color: var(--accent);
  border-color: rgba(140, 98, 57, 0.2);
}
.icon-btn--confirm:hover { background: rgba(140, 98, 57, 0.15); }
.icon-btn--cancel {
  background: none;
  color: var(--text-muted);
  border-color: var(--border-light);
}
.icon-btn--cancel:hover { background: var(--bg-light); color: var(--text-main); }
.icon-btn--delete {
  background: none;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
.icon-btn--delete:hover { background: #fdecea; color: #c62828; border-color: #ef9a9a; }
.icon-btn--link {
  background: none;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
  text-decoration: none;
}
.icon-btn--link:hover { background: var(--bg-light); color: var(--accent); }

.library-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 4px;
}

.repo-list { list-style: none; margin: 0; padding: 0; }
.repo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light);
  gap: 12px;
}
.repo-item:last-child { border-bottom: none; }
.repo-item-info { display: flex; flex-direction: column; min-width: 0; }
.repo-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.repo-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 700;
  vertical-align: middle;
}
.repo-badge--shared {
  background: rgba(46, 64, 54, 0.12);
  color: var(--primary-moss);
}
.repo-url { font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.repo-date { font-size: 0.72rem; }
.repo-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .add-form-fields { flex-direction: column; }
  .field-input--label { max-width: 100%; }
}
</style>
