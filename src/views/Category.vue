<template>
  <div v-if="!category" class="empty">
    <h1 class="empty__title">Category not found</h1>
    <RouterLink to="/" class="btn btn--primary">Back to all comparisons</RouterLink>
  </div>

  <div v-else>
    <header class="head">
      <span class="head__eyebrow">Category</span>
      <h1 class="head__title">{{ category.label }}</h1>
      <p class="head__blurb">{{ category.blurb }}</p>

      <div v-if="category.ecosystems.length > 1" class="ecos" role="radiogroup" aria-label="Ecosystem">
        <button
          v-for="eco in category.ecosystems"
          :key="eco"
          type="button"
          role="radio"
          :aria-checked="ecosystem === eco"
          class="eco"
          :class="{ 'is-active': ecosystem === eco }"
          @click="setEcosystem(eco)"
        >{{ eco }}</button>
      </div>
    </header>

    <p class="caveat">
      Contenders first, then whatever the {{ ecosystem }} registry returns for
      this category. Registry ranking favours incumbents — the thing StackPick
      exists to look past — so treat the order as meaningless. Pick two or more
      and let the verdict do the work.
    </p>

    <div v-if="loading && !packages.length" class="loading">
      <span class="loading__spinner" aria-hidden="true"></span>
      <span>Loading {{ ecosystem }} packages…</span>
    </div>

    <p v-else-if="!packages.length" class="caveat">
      No packages came back for this category on {{ ecosystem }}.
    </p>

    <template v-else>
      <ul class="list">
        <li v-for="pkg in packages" :key="pkg.name">
          <label class="row" :class="{ 'is-picked': selected.includes(pkg.name), 'is-seed': pkg.seed }">
            <input
              type="checkbox"
              :checked="selected.includes(pkg.name)"
              :disabled="!selected.includes(pkg.name) && selected.length >= MAX_PACKAGES"
              @change="toggle(pkg.name)"
            />
            <span class="row__body">
              <span class="row__name sp-mono">
                {{ pkg.name }}
                <span v-if="pkg.seed" class="row__tag">contender</span>
              </span>
              <span v-if="pkg.description" class="row__desc">{{ pkg.description }}</span>
            </span>
            <span v-if="pkg.downloads" class="row__dl sp-tabular">
              {{ formatCompact(pkg.downloads) }}
            </span>
          </label>
        </li>
      </ul>

      <div class="bar" :class="{ 'is-ready': selected.length >= 2 }">
        <span class="bar__count">
          {{ selected.length }} selected{{ selected.length < 2 ? ' — pick at least two' : '' }}
        </span>
        <button class="btn btn--primary" type="button" :disabled="selected.length < 2" @click="compare">
          Compare selected
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { categoryBySlug, categoryQuery, categorySeeds } from '../content/categories'
import { MAX_PACKAGES } from '../lib/spec'
import { formatCompact } from '../lib/format'
import type { Ecosystem, PackageSummary } from '../types'

const route = useRoute()
const router = useRouter()

const category = computed(() => categoryBySlug(String(route.params.slug)))
const ecosystem = ref<Ecosystem>('npm')
type Row = PackageSummary & { seed?: boolean }

const packages = ref<Row[]>([])
const selected = ref<string[]>([])
const loading = ref(false)

function setEcosystem(eco: Ecosystem) {
  if (eco === ecosystem.value) return
  ecosystem.value = eco
  // Names don't carry across registries.
  selected.value = []
}

function toggle(name: string) {
  selected.value = selected.value.includes(name)
    ? selected.value.filter(n => n !== name)
    : [...selected.value, name]
}

function compare() {
  if (selected.value.length < 2) return
  router.push({
    name: 'adhoc',
    query: { ecosystem: ecosystem.value, packages: selected.value.join(',') },
  })
}

async function load() {
  const cat = category.value
  if (!cat) return

  // Fall back to whichever ecosystem this category actually covers.
  if (!cat.ecosystems.includes(ecosystem.value)) ecosystem.value = cat.ecosystems[0]

  const seeds: Row[] = categorySeeds(cat, ecosystem.value).map(name => ({
    name,
    description: '',
    version: '',
    tags: [],
    seed: true,
  }))

  const q = categoryQuery(cat, ecosystem.value)
  if (!q) {
    packages.value = seeds
    return
  }

  // Seeds render immediately; search only ever appends to them.
  packages.value = seeds
  loading.value = true

  try {
    const params = new URLSearchParams({ ecosystem: ecosystem.value, q, limit: '14' })
    const res = await fetch(`/api/search?${params}`)
    const found: Row[] = res.ok ? await res.json() : []
    const seen = new Set(seeds.map(s => s.name.toLowerCase()))
    packages.value = [...seeds, ...found.filter(p => !seen.has(p.name.toLowerCase()))]
  } catch {
    packages.value = seeds
  } finally {
    loading.value = false
  }
}

watch([() => route.params.slug, ecosystem], load, { immediate: true })
</script>

<style scoped>
.head { padding-top: 8px; }

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
  color: var(--sp-text);
}

.head__blurb {
  margin: 10px 0 0;
  font-size: 16px;
  color: var(--sp-text-dim);
  max-width: 60ch;
}

.ecos {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-top: 16px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
}

.eco {
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--sp-text-muted);
  font-family: var(--sp-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.eco.is-active { background: var(--sp-surface-3); color: var(--sp-accent); }

.caveat {
  margin: 20px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sp-text-muted);
  max-width: 70ch;
}

.list {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  overflow: hidden;
}

.list li + li { border-top: 1px solid var(--sp-border); }

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
}
.row:hover { background: var(--sp-surface-2); }
.row.is-picked { background: var(--sp-accent-wash); }

.row input {
  accent-color: var(--sp-accent);
  width: 16px;
  height: 16px;
  flex: none;
  cursor: pointer;
}

.row__body { flex: 1; min-width: 0; }

.row__name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--sp-text);
}

.row__desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sp-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__dl { font-size: 12px; color: var(--sp-text-muted); flex: none; }

.row__tag {
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--sp-border-strong);
  font-family: var(--sp-sans);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
  vertical-align: middle;
}

.row.is-seed .row__tag { color: var(--sp-accent); border-color: rgba(167, 139, 250, 0.45); }

.bar {
  position: sticky;
  bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid var(--sp-border-strong);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface-2);
}
.bar.is-ready { border-color: var(--sp-accent); }

.bar__count { font-size: 13px; color: var(--sp-text-dim); }

.btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-accent);
  background: var(--sp-accent);
  color: #12091f;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}
.btn:hover:not(:disabled) { background: var(--sp-accent-dim); color: #fff; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
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

@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading__spinner { animation-duration: 3s; } }

.empty { padding: 80px 0; text-align: center; }
.empty__title { margin: 0 0 24px; font-size: 24px; color: var(--sp-text); }
</style>
