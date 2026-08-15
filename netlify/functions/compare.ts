import type { Handler } from '@netlify/functions';

// A single comparison page asks for a handful of packages. Cap it so the public
// endpoint can't be turned into a fan-out amplifier against npm/GitHub.
const MAX_PACKAGES = 8;

const NPM_NAME = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const NUGET_NAME = /^[A-Za-z0-9._-]+$/;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * `Response.json()` is typed as `unknown`. These payloads come from third-party
 * registries whose shapes we don't control, so read them loosely and let the
 * optional chaining below absorb anything missing.
 */
const readJson = (res: Response) => res.json() as Promise<any>;

/**
 * Warm-container memo. Netlify reuses function instances between invocations,
 * so popular packages are frequently answered without touching GitHub at all.
 * This is the cheapest of the mitigations against the search-API ceiling below.
 */
const githubCache = new Map<string, { at: number; value: any }>();
const GITHUB_TTL_MS = 15 * 60 * 1000;

/**
 * GitHub's /search/issues endpoint allows only 30 requests per MINUTE even when
 * authenticated, and that budget is shared across every visitor to the site.
 * The repo endpoint is 5,000/hour by comparison. Closed-issue counts are
 * therefore treated as strictly optional: when the budget is gone the rest of
 * the metrics still return, and the count comes back null.
 *
 * null is not zero. Reporting a rate-limited lookup as "0 closed issues" would
 * drive the close ratio to 0% and actively penalise the package in the verdict.
 */
async function getGithubMetrics(repoUrl: string) {
  if (!repoUrl) return null;

  // Extract owner and repo from various github URL formats
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;

  const rawOwner = match[1];
  const rawRepo = match[2].replace(/\.git$/, '');
  const key = `${rawOwner}/${rawRepo}`.toLowerCase();

  const hit = githubCache.get(key);
  if (hit && Date.now() - hit.at < GITHUB_TTL_MS) return hit.value;

  const owner = encodeURIComponent(rawOwner);
  const repo = encodeURIComponent(rawRepo);

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'StackPick-App'
  };

  // Without a token GitHub allows 60 req/hr per IP, and Netlify's egress IPs are
  // shared. Set GITHUB_TOKEN in the site env or these columns will read N/A.
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const [repoRes, issuesRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetchWithTimeout(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${rawOwner}/${rawRepo} type:issue state:closed`)}&per_page=1`,
        { headers },
        4000
      )
    ]);

    if (repoRes.status !== 'fulfilled' || !repoRes.value.ok) return null;

    const repoData = await readJson(repoRes.value);

    let closedIssues: number | null = null;
    if (issuesRes.status === 'fulfilled' && issuesRes.value.ok) {
      closedIssues = (await readJson(issuesRes.value)).total_count ?? null;
    } else if (issuesRes.status === 'fulfilled') {
      console.warn(`GitHub issue search unavailable for ${key} (HTTP ${issuesRes.value.status})`);
    }

    const value = {
      stars: repoData.stargazers_count,
      // GitHub's open_issues_count includes open PRs; subtract nothing here, but
      // it is the same convention shown on the repo page.
      openIssues: repoData.open_issues_count,
      closedIssues,
      archived: repoData.archived,
      license: repoData.license?.spdx_id || null,
      // Curated repo topics. The cleanest of the three tag sources, and already
      // present in this response.
      topics: Array.isArray(repoData.topics) ? repoData.topics : [],
    };

    githubCache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.error(`GitHub API error for ${key}:`, e);
    return null;
  }
}

async function getBundlephobia(pkgName: string, version: string) {
  try {
    const res = await fetchWithTimeout(
      `https://bundlephobia.com/api/size?package=${encodeURIComponent(`${pkgName}@${version}`)}`,
      {},
      3000
    );
    if (!res.ok) return null;
    const data = await readJson(res);
    return {
      size: data.size,
      gzip: data.gzip
    };
  } catch (e) {
    console.error(`Bundlephobia error for ${pkgName}:`, e);
    return null; // Graceful degradation
  }
}

/** Generic warm-container memo, shared by the lookups below. */
function memoize<T>(ttlMs: number) {
  const store = new Map<string, { at: number; value: T }>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    store.set(key, { at: Date.now(), value });
    return value;
  };
}

const osvMemo = memoize<VulnSummary | null>(30 * 60 * 1000);
const scorecardMemo = memoize<Scorecard | null>(6 * 60 * 60 * 1000);
const depsMemo = memoize<number | null>(6 * 60 * 60 * 1000);

export interface VulnSummary {
  count: number;
  maxSeverity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | null;
  ids: string[];
}

export interface Scorecard {
  score: number;
  checks: { name: string; score: number }[];
}

const SEVERITY_RANK = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 } as const;

/**
 * Known vulnerabilities affecting this exact version, from OSV.
 *
 * Free and unauthenticated, and it covers npm and NuGet from one endpoint. Note
 * this is version-scoped: a package with a bad history but a clean current
 * release should not be punished for the past.
 */
async function getVulnerabilities(
  pkgName: string,
  version: string | undefined,
  ecosystem: 'npm' | 'nuget'
): Promise<VulnSummary | null> {
  if (!version) return null;

  return osvMemo(`${ecosystem}:${pkgName}@${version}`, async () => {
    try {
      const res = await fetchWithTimeout('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: { name: pkgName, ecosystem: ecosystem === 'npm' ? 'npm' : 'NuGet' },
          version
        })
      }, 5000);
      if (!res.ok) return null;

      const vulns: any[] = (await readJson(res)).vulns || [];
      let maxSeverity: VulnSummary['maxSeverity'] = null;

      for (const v of vulns) {
        const raw = String(v.database_specific?.severity || '').toUpperCase();
        if (raw in SEVERITY_RANK) {
          const current = maxSeverity ? SEVERITY_RANK[maxSeverity] : 0;
          if (SEVERITY_RANK[raw as keyof typeof SEVERITY_RANK] > current) {
            maxSeverity = raw as VulnSummary['maxSeverity'];
          }
        }
      }

      return { count: vulns.length, maxSeverity, ids: vulns.map(v => v.id).slice(0, 5) };
    } catch (e) {
      console.error(`OSV lookup failed for ${pkgName}@${version}`, e);
      return null;
    }
  });
}

/** OpenSSF Scorecard: supply-chain posture for the backing repo. */
async function getScorecard(repoUrl: string): Promise<Scorecard | null> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;

  const slug = `${match[1]}/${match[2].replace(/\.git$/, '')}`;

  return scorecardMemo(slug.toLowerCase(), async () => {
    try {
      const res = await fetchWithTimeout(
        `https://api.securityscorecards.dev/projects/github.com/${slug}`,
        {},
        5000
      );
      if (!res.ok) return null;

      const data = await readJson(res);
      if (typeof data.score !== 'number') return null;

      return {
        score: data.score,
        checks: (data.checks || [])
          .filter((c: any) => typeof c.score === 'number' && c.score >= 0)
          .map((c: any) => ({ name: c.name, score: c.score })),
      };
    } catch (e) {
      console.error(`Scorecard lookup failed for ${slug}`, e);
      return null;
    }
  });
}

/**
 * Transitive dependency count from deps.dev.
 *
 * Supply-chain surface area, and one of the sharpest differentiators available:
 * axios pulls in 25 packages, ky pulls in none.
 */
async function getTransitiveDeps(pkgName: string, version: string | undefined): Promise<number | null> {
  if (!version) return null;

  return depsMemo(`${pkgName}@${version}`, async () => {
    try {
      const res = await fetchWithTimeout(
        `https://api.deps.dev/v3alpha/systems/npm/packages/${encodeURIComponent(pkgName)}/versions/${encodeURIComponent(version)}:dependencies`,
        {},
        5000
      );
      if (!res.ok) return null;

      const nodes = (await readJson(res)).nodes || [];
      // Node 0 is the package itself.
      return Math.max(nodes.length - 1, 0);
    } catch (e) {
      console.error(`deps.dev lookup failed for ${pkgName}@${version}`, e);
      return null;
    }
  });
}

/**
 * The first runnable code block in the README.
 *
 * API fit cannot be scored, only shown. Seeing the call you would actually write
 * beats any metric for "which of these do I want to live with".
 */
function extractSample(readme: string | undefined): string | null {
  if (!readme) return null;

  const blocks = [...readme.matchAll(
    /```(?:js|jsx|ts|tsx|javascript|typescript|csharp|cs)\r?\n([\s\S]*?)```/g
  )].map(m => m[1].trim()).filter(b => b.length >= 12);

  if (!blocks.length) return null;

  // Prefer a block that actually calls something. Many READMEs open with a bare
  // import line, which shows nothing about the API.
  const substantive = blocks.find(b => {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const code = lines.filter(l => !/^(import|const .* = require|using |\/\/)/.test(l));
    return code.length >= 1 && lines.length >= 2;
  });

  const chosen = substantive ?? blocks[0];
  return chosen.split('\n').slice(0, 12).join('\n').slice(0, 600);
}

/** Which module systems the package actually ships. */
function moduleFormat(pkg: any): 'esm' | 'cjs' | 'dual' | null {
  if (!pkg) return null;

  const exp = pkg.exports;
  const hasImport = JSON.stringify(exp ?? '').includes('"import"');
  const hasRequire = JSON.stringify(exp ?? '').includes('"require"');

  if (hasImport && hasRequire) return 'dual';
  if (pkg.type === 'module') return hasRequire ? 'dual' : 'esm';
  if (pkg.module && pkg.main) return 'dual';
  return 'cjs';
}

/**
 * Distinct major versions released in the window, as a migration-cost signal.
 *
 * Two majors in three years means one migration you did not plan for. Counts
 * distinct majors rather than releases, so 3.0.0 followed by 3.0.1 is one.
 */
function countMajorBumps(released: [string, string][], years = 3): number {
  const cutoff = Date.now() - years * MS_PER_YEAR;
  const majors = new Set<string>();

  for (const [version, date] of released) {
    const t = Date.parse(date);
    if (Number.isNaN(t) || t < cutoff) continue;
    const m = /^(\d+)\./.exec(version);
    // 0.x releases signal pre-1.0 instability rather than a migration.
    if (m && m[1] !== '0') majors.add(m[1]);
  }

  return Math.max(majors.size - 1, 0);
}

/**
 * Group daily npm downloads into 7-day buckets.
 *
 * Buckets are aligned to the END of the range so the most recent week is always
 * complete: a trailing partial week would render as a cliff on the trend chart,
 * and the oldest days are the ones we can afford to drop.
 */
function aggregateNpmDownloads(daily: { day: string, downloads: number }[]) {
  const weekly: { date: string, downloads: number }[] = [];
  const offset = daily.length % 7;

  for (let i = offset; i + 7 <= daily.length; i += 7) {
    let total = 0;
    for (let j = i; j < i + 7; j++) total += daily[j].downloads || 0;
    weekly.push({ date: daily[i].day, downloads: total });
  }

  return weekly;
}

/**
 * Year-over-year change in download volume, as a percentage.
 *
 * Compares the newest 12 weeks against the oldest 12 of the same 52-week window
 * rather than single weeks at each end, so one holiday lull or one CI stampede
 * doesn't decide the number. This is the signal totals hide: a package can hold
 * an enormous download count for years while every trend line points down.
 */
function computeGrowth(weekly: number[]): number | null {
  const WINDOW = 12;
  if (weekly.length < WINDOW * 2) return null;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const past = mean(weekly.slice(0, WINDOW));
  const recent = mean(weekly.slice(-WINDOW));

  if (past <= 0) return null;
  return ((recent - past) / past) * 100;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** How many versions shipped in the last year. */
function countRecentReleases(dates: (string | undefined)[]): number {
  const cutoff = Date.now() - MS_PER_YEAR;
  return dates.filter(d => {
    if (!d) return false;
    const t = Date.parse(d);
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

async function fetchNpmData(pkgName: string) {
  try {
    const [metaRes, rangeRes, pointRes] = await Promise.all([
      fetchWithTimeout(`https://registry.npmjs.org/${pkgName}`),
      fetchWithTimeout(`https://api.npmjs.org/downloads/range/last-year/${pkgName}`),
      fetchWithTimeout(`https://api.npmjs.org/downloads/point/last-week/${pkgName}`)
    ]);

    if (!metaRes.ok) throw new Error(`npm meta failed for ${pkgName} (HTTP ${metaRes.status})`);

    const meta = await readJson(metaRes);
    const range = rangeRes.ok ? await readJson(rangeRes) : { downloads: [] };
    const point = pointRes.ok ? await readJson(pointRes) : { downloads: 0 };

    const latestVersion = meta['dist-tags']?.latest;
    const latestVersionData = meta.versions?.[latestVersion];
    const repoUrl = meta.repository?.url || '';

    // Independent lookups. Run them together rather than back to back.
    const [githubMetrics, bundleSize, vulnerabilities, scorecard, transitiveDeps] = await Promise.all([
      getGithubMetrics(repoUrl),
      latestVersion ? getBundlephobia(pkgName, latestVersion) : Promise.resolve(null),
      getVulnerabilities(pkgName, latestVersion, 'npm'),
      getScorecard(repoUrl),
      getTransitiveDeps(pkgName, latestVersion)
    ]);

    const typesBundled = !!(latestVersionData?.types || latestVersionData?.typings);
    const weeklyTrend = aggregateNpmDownloads(range.downloads || []);
    const trend = weeklyTrend.map(w => w.downloads);

    // meta.time is a map of version -> ISO date, plus "created"/"modified" keys
    // that aren't versions. It was already being fetched for lastPublish alone.
    const released = Object.entries(meta.time || {})
      .filter(([v]) => v !== 'created' && v !== 'modified') as [string, string][];
    const releaseDates = released.map(([, d]) => d);

    return {
      name: pkgName,
      weeklyDownloads: point.downloads || 0,
      trend,
      trendDates: weeklyTrend.map(w => w.date),
      growthYoY: computeGrowth(trend),
      releasesLastYear: countRecentReleases(releaseDates),
      lastPublish: meta.time?.[latestVersion] || null,
      latestVersion,
      typesBundled,
      // npm's own deprecation notice, set by the author. Already present in the
      // metadata this function reads; previously ignored entirely.
      deprecated: typeof latestVersionData?.deprecated === 'string'
        ? latestVersionData.deprecated
        : latestVersionData?.deprecated ? 'This package is deprecated.' : null,
      license: meta.license || null,
      tags: Array.isArray(latestVersionData?.keywords) ? latestVersionData.keywords : [],
      github: githubMetrics,
      bundleSize,

      // Security. Scored, because an unpatched hole is a real reason not to pick.
      vulnerabilities,
      scorecard,
      transitiveDeps,
      directDeps: Object.keys(latestVersionData?.dependencies || {}).length,

      // Compatibility. Gates rather than demerits: a Node 22 requirement doesn't
      // make a package worse, it makes it inapplicable to someone on Node 18.
      compat: {
        engines: latestVersionData?.engines?.node || null,
        moduleFormat: moduleFormat(latestVersionData),
        sideEffects: latestVersionData?.sideEffects === false ? false : null,
        peerDeps: Object.keys(latestVersionData?.peerDependencies || {}),
        targetFrameworks: null,
      },

      // API fit. Shown, never ranked. What it is worth depends on who is asking.
      sample: extractSample(meta.readme),
      majorBumps: countMajorBumps(released),
    };
  } catch (e) {
    console.error(`Error fetching NPM data for ${pkgName}`, e);
    return { name: pkgName, error: 'Failed to fetch npm data' };
  }
}

/**
 * Publish dates for a NuGet package's most recent versions.
 *
 * The search endpoint returns versions and download counts but no dates, which
 * is why "Last Publish" and release cadence were previously blank for every
 * .NET comparison. The registration index has them; for packages with many
 * versions its pages are not inlined, so the newest page is followed once.
 */
interface NugetRegistration {
  dates: string[];
  targetFrameworks: string[];
  vulnerabilities: number;
  deprecated: string | null;
  latestEntryVersion: string | null;
}

async function getNugetReleaseDates(pkgName: string): Promise<NugetRegistration> {
  const empty: NugetRegistration = {
    dates: [],
    targetFrameworks: [],
    vulnerabilities: 0,
    deprecated: null,
    latestEntryVersion: null,
  };
  try {
    const res = await fetchWithTimeout(
      `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(pkgName.toLowerCase())}/index.json`
    );
    if (!res.ok) return empty;

    const index = await readJson(res);
    const pages: any[] = index.items || [];
    if (!pages.length) return empty;

    const newest = pages[pages.length - 1];
    let leaves: any[] = newest.items || [];

    if (!leaves.length && newest['@id']) {
      const pageRes = await fetchWithTimeout(newest['@id']);
      if (!pageRes.ok) return empty;
      leaves = (await readJson(pageRes)).items || [];
    }

    const entries = leaves.map(leaf => leaf.catalogEntry).filter(Boolean);
    const latest = entries[entries.length - 1];

    // The same walk yields target frameworks, deprecation and vulnerabilities,
    // none of which cost an extra request.
    const targetFrameworks: string[] = (latest?.dependencyGroups || [])
      .map((g: any) => g.targetFramework)
      .filter((f: unknown): f is string => typeof f === 'string' && !!f);

    return {
      dates: entries
        .map((e: any) => e.published)
        .filter((d: unknown): d is string => typeof d === 'string')
        // NuGet marks unlisted versions with the sentinel year 1900.
        .filter((d: string) => !d.startsWith('1900')),
      targetFrameworks: [...new Set(targetFrameworks)],
      vulnerabilities: (latest?.vulnerabilities || []).length,
      deprecated: latest?.deprecation
        ? latest.deprecation.message || 'This package is deprecated.'
        : null,
      latestEntryVersion: latest?.version ?? null,
    };
  } catch (e) {
    console.error(`NuGet registration error for ${pkgName}:`, e);
    return empty;
  }
}

async function fetchNugetData(pkgName: string) {
  try {
    const searchRes = await fetchWithTimeout(
      `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(pkgName)}&prerelease=false`
    );
    if (!searchRes.ok) throw new Error(`nuget search failed for ${pkgName} (HTTP ${searchRes.status})`);

    const searchData = await readJson(searchRes);
    const pkgData = searchData.data?.[0];

    if (!pkgData) throw new Error(`Package not found: ${pkgName}`);

    const repoUrl = pkgData.projectUrl || '';
    const [githubMetrics, registration, scorecard, vulnerabilities] = await Promise.all([
      getGithubMetrics(repoUrl),
      getNugetReleaseDates(pkgName),
      getScorecard(repoUrl),
      getVulnerabilities(pkgName, pkgData.version, 'nuget')
    ]);

    // Cumulative downloads by version for the chart
    const versions = pkgData.versions || [];
    const sortedDates = [...registration.dates].sort();

    return {
      name: pkgName,
      weeklyDownloads: pkgData.totalDownloads, // Repurposing column for total downloads in NuGet
      trend: versions.map((v: any) => v.downloads),
      trendDates: versions.map((v: any) => v.version),
      // NuGet publishes no download time series, so momentum is genuinely
      // unavailable here rather than zero. The UI must say so, not imply decline.
      growthYoY: null,
      releasesLastYear: registration.dates.length ? countRecentReleases(registration.dates) : null,
      lastPublish: sortedDates.length ? sortedDates[sortedDates.length - 1] : null,
      latestVersion: pkgData.version,
      typesBundled: null, // Not applicable
      deprecated: registration.deprecated,
      license: pkgData.licenseUrl ? 'See License URL' : null, // Simplification
      tags: Array.isArray(pkgData.tags) ? pkgData.tags : [],
      github: githubMetrics,
      bundleSize: null, // Not applicable

      // NuGet ships its own vulnerability list on the registration entry; prefer
      // OSV when it answered, since it carries severity.
      vulnerabilities: vulnerabilities ?? (registration.vulnerabilities
        ? { count: registration.vulnerabilities, maxSeverity: null, ids: [] }
        : null),
      scorecard,
      transitiveDeps: null, // deps.dev's NuGet coverage is not reliable enough to show
      directDeps: null,

      compat: {
        engines: null,
        moduleFormat: null,
        sideEffects: null,
        peerDeps: [],
        // The decisive compatibility fact for a .NET consumer.
        targetFrameworks: registration.targetFrameworks.length
          ? registration.targetFrameworks
          : null,
      },

      sample: null, // NuGet's search API carries no README
      majorBumps: null,
    };
  } catch (e) {
    console.error(`Error fetching NuGet data for ${pkgName}`, e);
    return { name: pkgName, error: 'Failed to fetch NuGet data' };
  }
}

const badRequest = (error: string) => ({
  statusCode: 400,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error })
});

export const handler: Handler = async (event) => {
  const { ecosystem, packages } = event.queryStringParameters || {};

  if (!ecosystem || !packages) {
    return badRequest('Missing ecosystem or packages parameter');
  }
  if (ecosystem !== 'npm' && ecosystem !== 'nuget') {
    return badRequest(`Unknown ecosystem: ${ecosystem}`);
  }

  const packageList = packages.split(',').map(p => p.trim()).filter(Boolean);

  if (packageList.length === 0) {
    return badRequest('No packages provided');
  }
  if (packageList.length > MAX_PACKAGES) {
    return badRequest(`Too many packages (max ${MAX_PACKAGES})`);
  }

  // Names are interpolated into upstream URLs, so accept only the characters the
  // respective registries actually allow.
  const pattern = ecosystem === 'npm' ? NPM_NAME : NUGET_NAME;
  const invalid = packageList.filter(p => !pattern.test(p));
  if (invalid.length) {
    return badRequest(`Invalid package name(s): ${invalid.join(', ')}`);
  }

  try {
    const results = await Promise.all(
      packageList.map(pkg =>
        ecosystem === 'npm' ? fetchNpmData(pkg) : fetchNugetData(pkg)
      )
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // A long CDN life is the main defence against the GitHub search ceiling:
        // repeat views of the same comparison never reach the function.
        'Cache-Control': 'public, max-age=600',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
