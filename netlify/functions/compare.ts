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

async function getGithubMetrics(repoUrl: string) {
  if (!repoUrl) return null;

  // Extract owner and repo from various github URL formats
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;

  const owner = encodeURIComponent(match[1]);
  const repo = encodeURIComponent(match[2].replace(/\.git$/, ''));

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'StackPick-App'
  };

  // Without a token GitHub allows 60 req/hr per IP, and Netlify's egress IPs are
  // shared — set GITHUB_TOKEN in the site env or these columns will read N/A.
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const [repoRes, issuesRes] = await Promise.all([
      fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetchWithTimeout(`https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${match[1]}/${match[2].replace(/\.git$/, '')} type:issue state:closed`)}`, { headers })
    ]);

    if (!repoRes.ok) return null;

    const repoData = await readJson(repoRes);
    let closedIssuesCount = 0;
    if (issuesRes.ok) {
      const issuesData = await readJson(issuesRes);
      closedIssuesCount = issuesData.total_count || 0;
    }

    return {
      stars: repoData.stargazers_count,
      // GitHub's open_issues_count includes open PRs; subtract nothing here, but
      // it is the same convention shown on the repo page.
      openIssues: repoData.open_issues_count,
      closedIssues: closedIssuesCount,
      archived: repoData.archived,
      license: repoData.license?.spdx_id || null,
    };
  } catch (e) {
    console.error(`GitHub API error for ${owner}/${repo}:`, e);
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

/** How many versions shipped in the last year — alive vs. embalmed. */
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

    // Independent lookups — run them together rather than back to back.
    const [githubMetrics, bundleSize] = await Promise.all([
      getGithubMetrics(repoUrl),
      latestVersion ? getBundlephobia(pkgName, latestVersion) : Promise.resolve(null)
    ]);

    const typesBundled = !!(latestVersionData?.types || latestVersionData?.typings);
    const weeklyTrend = aggregateNpmDownloads(range.downloads || []);
    const trend = weeklyTrend.map(w => w.downloads);

    // meta.time is a map of version -> ISO date, plus "created"/"modified" keys
    // that aren't versions. It was already being fetched for lastPublish alone.
    const releaseDates = Object.entries(meta.time || {})
      .filter(([v]) => v !== 'created' && v !== 'modified')
      .map(([, d]) => d as string);

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
      github: githubMetrics,
      bundleSize
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
async function getNugetReleaseDates(pkgName: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(pkgName.toLowerCase())}/index.json`
    );
    if (!res.ok) return [];

    const index = await readJson(res);
    const pages: any[] = index.items || [];
    if (!pages.length) return [];

    const newest = pages[pages.length - 1];
    let leaves: any[] = newest.items || [];

    if (!leaves.length && newest['@id']) {
      const pageRes = await fetchWithTimeout(newest['@id']);
      if (!pageRes.ok) return [];
      leaves = (await readJson(pageRes)).items || [];
    }

    return leaves
      .map(leaf => leaf.catalogEntry?.published)
      .filter((d: unknown): d is string => typeof d === 'string')
      // NuGet marks unlisted versions with the sentinel year 1900.
      .filter(d => !d.startsWith('1900'));
  } catch (e) {
    console.error(`NuGet registration error for ${pkgName}:`, e);
    return [];
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
    const [githubMetrics, releaseDates] = await Promise.all([
      getGithubMetrics(repoUrl),
      getNugetReleaseDates(pkgName)
    ]);

    // Cumulative downloads by version for the chart
    const versions = pkgData.versions || [];

    const sortedDates = [...releaseDates].sort();

    return {
      name: pkgName,
      weeklyDownloads: pkgData.totalDownloads, // Repurposing column for total downloads in NuGet
      trend: versions.map((v: any) => v.downloads),
      trendDates: versions.map((v: any) => v.version),
      // NuGet publishes no download time series, so momentum is genuinely
      // unavailable here rather than zero — the UI must say so, not imply decline.
      growthYoY: null,
      releasesLastYear: releaseDates.length ? countRecentReleases(releaseDates) : null,
      lastPublish: sortedDates.length ? sortedDates[sortedDates.length - 1] : null,
      latestVersion: pkgData.version,
      typesBundled: null, // Not applicable
      deprecated: null,
      license: pkgData.licenseUrl ? 'See License URL' : null, // Simplification
      github: githubMetrics,
      bundleSize: null // Not applicable
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
