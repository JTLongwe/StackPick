<template>
  <figure class="chart">
    <figcaption class="chart__head">
      <div>
        <h3 class="chart__title">
          {{ ecosystem === 'npm' ? 'Weekly downloads' : 'Cumulative downloads by version' }}
        </h3>
        <p class="chart__sub">
          {{ ecosystem === 'npm'
            ? 'Last 52 weeks. Watch the slope, not the height.'
            : 'NuGet publishes no download time series, so this is per-version totals.' }}
        </p>
      </div>
      <label v-if="needsLogToggle" class="chart__toggle">
        <input type="checkbox" v-model="useLogScale" />
        <span>Log scale</span>
      </label>
    </figcaption>

    <div class="chart__canvas">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </figure>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'
import type { PackageResult } from '../types'
import { SERIES_PALETTE, CHART_INK } from '../theme'
import { formatCompact } from '../lib/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
)

const props = defineProps<{
  results: PackageResult[]
  ecosystem: string
}>()

const useLogScale = ref(false)

// Only offer the toggle when the series really are orders of magnitude apart —
// a log axis on comparable series just makes the difference harder to read.
const needsLogToggle = computed(() => {
  let max = 0
  let min = Infinity
  for (const res of props.results) {
    for (const val of res.trend || []) {
      if (val > max) max = val
      if (val > 0 && val < min) min = val
    }
  }
  if (min === Infinity) return false
  return max / min > 100
})

const chartData = computed(() => {
  let labels: string[] = []
  for (const res of props.results) {
    if (res.trendDates && res.trendDates.length > labels.length) {
      labels = res.trendDates
    }
  }

  return {
    labels,
    datasets: props.results.map((res, index) => ({
      label: res.name,
      data: res.trend || [],
      // Fixed slot order, never cycled — the palette's CVD safety depends on it.
      borderColor: SERIES_PALETTE[index % SERIES_PALETTE.length],
      backgroundColor: SERIES_PALETTE[index % SERIES_PALETTE.length],
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      // A 2px surface ring keeps overlapping hover markers separable.
      pointHoverBorderColor: CHART_INK.surface,
      tension: 0.25
    }))
  }
})

/** Direct end-labels: identity never rests on hue alone, and it removes the
 *  legend-to-line lookup entirely. */
const endLabelPlugin = {
  id: 'endLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart
    ctx.save()
    ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    chart.data.datasets.forEach((dataset: any, i: number) => {
      const meta = chart.getDatasetMeta(i)
      if (meta.hidden || !meta.data.length) return
      const last = meta.data[meta.data.length - 1]
      if (!last) return
      ctx.fillStyle = CHART_INK.label
      ctx.fillText(dataset.label, last.x + 10, last.y)
    })

    ctx.restore()
  }
}

ChartJS.register(endLabelPlugin)

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // Crosshair-style shared tooltip: hovering anywhere reads every series at
  // that point, which is the actual comparison question.
  interaction: { mode: 'index' as const, intersect: false },
  layout: { padding: { right: 96, top: 8 } },
  scales: {
    x: {
      grid: { color: CHART_INK.grid, drawTicks: false },
      border: { color: CHART_INK.axis },
      ticks: {
        color: CHART_INK.text,
        maxRotation: 0,
        autoSkipPadding: 24,
        font: { size: 11 },
        // Weekly buckets are dated; show a short label rather than an ISO date.
        callback(this: any, value: string | number) {
          const raw = String(this.getLabelForValue(value))
          if (props.ecosystem !== 'npm') return raw
          const t = Date.parse(raw)
          return Number.isNaN(t)
            ? raw
            : new Date(t).toLocaleDateString('en', { month: 'short', year: '2-digit' })
        }
      }
    },
    y: {
      type: useLogScale.value ? ('logarithmic' as const) : ('linear' as const),
      grid: { color: CHART_INK.grid, drawTicks: false },
      border: { display: false },
      ticks: {
        color: CHART_INK.text,
        font: { size: 11 },
        callback: (value: string | number) => formatCompact(Number(value))
      }
    }
  },
  plugins: {
    legend: {
      display: props.results.length >= 2,
      align: 'start' as const,
      labels: {
        color: CHART_INK.text,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'rectRounded',
        font: { size: 12 }
      }
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
      backgroundColor: CHART_INK.tooltipBg,
      borderColor: CHART_INK.tooltipBorder,
      borderWidth: 1,
      titleColor: CHART_INK.label,
      bodyColor: CHART_INK.text,
      padding: 10,
      cornerRadius: 8,
      usePointStyle: true,
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}  ${formatCompact(ctx.parsed.y)}`
      }
    }
  }
}))
</script>

<style scoped>
.chart {
  margin: 0;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  padding: 22px;
}

.chart__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.chart__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sp-text);
}

.chart__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sp-text-muted);
}

.chart__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--sp-text-dim);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.chart__toggle input {
  accent-color: var(--sp-accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.chart__canvas {
  position: relative;
  height: 380px;
}

@media (max-width: 600px) {
  .chart { padding: 16px; }
  .chart__canvas { height: 300px; }
}
</style>
