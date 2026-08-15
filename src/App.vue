<template>
  <v-app>
    <v-app-bar title="StackPick" flat>
      <template v-slot:prepend>
        <v-btn :icon="mdiArrowLeft" v-if="$route.name !== 'home'" @click="$router.push('/')"></v-btn>
      </template>
    </v-app-bar>

    <v-main>
      <v-container>
        <router-view></router-view>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'
</script>
