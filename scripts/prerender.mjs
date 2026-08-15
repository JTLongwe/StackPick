/**
 * Post-build prerender.
 *
 * The app is a client-rendered SPA, so a crawler that doesn't run JavaScript
 * sees an empty <div id="app">. Search engines are unreliable about executing
 * it and social crawlers never do, which means every shared link produced an
 * identical bare card and the comparison pages were effectively invisible.
 *
 * Rather than adopt SSR for ten static pages, this writes a real HTML file per
 * curated route: correct title, description, canonical and Open Graph tags,
 * plus a summary in the body so there is something to index. The SPA still
 * boots and takes over on load. Netlify serves these files directly, ahead of
 * the /* -> /index.html fallback.
 *
 * Live registry numbers are deliberately NOT baked in. They change daily and a
 * stale figure in a search result is worse than no figure.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

// Netlify exposes the production URL; fall back to the deploy prime URL.
const SITE = (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://stackpick.netlify.app')
  .replace(/\/$/, '')

const escape = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const template = readFileSync(join(dist, 'index.html'), 'utf8')

function loadComparisons() {
  const dir = join(root, 'src/content/comparisons')
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => parse(readFileSync(join(dir, f), 'utf8')))
}

/** Categories live in a .ts module, so read the slugs and labels out of it
 *  rather than pulling a TypeScript loader into the build. */
function loadCategories() {
  const src = readFileSync(join(root, 'src/content/categories.ts'), 'utf8')
  const out = []
  const re = /slug:\s*'([^']+)',\s*\n\s*label:\s*'([^']+)',\s*\n\s*blurb:\s*'([^']+)'/g
  let m
  while ((m = re.exec(src))) out.push({ slug: m[1], label: m[2], blurb: m[3] })
  return out
}

function render({ path, title, description, body }) {
  const url = `${SITE}${path}`
  const fullTitle = `${title} · StackPick`

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(fullTitle)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${escape(description)}$2`
    )
    .replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
      `$1${escape(fullTitle)}$2`
    )
    .replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${escape(description)}$2`
    )
    // Relative image paths are not resolved by social crawlers.
    .replace(/content="\/og\.png"/g, `content="${SITE}/og.png"`)
    .replace(
      '</head>',
      `  <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`
    )

  // Something for a crawler to read. Replaced the instant the app mounts.
  html = html.replace(
    '<div id="app"></div>',
    `<div id="app">${body}</div>`
  )

  const dir = join(dist, path.replace(/^\//, ''))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
  return url
}

const urls = [SITE + '/']

for (const c of loadComparisons()) {
  const list = c.packages.join(', ')
  urls.push(
    render({
      path: `/compare/${c.id}`,
      title: c.title,
      description: `${c.question} Compare ${list} on live ${c.ecosystem} data: download momentum, release cadence, security advisories, supply-chain size and maintenance.`,
      body: `<article><h1>${escape(c.title)}</h1><p>${escape(c.question)}</p>` +
        `<p>Comparing ${escape(list)} on live ${escape(c.ecosystem)} registry data.</p>` +
        (c.note ? `<p>${escape(c.note)}</p>` : '') +
        `</article>`,
    })
  )
}

for (const cat of loadCategories()) {
  urls.push(
    render({
      path: `/category/${cat.slug}`,
      title: `${cat.label} libraries compared`,
      description: `${cat.blurb} Compare the contenders on live registry data: momentum, release cadence, security advisories and supply-chain size.`,
      body: `<article><h1>${escape(cat.label)}</h1><p>${escape(cat.blurb)}</p></article>`,
    })
  )
}

// Rewrite the root document's image URLs too, so the home page card works.
writeFileSync(
  join(dist, 'index.html'),
  template.replace(/content="\/og\.png"/g, `content="${SITE}/og.png"`)
)

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`

writeFileSync(join(dist, 'sitemap.xml'), sitemap)
writeFileSync(
  join(dist, 'robots.txt'),
  readFileSync(join(root, 'public/robots.txt'), 'utf8').replace(
    'Sitemap: /sitemap.xml',
    `Sitemap: ${SITE}/sitemap.xml`
  )
)

console.log(`prerendered ${urls.length - 1} pages, sitemap with ${urls.length} urls, site ${SITE}`)
