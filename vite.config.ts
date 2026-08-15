import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import yaml from '@rollup/plugin-yaml'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Auto-imports only the Vuetify components each SFC actually uses, along
    // with their styles. Without this, main.ts has to register the entire
    // library and every component ships to the browser.
    vuetify({ autoImport: true }),
    // @ts-ignore
    yaml()
  ]
})
