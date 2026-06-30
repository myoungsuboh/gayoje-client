<script setup>
/**
 * GlossaryModal — "용어 사전". 헤더의 책 아이콘으로 언제든 열 수 있다.
 *
 * 인라인 가이드(GuideTooltip)가 "그 자리"에서 설명한다면, 이 사전은 모든 용어를
 * 한 화면에 모아 검색으로 되짚게 해준다. 데이터는 src/utils/glossary.js (단일 출처).
 *
 * 비개발자 대상: 영문 약어 옆에 항상 한글 풀이, 일상 비유 우선.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { X, Search, BookOpen } from 'lucide-vue-next'
import { GLOSSARY, GLOSSARY_GROUPS, searchGlossary } from '@/utils/glossary'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const query = ref('')
const searchRef = ref(null)

const matches = computed(() => searchGlossary(query.value))

// 분류별로 묶되, 검색 결과가 없는 그룹은 숨김.
// label/hint 는 getter 라 spread 로 풀리지 않으므로 명시적으로 옮긴다.
const groupedMatches = computed(() =>
  GLOSSARY_GROUPS
    .map((g) => ({
      key: g.key,
      label: g.label,
      hint: g.hint,
      terms: matches.value.filter((term) => term.group === g.key),
    }))
    .filter((g) => g.terms.length > 0),
)

const close = () => emit('update:modelValue', false)

const onKeydown = (e) => {
  if (e.key === 'Escape') close()
}

// 열릴 때마다 검색어 초기화 + 검색창에 포커스.
watch(() => props.modelValue, (open) => {
  if (open) {
    query.value = ''
    nextTick(() => searchRef.value?.focus())
  }
})
</script>

<template>
  <transition name="glossary-fade">
    <div
      v-if="modelValue"
      class="glossary-overlay"
      @click.self="close"
      @keydown="onKeydown"
    >
      <div class="glossary-modal" role="dialog" aria-labelledby="glossary-title" aria-modal="true">
        <button type="button" class="glossary-close" :aria-label="$t('common.action.close')" @click="close">
          <X :size="18" />
        </button>

        <!-- Header -->
        <div class="glossary-header">
          <span class="glossary-pill"><BookOpen :size="11" class="mr-1" />GLOSSARY</span>
          <h3 id="glossary-title" class="glossary-headline">{{ $t('glossary.modal.headline') }}</h3>
          <p class="glossary-sub">{{ $t('glossary.modal.sub') }}</p>

          <div class="glossary-search">
            <Search :size="15" class="glossary-search__icon" aria-hidden="true" />
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              class="glossary-search__input"
              :placeholder="$t('glossary.modal.search_placeholder')"
              :aria-label="$t('glossary.modal.search_aria')"
            >
          </div>
        </div>

        <!-- Body -->
        <div class="glossary-body">
          <p v-if="matches.length === 0" class="glossary-empty">
            {{ $t('glossary.modal.empty', { query }) }}
          </p>

          <section
            v-for="g in groupedMatches"
            :key="g.key"
            class="glossary-group"
          >
            <div class="glossary-group__head">
              <span class="glossary-group__label">{{ g.label }}</span>
              <span class="glossary-group__hint">{{ g.hint }}</span>
            </div>

            <dl class="glossary-list">
              <div v-for="item in g.terms" :key="item.id" class="glossary-item">
                <dt class="glossary-term">
                  {{ item.term }}
                  <span v-if="item.abbr" class="glossary-abbr">{{ item.abbr }}</span>
                </dt>
                <dd class="glossary-desc">
                  {{ item.desc }}
                  <span v-if="item.example" class="glossary-example">{{ $t('glossary.modal.example_prefix', { example: item.example }) }}</span>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <!-- Footer -->
        <div class="glossary-footer">
          <span class="glossary-count">{{ $t('glossary.modal.count', { matched: matches.length, total: GLOSSARY.length }) }}</span>
          <button type="button" class="glossary-done" @click="close">{{ $t('common.action.close') }}</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.glossary-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(20, 18, 14, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}

.glossary-modal {
  position: relative;
  width: 100%; max-width: 640px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex; flex-direction: column;
  /* 화면을 꽉 채우지 않도록 상·하 여백 확보 — 700px 캡 + 작은 화면은 비율로. */
  max-height: min(700px, calc(100vh - 96px));
}

.glossary-close {
  position: absolute; top: 14px; right: 14px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 9999px; cursor: pointer;
  color: var(--text-muted); transition: all 0.15s; z-index: 1;
}
.glossary-close:hover { background: rgba(0, 0, 0, 0.05); color: var(--text-main); }

.glossary-header {
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--border-light);
}
.glossary-pill {
  display: inline-flex; align-items: center;
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.6rem; font-weight: 700;
  background: var(--accent); color: white;
  padding: 3px 12px; border-radius: 9999px; letter-spacing: 0.08em;
}
.glossary-headline {
  margin: 10px 0 4px;
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 1.35rem; font-weight: 900; color: var(--text-main); line-height: 1.3;
}
.glossary-sub {
  margin: 0 0 14px;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;
}

.glossary-search {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px;
  background: var(--bg-light, #F7F5EB);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  transition: border-color 0.15s;
}
.glossary-search:focus-within { border-color: var(--accent); }
.glossary-search__icon { color: var(--text-muted); flex-shrink: 0; }
.glossary-search__input {
  flex: 1; border: none; background: transparent; outline: none;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.86rem; color: var(--text-main);
}
.glossary-search__input::placeholder { color: var(--text-muted); opacity: 0.7; }

.glossary-body {
  flex: 1; overflow-y: auto;
  padding: 18px 32px 8px;
}
.glossary-empty {
  text-align: center; color: var(--text-muted);
  font-size: 0.86rem; padding: 32px 0;
}

.glossary-group { margin-bottom: 22px; }
.glossary-group__head {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin-bottom: 10px;
}
.glossary-group__label {
  font-family: 'Outfit', 'Pretendard Variable', sans-serif;
  font-size: 0.82rem; font-weight: 800; color: var(--accent);
}
.glossary-group__hint {
  font-size: 0.72rem; color: var(--text-muted);
}

.glossary-list { margin: 0; }
.glossary-item {
  padding: 11px 0;
  border-top: 1px solid var(--border-light);
}
.glossary-item:first-child { border-top: none; }
.glossary-term {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.92rem; font-weight: 800; color: var(--text-main);
  margin-bottom: 3px;
}
.glossary-abbr {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.66rem; font-weight: 700;
  color: var(--accent);
  background: rgba(140, 98, 57, 0.08);
  padding: 2px 8px; border-radius: 6px; letter-spacing: 0.03em;
}
.glossary-desc {
  margin: 0;
  font-family: 'Pretendard Variable', sans-serif;
  font-size: 0.83rem; color: var(--text-muted); line-height: 1.6;
  word-break: keep-all; overflow-wrap: break-word;
}
.glossary-example {
  display: block; margin-top: 5px;
  font-size: 0.78rem; color: var(--primary-moss, #2E4036);
  background: rgba(46, 64, 54, 0.06);
  border-left: 2px solid rgba(46, 64, 54, 0.3);
  padding: 5px 10px; border-radius: 0 6px 6px 0;
}

.glossary-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 32px 18px;
  border-top: 1px solid var(--border-light);
  background: #fafbfc;
}
.glossary-count {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
  font-size: 0.72rem; color: var(--text-muted);
}
.glossary-done {
  padding: 8px 20px; border-radius: 9999px; border: none;
  background: var(--text-main); color: white;
  font-family: 'Outfit', sans-serif; font-size: 0.72rem; font-weight: 800;
  letter-spacing: 0.04em; cursor: pointer; transition: opacity 0.15s;
}
.glossary-done:hover { opacity: 0.85; }

.glossary-fade-enter-active, .glossary-fade-leave-active { transition: opacity 0.2s ease; }
.glossary-fade-enter-from, .glossary-fade-leave-to { opacity: 0; }

@media (max-width: 600px) {
  .glossary-header { padding: 22px 20px 14px; }
  .glossary-headline { font-size: 1.15rem; }
  .glossary-body { padding: 14px 20px 4px; }
  .glossary-footer { padding: 12px 20px 16px; }
}
</style>
