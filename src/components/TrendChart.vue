<template>
  <v-card class="pa-4 bg-surface" variant="outlined">
    <div class="d-flex justify-space-between align-center mb-4">
      <h3 class="text-h6 font-weight-regular">
        {{ ecosystem === 'npm' ? 'Weekly Downloads (52 weeks)' : 'Cumulative Downloads by Version' }}
      </h3>
      <v-switch
        v-if="needsLogToggle"
        v-model="useLogScale"
        label="Logarithmic Scale"
        color="primary"
        hide-details
        density="compact"
      ></v-switch>
    </div>
    
    <div style="height: 400px; position: relative;">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
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
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const props = defineProps<{
  results: any[]
  ecosystem: string
}>()

// Colorblind safe Okabe-Ito palette
const palette = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7']

const useLogScale = ref(false)

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
  return (max / min) > 100 // Display log toggle if orders of magnitude diff
})

const chartData = computed(() => {
  // Find longest trend dates array to act as labels
  let labels: string[] = []
  for (const res of props.results) {
    if (res.trendDates && res.trendDates.length > labels.length) {
      labels = res.trendDates
    }
  }

  const datasets = props.results.map((res, index) => {
    return {
      label: res.name,
      data: res.trend || [],
      borderColor: palette[index % palette.length],
      backgroundColor: palette[index % palette.length],
      borderWidth: 2, // Thin marks
      pointRadius: 4, // 8px diameter markers
      pointHoverRadius: 6,
      tension: 0.2
    }
  })

  return {
    labels,
    datasets
  }
})

// End-label plugin
const endLabelPlugin = {
  id: 'endLabels',
  afterDraw(chart: any) {
    const ctx = chart.ctx;
    ctx.font = '12px Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E0E0E0'; // Text uses text colour, not series colour

    chart.data.datasets.forEach((dataset: any, i: number) => {
      const meta = chart.getDatasetMeta(i);
      if (!meta.hidden && meta.data.length > 0) {
        const lastPoint = meta.data[meta.data.length - 1];
        if (lastPoint) {
          ctx.fillText(`  ${dataset.label}`, lastPoint.x, lastPoint.y);
        }
      }
    });
  }
}

ChartJS.register(endLabelPlugin)

const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    layout: {
      padding: {
        right: 120 // Space for direct labels
      }
    },
    scales: {
      x: {
        grid: {
          color: '#333333', // Recessive grid
        },
        ticks: {
          color: '#AAAAAA'
        }
      },
      y: {
        type: useLogScale.value ? 'logarithmic' as const : 'linear' as const,
        grid: {
          color: '#333333',
        },
        ticks: {
          color: '#AAAAAA'
        }
      }
    },
    plugins: {
      legend: {
        display: props.results.length >= 2,
        labels: {
          color: '#E0E0E0'
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false
      }
    }
  }
})
</script>
