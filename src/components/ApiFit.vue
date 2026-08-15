<template>
  <section v-if="shown.length" class="fit">
    <header class="fit__head">
      <h3 class="fit__title">What using it looks like</h3>
      <p class="fit__sub">
        First example from each README. Nothing here is scored, because whether
        an API suits you depends on what you're building.
      </p>
    </header>

    <div class="fit__grid" :style="{ '--cols': Math.min(shown.length, 3) }">
      <figure v-for="pkg in shown" :key="pkg.name" class="snippet">
        <figcaption class="snippet__name sp-mono">
          {{ pkg.name }}
          <span v-if="pkg.majorBumps" class="snippet__churn" :title="churnTitle(pkg.majorBumps)">
            {{ pkg.majorBumps }} major{{ pkg.majorBumps === 1 ? '' : 's' }} / 3yr
          </span>
        </figcaption>
        <pre class="snippet__code"><code>{{ pkg.sample }}</code></pre>
      </figure>
    </div>

    <p v-if="missing.length" class="fit__missing">
      No example found in the README for
      <span class="sp-mono">{{ missing.join(', ') }}</span>.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PackageResult } from '../types'

const props = defineProps<{ results: PackageResult[] }>()

const shown = computed(() => props.results.filter(r => r.sample))
const missing = computed(() =>
  props.results.filter(r => !r.error && !r.sample).map(r => r.name)
)

const churnTitle = (n: number) =>
  `${n} major version${n === 1 ? '' : 's'} released in the last three years, so expect migration work.`
</script>

<style scoped>
.fit {
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  padding: 22px;
}

.fit__head { margin-bottom: 16px; }

.fit__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sp-text);
}

.fit__sub {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sp-text-muted);
  max-width: 68ch;
}

.fit__grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .fit__grid { grid-template-columns: 1fr; }
}

.snippet {
  margin: 0;
  min-width: 0;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  background: var(--sp-bg);
  overflow: hidden;
}

.snippet__name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--sp-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--sp-accent);
}

.snippet__churn {
  font-family: var(--sp-sans);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--sp-text-muted);
  cursor: help;
  white-space: nowrap;
}

.snippet__code {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font-family: var(--sp-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--sp-text-dim);
  white-space: pre;
  tab-size: 2;
}

.fit__missing {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--sp-text-muted);
}
</style>
