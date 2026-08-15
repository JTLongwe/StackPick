<template>
  <div class="sp-scroll-x metrics-wrap">
    <table class="metrics">
      <caption class="sr-only">
        Registry metrics for {{ results.map(r => r.name).join(', ') }}
      </caption>
      <thead>
        <tr>
          <th scope="col" class="metrics__corner">Metric</th>
          <th
            v-for="res in results"
            :key="res.name"
            scope="col"
            class="metrics__pkg"
            :class="{ 'is-winner': res.name === winnerName }"
          >
            <span class="metrics__pkg-name sp-mono">{{ res.name }}</span>
            <span v-if="res.name === winnerName" class="metrics__pick">Pick</span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr class="metrics__flags-row">
          <th scope="row">Status</th>
          <td v-for="res in results" :key="res.name" :class="{ 'is-winner': res.name === winnerName }">
            <div class="flags">
              <span
                v-for="flag in flagsFor(res.name)"
                :key="flag.label"
                class="flag"
                :class="`flag--${flag.tone}`"
                :title="flag.detail"
              >
                <span class="flag__dot" aria-hidden="true"></span>{{ flag.label }}
              </span>
              <span v-if="!flagsFor(res.name).length" class="flag flag--neutral">
                <span class="flag__dot" aria-hidden="true"></span>Healthy
              </span>
            </div>
          </td>
        </tr>

        <tr v-if="showFit" class="metrics__fit-row">
          <th scope="row">
            Fits your setup
            <span class="metrics__hint" title="Checked against the constraints you set above. Not part of the score.">?</span>
          </th>
          <td v-for="res in results" :key="res.name" :class="{ 'is-winner': res.name === winnerName }">
            <span class="fit" :class="`fit--${fitFor(res).level}`" :title="fitFor(res).reasons.join(' ')">
              <span class="fit__dot" aria-hidden="true"></span>
              {{ fitLabel(fitFor(res).level) }}
            </span>
          </td>
        </tr>

        <tr v-for="row in rows" :key="row.label">
          <th scope="row">
            {{ row.label }}
            <span v-if="row.hint" class="metrics__hint" :title="row.hint">?</span>
          </th>
          <td
            v-for="res in results"
            :key="res.name"
            class="sp-tabular"
            :class="{ 'is-winner': res.name === winnerName }"
          >
            <span v-if="row.key === 'growth'" :class="growthClass(res.growthYoY)">
              <span v-if="res.growthYoY != null" aria-hidden="true">{{ res.growthYoY >= 0 ? '▲' : '▼' }}</span>
              {{ formatPercent(res.growthYoY) }}
            </span>
            <span v-else>{{ row.value(res) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PackageResult, Ecosystem } from '../types'
import type { Verdict } from '../lib/verdict'
import { checkFit, hasAnyRequirement, type Requirements } from '../lib/requirements'
import { formatCompact, formatBytes, formatPercent, formatAge } from '../lib/format'

const props = defineProps<{
  results: PackageResult[]
  ecosystem: Ecosystem
  verdict: Verdict
  requirements: Requirements
}>()

const showFit = computed(() => hasAnyRequirement(props.requirements, props.ecosystem))

const fitFor = (pkg: PackageResult) => checkFit(pkg, props.requirements, props.ecosystem)

const fitLabel = (level: string) =>
  level === 'fits' ? 'Yes' : level === 'fails' ? 'No' : 'Unknown'

const winnerName = computed(() =>
  props.verdict.confidence === 'close' ? null : props.verdict.winner?.name ?? null
)

function flagsFor(name: string) {
  return props.verdict.scores.find(s => s.name === name)?.flags ?? []
}

function growthClass(growth: number | null | undefined) {
  if (growth == null) return 'sp-muted'
  if (growth >= 10) return 'delta delta--up'
  if (growth <= -10) return 'delta delta--down'
  return 'delta'
}

interface Row {
  label: string
  key?: string
  hint?: string
  value: (r: PackageResult) => string
}

const rows = computed<Row[]>(() => {
  const isNpm = props.ecosystem === 'npm'

  const base: Row[] = [
    {
      label: 'Momentum (YoY)',
      key: 'growth',
      hint: 'Change in downloads against the same period last year. Raw totals hide this.',
      value: r => formatPercent(r.growthYoY),
    },
    {
      label: isNpm ? 'Weekly downloads' : 'Total downloads',
      value: r => formatCompact(r.weeklyDownloads),
    },
    {
      label: 'Releases (last year)',
      hint: 'How often the package actually ships a release.',
      value: r => (r.releasesLastYear == null ? 'N/A' : String(r.releasesLastYear)),
    },
    { label: 'Last publish', value: r => formatAge(r.lastPublish) },
    { label: 'Latest version', value: r => r.latestVersion || 'N/A' },
  ]

  if (isNpm) {
    base.push(
      { label: 'Bundle size (gzip)', value: r => formatBytes(r.bundleSize?.gzip) },
      { label: 'Types bundled', value: r => (r.typesBundled == null ? 'N/A' : r.typesBundled ? 'Yes' : 'No') }
    )
  }

  base.push(
    {
      label: 'Known vulnerabilities',
      hint: 'Advisories from OSV affecting the current version specifically, not the package history.',
      value: r => {
        const v = r.vulnerabilities
        if (!v) return 'N/A'
        if (!v.count) return 'None'
        return v.maxSeverity ? `${v.count} (${v.maxSeverity.toLowerCase()})` : String(v.count)
      },
    },
    {
      label: 'Supply chain',
      hint: 'Total packages installed alongside this one. Every extra package is more code you are trusting.',
      value: r =>
        r.transitiveDeps == null
          ? 'N/A'
          : `${r.transitiveDeps} package${r.transitiveDeps === 1 ? '' : 's'}`,
    },
    {
      label: 'OpenSSF Scorecard',
      hint: 'Supply-chain posture of the repo: review practice, branch protection, pinned dependencies, workflow safety.',
      value: r => (r.scorecard ? `${r.scorecard.score.toFixed(1)} / 10` : 'N/A'),
    }
  )

  if (isNpm) {
    base.push(
      {
        label: 'Module format',
        hint: 'Dual ships both ESM and CommonJS. ESM-only can be awkward in an older CommonJS build.',
        value: r => {
          const f = r.compat?.moduleFormat
          return f === 'dual' ? 'ESM + CJS' : f === 'esm' ? 'ESM only' : f === 'cjs' ? 'CJS only' : 'N/A'
        },
      },
      { label: 'Node requirement', value: r => r.compat?.engines || 'Unstated' }
    )
  } else {
    base.push({
      label: 'Targets',
      hint: 'Target frameworks the package ships. netstandard2.0 is consumable almost everywhere.',
      value: r => {
        const t = r.compat?.targetFrameworks
        return t?.length ? t.slice(0, 4).join(', ') + (t.length > 4 ? '…' : '') : 'N/A'
      },
    })
  }

  base.push(
    { label: 'GitHub stars', value: r => formatCompact(r.github?.stars) },
    {
      label: 'Issues closed',
      hint: 'Share of all issues that are closed. A rough sign of how responsive maintainers are.',
      value: r => {
        const open = r.github?.openIssues
        const closed = r.github?.closedIssues
        if (open == null || closed == null || open + closed === 0) return 'N/A'
        return `${Math.round((closed / (open + closed)) * 100)}%`
      },
    },
    { label: 'License', value: r => r.license || 'N/A' }
  )

  return base
})
</script>

<style scoped>
.metrics-wrap {
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
}

.metrics {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.metrics th,
.metrics td {
  padding: 13px 18px;
  text-align: left;
  border-bottom: 1px solid var(--sp-border);
}

.metrics tbody tr:last-child th,
.metrics tbody tr:last-child td {
  border-bottom: none;
}

.metrics tbody th {
  font-weight: 500;
  color: var(--sp-text-dim);
  white-space: nowrap;
}

.metrics td {
  color: var(--sp-text);
  white-space: nowrap;
}

.metrics__corner {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sp-text-muted);
  font-weight: 600;
}

.metrics__pkg {
  vertical-align: bottom;
}

.metrics__pkg-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--sp-text);
}

/* The winning column is tinted end to end rather than badged once, so the eye
   can follow it down the table without re-reading the header. */
.metrics__pkg.is-winner .metrics__pkg-name {
  color: var(--sp-accent);
}

.metrics th.is-winner,
.metrics td.is-winner {
  background: var(--sp-accent-wash);
}

.metrics__pick {
  display: inline-block;
  margin-top: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sp-accent);
}

.metrics__hint {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  margin-left: 5px;
  border-radius: 50%;
  background: var(--sp-surface-3);
  color: var(--sp-text-muted);
  font-size: 9px;
  font-weight: 700;
  cursor: help;
  vertical-align: middle;
}

.delta {
  color: var(--sp-text);
}
.delta--up {
  color: var(--sp-good-text);
}
.delta--down {
  color: var(--sp-critical-text);
}

.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Fit is a gate, not a grade, so it uses a plain yes/no rather than the
   status palette reserved for quality signals. */
.fit {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  color: var(--sp-text-dim);
}

.fit__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sp-text-muted);
}

.fit--fits { color: var(--sp-good-text); }
.fit--fits .fit__dot { background: var(--sp-good); }

.fit--fails { color: var(--sp-critical-text); }
.fit--fails .fit__dot { background: var(--sp-critical); }

.metrics__fit-row th,
.metrics__fit-row td {
  background: rgba(167, 139, 250, 0.05);
}
.metrics__fit-row td.is-winner { background: var(--sp-accent-wash); }

/* Status is never carried by color alone. Every flag ships a dot AND a label,
   and the full explanation is in the title attribute. */
.flag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--sp-border-strong);
  font-size: 11px;
  font-weight: 600;
  color: var(--sp-text-dim);
  white-space: nowrap;
  cursor: help;
}

.flag__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sp-text-muted);
}

.flag--bad {
  border-color: rgba(208, 59, 59, 0.5);
  color: var(--sp-critical-text);
}
.flag--bad .flag__dot { background: var(--sp-critical); }

.flag--good {
  border-color: rgba(12, 163, 12, 0.5);
  color: var(--sp-good-text);
}
.flag--good .flag__dot { background: var(--sp-good); }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 600px) {
  .metrics th,
  .metrics td { padding: 11px 12px; }
  .metrics { font-size: 13px; }
}
</style>
