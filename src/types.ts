export type Ecosystem = 'npm' | 'nuget'

/** One comparison, authored as a YAML file in src/content/comparisons/. */
export interface Comparison {
  id: string
  title: string
  question: string
  ecosystem: Ecosystem
  packages: string[]
  note?: string
}

export interface GithubMetrics {
  stars: number
  openIssues: number
  /**
   * null when GitHub's search API was unavailable or rate-limited. Which is
   * common, since it allows only 30 requests per minute site-wide. Must never
   * be treated as 0; that would read as "nothing ever gets closed".
   */
  closedIssues: number | null
  archived: boolean
  license: string | null
  topics?: string[]
}

export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export interface VulnSummary {
  count: number
  /** null when the source reported vulnerabilities without grading them. */
  maxSeverity: Severity | null
  ids: string[]
}

/** OpenSSF Scorecard: supply-chain posture for the backing repository. */
export interface Scorecard {
  score: number
  checks: { name: string; score: number }[]
}

/**
 * Compatibility facts.
 *
 * These are gates, not demerits. A Node 22 requirement doesn't make a package
 * worse, it makes it inapplicable to someone on Node 18, so none of this feeds
 * the score. It is checked against the reader's own constraints instead.
 */
export interface Compat {
  engines?: string | null
  moduleFormat?: 'esm' | 'cjs' | 'dual' | null
  sideEffects?: boolean | null
  peerDeps?: string[]
  targetFrameworks?: string[] | null
}

/** A package summary from the typeahead search endpoint. */
export interface PackageSummary {
  name: string
  description: string
  version: string
  downloads?: number
  tags: string[]
  verified?: boolean
}

/** One package's row in the comparison table, as returned by /api/compare. */
export interface PackageResult {
  name: string
  /** Weekly downloads for npm, total downloads for NuGet. */
  weeklyDownloads?: number
  trend?: number[]
  trendDates?: string[]
  /**
   * Year-over-year change in downloads, as a percentage. null when the
   * ecosystem publishes no time series (NuGet). Which is not the same as 0.
   */
  growthYoY?: number | null
  releasesLastYear?: number | null
  lastPublish?: string | null
  latestVersion?: string
  /** null when the ecosystem has no equivalent concept. */
  typesBundled?: boolean | null
  /** The registry's own deprecation notice, when the author set one. */
  deprecated?: string | null
  license?: string | null
  /** npm keywords or NuGet tags, used for category grouping. */
  tags?: string[]
  github?: GithubMetrics | null
  bundleSize?: { size: number; gzip: number } | null

  /** Security signals. These do feed the score. */
  vulnerabilities?: VulnSummary | null
  scorecard?: Scorecard | null
  /** Supply-chain surface area. axios pulls 25 packages, ky pulls none. */
  transitiveDeps?: number | null
  directDeps?: number | null

  /** Compatibility gates, checked against the reader's constraints. */
  compat?: Compat

  /** First runnable block from the README. Shown, never ranked. */
  sample?: string | null
  /** Distinct major versions in the last three years: migration cost. */
  majorBumps?: number | null

  /** Set instead of the metrics above when the lookup failed. */
  error?: string
}
