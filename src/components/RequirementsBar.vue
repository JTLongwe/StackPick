<template>
  <section class="req">
    <div class="req__head">
      <h3 class="req__title">Your constraints</h3>
      <p class="req__blurb">
        Compatibility isn't a quality judgement, so none of this changes the
        score. It marks what you can actually use.
      </p>
    </div>

    <div class="req__controls">
      <template v-if="ecosystem === 'npm'">
        <label class="field">
          <span class="field__label">Node</span>
          <select :value="modelValue.node ?? ''" @change="setNode($event)">
            <option value="">Any</option>
            <option v-for="n in NODE_CHOICES" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Modules</span>
          <select :value="modelValue.moduleFormat" @change="setFormat($event)">
            <option value="any">Any</option>
            <option value="esm">ESM</option>
            <option value="cjs">CommonJS</option>
          </select>
        </label>
      </template>

      <label v-else class="field">
        <span class="field__label">Target framework</span>
        <select :value="modelValue.targetFramework ?? ''" @change="setTfm($event)">
          <option value="">Any</option>
          <option v-for="t in TFM_CHOICES" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>

      <button v-if="active" type="button" class="req__clear" @click="clear">Clear</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  NODE_CHOICES,
  TFM_CHOICES,
  emptyRequirements,
  hasAnyRequirement,
  type Requirements,
} from '../lib/requirements'
import type { Ecosystem } from '../types'

const props = defineProps<{ modelValue: Requirements; ecosystem: Ecosystem }>()
const emit = defineEmits<{ 'update:modelValue': [Requirements] }>()

const active = computed(() => hasAnyRequirement(props.modelValue, props.ecosystem))

const patch = (part: Partial<Requirements>) =>
  emit('update:modelValue', { ...props.modelValue, ...part })

const value = (e: Event) => (e.target as HTMLSelectElement).value

const setNode = (e: Event) => patch({ node: value(e) ? Number(value(e)) : null })
const setFormat = (e: Event) => patch({ moduleFormat: value(e) as Requirements['moduleFormat'] })
const setTfm = (e: Event) => patch({ targetFramework: value(e) || null })
const clear = () => emit('update:modelValue', { ...emptyRequirements })
</script>

<style scoped>
.req {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
}

.req__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
}

.req__blurb {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sp-text-muted);
  max-width: 52ch;
}

.req__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  align-items: center;
  gap: 7px;
}

.field__label {
  font-size: 12px;
  color: var(--sp-text-dim);
}

.field select {
  padding: 6px 10px;
  border-radius: var(--sp-radius);
  border: 1px solid var(--sp-border);
  background: var(--sp-bg);
  color: var(--sp-text);
  font-family: var(--sp-mono);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.field select:focus { border-color: var(--sp-accent); }

.req__clear {
  border: none;
  background: none;
  color: var(--sp-text-muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}
.req__clear:hover { color: var(--sp-accent); }
</style>
