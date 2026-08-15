<template>
  <div>
    <h1 class="text-h3 font-weight-bold mb-4">StackPick</h1>
    <p class="text-subtitle-1 text-grey mb-8">
      The answer today is buried across npm, GitHub, changelogs and blog posts.
      This tool puts it on one screen, driven by live registry data rather than opinion.
    </p>

    <div v-for="[ecosystem, items] in groupedComparisons" :key="ecosystem" class="mb-8">
      <h2 class="text-h5 text-capitalize mb-4">{{ ecosystem }}</h2>
      <v-row>
        <v-col cols="12" sm="6" md="4" v-for="comp in items" :key="comp.id">
          <v-card :to="`/compare/${comp.id}`" hover>
            <v-card-title>{{ comp.title }}</v-card-title>
            <v-card-text>
              <div class="mb-2">{{ comp.question }}</div>
              <v-chip size="small" class="mr-1" v-for="pkg in comp.packages" :key="pkg">
                {{ pkg }}
              </v-chip>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const modules = import.meta.glob('../content/comparisons/*.yaml', { eager: true })
const comparisons = Object.values(modules).map((m: any) => m.default || m)

const groupedComparisons = computed(() => {
  const groups: Record<string, any[]> = {}
  for (const c of comparisons) {
    if (!groups[c.ecosystem]) groups[c.ecosystem] = []
    groups[c.ecosystem].push(c)
  }
  return Object.entries(groups)
})
</script>
