<template>
  <v-app>
    <v-app-bar title="StackPick" flat>
      <template v-slot:prepend>
        <v-btn icon="mdi-arrow-left" v-if="$route.name !== 'home'" @click="$router.push('/')"></v-btn>
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
// Main App Shell
</script>

<style>
/* Global cleanups */
html, body {
  margin: 0;
  padding: 0;
  font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background-color: #121212;
}
</style>
