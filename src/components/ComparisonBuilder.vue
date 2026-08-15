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
          @click="ecosystem = eco"
        >
          {{ eco }}
        </button>
      </div>

      <input
        v-model="raw"
        class="builder__input sp-mono"
        :placeholder="placeholder"
        :aria-label="`Package names to compare on ${ecosystem}`"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
      />

      <button type="submit" class="builder__go" :disabled="!!validation">Compare</button>
    </div>

    <p class="builder__hint" :class="{ 'is-error': raw.trim() && validation }">
      {{ raw.trim() && validation ? validation : `Comma or space separated, up to ${MAX_PACKAGES}.` }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { specFromQuery, parsePackages, MAX_PACKAGES } from '../lib/spec'
import type { Ecosystem } from '../types'

const router = useRouter()
const ecosystem = ref<Ecosystem>('npm')
const raw = ref('')

const placeholder = computed(() =>
  ecosystem.value === 'npm' ? 'zod, valibot, arktype' : 'Serilog, NLog'
)

// Reuses exactly the validation the comparison page and the function apply, so
// the button can't send the user to a page that will reject them.
const validation = computed(() => specFromQuery(ecosystem.value, raw.value).error)

function submit() {
  if (validation.value) return
  router.push({
    name: 'adhoc',
    query: { ecosystem: ecosystem.value, packages: parsePackages(raw.value).join(',') },
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
  align-items: stretch;
  flex-wrap: wrap;
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
  padding: 6px 14px;
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

.builder__input {
  flex: 1 1 240px;
  min-width: 0;
  padding: 10px 14px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-bg);
  color: var(--sp-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}

.builder__input::placeholder { color: var(--sp-text-muted); }
.builder__input:focus { border-color: var(--sp-accent); }

.builder__go {
  padding: 10px 20px;
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

.builder__hint {
  margin: 10px 2px 0;
  font-size: 12px;
  color: var(--sp-text-muted);
}

.builder__hint.is-error { color: var(--sp-critical-text); }
</style>
