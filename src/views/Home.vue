<template>
  <div>
    <section class="hero">
      <h1 class="hero__title">
        Stop guessing which<br />
        <span class="hero__accent">library to pick.</span>
      </h1>
      <p class="hero__body">
        The answer is buried across npm, GitHub, changelogs and blog posts.
        StackPick puts it on one screen and reads the trend lines, not just the
        totals. A package can hold a huge download count for years after everyone
        has moved on.
      </p>
      <ComparisonBuilder class="hero__builder" />
    </section>

    <section class="cats">
      <h2 class="browse__title">Browse by category</h2>
      <div class="cats__row">
        <RouterLink
          v-for="cat in categories"
          :key="cat.slug"
          :to="`/category/${cat.slug}`"
          class="cat"
        >{{ cat.label }}</RouterLink>
      </div>
    </section>

    <section class="browse">
      <div class="browse__bar">
        <h2 class="browse__title">Curated comparisons</h2>

        <div class="browse__controls">
          <input
            v-model="query"
            class="search"
            type="search"
            placeholder="Search comparisons or packages…"
            aria-label="Search comparisons"
          />
          <div class="filters" role="group" aria-label="Filter by ecosystem">
            <button
              v-for="eco in ecosystems"
              :key="eco"
              type="button"
              class="filter"
              :class="{ 'is-active': activeEcosystem === eco }"
              :aria-pressed="activeEcosystem === eco"
              @click="activeEcosystem = eco"
            >
              {{ eco === 'all' ? 'All' : eco }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="!filtered.length" class="browse__empty">
        Nothing matches "{{ query }}".
        <template v-if="canCompareQuery">
          You can still
          <RouterLink :to="adhocFallback" class="link">compare those packages directly</RouterLink>.
        </template>
        <template v-else>
          Add a second package above to compare it against something.
        </template>
      </p>

      <div v-else class="grid">
        <RouterLink
          v-for="comp in filtered"
          :key="comp.id"
          :to="`/compare/${comp.id}`"
          class="card"
        >
          <span class="card__eco">{{ comp.ecosystem }}</span>
          <h3 class="card__title">{{ comp.title }}</h3>
          <p class="card__question">{{ comp.question }}</p>
          <div class="card__pkgs">
            <span v-for="pkg in comp.packages" :key="pkg" class="card__pkg sp-mono">{{ pkg }}</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import ComparisonBuilder from '../components/ComparisonBuilder.vue'
import { comparisons } from '../content'
import { categories } from '../content/categories'
import { parsePackages } from '../lib/spec'

const query = ref('')
const activeEcosystem = ref<string>('all')

const ecosystems = computed(() => [
  'all',
  ...[...new Set(comparisons.map(c => c.ecosystem))].sort(),
])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()

  return comparisons.filter(c => {
    if (activeEcosystem.value !== 'all' && c.ecosystem !== activeEcosystem.value) return false
    if (!q) return true
    // Match packages too. People search for the library, not the topic.
    return (
      c.title.toLowerCase().includes(q) ||
      c.question.toLowerCase().includes(q) ||
      c.packages.some(p => p.toLowerCase().includes(q))
    )
  })
})

/** A failed search is still a lead, so offer to run it as an ad-hoc comparison.
 *  Only when it would actually be valid though, rather than routing to an error. */
const canCompareQuery = computed(() => parsePackages(query.value).length >= 2)

const adhocFallback = computed(() => ({
  name: 'adhoc',
  query: {
    ecosystem: activeEcosystem.value === 'nuget' ? 'nuget' : 'npm',
    packages: parsePackages(query.value).join(','),
  },
}))
</script>

<style scoped>
.hero {
  padding: 40px 0 48px;
  border-bottom: 1px solid var(--sp-border);
}

.hero__title {
  margin: 0;
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 680;
  line-height: 1.05;
  letter-spacing: -0.035em;
  color: var(--sp-text);
}

.hero__accent {
  color: var(--sp-accent);
}

.hero__body {
  margin: 20px 0 0;
  max-width: 60ch;
  font-size: 16px;
  line-height: 1.65;
  color: var(--sp-text-dim);
}

.hero__builder {
  margin-top: 28px;
  max-width: 720px;
}

.cats {
  padding-top: 32px;
}

.cats__row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.cat {
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
  color: var(--sp-text-dim);
  font-size: 13px;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;
}

.cat:hover {
  border-color: var(--sp-accent);
  color: var(--sp-accent);
}

.browse {
  padding-top: 36px;
}

.browse__bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}

.browse__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
}

.browse__controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.search {
  width: 260px;
  max-width: 100%;
  padding: 8px 13px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
  color: var(--sp-text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.search::placeholder { color: var(--sp-text-muted); }
.search:focus { border-color: var(--sp-accent); }

.filters {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-surface);
}

.filter {
  padding: 5px 13px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--sp-text-muted);
  font-family: var(--sp-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-transform: lowercase;
  transition: background 0.15s, color 0.15s;
}

.filter:hover { color: var(--sp-text-dim); }

.filter.is-active {
  background: var(--sp-surface-3);
  color: var(--sp-accent);
}

.browse__empty {
  padding: 40px 0;
  color: var(--sp-text-muted);
  font-size: 15px;
}

.link {
  color: var(--sp-accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(167, 139, 250, 0.4);
}
.link:hover { border-bottom-color: var(--sp-accent); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 14px;
}

.card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.card:hover {
  border-color: var(--sp-border-strong);
  background: var(--sp-surface-2);
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .card { transition: border-color 0.15s, background 0.15s; }
  .card:hover { transform: none; }
}

.card__eco {
  font-family: var(--sp-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
}

.card__title {
  margin: 10px 0 0;
  font-size: 17px;
  font-weight: 620;
  letter-spacing: -0.01em;
  color: var(--sp-text);
}

.card__question {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sp-text-muted);
  flex: 1;
}

.card__pkgs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 16px;
}

.card__pkg {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--sp-surface-3);
  color: var(--sp-text-dim);
  font-size: 11px;
}
</style>
