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
  closedIssues: number
  archived: boolean
  license: string | null
}

/** One package's row in the comparison table, as returned by /api/compare. */
export interface PackageResult {
  name: string
  /** Weekly downloads for npm, total downloads for NuGet. */
  weeklyDownloads?: number
  trend?: number[]
  trendDates?: string[]
  lastPublish?: string | null
  latestVersion?: string
  /** null when the ecosystem has no equivalent concept. */
  typesBundled?: boolean | null
  license?: string | null
  github?: GithubMetrics | null
  bundleSize?: { size: number; gzip: number } | null
  /** Set instead of the metrics above when the lookup failed. */
  error?: string
}
