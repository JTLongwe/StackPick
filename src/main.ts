import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

/**
 * Analytics are opt-in and off unless VITE_ANALYTICS_DOMAIN is set, so the
 * default build ships no third-party script at all. GoatCounter sets no
 * cookies and collects no personal data, which keeps the site free of consent
 * banners.
 */
const analyticsDomain = import.meta.env.VITE_ANALYTICS_DOMAIN
if (analyticsDomain) {
  const s = document.createElement('script')
  s.async = true
  s.dataset.goatcounter = `https://${analyticsDomain}.goatcounter.com/count`
  s.src = '//gc.zgo.at/count.js'
  document.head.appendChild(s)
}

createApp(App)
  .use(router)
  .mount('#app')
