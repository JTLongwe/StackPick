import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      // Lazy so Chart.js only downloads once someone opens a comparison.
      path: '/compare/:id',
      name: 'comparison',
      component: () => import('../views/Comparison.vue')
    }
  ],
  scrollBehavior: () => ({ top: 0 })
})

// Netlify rewrites every unknown path to index.html, so the app has to deal with
// paths that match no route. A guard is used rather than a `/:pathMatch(.*)*`
// wildcard route, which in vue-router 5 shadows the routes declared above it.
router.beforeEach(to => {
  if (!to.matched.length) return { name: 'home' }
})

export default router
