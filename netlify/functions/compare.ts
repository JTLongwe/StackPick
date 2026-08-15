import type { Handler } from '@netlify/functions';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function getGithubMetrics(repoUrl: string) {
  if (!repoUrl) return null;
  
  // Extract owner and repo from various github URL formats
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;
  
  let owner = match[1];
  let repo = match[2].replace(/\.git$/, '');

  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'StackPick-App'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const [repoRes, issuesRes] = await Promise.all([
      fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetchWithTimeout(`https://api.github.com/search/issues?q=repo:${owner}/${repo}+type:issue+state:closed`, { headers })
    ]);

    if (!repoRes.ok) return null;
    
    const repoData = await repoRes.json();
    let closedIssuesCount = 0;
    if (issuesRes.ok) {
      const issuesData = await issuesRes.json();
      closedIssuesCount = issuesData.total_count || 0;
    }

    return {
      stars: repoData.stargazers_count,
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
    const res = await fetchWithTimeout(`https://bundlephobia.com/api/size?package=${pkgName}@${version}`, {}, 3000);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      size: data.size,
      gzip: data.gzip
    };
  } catch (e) {
    console.error(`Bundlephobia error for ${pkgName}:`, e);
    return null; // Graceful degradation
  }
}

// Group daily npm downloads into weekly intervals
function aggregateNpmDownloads(dailyData: { day: string, downloads: number }[]) {
  const weekly = [];
  let currentWeekDownloads = 0;
  let currentWeekStart = '';
  
  for (let i = 0; i < dailyData.length; i++) {
    const entry = dailyData[i];
    if (i % 7 === 0) {
      if (i > 0) {
        weekly.push({ date: currentWeekStart, downloads: currentWeekDownloads });
      }
      currentWeekStart = entry.day;
      currentWeekDownloads = 0;
    }
    currentWeekDownloads += entry.downloads;
  }
  if (currentWeekDownloads > 0 && dailyData.length % 7 !== 0) {
     // incomplete last week
     weekly.push({ date: currentWeekStart, downloads: currentWeekDownloads });
  }
  return weekly;
}

async function fetchNpmData(pkgName: string) {
  try {
    const [metaRes, rangeRes, pointRes] = await Promise.all([
      fetchWithTimeout(`https://registry.npmjs.org/${pkgName}`),
      fetchWithTimeout(`https://api.npmjs.org/downloads/range/last-year/${pkgName}`),
      fetchWithTimeout(`https://api.npmjs.org/downloads/point/last-week/${pkgName}`)
    ]);

    if (!metaRes.ok) throw new Error(`npm meta failed for ${pkgName}`);
    
    const meta = await metaRes.json();
    const range = rangeRes.ok ? await rangeRes.json() : { downloads: [] };
    const point = pointRes.ok ? await pointRes.json() : { downloads: 0 };

    const latestVersion = meta['dist-tags']?.latest;
    const latestVersionData = meta.versions?.[latestVersion];
    
    const repoUrl = meta.repository?.url || '';
    const githubMetrics = await getGithubMetrics(repoUrl);
    
    let bundleSize = null;
    if (latestVersion) {
      bundleSize = await getBundlephobia(pkgName, latestVersion);
    }

    const typesBundled = !!(latestVersionData?.types || latestVersionData?.typings);
    
    const weeklyTrend = aggregateNpmDownloads(range.downloads || []);

    return {
      name: pkgName,
      weeklyDownloads: point.downloads || 0,
      trend: weeklyTrend.map(w => w.downloads),
      trendDates: weeklyTrend.map(w => w.date),
      lastPublish: meta.time?.[latestVersion] || null,
      latestVersion,
      typesBundled,
      license: meta.license || null,
      github: githubMetrics,
      bundleSize
    };
  } catch (e) {
    console.error(`Error fetching NPM data for ${pkgName}`, e);
    return { name: pkgName, error: 'Failed to fetch npm data' };
  }
}

async function fetchNugetData(pkgName: string) {
  try {
    const searchRes = await fetchWithTimeout(`https://azuresearch-usnc.nuget.org/query?q=packageid:${pkgName}&prerelease=false`);
    if (!searchRes.ok) throw new Error(`nuget search failed for ${pkgName}`);
    
    const searchData = await searchRes.json();
    const pkgData = searchData.data?.[0];
    
    if (!pkgData) throw new Error(`Package not found: ${pkgName}`);

    const latestVersion = pkgData.version;
    const totalDownloads = pkgData.totalDownloads;
    
    const repoUrl = pkgData.projectUrl || '';
    const githubMetrics = await getGithubMetrics(repoUrl);

    // Cumulative downloads by version for the chart
    const versions = pkgData.versions || [];
    const trend = versions.map((v: any) => v.downloads);
    const trendDates = versions.map((v: any) => v.version);

    return {
      name: pkgName,
      weeklyDownloads: totalDownloads, // Repurposing column for total downloads in NuGet
      trend,
      trendDates,
      lastPublish: null, // NuGet search doesn't easily return last publish date per version in this endpoint
      latestVersion,
      typesBundled: null, // Not applicable
      license: pkgData.licenseUrl ? 'See License URL' : null, // Simplification
      github: githubMetrics,
      bundleSize: null // Not applicable
    };
  } catch (e) {
    console.error(`Error fetching NuGet data for ${pkgName}`, e);
    return { name: pkgName, error: 'Failed to fetch NuGet data' };
  }
}

export const handler: Handler = async (event) => {
  const { ecosystem, packages } = event.queryStringParameters || {};

  if (!ecosystem || !packages) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing ecosystem or packages parameter' })
    };
  }

  const packageList = packages.split(',').map(p => p.trim()).filter(Boolean);
  
  if (packageList.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No packages provided' }) };
  }

  try {
    const results = await Promise.all(
      packageList.map(pkg => {
        if (ecosystem === 'npm') return fetchNpmData(pkg);
        if (ecosystem === 'nuget') return fetchNugetData(pkg);
        return Promise.resolve({ error: 'Unknown ecosystem' });
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
