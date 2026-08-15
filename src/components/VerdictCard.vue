<template>
  <section class="verdict" :class="`verdict--${verdict.confidence}`">
    <header class="verdict__head">
      <span class="verdict__eyebrow">
        {{ verdict.confidence === 'close' ? 'Too close to call' : 'Verdict' }}
      </span>
      <h2 class="verdict__headline">
        <template v-if="verdict.confidence !== 'close' && verdict.winner">
          Pick <span class="verdict__winner sp-mono">{{ verdict.winner.name }}</span>
        </template>
        <template v-else>{{ verdict.headline }}</template>
      </h2>
    </header>

    <ul class="verdict__reasons">
      <li v-for="(reason, i) in verdict.reasons" :key="i" :class="`tone-${reason.tone}`">
        <span class="verdict__bullet" aria-hidden="true"></span>
        <span>{{ reason.text }}</span>
      </li>
    </ul>

    <!-- The score bars are the "showing your working" part: a verdict is an
         editorial claim, so the components behind it are always visible. -->
    <div class="verdict__scores">
      <div v-for="s in verdict.scores" :key="s.name" class="score">
        <div class="score__label sp-mono">{{ s.name }}</div>
        <div class="score__track">
          <div class="score__fill" :style="{ width: `${Math.max(s.score, 1.5)}%` }"></div>
        </div>
        <div class="score__value sp-tabular">{{ Math.round(s.score) }}</div>
      </div>
    </div>

    <details class="verdict__how">
      <summary>How this is scored</summary>
      <p>
        Momentum counts for 35%, adoption 25%, maintenance 25% and community 15%.
        Packages that are deprecated, archived or have gone quiet take a direct
        hit. If a registry doesn't publish something, that signal is dropped and
        its weight goes to the others rather than counting as zero.
      </p>
      <ul>
        <li v-for="(caveat, i) in verdict.caveats" :key="i">{{ caveat }}</li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import type { Verdict } from '../lib/verdict'

defineProps<{ verdict: Verdict }>()
</script>

<style scoped>
.verdict {
  position: relative;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(167, 139, 250, 0.09), transparent 55%),
    var(--sp-surface);
  padding: 28px;
  overflow: hidden;
}

/* A confident call gets a lit edge; a coin-flip does not get to look decisive. */
.verdict--clear {
  border-color: rgba(167, 139, 250, 0.45);
}
.verdict--close {
  background: var(--sp-surface);
}

.verdict__eyebrow {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sp-accent);
  margin-bottom: 10px;
}

.verdict__headline {
  margin: 0 0 20px;
  font-size: clamp(26px, 4vw, 38px);
  line-height: 1.12;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--sp-text);
}

.verdict__winner {
  color: var(--sp-accent);
}

.verdict__reasons {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: grid;
  gap: 10px;
  max-width: 68ch;
}

.verdict__reasons li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  font-size: 15px;
  line-height: 1.5;
  color: var(--sp-text-dim);
}

.verdict__bullet {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 8px;
  background: var(--sp-text-muted);
}
.tone-good .verdict__bullet { background: var(--sp-good-text); }
.tone-bad .verdict__bullet { background: var(--sp-critical-text); }

.verdict__scores {
  display: grid;
  gap: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--sp-border);
}

.score {
  display: grid;
  grid-template-columns: minmax(90px, 160px) 1fr 34px;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.score__label {
  color: var(--sp-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score__track {
  height: 6px;
  border-radius: 3px;
  background: var(--sp-surface-3);
  overflow: hidden;
}

.score__fill {
  height: 100%;
  border-radius: 3px;
  background: var(--sp-accent);
}

/* Only the leader is saturated. The rest recede so rank is legible at a glance
   without needing to read the numbers. */
.score:not(:first-child) .score__fill {
  background: var(--sp-border-strong);
}

.score__value {
  text-align: right;
  color: var(--sp-text-muted);
}

.verdict__how {
  margin-top: 20px;
  font-size: 13px;
  color: var(--sp-text-muted);
}

.verdict__how summary {
  cursor: pointer;
  color: var(--sp-text-dim);
  user-select: none;
}
.verdict__how summary:hover {
  color: var(--sp-accent);
}

.verdict__how p {
  margin: 12px 0 8px;
  line-height: 1.6;
  max-width: 70ch;
}

.verdict__how ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  line-height: 1.5;
  max-width: 70ch;
}

@media (max-width: 600px) {
  .verdict { padding: 20px; }
  .score { grid-template-columns: minmax(70px, 110px) 1fr 30px; }
}
</style>
