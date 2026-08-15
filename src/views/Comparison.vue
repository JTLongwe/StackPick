<template>
  <div class="page">
    <!-- Nothing resolved: a bad curated id, or malformed ad-hoc parameters. -->
    <div v-if="!spec" class="empty">
      <h1 class="empty__title">{{ specError || 'Comparison not found' }}</h1>
      <p class="empty__body">
        <template v-if="!specError">
          No comparison is defined for "{{ route.params.id }}".
        </template>
        <template v-else>Check the packages in the address bar and try again.</template>
      </p>
      <RouterLink to="/" class="btn btn--primary">Back to all comparisons</RouterLink>
    </div>

    <template v-else>
      <header class="head">
        <div class="head__main">
          <span v-if="!spec.curated" class="head__eyebrow">Custom comparison</span>
          <h1 class="head__title">{{ spec.title }}</h1>
          <p v-if="spec.question" class="head__question">{{ spec.question }}</p>
          <div class="head__pkgs">
            <span v-for="pkg in spec.packages" :key="pkg" class="pill sp-mono">{{ pkg }}</span>
            <span class="pill pill--eco">{{ spec.ecosystem }}</span>
          </div>
        </div>

        <div class="head__actions">
          <button class="btn btn--ghost" type="button" @click="toggleEdit">
            {{ editing ? 'Cancel' : 'Edit packages' }}
          </button>
          <button class="btn btn--ghost" type="button" @click="share">
            {{ copied ? 'Link copied' : 'Copy link' }}
          </button>
        </div>
      </header>

      <!-- Editing turns any comparison into a live query. Changes are applied on
           submit rather than per keystroke: each refetch costs GitHub API budget
           that is shared across every visitor. -->
      <form v-if="editing" class="editor" @submit.prevent="applyEdit">
        <PackagePicker v-model="draft" :ecosystem="spec.ecosystem" />
        <div class="editor__actions">
          <button class="btn btn--primary" type="submit" :disabled="draft.length < 2 || unchanged">
            Update comparison
          </button>
          <span v-if="spec.curated && !unchanged" class="editor__warn">
            This becomes a custom comparison, so the notes above won't carry over.
          </span>
        </div>
      </form>

      <p v-if="spec.note" class="note">{{ spec.note }}</p>

      <div v-if="loading" class="loading">
        <span class="loading__spinner" aria-hidden="true"></span>
        <span>Reading live registry data…</span>
      </div>

      <div v-else-if="error" class="alert alert--error">
        <div>{{ error }}</div>
        <button class="btn btn--ghost" type="button" @click="load">Retry</button>
      </div>

      <template v-else-if="results && verdict">
        <VerdictCard :verdict="verdict" class="block" />

        <div v-if="failed.length" class="alert alert--warn block">
          Could not load registry data for
          <strong class="sp-mono">{{ failed.map(r => r.name).join(', ') }}</strong>.
          The verdict below is based on the rest.
        </div>

        <RequirementsBar
          v-model="requirements"
          :ecosystem="spec.ecosystem"
          class="block"
        />

        <TrendChart
          v-if="charted.length"
          :results="charted"
          :ecosystem="spec.ecosystem"
          class="block"
        />

        <MetricTable
          :results="results"
          :ecosystem="spec.ecosystem"
          :verdict="verdict"
          :requirements="requirements"
          class="block"
        />

        <ApiFit :results="results" class="block" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import PackagePicker from '../components/PackagePicker.vue'
import TrendChart from '../components/TrendChart.vue'
import MetricTable from '../components/MetricTable.vue'
import VerdictCard from '../components/VerdictCard.vue'
import RequirementsBar from '../components/RequirementsBar.vue'
import ApiFit from '../components/ApiFit.vue'
import { loadRequirements, saveRequirements } from '../lib/requirements'
import { comparisons } from '../content'
import { specFromComparison, specFromQuery, type ComparisonSpec } from '../lib/spec'
import { buildVerdict } from '../lib/verdict'
import type { PackageResult } from '../types'

const route = useRoute()
const router = useRouter()

const editing = ref(false)
const draft = ref<string[]>([])

// Constraints belong to the developer, not the comparison, so they persist
// across pages instead of resetting on every navigation.
const requirements = ref(loadRequirements())
watch(requirements, saveRequirements, { deep: true })

const results = ref<PackageResult[] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const copied = ref(false)

/** One page serves both curated (/compare/:id) and ad-hoc (/compare?…) routes. */
const parsedQuery = computed(() =>
  route.params.id ? null : specFromQuery(route.query.ecosystem, route.query.packages)
)

const spec = computed<ComparisonSpec | null>(() => {
  if (route.params.id) {
    const found = comparisons.find(c => c.id === route.params.id)
    return found ? specFromComparison(found) : null
  }
  return parsedQuery.value?.spec ?? null
})

const specError = computed(() => parsedQuery.value?.error ?? null)

const failed = computed(() => results.value?.filter(r => r.error) ?? [])
const charted = computed(() => results.value?.filter(r => r.trend?.length) ?? [])

const verdict = computed(() =>
  results.value && spec.value ? buildVerdict(results.value, spec.value.ecosystem) : null
)

async function load() {
  if (!spec.value) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  results.value = null

  try {
    const params = new URLSearchParams({
      ecosystem: spec.value.ecosystem,
      packages: spec.value.packages.join(','),
    })
    const res = await fetch(`/api/compare?${params}`)
    if (!res.ok) {
      const detail = await res.json().catch(() => null)
      throw new Error(detail?.error || `Registry lookup failed (HTTP ${res.status})`)
    }
    // If the function is missing, the SPA fallback serves index.html with a 200.
    // Without this check that surfaces as an opaque JSON parse error.
    if (!res.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The /api/compare function did not respond with JSON.')
    }
    results.value = await res.json()
  } catch (e: any) {
    error.value = e.message || 'Error fetching data'
  } finally {
    loading.value = false
  }
}

function toggleEdit() {
  editing.value = !editing.value
  if (editing.value) draft.value = [...(spec.value?.packages ?? [])]
}

const unchanged = computed(() => {
  const current = spec.value?.packages ?? []
  return (
    current.length === draft.value.length &&
    current.every((p, i) => p === draft.value[i])
  )
})

/** Every edit lands on the ad-hoc route, so the result is always a shareable
 *  permalink regardless of whether it started from a curated page. */
function applyEdit() {
  if (draft.value.length < 2 || unchanged.value || !spec.value) return
  editing.value = false
  router.push({
    name: 'adhoc',
    query: { ecosystem: spec.value.ecosystem, packages: draft.value.join(',') },
  })
}

async function share() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard is blocked outside a secure context; the URL is in the address
    // bar either way, so this is not worth an error state.
  }
}

// Re-fetch when the route changes, since both routes share this component and
// navigating between comparisons does not remount it.
watch(
  () => [route.params.id, route.query.packages, route.query.ecosystem],
  load,
  { immediate: true }
)
</script>

<style scoped>
.page {
  display: block;
}

.block {
  margin-top: 20px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.head__eyebrow {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
  margin-bottom: 8px;
}

.head__title {
  margin: 0;
  font-size: clamp(28px, 5vw, 40px);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: var(--sp-text);
}

.head__question {
  margin: 10px 0 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--sp-text-dim);
  max-width: 62ch;
}

.head__pkgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
  font-size: 12px;
  color: var(--sp-text-dim);
}

.pill--eco {
  border-style: dashed;
  color: var(--sp-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  font-weight: 700;
}

.head__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.editor {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--sp-border-strong);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
}

.editor__actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.editor__warn {
  font-size: 12px;
  color: var(--sp-text-muted);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn--primary:disabled:hover {
  background: var(--sp-accent);
  border-color: var(--sp-accent);
  color: #12091f;
}

.note {
  margin: 20px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--sp-border);
  border-left: 2px solid var(--sp-accent);
  border-radius: var(--sp-radius);
  background: var(--sp-surface);
  color: var(--sp-text-dim);
  font-size: 14px;
  line-height: 1.6;
  max-width: 74ch;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border-strong);
  background: transparent;
  color: var(--sp-text-dim);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.btn:hover {
  border-color: var(--sp-accent);
  color: var(--sp-accent);
}

.btn--primary {
  background: var(--sp-accent);
  border-color: var(--sp-accent);
  color: #12091f;
}
.btn--primary:hover {
  background: var(--sp-accent-dim);
  border-color: var(--sp-accent-dim);
  color: #fff;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 72px 0;
  color: var(--sp-text-muted);
  font-size: 14px;
}

.loading__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--sp-surface-3);
  border-top-color: var(--sp-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .loading__spinner { animation-duration: 3s; }
}

.alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  font-size: 14px;
  line-height: 1.5;
}

.alert--error {
  border-color: rgba(208, 59, 59, 0.5);
  background: rgba(208, 59, 59, 0.08);
  color: var(--sp-critical-text);
}

.alert--warn {
  border-color: rgba(250, 178, 25, 0.4);
  background: rgba(250, 178, 25, 0.07);
  color: #f5c451;
}

.empty {
  padding: 80px 0;
  text-align: center;
}

.empty__title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 600;
  color: var(--sp-text);
}

.empty__body {
  margin: 0 0 24px;
  color: var(--sp-text-muted);
}
</style>
