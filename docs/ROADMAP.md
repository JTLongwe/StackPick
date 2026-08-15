# StackPick — live search, on-the-fly comparisons, categories

Design doc for the next phase. Written so the work can be picked up cold, in a
new session, without re-deriving anything.

**Status legend:** ⬜ not started · 🟡 in progress · ✅ done

---

## 0. GITHUB_TOKEN ⬜

Not code — do this in the Netlify UI. Everything below degrades without it.

### Create the token

GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
**Fine-grained tokens** → *Generate new token*.

- Repository access: **Public repositories (read-only)**
- Permissions: **none — leave every scope unset**

A zero-scope token still raises the rate limit from **60 requests/hour** to
**5,000/hour**, because the limit is per-authenticated-user rather than per-IP.
It grants no access to anything private, so the blast radius if it leaks is
effectively nil. Do not create a classic token with `repo` scope; it is far more
access than this needs.

### Add it to Netlify

Netlify → your site → **Site configuration** → **Environment variables** →
*Add a variable*.

- Key: `GITHUB_TOKEN`
- Value: the token
- Scopes: Functions (Builds too is harmless)

**Then trigger a redeploy.** Functions read env at deploy time; an existing
deploy will not pick up a new variable.

`compare.ts` already reads `process.env.GITHUB_TOKEN` and adds the auth header
when present — no code change needed.

### Local development

```
# .env  (gitignored — never commit this)
GITHUB_TOKEN=github_pat_...
```

`netlify dev` loads `.env` automatically. Add `.env` to `.gitignore` before
creating it.

---

## The architectural shift

Today a comparison is either **curated** (a YAML file) or **ad-hoc** (query
params). The next phase makes that distinction disappear:

> A curated comparison is just an ad-hoc comparison with a title, a question and
> a note attached to it.

Everything renders through one `ComparisonSpec`. YAML becomes **seed content and
editorial voice**, not a separate code path. `src/lib/spec.ts` already models
this — the work is making the UI editable rather than adding a second model.

---

## 1. Live package search ⬜

### Why a function rather than calling registries from the browser

- npm's search endpoint sends no CORS headers usable from a browser app.
- Server-side lets us cache at the CDN, so repeated prefixes cost nothing.
- Keeps rate-limit handling in one place.

### New: `netlify/functions/search.ts`

`GET /api/search?ecosystem=npm&q=zo&limit=10`

**npm**
```
https://registry.npmjs.org/-/v1/search?text=<q>&size=<limit>
→ objects[].package { name, description, version, keywords, links, publisher }
→ objects[].score.final
```

**NuGet**
```
https://azuresearch-usnc.nuget.org/query?q=<q>&take=<limit>&prerelease=false
→ data[] { id, description, version, totalDownloads, tags, verified }
```

Normalise both to one shape:

```ts
interface PackageSummary {
  name: string
  description: string
  version: string
  downloads?: number   // NuGet gives totals; npm search does not
  tags: string[]       // npm keywords / NuGet tags
  verified?: boolean   // NuGet only
}
```

**Response headers** — cache hard, these results barely move:
```
Cache-Control: public, max-age=300
Netlify-CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

**Validation:** reuse `NAME_PATTERNS` thinking from `compare.ts`; `q` should be
length-capped (say 64) and `limit` clamped to 1–25.

### New: `src/components/PackagePicker.vue`

A typeahead multi-select. Replaces the free-text input in `ComparisonBuilder.vue`.

Requirements:
- Debounce **250ms**; do not fire under **2 characters**.
- `AbortController` on every keystroke — cancel the in-flight request.
- Client-side `Map` cache keyed `${ecosystem}:${q}` so backspacing is instant.
- Selected packages render as removable chips; cap at `MAX_PACKAGES` (8).
- Keyboard: ↑/↓ to move, Enter to select, Escape to close, Backspace on empty
  input removes the last chip.
- `role="combobox"` + `aria-activedescendant`; the listbox must be reachable
  without a mouse.

### Files
| File | Change |
|---|---|
| `netlify/functions/search.ts` | new |
| `src/components/PackagePicker.vue` | new |
| `src/lib/useSearch.ts` | new — debounce + abort + cache |
| `src/types.ts` | add `PackageSummary` |
| `src/components/ComparisonBuilder.vue` | swap input for picker |

---

## 2. Editable comparison pages ⬜

Put the picker **on the comparison page itself**, so a comparison is a live
query rather than a destination.

- Curated page shows its packages in the picker, pre-filled.
- Changing the selection rewrites the URL to `/compare?ecosystem=…&packages=…`
  and refetches. The curated title/note drop away once it is no longer that
  comparison — do not keep editorial copy attached to a set it no longer describes.
- `router.replace` (not `push`) while editing, so the back button doesn't
  accumulate one entry per keystroke.
- The permalink stays shareable throughout.

`Comparison.vue` already watches route params and refetches, so this is mostly
a matter of rendering the picker and pushing selection changes into the query.

---

## 3. Categories from tags ⬜

### Where tags come from

| Source | Field | Notes |
|---|---|---|
| npm | `keywords` on the version document | already in the metadata `compare.ts` fetches |
| NuGet | `tags` in the search response | already fetched |
| GitHub | `topics` on the repo response | already fetched, currently discarded |

All three are **already in responses the function reads today** — surfacing them
costs no extra requests.

### Browsing by category

Both registries support tag-scoped search, which makes category listings real
rather than hand-maintained:

```
npm:   /-/v1/search?text=keywords:validation&size=20
NuGet: /query?q=tags:logging&take=20
```

### The taxonomy problem — read this before building it

Raw keywords are **noise**. Real npm packages tag themselves `javascript`,
`typescript`, `node`, `utility`. Those carry no signal. Auto-derived categories
will look broken.

So: `src/content/categories.ts` holds a **curated** map — category → the tags
that genuinely imply it, per ecosystem:

```ts
{
  slug: 'validation',
  label: 'Schema validation',
  npmKeywords: ['validation', 'schema', 'validator'],
  nugetTags: ['validation', 'fluentvalidation'],
}
```

Start with ~10 categories that match the existing curated comparisons: ui,
testing, http, validation, logging, state, date, orm, serialization,
cryptography.

Treat categories as a **discovery surface**, not a ranking. Tag search is
ordered by registry popularity score, which is exactly the incumbent bias
StackPick exists to counter — so a category page should lead into a comparison,
where the verdict does the real work, rather than presenting its own order as
meaningful.

### Route
`/category/:slug` → tag-scoped listing → "compare these" → `/compare?…`

---

## Risks — the things that will actually bite

### GitHub's search API is the hard ceiling ⚠️

`getGithubMetrics` makes **two** calls per package: `/repos/…` (5,000/hr) and
`/search/issues` (**30 per minute**, authenticated).

Search is the binding constraint, and it is shared across every visitor:

- 8 packages = 8 search calls = one comparison
- **~3–4 comparisons per minute, site-wide**

Ad-hoc comparison makes this reachable in a way curated pages never did. Options,
roughly in order of preference:

1. Cache closed-issue counts hard (CDN `s-maxage` of a day) — the number barely
   moves and this is nearly free.
2. Drop the closed-issue count and score maintenance on cadence + recency, which
   are already the stronger signals.
3. Make it a progressive enhancement: render without it, fill in when available.

Do **not** ship broad ad-hoc comparison without addressing this.

### Function invocation budget
Typeahead multiplies invocations. Netlify's free tier is 125k/month. Debounce,
the 2-character floor, and CDN caching are what keep this affordable — treat them
as requirements, not polish.

### Latency
A 2-package comparison already takes ~2s (measured). Eight packages, each with
GitHub plus Bundlephobia, will be considerably worse. Consider returning results
per-package as they resolve rather than one `Promise.all`, so the table fills in
progressively.

### Bundlephobia
Frequently rate-limited and slow; already degrades to `null`. Do not add anything
that depends on it succeeding.

---

## Suggested order

1. `GITHUB_TOKEN` — unblocks the metrics everything else leans on
2. Cache/mitigate the GitHub search ceiling **before** widening ad-hoc use
3. `search.ts` + `PackagePicker` in the home builder
4. Picker on the comparison page
5. Tags surfaced on the comparison page
6. Categories + `/category/:slug`

Stages 3 and 4 are the ones that change how the product feels. Stage 2 is the one
that stops it falling over.
