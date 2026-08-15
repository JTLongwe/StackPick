import type { Handler } from '@netlify/functions';

/**
 * Package typeahead across npm and NuGet.
 *
 * This runs server-side rather than from the browser for three reasons: npm's
 * search endpoint sends no usable CORS headers, results can be cached at the
 * CDN so repeated prefixes cost nothing, and rate-limit handling stays in one
 * place. Typeahead multiplies invocations, so the caching here is a requirement
 * rather than an optimisation.
 */

// Roomy enough for tag-scoped category queries, which join several terms
// ("keywords:crypto keywords:encryption keywords:jwt …").
const MAX_QUERY = 200;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

async function fetchWithTimeout(url: string, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'StackPick-App' }
    });
  } finally {
    clearTimeout(id);
  }
}

const readJson = (res: Response) => res.json() as Promise<any>;

export interface PackageSummary {
  name: string;
  description: string;
  version: string;
  downloads?: number;
  tags: string[];
  verified?: boolean;
}

async function searchNpm(query: string, limit: number): Promise<PackageSummary[]> {
  const res = await fetchWithTimeout(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`
  );
  if (!res.ok) throw new Error(`npm search failed (HTTP ${res.status})`);

  const data = await readJson(res);
  return (data.objects || []).map((entry: any): PackageSummary => ({
    name: entry.package?.name ?? '',
    description: entry.package?.description ?? '',
    version: entry.package?.version ?? '',
    tags: Array.isArray(entry.package?.keywords) ? entry.package.keywords.slice(0, 6) : [],
  })).filter((p: PackageSummary) => p.name);
}

async function searchNuget(query: string, limit: number): Promise<PackageSummary[]> {
  const res = await fetchWithTimeout(
    `https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(query)}&take=${limit}&prerelease=false`
  );
  if (!res.ok) throw new Error(`nuget search failed (HTTP ${res.status})`);

  const data = await readJson(res);
  return (data.data || []).map((entry: any): PackageSummary => ({
    name: entry.id ?? '',
    description: entry.description ?? '',
    version: entry.version ?? '',
    downloads: entry.totalDownloads,
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 6) : [],
    verified: !!entry.verified,
  })).filter((p: PackageSummary) => p.name);
}

const json = (statusCode: number, body: unknown, cache = false) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...(cache
      ? {
          // Search results barely move; a long CDN life is what keeps typeahead
          // affordable against Netlify's invocation budget.
          'Cache-Control': 'public, max-age=300',
          'Netlify-CDN-Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        }
      : { 'Cache-Control': 'no-store' }),
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  const { ecosystem, q, limit } = event.queryStringParameters || {};

  if (ecosystem !== 'npm' && ecosystem !== 'nuget') {
    return json(400, { error: 'ecosystem must be npm or nuget' });
  }

  const query = (q ?? '').trim();
  if (query.length < 2) {
    // Not an error. The client asks on every keystroke. An empty list is the
    // honest answer and stays cacheable.
    return json(200, []);
  }
  if (query.length > MAX_QUERY) {
    return json(400, { error: `Query too long (max ${MAX_QUERY})` });
  }

  const size = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    const results =
      ecosystem === 'npm'
        ? await searchNpm(query, size)
        : await searchNuget(query, size);

    return json(200, results, true);
  } catch (e) {
    console.error(`Search failed for ${ecosystem}:"${query}"`, e);
    // Degrade to an empty list rather than an error: a failed typeahead should
    // never block someone from typing a package name they already know.
    return json(200, []);
  }
};
