<template>
  <div v-if="comparison">
    <h1 class="text-h4 mb-2">{{ comparison.title }}</h1>
    <p class="text-h6 text-grey-lighten-1 mb-4">{{ comparison.question }}</p>
    <v-alert v-if="comparison.note" type="info" variant="tonal" class="mb-8">
      {{ comparison.note }}
    </v-alert>

    <div v-if="loading" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <div class="mt-4">Fetching live registry data...</div>
    </div>
    
    <v-alert v-else-if="error" type="error" variant="tonal">{{ error }}</v-alert>

    <template v-else-if="results">
      <trend-chart :results="results" :ecosystem="comparison.ecosystem" class="mb-8" />
      
      <v-table class="elevation-1 bg-surface">
        <thead>
          <tr>
            <th class="text-left font-weight-bold">Metric</th>
            <th v-for="res in results" :key="res.name" class="text-center font-weight-bold">
              {{ res.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-weight-bold">Weekly Downloads</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.weeklyDownloads?.toLocaleString() || 'N/A' }}
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Latest Version</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.latestVersion || 'N/A' }}
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Last Publish</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.lastPublish ? new Date(res.lastPublish).toLocaleDateString() : 'N/A' }}
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">License</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.license || 'N/A' }}
            </td>
          </tr>
          <tr v-if="comparison.ecosystem === 'npm'">
            <td class="font-weight-bold">Types Bundled</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <v-icon :color="res.typesBundled ? 'success' : 'error'">
                {{ res.typesBundled ? 'mdi-check' : 'mdi-close' }}
              </v-icon>
            </td>
          </tr>
          <tr v-if="comparison.ecosystem === 'npm'">
            <td class="font-weight-bold">Bundle Size (min+gzip)</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <span v-if="res.bundleSize">
                {{ formatBytes(res.bundleSize.gzip) }}
              </span>
              <span v-else class="text-grey">unavailable</span>
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">GitHub Stars</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.github?.stars?.toLocaleString() || 'N/A' }}
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Open/Closed Issues</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <span v-if="res.github">
                {{ res.github.openIssues }} / {{ res.github.closedIssues }}
              </span>
              <span v-else>N/A</span>
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Archived?</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <v-chip v-if="res.github?.archived" color="error" class="font-weight-bold" variant="flat">
                ARCHIVED
              </v-chip>
              <span v-else class="text-grey">Active</span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TrendChart from '../components/TrendChart.vue'

const route = useRoute()
const modules = import.meta.glob('../content/comparisons/*.yaml', { eager: true })
const comparisons = Object.values(modules).map((m: any) => m.default || m)

const comparison = computed(() => comparisons.find(c => c.id === route.params.id))

const results = ref<any[] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

onMounted(async () => {
  if (!comparison.value) return
  
  try {
    const pkgs = comparison.value.packages.join(',')
    const eco = comparison.value.ecosystem
    const res = await fetch(`/api/compare?ecosystem=${eco}&packages=${pkgs}`)
    if (!res.ok) throw new Error('API fetch failed')
    results.value = await res.json()
  } catch (e: any) {
    error.value = e.message || 'Error fetching data'
  } finally {
    loading.value = false
  }
})
</script>
