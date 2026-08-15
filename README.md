# StackPick

Compare npm and NuGet packages on live registry data, and get an answer rather
than a table.

Vuex has roughly twice the GitHub stars of Pinia and has not shipped a release
since 2022. Axios installs 29 packages; ky installs none. Download totals hide
both of those facts, and totals are what most comparisons show you.

## What it does

Every comparison reads live data and produces a verdict that shows its working:

- **Momentum** — year-over-year change in downloads, comparing the newest 12
  weeks against the oldest 12 of the same window so one holiday lull doesn't
  decide it. This is the signal totals hide.
- **Maintenance** — release cadence, time since last publish, deprecation and
  archive status.
- **Security** — advisories affecting the current version (OSV), OpenSSF
  Scorecard, and transitive dependency count as supply-chain surface.
- **Compatibility** — Node version, ESM/CJS, .NET target frameworks. Checked
  against constraints you set, never scored.
- **API fit** — the first real example from each README, side by side.

The last two are deliberately kept out of the score. Requiring Node 22 doesn't
make a package worse, it makes it unusable if you're on 18, and only you know
which applies.

Comparisons come from two places: curated YAML in `src/content/comparisons/`,
and anything you ask for via `/compare?ecosystem=npm&packages=zod,valibot`. Both
render through the same code path, and any comparison can be edited in place.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` serves the front end only, so `/api/*` will 404. For the full
thing including the serverless functions:

```bash
npx netlify dev
```

Set a token so the GitHub columns populate. Unauthenticated GitHub allows 60
requests an hour per IP, which shared CI addresses exhaust immediately:

```bash
# .env — gitignored, never commit this
GITHUB_TOKEN=github_pat_...
```

A fine-grained token with **no scopes at all** is enough. It raises the limit to
5,000/hour because the limit is per-user rather than per-IP, and grants access
to nothing.

## Data sources

| Source | Used for | Auth |
|---|---|---|
| npm registry | metadata, downloads, README, engines, module format | none |
| NuGet search + registration | metadata, versions, publish dates, target frameworks | none |
| GitHub | stars, issues, archived, topics | token recommended |
| OSV.dev | vulnerabilities for the current version | none |
| OpenSSF Scorecard | supply-chain posture | none |
| deps.dev | transitive dependency count | none |
| Bundlephobia | bundle size | none |

## Layout

```
netlify/functions/
  compare.ts        registry aggregation, scoring inputs
  search.ts         package typeahead across both registries
src/
  lib/verdict.ts    scoring and reasons
  lib/requirements.ts  compatibility gates
  content/          curated comparisons (YAML) and category taxonomy
scripts/
  prerender.mjs     static HTML per curated route, sitemap, canonical tags
```

## Deploying

Netlify, configured in `netlify.toml`. `npm run build` type-checks, bundles, and
then prerenders each curated route to static HTML so crawlers and link previews
see real content instead of an empty div.

Set `GITHUB_TOKEN` in the site environment and redeploy; functions read env at
deploy time and won't pick up a new variable otherwise.

Optional: set `VITE_ANALYTICS_DOMAIN` to your GoatCounter subdomain to enable
privacy-friendly, cookie-free analytics. Leave it unset and no analytics script
is loaded at all.

## A caveat worth keeping

Download counts include CI runs and mirrors, not just people. The verdict is a
starting point that shows its reasoning, not a decision.
