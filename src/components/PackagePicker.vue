<template>
  <div class="picker" ref="root">
    <div class="picker__field" :class="{ 'is-focused': open }" @click="focusInput">
      <span v-for="pkg in modelValue" :key="pkg" class="chip sp-mono">
        {{ pkg }}
        <button
          type="button"
          class="chip__x"
          :aria-label="`Remove ${pkg}`"
          @click.stop="remove(pkg)"
        >×</button>
      </span>

      <input
        ref="input"
        v-model="query"
        class="picker__input sp-mono"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        aria-controls="picker-listbox"
        :aria-activedescendant="active >= 0 ? `picker-opt-${active}` : undefined"
        :placeholder="modelValue.length ? '' : placeholder"
        :disabled="atLimit"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @focus="open = true"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose()"
        @keydown.esc="open = false"
        @keydown.backspace="onBackspace"
      />
    </div>

    <ul
      v-if="open && (results.length || loading || showRaw)"
      id="picker-listbox"
      class="picker__list"
      role="listbox"
    >
      <li v-if="loading && !results.length" class="picker__status">Searching…</li>

      <li
        v-for="(pkg, i) in results"
        :id="`picker-opt-${i}`"
        :key="pkg.name"
        role="option"
        :aria-selected="i === active"
        class="picker__opt"
        :class="{ 'is-active': i === active }"
        @mousedown.prevent="choose(i)"
        @mouseenter="active = i"
      >
        <div class="picker__opt-top">
          <span class="picker__opt-name sp-mono">{{ pkg.name }}</span>
          <span v-if="pkg.downloads" class="picker__opt-dl sp-tabular">
            {{ formatCompact(pkg.downloads) }}
          </span>
        </div>
        <p v-if="pkg.description" class="picker__opt-desc">{{ pkg.description }}</p>
      </li>

      <!-- Search can fail or lag; never block someone typing a name they know. -->
      <li
        v-if="showRaw"
        role="option"
        :aria-selected="false"
        class="picker__opt picker__opt--raw"
        @mousedown.prevent="add(query.trim())"
      >
        Add <span class="sp-mono">{{ query.trim() }}</span> anyway
      </li>
    </ul>

    <p class="picker__hint" :class="{ 'is-error': error }">
      {{ error || hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useSearch } from '../lib/useSearch'
import { MAX_PACKAGES, NAME_PATTERNS } from '../lib/spec'
import { formatCompact } from '../lib/format'
import type { Ecosystem } from '../types'

const props = defineProps<{
  modelValue: string[]
  ecosystem: Ecosystem
  error?: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const query = ref('')
const open = ref(false)
const active = ref(-1)

const ecosystemRef = computed(() => props.ecosystem)
const { results, loading, reset } = useSearch(query, ecosystemRef)

const atLimit = computed(() => props.modelValue.length >= MAX_PACKAGES)

const placeholder = computed(() =>
  props.ecosystem === 'npm' ? 'Search npm…' : 'Search NuGet…'
)

const hint = computed(() => {
  if (atLimit.value) return `Maximum of ${MAX_PACKAGES} packages.`
  if (props.modelValue.length < 2) return 'Pick at least two packages to compare.'
  return `${props.modelValue.length} selected. You can add up to ${MAX_PACKAGES}.`
})

/** Offer the literal input when it's a valid name that search didn't return. */
const showRaw = computed(() => {
  const q = query.value.trim()
  if (q.length < 2 || loading.value) return false
  if (!NAME_PATTERNS[props.ecosystem].test(q)) return false
  if (props.modelValue.includes(q)) return false
  return !results.value.some(r => r.name.toLowerCase() === q.toLowerCase())
})

// Results change under the cursor as the user types; keep the highlight valid
// and always land on the first row so Enter is immediately meaningful.
watch(results, () => { active.value = results.value.length ? 0 : -1 }, { flush: 'sync' })

function focusInput() {
  input.value?.focus()
}

function move(delta: number) {
  open.value = true
  const total = results.value.length + (showRaw.value ? 1 : 0)
  if (!total) return
  active.value = (active.value + delta + total) % total
}

/**
 * Enter must always do something useful. If nothing is highlighted yet. The
 * results may have landed a tick ago. Fall back to the first result, and to
 * the raw text when there are no results at all.
 */
function choose(index?: number) {
  const typed = query.value.trim()

  if (!results.value.length) {
    if (typed) add(typed)
    return
  }

  const i = index ?? (active.value >= 0 ? active.value : 0)
  const pick = results.value[i]
  add(pick ? pick.name : typed)
}

function add(name: string) {
  if (!name || atLimit.value || props.modelValue.includes(name)) return
  emit('update:modelValue', [...props.modelValue, name])
  query.value = ''
  active.value = -1
  reset()
}

function remove(name: string) {
  emit('update:modelValue', props.modelValue.filter(p => p !== name))
}

/** Backspace on an empty input removes the last chip, as in every tag input. */
function onBackspace(e: KeyboardEvent) {
  if (query.value === '' && props.modelValue.length) {
    e.preventDefault()
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  reset()
})
</script>

<style scoped>
.picker {
  position: relative;
}

.picker__field {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 42px;
  padding: 6px 8px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-bg);
  cursor: text;
  transition: border-color 0.15s;
}

.picker__field.is-focused {
  border-color: var(--sp-accent);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-radius: 7px;
  background: var(--sp-surface-3);
  color: var(--sp-text);
  font-size: 12px;
}

.chip__x {
  border: none;
  background: none;
  color: var(--sp-text-muted);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.chip__x:hover { color: var(--sp-critical-text); }

.picker__input {
  flex: 1 1 120px;
  min-width: 100px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--sp-text);
  font-size: 14px;
  padding: 4px;
}

.picker__input::placeholder { color: var(--sp-text-muted); }
.picker__input:disabled { cursor: not-allowed; }

.picker__list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 5px;
  list-style: none;
  max-height: 300px;
  overflow-y: auto;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border-strong);
  background: var(--sp-surface-2);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.picker__status {
  padding: 10px 12px;
  color: var(--sp-text-muted);
  font-size: 13px;
}

.picker__opt {
  padding: 8px 12px;
  border-radius: 7px;
  cursor: pointer;
}

.picker__opt.is-active {
  background: var(--sp-surface-3);
}

.picker__opt-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.picker__opt-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sp-text);
}

.picker__opt-dl {
  font-size: 11px;
  color: var(--sp-text-muted);
}

.picker__opt-desc {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--sp-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.picker__opt--raw {
  color: var(--sp-text-dim);
  font-size: 13px;
  border-top: 1px solid var(--sp-border);
  margin-top: 4px;
  padding-top: 10px;
  border-radius: 0 0 7px 7px;
}

.picker__hint {
  margin: 9px 2px 0;
  font-size: 12px;
  color: var(--sp-text-muted);
}

.picker__hint.is-error { color: var(--sp-critical-text); }
</style>
