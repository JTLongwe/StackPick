<template>
  <div v-if="!comparison" class="py-10 text-center">
    <h1 class="text-h5 mb-2">Comparison not found</h1>
    <p class="text-grey mb-6">No comparison is defined for "{{ route.params.id }}".</p>
    <v-btn color="primary" variant="tonal" to="/">Back to all comparisons</v-btn>
  </div>

  <div v-else>
    <h1 class="text-h4 mb-2">{{ comparison.title }}</h1>
    <p class="text-h6 text-grey-lighten-1 mb-4">{{ comparison.question }}</p>
    <v-alert v-if="comparison.note" type="info" variant="tonal" class="mb-8">
      {{ comparison.note }}
    </v-alert>

    <div v-if="loading" class="text-center py-10">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <div class="mt-4">Fetching live registry data...</div>
    </div>

    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">Retry</v-btn>
      </template>
    </v-alert>

    <template v-else-if="results">
      <v-alert v-if="failed.length" type="warning" variant="tonal" class="mb-4">
        Could not load registry data for
        {{ failed.map(r => r.name).join(', ') }}. The columns below are incomplete.
      </v-alert>

      <trend-chart
        v-if="charted.length"
        :results="charted"
        :ecosystem="comparison.ecosystem"
        class="mb-8"
      />

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
            <td class="font-weight-bold">
              {{ comparison.ecosystem === 'npm' ? 'Weekly Downloads' : 'Total Downloads' }}
            </td>
            <td v-for="res in results" :key="res.name" class="text-center">
              {{ res.weeklyDownloads?.toLocaleString() ?? 'N/A' }}
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
              <v-icon
                v-if="res.typesBundled != null"
                :color="res.typesBundled ? 'success' : 'error'"
                :icon="res.typesBundled ? mdiCheck : mdiClose"
              />
              <span v-else class="text-grey">N/A</span>
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
              {{ res.github?.stars?.toLocaleString() ?? 'N/A' }}
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Open/Closed Issues</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <span v-if="res.github">
                {{ res.github.openIssues?.toLocaleString() }} /
                {{ res.github.closedIssues?.toLocaleString() }}
              </span>
              <span v-else class="text-grey">N/A</span>
            </td>
          </tr>
          <tr>
            <td class="font-weight-bold">Archived?</td>
            <td v-for="res in results" :key="res.name" class="text-center">
              <v-chip v-if="res.github?.archived" color="error" class="font-weight-bold" variant="flat">
                ARCHIVED
              </v-chip>
              <span v-else-if="res.github" class="text-grey">Active</span>
              <span v-else class="text-grey">N/A</span>
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
import { mdiCheck, mdiClose } from '@mdi/js'
import TrendChart from '../components/TrendChart.vue'
import { comparisons } from '../content'
import type { PackageResult } from '../types'

const route = useRoute()

const comparison = computed(() => comparisons.find(c => c.id === route.params.id))

const results = ref<PackageResult[] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Packages the API could not resolve at all — flagged so the table's N/A cells
// read as "lookup failed" rather than "this package has no stars".
const failed = computed(() => results.value?.filter(r => r.error) ?? [])
const charted = computed(() => results.value?.filter(r => r.trend?.length) ?? [])

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

async function load() {
  if (!comparison.value) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    const params = new URLSearchParams({
      ecosystem: comparison.value.ecosystem,
      packages: comparison.value.packages.join(','),
    })
    const res = await fetch(`/api/compare?${params}`)
    if (!res.ok) throw new Error(`Registry lookup failed (HTTP ${res.status})`)
    // If the function is missing, the SPA fallback serves index.html with a 200.
    // Without this check that surfaces as an opaque JSON parse error.
    if (!res.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The /api/compare function did not respond with JSON.')
    }
    results.value = await res.json()
  } catch (e: any) {
    error.value = e.message || 'Error fetching data'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
