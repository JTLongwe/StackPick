import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Comparison from '../views/Comparison.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/compare/:id',
      name: 'comparison',
      component: Comparison
    }
  ]
})

export default router
