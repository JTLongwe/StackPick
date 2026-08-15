<template>
  <div class="shell">
    <header class="topbar">
      <div class="topbar__inner">
        <RouterLink to="/" class="brand">
          <span class="brand__mark" aria-hidden="true"></span>
          <span class="brand__name">StackPick</span>
        </RouterLink>
        <span class="topbar__tag">Live registry data, not opinion</span>
      </div>
    </header>

    <main class="main">
      <RouterView />
    </main>

    <footer class="footer">
      <span>
        Data from the npm registry, NuGet, GitHub and Bundlephobia. Downloads
        count CI and mirrors as well as people.
      </span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
.shell {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--sp-border);
  background: rgba(10, 12, 16, 0.82);
  backdrop-filter: blur(12px);
}

.topbar__inner,
.main,
.footer > span {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding-inline: 24px;
}

.topbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 56px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
}

/* A small stacked mark — three bars, tallest last, echoing the trend lines. */
.brand__mark {
  width: 15px;
  height: 15px;
  border-radius: 3px;
  background:
    linear-gradient(to top, var(--sp-accent) 40%, transparent 40%),
    linear-gradient(to right, var(--sp-surface-3) 0 100%);
  box-shadow: inset 0 0 0 1px var(--sp-border-strong);
}

.brand__name {
  font-size: 15px;
  font-weight: 680;
  letter-spacing: -0.015em;
  color: var(--sp-text);
}

.topbar__tag {
  font-size: 12px;
  color: var(--sp-text-muted);
}

.main {
  flex: 1;
  padding-bottom: 72px;
}

.footer {
  border-top: 1px solid var(--sp-border);
  padding: 22px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sp-text-muted);
}

.footer > span {
  display: block;
}

@media (max-width: 640px) {
  .topbar__tag { display: none; }
  .topbar__inner,
  .main,
  .footer > span { padding-inline: 16px; }
}
</style>
