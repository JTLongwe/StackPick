<template>
  <form class="builder" @submit.prevent="submit">
    <div class="builder__row">
      <div class="builder__eco" role="radiogroup" aria-label="Ecosystem">
        <button
          v-for="eco in (['npm', 'nuget'] as const)"
          :key="eco"
          type="button"
          role="radio"
          :aria-checked="ecosystem === eco"
          class="eco"
          :class="{ 'is-active': ecosystem === eco }"
          @click="setEcosystem(eco)"
        >
          {{ eco }}
        </button>
      </div>

      <PackagePicker
        v-model="packages"
        :ecosystem="ecosystem"
        class="builder__picker"
      />

      <button type="submit" class="builder__go" :disabled="packages.length < 2">
        Compare
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PackagePicker from './PackagePicker.vue'
import type { Ecosystem } from '../types'

const router = useRouter()
const ecosystem = ref<Ecosystem>('npm')
const packages = ref<string[]>([])

/** Names don't carry across registries, so switching ecosystem clears them
 *  rather than leaving npm packages selected in a NuGet search. */
function setEcosystem(eco: Ecosystem) {
  if (eco === ecosystem.value) return
  ecosystem.value = eco
  packages.value = []
}

function submit() {
  if (packages.value.length < 2) return
  router.push({
    name: 'adhoc',
    query: { ecosystem: ecosystem.value, packages: packages.value.join(',') },
  })
}
</script>

<style scoped>
.builder {
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  padding: 14px;
}

.builder__row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.builder__picker {
  flex: 1 1 260px;
  min-width: 0;
}

.builder__eco {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--sp-radius);
  background: var(--sp-bg);
  border: 1px solid var(--sp-border);
}

.eco {
  padding: 8px 14px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--sp-text-muted);
  font-family: var(--sp-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.eco:hover { color: var(--sp-text-dim); }

.eco.is-active {
  background: var(--sp-surface-3);
  color: var(--sp-accent);
}

.builder__go {
  padding: 11px 20px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-accent);
  background: var(--sp-accent);
  color: #12091f;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.builder__go:hover:not(:disabled) { background: var(--sp-accent-dim); color: #fff; }

.builder__go:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
